import { contextBridge, ipcRenderer, webUtils } from 'electron';

/**
 * Public, minimal API exposed to the renderer via contextBridge.
 * Raw IPC and Node.js primitives are strictly withheld.
 */
export interface PlaybackStatusPayload {
  mediaState: string;
  currentFile: string | null;
  position: number | null;
  duration: number | null;
  paused: boolean;
  volume: number;
  muted: boolean;
  videoWidth?: number | null;
  videoHeight?: number | null;
  error?: string;
}

export interface MediaItemPayload {
  id: string;
  filePath: string;
  fileName: string;
  duration: number | null;
  fileSize: number | null;
  lastModified: number | null;
  firstAdded: number;
  lastOpened: number;
  lastPosition: number | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  isMissing?: boolean;
  videoCodec?: string | null;
  audioCodec?: string | null;
  fps?: number | null;
  thumbnailKey?: string | null;
}

export interface PlaylistPayload {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  itemCount?: number;
}

export interface PlaylistItemPayload {
  id: string;
  playlistId: string;
  mediaId: string;
  sortOrder: number;
  addedAt: number;
  media?: MediaItemPayload;
}

export interface MediaTrackPayload {
  id: number;
  type: 'video' | 'audio' | 'sub';
  title?: string;
  lang?: string;
  codec?: string;
  selected: boolean;
  isDefault?: boolean;
}

export interface PlayerTracksSnapshotPayload {
  audioTracks: MediaTrackPayload[];
  subtitleTracks: MediaTrackPayload[];
  selectedAudioId: number | string | null;
  selectedSubtitleId: number | string | null;
  subtitlesVisible: boolean;
}

export interface NosvedAPI {
  getAppInfo: () => Promise<{
    name: string;
    version: string;
    isPackaged: boolean;
    platform: string;
    arch: string;
  }>;
  getSecurityState: () => Promise<{
    contextIsolated: boolean;
    nodeIntegrationDisabled: boolean;
    sandboxEnabled: boolean;
  }>;
  ping: () => Promise<{
    status: string;
    timestamp: number;
  }>;
  testNativeMpv: () => Promise<{
    success: boolean;
    stage: string;
    apiVersion?: {
      raw: number;
      major: number;
      minor: number;
      formatted: string;
    };
    error?: string;
    errorCode?: number;
  }>;
  initializePlayer: () => Promise<{
    state: string;
    apiVersion?: {
      raw: number;
      major: number;
      minor: number;
      formatted: string;
    };
    error?: string;
  }>;
  getPlayerStatus: () => Promise<{
    state: string;
    apiVersion?: {
      raw: number;
      major: number;
      minor: number;
      formatted: string;
    };
    error?: string;
  }>;
  shutdownPlayer: () => Promise<{
    state: string;
    apiVersion?: {
      raw: number;
      major: number;
      minor: number;
      formatted: string;
    };
    error?: string;
  }>;
  openFileDialog: () => Promise<{
    canceled: boolean;
    filePath?: string;
    status: PlaybackStatusPayload;
  }>;
  loadFile: (filePath: string) => Promise<PlaybackStatusPayload>;
  play: () => Promise<PlaybackStatusPayload>;
  pause: () => Promise<PlaybackStatusPayload>;
  togglePause: () => Promise<PlaybackStatusPayload>;
  seek: (positionSeconds: number) => Promise<PlaybackStatusPayload>;
  setVolume: (volumePercent: number) => Promise<PlaybackStatusPayload>;
  setMuted: (muted: boolean) => Promise<PlaybackStatusPayload>;
  toggleMute: () => Promise<PlaybackStatusPayload>;
  setVideoBounds: (bounds: { x: number; y: number; width: number; height: number; visible?: boolean }) => Promise<{ success: boolean }>;
  getPlaybackStatus: () => Promise<PlaybackStatusPayload>;
  onPlaybackStatus: (callback: (status: PlaybackStatusPayload) => void) => () => void;

  // Track APIs
  getTracks: () => Promise<PlayerTracksSnapshotPayload>;
  setAudioTrack: (trackId: number | string) => Promise<PlayerTracksSnapshotPayload>;
  setSubtitleTrack: (trackId: number | string) => Promise<PlayerTracksSnapshotPayload>;
  setSubtitlesVisible: (visible: boolean) => Promise<PlayerTracksSnapshotPayload>;
  selectSubtitleFile: () => Promise<{ canceled: boolean; filePath?: string; tracks?: PlayerTracksSnapshotPayload; error?: string }>;
  setSubtitleDelay: (seconds: number) => Promise<number>;
  setAudioDelay: (seconds: number) => Promise<number>;

  // Phase 8 Fullscreen APIs
  toggleFullscreen: () => Promise<boolean>;
  setFullscreen: (fullscreen: boolean) => Promise<boolean>;
  isFullscreen: () => Promise<boolean>;
  setTitleBarTheme: (themeMode: string, isAmoled?: boolean) => Promise<boolean>;
  onFullscreenChange: (callback: (fullscreen: boolean) => void) => () => void;
  onUserActive: (callback: () => void) => () => void;
  onWindowRestored: (callback: () => void) => () => void;
  onVideoDoubleClicked: (callback: () => void) => () => void;

