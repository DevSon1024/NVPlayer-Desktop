import { dialog, ipcMain, BrowserWindow } from 'electron';
import { validateIpcSender } from './ipc-validator';
import { SUPPORTED_VIDEO_EXTENSIONS } from '../native/player-service';
import type { MediaDatabase } from '../database/media-db';
import type { MetadataService } from '../native/metadata-service';

export interface LibraryHandlerContext {
  getMainWindow: () => BrowserWindow | null;
  isDev: boolean;
  getMediaDb: () => MediaDatabase | null;
  getMetadataService: () => MetadataService | null;
}

export function registerLibraryHandlers(ctx: LibraryHandlerContext): void {
  ipcMain.handle('library:get-all', (event) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return ctx.getMediaDb()?.getAllMedia() ?? [];
  });

  ipcMain.handle('library:get-recent', (event, limit: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    const max = typeof limit === 'number' && limit > 0 ? limit : 20;
    return ctx.getMediaDb()?.getRecentMedia(max) ?? [];
  });

  ipcMain.handle('library:import-files', async (event) => {
    const mainWindow = ctx.getMainWindow();
    if (!validateIpcSender(event, mainWindow, ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (!mainWindow) {
      throw new Error('Window is not available');
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Media to Library',
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

    const mediaDb = ctx.getMediaDb();
    const metadataService = ctx.getMetadataService();

    for (const fp of result.filePaths) {
      const media = mediaDb?.addOrUpdateMedia(fp);
      if (media && metadataService) {
        metadataService.extractForMedia(media).catch(() => {});
      }
    }
    return { canceled: false, importedCount: result.filePaths.length };
  });

  ipcMain.handle('library:remove', (event, id: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('Invalid argument: id must be a string');
    }
    return ctx.getMediaDb()?.removeMedia(id) ?? false;
  });

  ipcMain.handle('library:update-position', (event, filePath: unknown, position: unknown, duration: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof filePath !== 'string' || typeof position !== 'number' || !Number.isFinite(position)) {
      throw new Error('Invalid arguments for library:update-position');
    }
    const dur = typeof duration === 'number' && Number.isFinite(duration) ? duration : null;
    return ctx.getMediaDb()?.updatePlaybackPosition(filePath, position, dur) ?? false;
  });
}
