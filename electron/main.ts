import { app, BrowserWindow, session, nativeTheme } from 'electron';
import path from 'node:path';
import { NativePlayerService } from './native/player-service';
import { NativeVideoWindow } from './native/video-window';
import { MediaDatabase } from './database/media-db';
import { MetadataService } from './native/metadata-service';
import {
  applyNativeTitleBarTheme,
  initTitleBarThemeTracking,
  TITLE_BAR_COLORS,
} from './native/title-bar';

import { registerThumbnailScheme, setupThumbnailProtocol } from './protocol/thumbnail-protocol';
import {
  startFullscreenActivityTracker,
  stopFullscreenActivityTracker,
} from './services/fullscreen-tracker';

import { registerAppHandlers } from './ipc/app-handlers';
import { registerPlayerHandlers } from './ipc/player-handlers';
import { registerWindowHandlers } from './ipc/window-handlers';
import { registerLibraryHandlers } from './ipc/library-handlers';
import { registerPlaylistHandlers } from './ipc/playlist-handlers';
import { registerMetadataHandlers } from './ipc/metadata-handlers';
import { registerSettingsHandlers } from './ipc/settings-handlers';

// 1. Must register privileged schemes before app ready
registerThumbnailScheme();

// Core native services
const playerService = new NativePlayerService();
const videoWindow = new NativeVideoWindow();
let mediaDb: MediaDatabase | null = null;
let metadataService: MetadataService | null = null;
let lastSavedPositionTime = 0;

let mainWindow: BrowserWindow | null = null;
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

const getMainWindow = (): BrowserWindow | null => mainWindow;
const getMediaDb = (): MediaDatabase | null => mediaDb;
const getMetadataService = (): MetadataService | null => metadataService;

// Broadcast playback changes to renderer and persist playback positions
playerService.onPlaybackStatusChange((status) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('player:playback-status-update', status);
  }

  if (status.currentFile && mediaDb) {
    if (status.duration || status.videoWidth || status.videoHeight) {
      mediaDb.addOrUpdateMedia(status.currentFile, {
        duration: status.duration,
        videoWidth: status.videoWidth,
        videoHeight: status.videoHeight,
      });
    }

    if (status.position !== null && status.position > 1) {
      const now = Date.now();
      if (now - lastSavedPositionTime > 4000 || status.paused || status.mediaState === 'ended') {
        lastSavedPositionTime = now;
        mediaDb.updatePlaybackPosition(status.currentFile, status.position, status.duration);
      }
    }
  }
});

if (process.platform === 'win32') {
  app.setAppUserModelId('com.nosved.player');
}