  // Phase 8 Media Library & History APIs
  getLibrary: () => Promise<MediaItemPayload[]>;
  getRecent: (limit?: number) => Promise<MediaItemPayload[]>;
  importMediaFiles: () => Promise<{ canceled: boolean; importedCount: number }>;
  removeMedia: (id: string) => Promise<boolean>;
  updatePlaybackPosition: (filePath: string, position: number, duration?: number | null) => Promise<boolean>;

  // Phase 9 Playlists & Metadata APIs
  createPlaylist: (name: string) => Promise<PlaylistPayload | null>;
  renamePlaylist: (id: string, name: string) => Promise<boolean>;
  deletePlaylist: (id: string) => Promise<boolean>;
  getPlaylists: () => Promise<PlaylistPayload[]>;
  getPlaylistDetails: (id: string) => Promise<{ playlist: PlaylistPayload; items: PlaylistItemPayload[] } | null>;
  addItemsToPlaylist: (playlistId: string, mediaIds: string[]) => Promise<boolean>;
  removeItemFromPlaylist: (playlistId: string, mediaId: string) => Promise<boolean>;
  reorderPlaylistItems: (playlistId: string, mediaIds: string[]) => Promise<boolean>;
  pickFilesForPlaylist: (playlistId: string) => Promise<{ canceled: boolean; addedCount: number }>;
  addFilesToPlaylist: (playlistId: string, filePaths: string[]) => Promise<{ success: boolean; addedCount: number }>;
  getPathForFile: (file: File) => string;
  extractMetadata: (mediaId: string, force?: boolean, priority?: number) => Promise<MediaItemPayload | null>;
  refreshAllThumbnails: (force?: boolean) => Promise<boolean>;
  cleanupThumbnails: () => Promise<void>;
  clearThumbnailCache: () => Promise<boolean>;
  onMediaMetadataUpdated: (callback: (media: MediaItemPayload) => void) => () => void;
  onF5Pressed: (callback: () => void) => () => void;

  // Settings & Themes
  getSettings: () => Promise<Record<string, string>>;
  getSystemAccentColor: () => Promise<string | null>;
  setSetting: (key: string, value: string) => Promise<boolean>;
  setAllSettings: (settings: Record<string, string>) => Promise<boolean>;
  resetSettings: () => Promise<boolean>;
  exportSettingsFile: (settingsJson: string) => Promise<{ canceled: boolean; filePath?: string; error?: string }>;
  importSettingsFile: () => Promise<{ canceled: boolean; data?: string; error?: string }>;
}

