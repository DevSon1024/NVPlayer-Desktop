import { ipcMain, BrowserWindow } from 'electron';
import { validateIpcSender } from './ipc-validator';
import type { NativeVideoWindow } from '../native/video-window';
import type { NativeOverlayWindow } from '../services/overlay-window';
import { applyNativeTitleBarTheme } from '../native/title-bar';
import { startFullscreenActivityTracker, stopFullscreenActivityTracker } from '../services/fullscreen-tracker';

export interface WindowHandlerContext {
  getMainWindow: () => BrowserWindow | null;
  isDev: boolean;
  videoWindow: NativeVideoWindow;
  overlayManager: NativeOverlayWindow;
}

export function registerWindowHandlers(ctx: WindowHandlerContext): void {
  ipcMain.handle('window:toggle-fullscreen', (event) => {
    const mainWindow = ctx.getMainWindow();
    if (!validateIpcSender(event, mainWindow, ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (!mainWindow) return false;
    const nextState = !mainWindow.isFullScreen();
    mainWindow.setFullScreen(nextState);
    if (nextState) {
      startFullscreenActivityTracker(ctx.getMainWindow);
    } else {
      stopFullscreenActivityTracker();
    }
    return nextState;
  });

  ipcMain.handle('window:set-fullscreen', (event, fullscreen: unknown) => {
    const mainWindow = ctx.getMainWindow();
    if (!validateIpcSender(event, mainWindow, ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof fullscreen !== 'boolean') {
      throw new Error('Invalid argument: fullscreen must be a boolean');
    }
    if (!mainWindow) return false;
    mainWindow.setFullScreen(fullscreen);
    if (fullscreen) {
      startFullscreenActivityTracker(ctx.getMainWindow);
    } else {
      stopFullscreenActivityTracker();
    }
    return fullscreen;
  });

  ipcMain.handle('window:is-fullscreen', (event) => {
    const mainWindow = ctx.getMainWindow();
    if (!validateIpcSender(event, mainWindow, ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return mainWindow?.isFullScreen() ?? false;
  });

  ipcMain.handle('window:set-title-bar-theme', (event, themeMode: unknown, isAmoled?: unknown) => {
    const mainWindow = ctx.getMainWindow();
    if (!validateIpcSender(event, mainWindow, ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof themeMode !== 'string' || !['light', 'dark', 'system'].includes(themeMode)) {
      throw new Error('Invalid themeMode: must be "light", "dark", or "system"');
    }
    const amoled = typeof isAmoled === 'boolean' ? isAmoled : false;
    return applyNativeTitleBarTheme(mainWindow, themeMode as 'light' | 'dark' | 'system', amoled);
  });

  ipcMain.handle('window:set-overlay-ignore-mouse', (event, ignore: unknown, forward?: unknown) => {
    const mainWindow = ctx.getMainWindow();
    if (!validateIpcSender(event, mainWindow, ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    const shouldIgnore = typeof ignore === 'boolean' ? ignore : true;
    const shouldForward = typeof forward === 'boolean' ? forward : false;
    ctx.overlayManager.setIgnoreMouse(shouldIgnore, shouldForward);
    return true;
  });

  ipcMain.handle('overlay:sync-state', (event, state: unknown) => {
    const mainWindow = ctx.getMainWindow();
    if (!validateIpcSender(event, mainWindow, ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    ctx.overlayManager.send('overlay:state-update', state);
    return true;
  });

  ipcMain.handle('overlay:notify-interaction', (event, isInteracting: unknown) => {
    const mainWindow = ctx.getMainWindow();
    if (!validateIpcSender(event, mainWindow, ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    const interacting = Boolean(isInteracting);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('overlay:interaction-changed', interacting);
    }
    return true;
  });

  ipcMain.handle('overlay:action', (event, action: unknown, data?: unknown) => {
    const mainWindow = ctx.getMainWindow();
    if (!validateIpcSender(event, mainWindow, ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof action !== 'string') {
      throw new Error('Invalid action: must be a string');
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('overlay:action', action, data);
    }
    return true;
  });

  ipcMain.handle('overlay:user-activity', (event) => {
    const mainWindow = ctx.getMainWindow();
    if (!validateIpcSender(event, mainWindow, ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:user-active');
    }
    return true;
  });
}

