import { contextBridge, ipcRenderer } from 'electron';

/**
 * Public, minimal API exposed to the renderer via contextBridge.
 * Raw IPC and Node.js primitives are strictly withheld.
 */
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
    status: {
      mediaState: string;
      currentFile: string | null;
      position: number | null;
      duration: number | null;
      paused: boolean;
      volume: number;
      error?: string;
    };
  }>;
  loadFile: (filePath: string) => Promise<{
    mediaState: string;
    currentFile: string | null;
    position: number | null;
    duration: number | null;
    paused: boolean;
    volume: number;
    error?: string;
  }>;
  play: () => Promise<{
    mediaState: string;
    currentFile: string | null;
    position: number | null;
    duration: number | null;
    paused: boolean;
    volume: number;
    error?: string;
  }>;
  pause: () => Promise<{
    mediaState: string;
    currentFile: string | null;
    position: number | null;
    duration: number | null;
    paused: boolean;
    volume: number;
    error?: string;
  }>;
  togglePause: () => Promise<{
    mediaState: string;
    currentFile: string | null;
    position: number | null;
    duration: number | null;
    paused: boolean;
    volume: number;
    error?: string;
  }>;
  seek: (positionSeconds: number) => Promise<{
    mediaState: string;
    currentFile: string | null;
    position: number | null;
    duration: number | null;
    paused: boolean;
    volume: number;
    error?: string;
  }>;
  setVolume: (volumePercent: number) => Promise<{
    mediaState: string;
    currentFile: string | null;
    position: number | null;
    duration: number | null;
    paused: boolean;
    volume: number;
    error?: string;
  }>;
  getPlaybackStatus: () => Promise<{
    mediaState: string;
    currentFile: string | null;
    position: number | null;
    duration: number | null;
    paused: boolean;
    volume: number;
    error?: string;
  }>;
  onPlaybackStatus: (callback: (status: {
    mediaState: string;
    currentFile: string | null;
    position: number | null;
    duration: number | null;
    paused: boolean;
    volume: number;
    error?: string;
  }) => void) => void;
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
  getPlaybackStatus: () => ipcRenderer.invoke('player:get-playback-status'),
  onPlaybackStatus: (callback) => {
    ipcRenderer.on('player:playback-status-update', (_event: Electron.IpcRendererEvent, status: unknown) => {
      callback(status as Parameters<typeof callback>[0]);
    });
  },
};

contextBridge.exposeInMainWorld('nosvedAPI', api);
