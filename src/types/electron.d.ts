export interface PlaybackStatus {
  mediaState: 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error' | string;
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

export interface MediaItem {
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

export interface Playlist {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  itemCount?: number;
}

export interface PlaylistItem {
  id: string;
  playlistId: string;
  mediaId: string;
  sortOrder: number;
  addedAt: number;
  media?: MediaItem;
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
    status: PlaybackStatus;
  }>;
  loadFile: (filePath: string) => Promise<PlaybackStatus>;
  play: () => Promise<PlaybackStatus>;
  pause: () => Promise<PlaybackStatus>;
  togglePause: () => Promise<PlaybackStatus>;
  seek: (positionSeconds: number) => Promise<PlaybackStatus>;
  setVolume: (volumePercent: number) => Promise<PlaybackStatus>;
  setMuted: (muted: boolean) => Promise<PlaybackStatus>;
  toggleMute: () => Promise<PlaybackStatus>;
  setVideoBounds: (bounds: { x: number; y: number; width: number; height: number; visible?: boolean }) => Promise<{ success: boolean }>;
  getPlaybackStatus: () => Promise<PlaybackStatus>;
  onPlaybackStatus: (callback: (status: PlaybackStatus) => void) => () => void;

  // Fullscreen APIs (Phase 8)
  toggleFullscreen: () => Promise<boolean>;
  setFullscreen: (fullscreen: boolean) => Promise<boolean>;
  isFullscreen: () => Promise<boolean>;
  onFullscreenChange: (callback: (fullscreen: boolean) => void) => () => void;
  onUserActive: (callback: () => void) => () => void;
  onWindowRestored: (callback: () => void) => () => void;
  onVideoDoubleClicked: (callback: () => void) => () => void;

  // Media Library & Persistence APIs (Phase 8)
  getLibrary: () => Promise<MediaItem[]>;
  getRecent: (limit?: number) => Promise<MediaItem[]>;
  importMediaFiles: () => Promise<{ canceled: boolean; importedCount: number }>;
  removeMedia: (id: string) => Promise<boolean>;
  updatePlaybackPosition: (filePath: string, position: number, duration?: number | null) => Promise<boolean>;

  // Phase 9 Playlists & Metadata APIs
  createPlaylist: (name: string) => Promise<Playlist | null>;
  renamePlaylist: (id: string, name: string) => Promise<boolean>;
  deletePlaylist: (id: string) => Promise<boolean>;
  getPlaylists: () => Promise<Playlist[]>;
  getPlaylistDetails: (id: string) => Promise<{ playlist: Playlist; items: PlaylistItem[] } | null>;
  addItemsToPlaylist: (playlistId: string, mediaIds: string[]) => Promise<boolean>;
  removeItemFromPlaylist: (playlistId: string, mediaId: string) => Promise<boolean>;
  reorderPlaylistItems: (playlistId: string, mediaIds: string[]) => Promise<boolean>;
  extractMetadata: (mediaId: string) => Promise<MediaItem | null>;
  cleanupThumbnails: () => Promise<void>;

  // Settings & Themes
  getSettings: () => Promise<Record<string, string>>;
  setSetting: (key: string, value: string) => Promise<boolean>;
  setAllSettings: (settings: Record<string, string>) => Promise<boolean>;
  resetSettings: () => Promise<boolean>;
  exportSettingsFile: (settingsJson: string) => Promise<{ canceled: boolean; filePath?: string; error?: string }>;
  importSettingsFile: () => Promise<{ canceled: boolean; data?: string; error?: string }>;
}

declare global {
  interface Window {
    nosvedAPI?: NosvedAPI;
  }
}
