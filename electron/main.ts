import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import path from 'node:path';
import { runMpvProofOfConcept } from './native/mpv-bindings';
import { NativePlayerService, SUPPORTED_VIDEO_EXTENSIONS } from './native/player-service';

// Single active player lifecycle service for the main process
const playerService = new NativePlayerService();

// Broadcast playback changes to renderer
playerService.onPlaybackStatusChange((status) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('player:playback-status-update', status);
  }
});

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.nosved.player');
}

let mainWindow: BrowserWindow | null = null;

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
    return { canceled: false, filePath: selectedPath, status };
  });

  ipcMain.handle('player:load-file', async (event, filePath: unknown) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof filePath !== 'string' || !filePath.trim()) {
      throw new Error('Invalid argument: File path must be a non-empty string');
    }
    return playerService.loadMedia(filePath);
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

  ipcMain.handle('player:get-playback-status', (event) => {
    if (!validateIpcSender(event)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return playerService.getPlaybackStatus();
  });
}

// App lifecycle
app.whenReady().then(() => {
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
    await playerService.shutdown();
  } catch (err) {
    console.error('[App] Error during player service shutdown before quit:', err);
  }
});