function createWindow(): void {
  const savedThemeMode = (mediaDb?.getSetting('themeMode') as 'light' | 'dark' | 'system') || 'system';
  const savedIsAmoled = mediaDb?.getSetting('isAmoledTheme') === 'true';
  const isEffectiveDark =
    savedThemeMode === 'dark' || (savedThemeMode === 'system' && nativeTheme.shouldUseDarkColors);
  const initialBgColor = isEffectiveDark
    ? (savedIsAmoled ? TITLE_BAR_COLORS.amoled.bg : TITLE_BAR_COLORS.dark.bg)
    : TITLE_BAR_COLORS.light.bg;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: initialBgColor,
    title: 'Nosved Player Desktop',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  applyNativeTitleBarTheme(mainWindow, savedThemeMode, savedIsAmoled);

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F5' && input.type === 'keyDown') {
      event.preventDefault();
    }
  });

  try {
    const nativeHwnd = mainWindow.getNativeWindowHandle().readBigInt64LE();
    const childHwnd = videoWindow.create(nativeHwnd);
    if (childHwnd) {
      playerService.setVideoWindowHwnd(childHwnd);
      playerService.onFullscreenToggle(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('window:video-double-clicked');
        }
      });
    }
  } catch (err) {
    console.error('[Main] Error attaching native video window to mainWindow:', err);
  }

  mainWindow.on('minimize', () => {
    videoWindow.setVisible(false);
  });

  mainWindow.on('restore', () => {
    mainWindow?.webContents.send('window:restored');
  });

  mainWindow.on('enter-full-screen', () => {
    startFullscreenActivityTracker(getMainWindow);
    mainWindow?.webContents.send('window:fullscreen-change', true);
  });

  mainWindow.on('leave-full-screen', () => {
    stopFullscreenActivityTracker();
    mainWindow?.webContents.send('window:fullscreen-change', false);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Restrict navigation: Never permit navigating away from the application shell
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const isAllowed = isDev && process.env.VITE_DEV_SERVER_URL
      ? navigationUrl.startsWith(process.env.VITE_DEV_SERVER_URL)
      : navigationUrl.startsWith('file://');

    if (!isAllowed) {
      event.preventDefault();
      console.warn(`[Security] Blocked unauthorized navigation attempt to: ${navigationUrl}`);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.warn(`[Security] Blocked unauthorized new window creation to: ${url}`);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
    console.warn('[Security] Blocked attempt to attach webview');
  });



  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Renderer Log (level ${level})]: ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Renderer Fail Load]: ${errorCode} - ${errorDescription} at ${validatedURL}`);
  });

  if (process.env.NOSVED_TEST_MODE === '1') {
    mainWindow.webContents.on('did-finish-load', async () => {
      try {
        const testResult = await mainWindow?.webContents.executeJavaScript(`
          new Promise((resolve) => {
            let attempts = 0;
            const check = async () => {
              attempts++;
              const root = document.getElementById('root');
              const brand = document.querySelector('.brand-title');
              if (root && root.children.length > 0 && brand) {
                let nativeMpvResult = null;
                let playerStatusResult = null;
                let playbackStatusResult = null;

                try {
                  if (typeof window.nosvedAPI?.testNativeMpv === 'function') {
                    nativeMpvResult = await window.nosvedAPI.testNativeMpv();
                  }
                } catch (e) {
                  nativeMpvResult = { success: false, error: String(e) };
                }

                try {
                  if (typeof window.nosvedAPI?.getPlayerStatus === 'function') {
                    playerStatusResult = await window.nosvedAPI.getPlayerStatus();
                  }
                } catch (e) {
                  playerStatusResult = { state: 'failed', error: String(e) };
                }

                try {
                  if (typeof window.nosvedAPI?.getPlaybackStatus === 'function') {
                    playbackStatusResult = await window.nosvedAPI.getPlaybackStatus();
                  }
                } catch (e) {
                  playbackStatusResult = { error: String(e) };
                }

                let setVideoBoundsResult = null;
                try {
                  if (typeof window.nosvedAPI?.setVideoBounds === 'function') {
                    setVideoBoundsResult = await window.nosvedAPI.setVideoBounds({ x: 20, y: 80, width: 640, height: 360, visible: false });
                  }
                } catch (e) {
                  setVideoBoundsResult = { error: String(e) };
                }

                let fullscreenTestResult = null;
                try {
                  if (typeof window.nosvedAPI?.isFullscreen === 'function') {
                    const initialFs = await window.nosvedAPI.isFullscreen();
                    fullscreenTestResult = { isFullscreen: initialFs };
                  }
                } catch (e) {
                  fullscreenTestResult = { error: String(e) };
                }

                let libraryTestResult = null;
                try {
                  if (typeof window.nosvedAPI?.getLibrary === 'function') {
                    const lib = await window.nosvedAPI.getLibrary();
                    libraryTestResult = { isArray: Array.isArray(lib), count: lib.length };
                  }
                } catch (e) {
                  libraryTestResult = { error: String(e) };
                }

                let titleBarThemeResult = null;
                try {
                  if (typeof window.nosvedAPI?.setTitleBarTheme === 'function') {
                    const lightRes = await window.nosvedAPI.setTitleBarTheme('light', false);
                    const darkRes = await window.nosvedAPI.setTitleBarTheme('dark', false);
                    const amoledRes = await window.nosvedAPI.setTitleBarTheme('dark', true);
                    const sysRes = await window.nosvedAPI.setTitleBarTheme('system', false);
                    titleBarThemeResult = { success: Boolean(lightRes && darkRes && amoledRes && sysRes) };
                  }
                } catch (e) {
                  titleBarThemeResult = { error: String(e) };
                }

                let thumbnailProtocolTestResult = null;
                try {
                  const lib = await window.nosvedAPI?.getLibrary?.();
                  const firstWithThumb = lib?.find((item) => item.thumbnailKey);
                  if (firstWithThumb && firstWithThumb.thumbnailKey) {
                    const imgTest = await new Promise((res) => {
                      const img = new Image();
                      img.onload = () => res({ loaded: true, width: img.naturalWidth, height: img.naturalHeight });
                      img.onerror = () => res({ loaded: false, error: 'img onerror triggered' });
                      img.src = 'nosved-thumb://' + firstWithThumb.thumbnailKey;
                    });
                    thumbnailProtocolTestResult = {
                      key: firstWithThumb.thumbnailKey,
                      ...imgTest,
                    };
                  } else {
                    thumbnailProtocolTestResult = { noThumbnailInLibrary: true, totalLib: lib?.length };
                  }
                } catch (e) {
                  thumbnailProtocolTestResult = { error: String(e) };
                }

                resolve({
                  hasNosvedAPI: typeof window.nosvedAPI !== 'undefined',
                  hasProcess: typeof window.process !== 'undefined',
                  hasRequire: typeof window.require !== 'undefined',
                  hasBuffer: typeof window.Buffer !== 'undefined',
                  rootChildCount: root.children.length,
                  brandTitle: brand.textContent,
                  isIsolated: typeof window.nosvedAPI?.getSecurityState === 'function',
                  nativeMpvResult,
                  playerStatusResult,
                  playbackStatusResult,
                  setVideoBoundsResult,
                  fullscreenTestResult,
                  libraryTestResult,
                  titleBarThemeResult,
                  thumbnailProtocolTestResult,
                });
              } else if (attempts < 80) {
                setTimeout(check, 50);
              } else {
                resolve({
                  error: 'Timeout waiting for React DOM mount',
                  hasNosvedAPI: typeof window.nosvedAPI !== 'undefined',
                });
              }
            };
            check();
          })
        `);
        console.log('__NOSVED_TEST_RESULT__:' + JSON.stringify(testResult));
        setTimeout(() => app.exit(0), 100);
      } catch (err) {
        console.error('__NOSVED_TEST_ERROR__:', err);
        app.exit(1);
      }
    });
  }

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    stopFullscreenActivityTracker();
    videoWindow.destroy();
    mainWindow = null;
  });
}

function registerAllIpcHandlers(): void {
  const handlerCtx = {
    getMainWindow,
    isDev,
    playerService,
    videoWindow,
    getMediaDb,
    getMetadataService,
  };

  registerAppHandlers(handlerCtx);
  registerPlayerHandlers(handlerCtx);
  registerWindowHandlers(handlerCtx);
  registerLibraryHandlers(handlerCtx);
  registerPlaylistHandlers(handlerCtx);
  registerMetadataHandlers(handlerCtx);
  registerSettingsHandlers(handlerCtx);
}

// App lifecycle
app.whenReady().then(() => {
  setupThumbnailProtocol(getMetadataService);

  try {
    const userData = app.getPath('userData');
    mediaDb = new MediaDatabase(path.join(userData, 'nosved_media.db'));
    mediaDb.init();
    metadataService = new MetadataService(path.join(userData, 'thumbnails'), mediaDb);
    metadataService.onMetadataUpdated((updatedMedia) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('media:metadata-updated', updatedMedia);
      }
    });
    metadataService.onStatusChanged((status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('metadata:status-updated', status);
      }
    });
  } catch (err) {
    console.error('[Main] Failed to initialize media database or metadata service:', err);
  }

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = isDev
      ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: nosved-thumb:; font-src 'self' data:; connect-src 'self' nosved-thumb: ws://localhost:* http://localhost:* ws://127.0.0.1:* http://127.0.0.1:*; base-uri 'self'; form-action 'none'; object-src 'none';"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: nosved-thumb:; font-src 'self' data:; connect-src 'self' nosved-thumb: ws://localhost:* http://localhost:* ws://127.0.0.1:* http://127.0.0.1:*; base-uri 'self'; form-action 'none'; object-src 'none';";

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  registerAllIpcHandlers();
  initTitleBarThemeTracking(getMainWindow);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  try {
    metadataService?.shutdown();
    stopFullscreenActivityTracker();
    videoWindow.destroy();
    mediaDb?.close();
    await playerService.shutdown();
  } catch (err) {
    console.error('[App] Error during player service shutdown before quit:', err);
  }
});
