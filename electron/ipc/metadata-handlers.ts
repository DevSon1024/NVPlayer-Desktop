import { ipcMain, BrowserWindow } from 'electron';
import { validateIpcSender } from './ipc-validator';
import type { MediaDatabase } from '../database/media-db';
import type { MetadataService } from '../native/metadata-service';

export interface MetadataHandlerContext {
  getMainWindow: () => BrowserWindow | null;
  isDev: boolean;
  getMediaDb: () => MediaDatabase | null;
  getMetadataService: () => MetadataService | null;
}

export function registerMetadataHandlers(ctx: MetadataHandlerContext): void {
  ipcMain.handle('metadata:extract-media', async (event, mediaId: unknown, force: unknown, priority?: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof mediaId !== 'string' || !mediaId.trim()) {
      throw new Error('Invalid argument: mediaId must be a non-empty string');
    }
    const mediaDb = ctx.getMediaDb();
    const media = mediaDb?.getMediaById(mediaId);
    if (!media) return null;

    const metadataService = ctx.getMetadataService();
    if (metadataService) {
      const prio = typeof priority === 'number' ? priority : 1;
      await metadataService.extractForMedia(media, Boolean(force), prio);
      return mediaDb?.getMediaById(mediaId) ?? null;
    }
    return media;
  });

  ipcMain.handle('metadata:refresh-all', async (event, force: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    const mediaDb = ctx.getMediaDb();
    const metadataService = ctx.getMetadataService();
    if (!metadataService || !mediaDb) return false;

    const all = mediaDb.getAllMedia();
    const shouldForce = Boolean(force);
    for (const media of all) {
      if (!media.isMissing) {
        void metadataService.extractForMedia(media, shouldForce, 2);
      }
    }
    return true;
  });

  ipcMain.handle('metadata:cleanup-cache', (event) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    const mediaDb = ctx.getMediaDb();
    const metadataService = ctx.getMetadataService();
    if (!metadataService || !mediaDb) return;

    const all = mediaDb.getAllMedia();
    const activeKeys = new Set<string>();
    for (const m of all) {
      if (m.thumbnailKey) activeKeys.add(m.thumbnailKey);
    }
    metadataService.cleanupOrphanedThumbnails(activeKeys);
  });

  ipcMain.handle('metadata:clear-cache', (event) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    const mediaDb = ctx.getMediaDb();
    const metadataService = ctx.getMetadataService();
    if (metadataService) {
      metadataService.clearAllThumbnails();
    }
    if (mediaDb) {
      mediaDb.clearAllThumbnailKeys();
    }
    return true;
  });

  ipcMain.handle('metadata:get-status', (event) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    const metadataService = ctx.getMetadataService();
    return metadataService ? metadataService.getStatus() : { isGenerating: false, pendingCount: 0 };
  });
}
