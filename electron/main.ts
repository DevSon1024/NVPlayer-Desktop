import { app, BrowserWindow, dialog, ipcMain, screen, session } from 'electron';
import path from 'node:path';
import { runMpvProofOfConcept } from './native/mpv-bindings';
import { NativePlayerService, SUPPORTED_VIDEO_EXTENSIONS } from './native/player-service';
import { NativeVideoWindow } from './native/video-window';
import { MediaDatabase } from './database/media-db';

// Single active player lifecycle service for the main process
const playerService = new NativePlayerService();
const videoWindow = new NativeVideoWindow();
let mediaDb: MediaDatabase | null = null;
let lastSavedPositionTime = 0;

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

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.nosved.player');
}

let mainWindow: BrowserWindow | null = null;
let fullscreenActivityTimer: NodeJS.Timeout | null = null;
let lastCursorPos = { x: -1, y: -1 };

function startFullscreenActivityTracker(): void {
  stopFullscreenActivityTracker();
  try {
    lastCursorPos = screen.getCursorScreenPoint();
  } catch {
    lastCursorPos = { x: -1, y: -1 };
  }
  fullscreenActivityTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isFullScreen()) {
      stopFullscreenActivityTracker();
      return;
    }
    try {
      const current = screen.getCursorScreenPoint();
      if (current.x !== lastCursorPos.x || current.y !== lastCursorPos.y) {
        lastCursorPos = current;
        mainWindow.webContents.send('window:user-active');
      }
    } catch {
      // Screen query may fail if displays change
    }
  }, 150);
  fullscreenActivityTimer.unref();
}

function stopFullscreenActivityTracker(): void {
  if (fullscreenActivityTimer) {
    clearInterval(fullscreenActivityTimer);
    fullscreenActivityTimer = null;
  }
}

// Determine development vs production environment
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

/**
 * Strict sender validation to prevent unauthorized IPC calls
 * from iframes, child windows, or unexpected origins.
 */
