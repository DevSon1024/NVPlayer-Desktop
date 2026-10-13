import { app, ipcMain, BrowserWindow } from 'electron';
import { validateIpcSender } from './ipc-validator';
import { runMpvProofOfConcept } from '../native/mpv-bindings';
import type { NativePlayerService } from '../native/player-service';

export interface AppHandlerContext {
  getMainWindow: () => BrowserWindow | null;
  isDev: boolean;
  playerService: NativePlayerService;
}

export function registerAppHandlers(ctx: AppHandlerContext): void {
  ipcMain.handle('app:get-info', (event) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
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
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return {
      contextIsolated: true,
      nodeIntegrationDisabled: true,
      sandboxEnabled: true,
    };
  });

  ipcMain.handle('app:ping', (event) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return {
      status: 'pong',
      timestamp: Date.now(),
    };
  });

  ipcMain.handle('app:test-native-mpv', async (event) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    const currentStatus = ctx.playerService.getStatus();
    if (currentStatus.state === 'initialized' && currentStatus.apiVersion) {
      return {
        success: true,
        stage: 'instance_initialized',
        apiVersion: currentStatus.apiVersion,
      };
    }
    if (currentStatus.state === 'initializing') {
      const res = await ctx.playerService.initialize();
      return {
        success: res.state === 'initialized',
        stage: 'instance_initialized',
        apiVersion: res.apiVersion,
      };
    }
    return runMpvProofOfConcept();
  });
}
