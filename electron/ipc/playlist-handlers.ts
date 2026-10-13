import path from 'node:path';
import { dialog, ipcMain, BrowserWindow } from 'electron';
import { validateIpcSender } from './ipc-validator';
import { SUPPORTED_VIDEO_EXTENSIONS } from '../native/player-service';
import type { MediaDatabase } from '../database/media-db';
import type { MetadataService } from '../native/metadata-service';

export interface PlaylistHandlerContext {
  getMainWindow: () => BrowserWindow | null;
  isDev: boolean;
  getMediaDb: () => MediaDatabase | null;
  getMetadataService?: () => MetadataService | null;
}

export function registerPlaylistHandlers(ctx: PlaylistHandlerContext): void {
  ipcMain.handle('playlist:create', (event, name: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error('Invalid playlist name: Must be a non-empty string');
    }
    return ctx.getMediaDb()?.createPlaylist(name.trim()) ?? null;
  });

  ipcMain.handle('playlist:rename', (event, id: unknown, name: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof id !== 'string' || !id.trim() || typeof name !== 'string' || !name.trim()) {
      throw new Error('Invalid playlist rename arguments');
    }
    return Boolean(ctx.getMediaDb()?.renamePlaylist(id.trim(), name.trim()));
  });

  ipcMain.handle('playlist:delete', (event, id: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('Invalid playlist id: Must be a string');
    }
    return ctx.getMediaDb()?.deletePlaylist(id.trim()) ?? false;
  });

  ipcMain.handle('playlist:get-all', (event) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return ctx.getMediaDb()?.getPlaylists() ?? [];
  });

  ipcMain.handle('playlist:get-details', (event, id: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('Invalid playlist id: Must be a string');
    }
    return ctx.getMediaDb()?.getPlaylistWithItems(id.trim()) ?? null;
  });

  ipcMain.handle('playlist:add-items', (event, playlistId: unknown, mediaIds: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof playlistId !== 'string' || !Array.isArray(mediaIds)) {
      throw new Error('Invalid arguments for playlist:add-items');
    }
    const cleanIds = mediaIds.filter((m): m is string => typeof m === 'string');
    return ctx.getMediaDb()?.addItemsToPlaylist(playlistId, cleanIds) ?? false;
  });

  ipcMain.handle('playlist:remove-item', (event, playlistId: unknown, mediaId: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof playlistId !== 'string' || typeof mediaId !== 'string') {
      throw new Error('Invalid arguments for playlist:remove-item');
    }
    return ctx.getMediaDb()?.removeItemFromPlaylist(playlistId, mediaId) ?? false;
  });

  ipcMain.handle('playlist:reorder-items', (event, playlistId: unknown, mediaIds: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof playlistId !== 'string' || !Array.isArray(mediaIds)) {
      throw new Error('Invalid arguments for playlist:reorder-items');
    }
    const cleanIds = mediaIds.filter((m): m is string => typeof m === 'string');
    return ctx.getMediaDb()?.reorderPlaylistItems(playlistId, cleanIds) ?? false;
  });

  ipcMain.handle('playlist:pick-files', async (event, playlistId: unknown) => {
    const mainWindow = ctx.getMainWindow();
    if (!validateIpcSender(event, mainWindow, ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (!mainWindow) {
      throw new Error('Window is not available');
    }
    if (typeof playlistId !== 'string' || !playlistId.trim()) {
      throw new Error('Invalid playlistId: Must be a non-empty string');
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Add Videos to Playlist',
      filters: [
        {
          name: 'Video Files',
          extensions: SUPPORTED_VIDEO_EXTENSIONS.map((ext) => ext.replace('.', '')),
        },
      ],
      properties: ['openFile', 'multiSelections'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, addedCount: 0 };
    }

    const mediaDb = ctx.getMediaDb();
    if (!mediaDb) {
      return { canceled: false, addedCount: 0 };
    }

    const addResult = mediaDb.addFilesToPlaylist(playlistId.trim(), result.filePaths);
    const metadataService = ctx.getMetadataService?.();
    if (metadataService && addResult.mediaRecords.length > 0) {
      for (const rec of addResult.mediaRecords) {
        metadataService.extractForMedia(rec).catch(() => {});
      }
    }

    return { canceled: false, addedCount: addResult.addedCount };
  });

  ipcMain.handle('playlist:add-files', async (event, playlistId: unknown, filePaths: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof playlistId !== 'string' || !playlistId.trim() || !Array.isArray(filePaths)) {
      throw new Error('Invalid arguments for playlist:add-files');
    }

    const validPaths = filePaths
      .filter((p): p is string => typeof p === 'string' && Boolean(p.trim()))
      .filter((p) => {
        const ext = path.extname(p).toLowerCase();
        return (SUPPORTED_VIDEO_EXTENSIONS as readonly string[]).includes(ext);
      });

    if (validPaths.length === 0) {
      return { success: false, addedCount: 0 };
    }

    const mediaDb = ctx.getMediaDb();
    if (!mediaDb) {
      return { success: false, addedCount: 0 };
    }

    const addResult = mediaDb.addFilesToPlaylist(playlistId.trim(), validPaths);
    const metadataService = ctx.getMetadataService?.();
    if (metadataService && addResult.mediaRecords.length > 0) {
      for (const rec of addResult.mediaRecords) {
        metadataService.extractForMedia(rec).catch(() => {});
      }
    }

    return { success: true, addedCount: addResult.addedCount };
  });
}
