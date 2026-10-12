import { ipcMain, BrowserWindow } from 'electron';
import { validateIpcSender } from './ipc-validator';
import type { NativeVideoWindow } from '../native/video-window';

export interface WindowHandlerContext {
  getMainWindow: () => BrowserWindow | null;
  isDev: boolean;
  videoWindow: NativeVideoWindow;
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
    return fullscreen;
  });

  ipcMain.handle('window:is-fullscreen', (event) => {
    const mainWindow = ctx.getMainWindow();
    if (!validateIpcSender(event, mainWindow, ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return mainWindow?.isFullScreen() ?? false;
  });
}
