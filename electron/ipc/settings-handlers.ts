import fs from 'node:fs';
import { dialog, ipcMain, BrowserWindow, systemPreferences } from 'electron';
import { validateIpcSender } from './ipc-validator';
import type { MediaDatabase } from '../database/media-db';

export interface SettingsHandlerContext {
  getMainWindow: () => BrowserWindow | null;
  isDev: boolean;
  getMediaDb: () => MediaDatabase | null;
}

export function registerSettingsHandlers(ctx: SettingsHandlerContext): void {
  ipcMain.handle('settings:get-system-accent-color', (event) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    try {
      if (process.platform === 'win32' && systemPreferences.getAccentColor) {
        const hex = systemPreferences.getAccentColor();
        if (hex && hex.length >= 6) {
          return `#${hex.slice(0, 6)}`;
        }
      }
    } catch (err) {
      console.warn('[Settings] Failed to query system accent color:', err);
    }
    return null;
  });

  ipcMain.handle('settings:get-all', (event) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return ctx.getMediaDb()?.getAllSettings() ?? {};
  });

  ipcMain.handle('settings:set', (event, key: unknown, value: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof key !== 'string' || typeof value !== 'string') {
      throw new Error('Invalid arguments: key and value must be strings');
    }
    return ctx.getMediaDb()?.setSetting(key, value) ?? false;
  });

  ipcMain.handle('settings:set-all', (event, rawSettings: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof rawSettings !== 'object' || rawSettings === null) {
      throw new Error('Invalid argument: settings must be an object');
    }
    const cleanSettings: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawSettings as Record<string, unknown>)) {
      if (typeof k === 'string' && typeof v === 'string') {
        cleanSettings[k] = v;
      }
    }
    return ctx.getMediaDb()?.setAllSettings(cleanSettings) ?? false;
  });

  ipcMain.handle('settings:reset', (event) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return ctx.getMediaDb()?.resetSettings() ?? false;
  });

  ipcMain.handle('settings:export-file', async (event, settingsJson: unknown) => {
    const mainWindow = ctx.getMainWindow();
    if (!validateIpcSender(event, mainWindow, ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (!mainWindow) {
      throw new Error('Window is not available');
    }
    if (typeof settingsJson !== 'string') {
      throw new Error('Invalid argument: settingsJson must be a string');
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Nosved Player Settings',
      defaultPath: `nosved_settings_${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON Settings File', extensions: ['json'] }],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    try {
      fs.writeFileSync(result.filePath, settingsJson, 'utf-8');
      return { canceled: false, filePath: result.filePath };
    } catch (err) {
      return {
        canceled: false,
        error: err instanceof Error ? err.message : 'Failed to write file',
      };
    }
  });

  ipcMain.handle('settings:import-file', async (event) => {
    const mainWindow = ctx.getMainWindow();
    if (!validateIpcSender(event, mainWindow, ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (!mainWindow) {
      throw new Error('Window is not available');
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Nosved Player Settings',
      filters: [{ name: 'JSON Settings File', extensions: ['json'] }],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0 || !result.filePaths[0]) {
      return { canceled: true };
    }

    try {
      const content = fs.readFileSync(result.filePaths[0], 'utf-8');
      // Validate valid JSON
      JSON.parse(content);
      return { canceled: false, data: content };
    } catch (err) {
      return {
        canceled: false,
        error: err instanceof Error ? err.message : 'Invalid JSON file',
      };
    }
  });
}
