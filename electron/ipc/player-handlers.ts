import { dialog, ipcMain, BrowserWindow, shell } from 'electron';
import { validateIpcSender } from './ipc-validator';
import { SUPPORTED_VIDEO_EXTENSIONS, NativePlayerService } from '../native/player-service';
import type { NativeVideoWindow } from '../native/video-window';
import type { MediaDatabase } from '../database/media-db';
import type { MetadataService } from '../native/metadata-service';

export interface PlayerHandlerContext {
  getMainWindow: () => BrowserWindow | null;
  isDev: boolean;
  playerService: NativePlayerService;
  videoWindow: NativeVideoWindow;
  getMediaDb: () => MediaDatabase | null;
  getMetadataService: () => MetadataService | null;
}

export function registerPlayerHandlers(ctx: PlayerHandlerContext): void {
  ipcMain.handle('player:initialize', async (event, ...args: unknown[]) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (args.length > 0 && typeof args[0] !== 'undefined') {
      if (typeof args[0] !== 'object' || args[0] === null) {
        throw new Error('Invalid arguments provided to player:initialize');
      }
    }
    return ctx.playerService.initialize();
  });

  ipcMain.handle('player:get-status', (event) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return ctx.playerService.getStatus();
  });

  ipcMain.handle('player:shutdown', async (event) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return ctx.playerService.shutdown();
  });

  ipcMain.handle('player:open-file-dialog', async (event) => {
    const mainWindow = ctx.getMainWindow();
    if (!validateIpcSender(event, mainWindow, ctx.isDev)) {
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
      return { canceled: true, status: ctx.playerService.getPlaybackStatus() };
    }

    const selectedPath = result.filePaths[0];
    const status = await ctx.playerService.loadMedia(selectedPath);
    const media = ctx.getMediaDb()?.addOrUpdateMedia(selectedPath);
    const metadataService = ctx.getMetadataService();
    if (media && metadataService) {
      metadataService.extractForMedia(media).catch(() => {});
    }
    return { canceled: false, filePath: selectedPath, status };
  });

  ipcMain.handle('player:load-file', async (event, filePath: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof filePath !== 'string' || !filePath.trim()) {
      throw new Error('Invalid argument: File path must be a non-empty string');
    }
    const status = await ctx.playerService.loadMedia(filePath);
    const media = ctx.getMediaDb()?.addOrUpdateMedia(filePath);
    const metadataService = ctx.getMetadataService();
    if (media && metadataService) {
      metadataService.extractForMedia(media).catch(() => {});
    }
    return status;
  });

  ipcMain.handle('player:play', async (event) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return ctx.playerService.play();
  });

  ipcMain.handle('player:pause', async (event) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return ctx.playerService.pause();
  });

  ipcMain.handle('player:toggle-pause', async (event) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return ctx.playerService.togglePause();
  });

  ipcMain.handle('player:seek', async (event, positionSeconds: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof positionSeconds !== 'number' || !Number.isFinite(positionSeconds)) {
      throw new Error('Invalid argument: Seek position must be a finite number');
    }
    return ctx.playerService.seek(positionSeconds);
  });

  ipcMain.handle('player:set-volume', async (event, volumePercent: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof volumePercent !== 'number' || !Number.isFinite(volumePercent)) {
      throw new Error('Invalid argument: Volume must be a finite number');
    }
    return ctx.playerService.setVolume(volumePercent);
  });

  ipcMain.handle('player:set-muted', async (event, muted: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof muted !== 'boolean') {
      throw new Error('Invalid argument: Muted must be a boolean');
    }
    return ctx.playerService.setMuted(muted);
  });

  ipcMain.handle('player:toggle-mute', async (event) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return ctx.playerService.toggleMute();
  });

  ipcMain.handle('player:get-playback-status', (event) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return ctx.playerService.getPlaybackStatus();
  });

  ipcMain.handle('player:set-video-bounds', (event, bounds: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof bounds !== 'object' || bounds === null) {
      throw new Error('Invalid argument: Bounds must be an object');
    }
    const b = bounds as { x?: unknown; y?: unknown; width?: unknown; height?: unknown; visible?: unknown };
    const x = typeof b.x === 'number' ? Math.round(b.x) : 0;
    const y = typeof b.y === 'number' ? Math.round(b.y) : 0;
    const width = typeof b.width === 'number' ? Math.max(0, Math.round(b.width)) : 0;
    const height = typeof b.height === 'number' ? Math.max(0, Math.round(b.height)) : 0;
    const visible = typeof b.visible === 'boolean' ? b.visible : true;

    if (visible && width > 0 && height > 0) {
      ctx.videoWindow.setBounds(x, y, width, height);
      ctx.videoWindow.setVisible(true);
    } else {
      ctx.videoWindow.setVisible(false);
    }

    return { success: true };
  });

  ipcMain.handle('player:get-tracks', (event) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    return ctx.playerService.getTracks();
  });

  ipcMain.handle('player:set-audio-track', async (event, trackId: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof trackId !== 'string' && typeof trackId !== 'number') {
      throw new Error('Invalid argument: Track ID must be a string or number');
    }
    return ctx.playerService.setAudioTrack(trackId);
  });

  ipcMain.handle('player:set-subtitle-track', async (event, trackId: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof trackId !== 'string' && typeof trackId !== 'number') {
      throw new Error('Invalid argument: Track ID must be a string or number');
    }
    return ctx.playerService.setSubtitleTrack(trackId);
  });

  ipcMain.handle('player:set-subtitles-visible', async (event, visible: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof visible !== 'boolean') {
      throw new Error('Invalid argument: Visible must be a boolean');
    }
    return ctx.playerService.setSubtitlesVisible(visible);
  });

  ipcMain.handle('player:select-subtitle-file', async (event) => {
    const mainWindow = ctx.getMainWindow();
    if (!validateIpcSender(event, mainWindow, ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (!mainWindow) {
      throw new Error('Window is not available');
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Subtitle File',
      filters: [
        {
          name: 'Subtitle Files',
          extensions: ['srt', 'vtt', 'ass', 'ssa', 'sub', 'idx'],
        },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, tracks: ctx.playerService.getTracks() };
    }

    const subPath = result.filePaths[0];
    const tracks = await ctx.playerService.addSubtitleFile(subPath);
    return { canceled: false, filePath: subPath, tracks };
  });

  ipcMain.handle('player:set-subtitle-delay', async (event, seconds: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
      throw new Error('Invalid argument: Seconds must be a finite number');
    }
    return ctx.playerService.setSubtitleDelay(seconds);
  });

  ipcMain.handle('player:set-subtitle-font-size', async (event, size: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
      throw new Error('Invalid argument: Font size must be a positive finite number');
    }
    return ctx.playerService.setSubtitleFontSize(size);
  });

  ipcMain.handle('player:set-subtitle-color', async (event, color: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof color !== 'string' || !color.trim()) {
      throw new Error('Invalid argument: Color must be a non-empty string');
    }
    return ctx.playerService.setSubtitleColor(color.trim());
  });

  ipcMain.handle('player:set-audio-delay', async (event, seconds: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
      throw new Error('Invalid argument: Seconds must be a finite number');
    }
    return ctx.playerService.setAudioDelay(seconds);
  });

  ipcMain.handle('player:frame-step', (event) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    ctx.playerService.frameStep();
    return ctx.playerService.getPlaybackStatus();
  });

  ipcMain.handle('player:frame-back-step', (event) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    ctx.playerService.frameBackStep();
    return ctx.playerService.getPlaybackStatus();
  });

  ipcMain.handle('player:capture-frame', async (event, customDir?: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    const dir = typeof customDir === 'string' && customDir.trim() ? customDir.trim() : undefined;
    return ctx.playerService.captureFrame(dir);
  });

  ipcMain.handle('player:set-speed', async (event, speed: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof speed !== 'number' || !Number.isFinite(speed)) {
      throw new Error('Invalid argument: Speed must be a finite number');
    }
    return ctx.playerService.setSpeed(speed);
  });

  ipcMain.handle('shell:show-item-in-folder', async (event, filePath: unknown) => {
    if (!validateIpcSender(event, ctx.getMainWindow(), ctx.isDev)) {
      throw new Error('Unauthorized IPC invocation: Sender validation failed');
    }
    if (typeof filePath === 'string' && filePath.trim()) {
      shell.showItemInFolder(filePath.trim());
      return true;
    }
    return false;
  });
}
