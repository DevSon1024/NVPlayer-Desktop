import { contextBridge, ipcRenderer } from 'electron';

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

  // Phase 8 Fullscreen APIs
  toggleFullscreen: () => Promise<boolean>;
  setFullscreen: (fullscreen: boolean) => Promise<boolean>;
  isFullscreen: () => Promise<boolean>;
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
};

contextBridge.exposeInMainWorld('nosvedAPI', api);
