import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'node:path';
import { runMpvProofOfConcept } from './native/mpv-bindings';

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

  if (process.env.NOSVED_TEST_MODE === '1') {
    mainWindow.webContents.on('did-finish-load', async () => {
      try {
        // Wait briefly for React to mount
        const testResult = await mainWindow?.webContents.executeJavaScript(`
          new Promise((resolve) => {
            const check = async () => {
              const root = document.getElementById('root');
              const brand = document.querySelector('.brand-title');
              if (root && root.children.length > 0 && brand) {
                let nativeMpvResult = null;
                try {
                  if (typeof window.nosvedAPI?.testNativeMpv === 'function') {
                    nativeMpvResult = await window.nosvedAPI.testNativeMpv();
                  }
                } catch (e) {
                  nativeMpvResult = { success: false, error: String(e) };
                }

                resolve({
                  hasNosvedAPI: typeof window.nosvedAPI !== 'undefined',
                  hasProcess: typeof window.process !== 'undefined',
                  hasRequire: typeof window.require !== 'undefined',
                  hasBuffer: typeof window.Buffer !== 'undefined',
                  rootChildCount: root.children.length,
                  brandTitle: brand.textContent,
                  isIsolated: typeof window.nosvedAPI?.getSecurityState === 'function',
                  nativeMpvResult
                });
              } else {
                setTimeout(check, 50);
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
    return runMpvProofOfConcept();
  });
}

// App lifecycle
app.whenReady().then(() => {
  // Apply Content Security Policy header on HTTP responses as defense-in-depth
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:* ws://127.0.0.1:* http://127.0.0.1:*; base-uri 'self'; form-action 'none'; object-src 'none';",
        ],
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
