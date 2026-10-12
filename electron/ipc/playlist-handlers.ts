import { ipcMain, BrowserWindow } from 'electron';
import { validateIpcSender } from './ipc-validator';
import type { MediaDatabase } from '../database/media-db';

export interface PlaylistHandlerContext {
  getMainWindow: () => BrowserWindow | null;
  isDev: boolean;
  getMediaDb: () => MediaDatabase | null;
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
    return ctx.getMediaDb()?.renamePlaylist(id.trim(), name.trim()) ?? false;
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
    return ctx.getMediaDb()?.getAllPlaylists() ?? [];
  });

  ipcMain.handle('playlist:get-details', (event, id: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('Invalid playlist id: Must be a string');
    }
    return ctx.getMediaDb()?.getPlaylistDetails(id.trim()) ?? null;
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
}