const api: NosvedAPI = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  getSecurityState: () => ipcRenderer.invoke('app:get-security-state'),
  ping: () => ipcRenderer.invoke('app:ping'),
  testNativeMpv: () => ipcRenderer.invoke('app:test-native-mpv'),
  initializePlayer: () => ipcRenderer.invoke('player:initialize'),
  getPlayerStatus: () => ipcRenderer.invoke('player:get-status'),
  shutdownPlayer: () => ipcRenderer.invoke('player:shutdown'),
  openFileDialog: () => ipcRenderer.invoke('player:open-file-dialog'),
  loadFile: (filePath: string) => ipcRenderer.invoke('player:load-file', filePath),
  play: () => ipcRenderer.invoke('player:play'),
  pause: () => ipcRenderer.invoke('player:pause'),
  togglePause: () => ipcRenderer.invoke('player:toggle-pause'),
  seek: (positionSeconds: number) => ipcRenderer.invoke('player:seek', positionSeconds),
  setVolume: (volumePercent: number) => ipcRenderer.invoke('player:set-volume', volumePercent),
  setMuted: (muted: boolean) => ipcRenderer.invoke('player:set-muted', muted),
  toggleMute: () => ipcRenderer.invoke('player:toggle-mute'),
  setVideoBounds: (bounds) => ipcRenderer.invoke('player:set-video-bounds', bounds),
  getPlaybackStatus: () => ipcRenderer.invoke('player:get-playback-status'),
  getTracks: () => ipcRenderer.invoke('player:get-tracks'),
  setAudioTrack: (trackId) => ipcRenderer.invoke('player:set-audio-track', trackId),
  setSubtitleTrack: (trackId) => ipcRenderer.invoke('player:set-subtitle-track', trackId),
  setSubtitlesVisible: (visible) => ipcRenderer.invoke('player:set-subtitles-visible', visible),
  selectSubtitleFile: () => ipcRenderer.invoke('player:select-subtitle-file'),
  setSubtitleDelay: (seconds) => ipcRenderer.invoke('player:set-subtitle-delay', seconds),
  setAudioDelay: (seconds) => ipcRenderer.invoke('player:set-audio-delay', seconds),
  onPlaybackStatus: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, status: unknown) => {
      callback(status as PlaybackStatusPayload);
    };
    ipcRenderer.on('player:playback-status-update', handler);
    return () => {
      ipcRenderer.removeListener('player:playback-status-update', handler);
    };
  },

  // Fullscreen IPC calls
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  setFullscreen: (fullscreen: boolean) => ipcRenderer.invoke('window:set-fullscreen', fullscreen),
  isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),
  setTitleBarTheme: (themeMode: string, isAmoled?: boolean) =>
    ipcRenderer.invoke('window:set-title-bar-theme', themeMode, isAmoled),
  onFullscreenChange: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, isFs: unknown) => {
      callback(Boolean(isFs));
    };
    ipcRenderer.on('window:fullscreen-change', handler);
    return () => {
      ipcRenderer.removeListener('window:fullscreen-change', handler);
    };
  },
  onUserActive: (callback) => {
    const handler = () => {
      callback();
    };
    ipcRenderer.on('window:user-active', handler);
    return () => {
      ipcRenderer.removeListener('window:user-active', handler);
    };
  },
  onWindowRestored: (callback) => {
    const handler = () => {
      callback();
    };
    ipcRenderer.on('window:restored', handler);
    return () => {
      ipcRenderer.removeListener('window:restored', handler);
    };
  },
  onVideoDoubleClicked: (callback) => {
    const handler = () => {
      callback();
    };
    ipcRenderer.on('window:video-double-clicked', handler);
    return () => {
      ipcRenderer.removeListener('window:video-double-clicked', handler);
    };
  },

  // Media Library & History IPC calls
  getLibrary: () => ipcRenderer.invoke('library:get-all'),
  getRecent: (limit?: number) => ipcRenderer.invoke('library:get-recent', limit),
  importMediaFiles: () => ipcRenderer.invoke('library:import-files'),
  removeMedia: (id: string) => ipcRenderer.invoke('library:remove', id),
  updatePlaybackPosition: (filePath: string, position: number, duration?: number | null) =>
    ipcRenderer.invoke('library:update-position', filePath, position, duration),

  // Phase 9 Playlists & Metadata IPC calls
  createPlaylist: (name: string) => ipcRenderer.invoke('playlist:create', name),
  renamePlaylist: (id: string, name: string) => ipcRenderer.invoke('playlist:rename', id, name),
  deletePlaylist: (id: string) => ipcRenderer.invoke('playlist:delete', id),
  getPlaylists: () => ipcRenderer.invoke('playlist:get-all'),
  getPlaylistDetails: (id: string) => ipcRenderer.invoke('playlist:get-details', id),
  addItemsToPlaylist: (playlistId: string, mediaIds: string[]) => ipcRenderer.invoke('playlist:add-items', playlistId, mediaIds),
  removeItemFromPlaylist: (playlistId: string, mediaId: string) => ipcRenderer.invoke('playlist:remove-item', playlistId, mediaId),
  reorderPlaylistItems: (playlistId: string, mediaIds: string[]) => ipcRenderer.invoke('playlist:reorder-items', playlistId, mediaIds),
  pickFilesForPlaylist: (playlistId: string) => ipcRenderer.invoke('playlist:pick-files', playlistId),
  addFilesToPlaylist: (playlistId: string, filePaths: string[]) => ipcRenderer.invoke('playlist:add-files', playlistId, filePaths),
  getPathForFile: (file: File) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file);
      }
    } catch {
      // Fallback if webUtils fails
    }
    return (file as unknown as { path?: string }).path || '';
  },
  extractMetadata: (mediaId: string, force?: boolean, priority?: number) =>
    ipcRenderer.invoke('metadata:extract-media', mediaId, force, priority),
  refreshAllThumbnails: (force?: boolean) => ipcRenderer.invoke('metadata:refresh-all', force),
  cleanupThumbnails: () => ipcRenderer.invoke('metadata:cleanup-cache'),
  clearThumbnailCache: () => ipcRenderer.invoke('metadata:clear-cache'),
  onMediaMetadataUpdated: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, media: unknown) => {
      callback(media as MediaItemPayload);
    };
    ipcRenderer.on('media:metadata-updated', handler);
    return () => {
      ipcRenderer.removeListener('media:metadata-updated', handler);
    };
  },
  onF5Pressed: (callback) => {
    const handler = () => {
      callback();
    };
    ipcRenderer.on('app:f5-pressed', handler);
    return () => {
      ipcRenderer.removeListener('app:f5-pressed', handler);
    };
  },

  // Settings & Themes
  getSettings: () => ipcRenderer.invoke('settings:get-all'),
  getSystemAccentColor: () => ipcRenderer.invoke('settings:get-system-accent-color'),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
  setAllSettings: (settings: Record<string, string>) => ipcRenderer.invoke('settings:set-all', settings),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  exportSettingsFile: (settingsJson: string) => ipcRenderer.invoke('settings:export-file', settingsJson),
  importSettingsFile: () => ipcRenderer.invoke('settings:import-file'),
};

contextBridge.exposeInMainWorld('nosvedAPI', api);
