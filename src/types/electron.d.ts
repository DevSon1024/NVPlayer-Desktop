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
  getPlaybackStatus: () => Promise<PlaybackStatus>;
  onPlaybackStatus: (callback: (status: PlaybackStatus) => void) => void;
}

export interface PlaybackStatus {
  mediaState: 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error' | string;
  currentFile: string | null;
  position: number | null;
  duration: number | null;
  paused: boolean;
  volume: number;
  error?: string;
}

declare global {
  interface Window {
    nosvedAPI?: NosvedAPI;
  }
}