function validateIpcSender(event: Electron.IpcMainInvokeEvent): boolean {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }
  if (event.sender.id !== mainWindow.webContents.id) {
    return false;
  }

  const frameUrl = event.senderFrame?.url;
  if (!frameUrl) {
    return false;
  }

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    return frameUrl.startsWith(devUrl) || frameUrl.startsWith('http://localhost:') || frameUrl.startsWith('http://127.0.0.1:');
  }

  return frameUrl.startsWith('file://');
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: '#121316',
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

  try {
    const nativeHwnd = mainWindow.getNativeWindowHandle().readBigInt64LE();
    const childHwnd = videoWindow.create(nativeHwnd);
    if (childHwnd) {
      playerService.setVideoWindowHwnd(childHwnd);
      videoWindow.onDoubleClick(() => {
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
    startFullscreenActivityTracker();
    mainWindow?.webContents.send('window:fullscreen-change', true);
  });

  mainWindow.on('leave-full-screen', () => {
    stopFullscreenActivityTracker();
    mainWindow?.webContents.send('window:fullscreen-change', false);
  });

  // Gracefully show window only once it has rendered initial frame
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

  // Restrict new window creation (window.open, target="_blank")
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.warn(`[Security] Blocked unauthorized new window creation to: ${url}`);
    return { action: 'deny' };
  });

  // Prevent webview creation
  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
    console.warn('[Security] Blocked attempt to attach webview');
  });

  // Top-level input failsafe: ensure Escape key exits fullscreen unconditionally
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFullScreen()) {
        mainWindow.setFullScreen(false);
      }
    }
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Renderer Log (level ${level})]: ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Renderer Fail Load]: ${errorCode} - ${errorDescription} at ${validatedURL}`);
  });

  if (process.env.NOSVED_TEST_MODE === '1') {

    mainWindow.webContents.on('did-finish-load', async () => {
      console.log('[Test Mode] did-finish-load event received');
      try {
        // Wait briefly for React to mount
        const testResult = await mainWindow?.webContents.executeJavaScript(`
          new Promise((resolve) => {
            let attempts = 0;
            const check = async () => {
              attempts++;
              const root = document.getElementById('root');
              const brand = document.querySelector('.brand-title');
              if (root && root.children.length > 0 && brand) {
                console.log('[Test Mode Script] DOM mounted, inspecting API...');
                let nativeMpvResult = null;
                let playerStatusResult = null;
                let playbackStatusResult = null;

                try {
                  if (typeof window.nosvedAPI?.testNativeMpv === 'function') {
                    console.log('[Test Mode Script] Calling testNativeMpv...');
                    nativeMpvResult = await window.nosvedAPI.testNativeMpv();
                    console.log('[Test Mode Script] testNativeMpv finished:', JSON.stringify(nativeMpvResult));
                  }
                } catch (e) {
                  console.log('[Test Mode Script] testNativeMpv threw:', String(e));
                  nativeMpvResult = { success: false, error: String(e) };
                }

                try {
                  if (typeof window.nosvedAPI?.getPlayerStatus === 'function') {
                    console.log('[Test Mode Script] Calling getPlayerStatus...');
                    playerStatusResult = await window.nosvedAPI.getPlayerStatus();
                    console.log('[Test Mode Script] getPlayerStatus finished:', JSON.stringify(playerStatusResult));
                  }
                } catch (e) {
                  console.log('[Test Mode Script] getPlayerStatus threw:', String(e));
                  playerStatusResult = { state: 'failed', error: String(e) };
                }

                try {
                  if (typeof window.nosvedAPI?.getPlaybackStatus === 'function') {
                    console.log('[Test Mode Script] Calling getPlaybackStatus...');
                    playbackStatusResult = await window.nosvedAPI.getPlaybackStatus();
                    console.log('[Test Mode Script] getPlaybackStatus finished:', JSON.stringify(playbackStatusResult));
                  }
                } catch (e) {
                  console.log('[Test Mode Script] getPlaybackStatus threw:', String(e));
                  playbackStatusResult = { error: String(e) };
                }

                let setVideoBoundsResult = null;
                try {
                  if (typeof window.nosvedAPI?.setVideoBounds === 'function') {
                    console.log('[Test Mode Script] Calling setVideoBounds...');
                    setVideoBoundsResult = await window.nosvedAPI.setVideoBounds({ x: 20, y: 80, width: 640, height: 360, visible: false });
                    console.log('[Test Mode Script] setVideoBounds finished:', JSON.stringify(setVideoBoundsResult));
                  }
                } catch (e) {
                  console.log('[Test Mode Script] setVideoBounds threw:', String(e));
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

// Register IPC handlers
function registerIpcHandlers(): void {
  ipcMain.handle('app:get-info', (event) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return {
      name: app.getName(),
      version: app.getVersion(),
      isPackaged: app.isPackaged,
      platform: process.platform,
      arch: process.arch,
    };
  });

  ipcMain.handle('app:get-security-state', (event) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return {
      contextIsolated: true,
      nodeIntegrationDisabled: true,
      sandboxEnabled: true,
    };
  });

  ipcMain.handle('app:ping', (event) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return {
      status: 'pong',
      timestamp: Date.now(),
    };
  });

  ipcMain.handle('app:test-native-mpv', async (event) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    const currentStatus = playerService.getStatus();
    if (currentStatus.state === 'initialized' && currentStatus.apiVersion) {
      return {
        success: true,
        stage: 'instance_initialized',
        apiVersion: currentStatus.apiVersion,
      };
    }
    if (currentStatus.state === 'initializing') {
      const res = await playerService.initialize();
      return {
        success: res.state === 'initialized',
        stage: 'instance_initialized',
        apiVersion: res.apiVersion,
      };
    }
    return runMpvProofOfConcept();
  });

  ipcMain.handle('player:initialize', async (event, ...args: unknown[]) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (args.length > 0 && typeof args[0] !== 'undefined') {
      if (typeof args[0] !== 'object' || args[0] === null) {
        throw new Error('Invalid arguments provided to player:initialize');
      }
    }
    return playerService.initialize();
  });

  ipcMain.handle('player:get-status', (event) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return playerService.getStatus();
  });

  ipcMain.handle('player:shutdown', async (event) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return playerService.shutdown();
  });

  ipcMain.handle('player:open-file-dialog', async (event) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (!mainWindow) {
      throw new Error('Window is not available');
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Video File',
      filters: [
        {
          name: 'Video Files',
          extensions: SUPPORTED_VIDEO_EXTENSIONS.map((ext) => ext.replace('.', '')),
        },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, status: playerService.getPlaybackStatus() };
    }

    const selectedPath = result.filePaths[0];
    const status = await playerService.loadMedia(selectedPath);
    mediaDb?.addOrUpdateMedia(selectedPath);
    return { canceled: false, filePath: selectedPath, status };
  });

  ipcMain.handle('player:load-file', async (event, filePath: unknown) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof filePath !== 'string' || !filePath.trim()) {
      throw new Error('Invalid argument: File path must be a non-empty string');
    }
    const status = await playerService.loadMedia(filePath);
    mediaDb?.addOrUpdateMedia(filePath);
    return status;
  });

  ipcMain.handle('player:play', async (event) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return playerService.play();
  });

  ipcMain.handle('player:pause', async (event) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return playerService.pause();
  });

  ipcMain.handle('player:toggle-pause', async (event) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return playerService.togglePause();
  });

  ipcMain.handle('player:seek', async (event, positionSeconds: unknown) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof positionSeconds !== 'number' || !Number.isFinite(positionSeconds)) {
      throw new Error('Invalid argument: Seek position must be a finite number');
    }
    return playerService.seek(positionSeconds);
  });

  ipcMain.handle('player:set-volume', async (event, volumePercent: unknown) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof volumePercent !== 'number' || !Number.isFinite(volumePercent)) {
      throw new Error('Invalid argument: Volume must be a finite number');
    }
    return playerService.setVolume(volumePercent);
  });

  ipcMain.handle('player:set-muted', async (event, muted: unknown) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof muted !== 'boolean') {
      throw new Error('Invalid argument: Muted must be a boolean');
    }
    return playerService.setMuted(muted);
  });

  ipcMain.handle('player:toggle-mute', async (event) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return playerService.toggleMute();
  });

  ipcMain.handle('player:get-playback-status', (event) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return playerService.getPlaybackStatus();
  });

  ipcMain.handle('player:set-video-bounds', async (event, rawBounds: unknown) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { success: false };
    }
    if (typeof rawBounds !== 'object' || rawBounds === null) {
      throw new Error('Invalid bounds argument: Must be an object');
    }
    const b = rawBounds as { x?: unknown; y?: unknown; width?: unknown; height?: unknown; visible?: unknown };
    if (
      typeof b.x !== 'number' || !Number.isFinite(b.x) ||
      typeof b.y !== 'number' || !Number.isFinite(b.y) ||
      typeof b.width !== 'number' || !Number.isFinite(b.width) ||
      typeof b.height !== 'number' || !Number.isFinite(b.height)
    ) {
      throw new Error('Invalid bounds dimensions: Values must be finite numbers');
    }

    const display = screen.getDisplayMatching(mainWindow.getBounds());
    const scale = (display?.scaleFactor || 1) * (mainWindow.webContents.getZoomFactor() || 1);
    const physX = Math.round(b.x * scale);
    const physY = Math.round(b.y * scale);
    const physW = Math.max(0, Math.round(b.width * scale));
    const physH = Math.max(0, Math.round(b.height * scale));
    const visible = Boolean(b.visible);

    videoWindow.setBounds(physX, physY, physW, physH);
    videoWindow.setVisible(visible);
    return { success: true };
  });

  // Fullscreen IPC handlers
  ipcMain.handle('window:toggle-fullscreen', (event) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (!mainWindow) return false;
    const next = !mainWindow.isFullScreen();
    mainWindow.setFullScreen(next);
    return next;
  });

  ipcMain.handle('window:set-fullscreen', (event, fullScreen: unknown) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (!mainWindow) return false;
    const next = Boolean(fullScreen);
    mainWindow.setFullScreen(next);
    return next;
  });

  ipcMain.handle('window:is-fullscreen', (event) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (!mainWindow) return false;
    return mainWindow.isFullScreen();
  });

  // Media Library & History IPC handlers
  ipcMain.handle('library:get-all', (event) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return mediaDb?.getAllMedia() ?? [];
  });

  ipcMain.handle('library:get-recent', (event, limit: unknown) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    const lim = typeof limit === 'number' && Number.isFinite(limit) ? limit : 20;
    return mediaDb?.getRecentMedia(lim) ?? [];
  });

  ipcMain.handle('library:import-files', async (event) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (!mainWindow) {
      return { canceled: true, importedCount: 0 };
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Media Files to Library',
      filters: [
        {
          name: 'Video Files',
          extensions: SUPPORTED_VIDEO_EXTENSIONS.map((ext) => ext.replace('.', '')),
        },
      ],
      properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, importedCount: 0 };
    }
    for (const fp of result.filePaths) {
      mediaDb?.addOrUpdateMedia(fp);
    }
    return { canceled: false, importedCount: result.filePaths.length };
  });

  ipcMain.handle('library:remove', (event, id: unknown) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof id !== 'string') {
      throw new Error('Invalid argument: ID must be a string');
    }
    return mediaDb?.removeMedia(id) ?? false;
  });

  ipcMain.handle('library:update-position', (event, filePath: unknown, position: unknown, duration: unknown) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof filePath !== 'string' || typeof position !== 'number' || !Number.isFinite(position)) {
      throw new Error('Invalid arguments for update-position');
    }
    const dur = typeof duration === 'number' && Number.isFinite(duration) ? duration : null;
    return mediaDb?.updatePlaybackPosition(filePath, position, dur) ?? false;
  });
}

// App lifecycle
app.whenReady().then(() => {
  // Initialize native SQLite media database in userData directory
  try {
    mediaDb = new MediaDatabase(path.join(app.getPath('userData'), 'nosved_media.db'));
    mediaDb.init();
  } catch (err) {
    console.error('[Main] Failed to initialize media database:', err);
  }

  // Apply Content Security Policy header on HTTP responses as defense-in-depth
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = isDev
      ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:* ws://127.0.0.1:* http://127.0.0.1:*; base-uri 'self'; form-action 'none'; object-src 'none';"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:* ws://127.0.0.1:* http://127.0.0.1:*; base-uri 'self'; form-action 'none'; object-src 'none';";

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  try {
    videoWindow.destroy();
    mediaDb?.close();
    await playerService.shutdown();
  } catch (err) {
    console.error('[App] Error during player service shutdown on window close:', err);
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  try {
    videoWindow.destroy();
    mediaDb?.close();
    await playerService.shutdown();
  } catch (err) {
    console.error('[App] Error during player service shutdown before quit:', err);
  }
});
