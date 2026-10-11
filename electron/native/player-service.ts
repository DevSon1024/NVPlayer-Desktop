import path from 'node:path';
import fs from 'node:fs';
import {
  getMpvFunctions,
  MpvFunctions,
  MPV_EVENT,
  decodeMpvEvent,
  safeGetMpvPropertyString,
} from './mpv-bindings';

export type PlayerLifecycleState =
  | 'uninitialized'
  | 'initializing'
  | 'initialized'
  | 'failed'
  | 'shutting-down'
  | 'shutdown';

export type MediaPlaybackState =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'ended'
  | 'error';

export interface PlayerServiceStatus {
  state: PlayerLifecycleState;
  apiVersion?: {
    raw: number;
    major: number;
    minor: number;
    formatted: string;
  };
  error?: string;
}

export interface PlaybackStatus {
  mediaState: MediaPlaybackState;
  currentFile: string | null;
  position: number | null;
  duration: number | null;
  paused: boolean;
  volume: number;
  videoWidth?: number | null;
  videoHeight?: number | null;
  error?: string;
}

export const SUPPORTED_VIDEO_EXTENSIONS = [
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.webm',
  '.flv',
  '.ts',
  '.m4v',
] as const;

/**
 * Native Player Service managing single-instance libmpv lifecycle,
 * asynchronous non-blocking event consumption via wakeup callbacks,
 * and high-level playback commands.
 */
export class NativePlayerService {
  private funcsGetter: () => MpvFunctions;
  private funcs: MpvFunctions | null = null;
  private handle: unknown | null = null;
  private state: PlayerLifecycleState = 'uninitialized';
  private apiVersion?: PlayerServiceStatus['apiVersion'];
  private lastError?: string;
  private videoWindowHwnd: bigint | number | null = null;

  private initPromise: Promise<PlayerServiceStatus> | null = null;
  private shutdownPromise: Promise<PlayerServiceStatus> | null = null;
  private cancelInitRequested = false;

  // Event loop & polling management
  private eventPollInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private positionPollInterval: NodeJS.Timeout | null = null;

  // Playback state model
  private playbackStatus: PlaybackStatus = {
    mediaState: 'idle',
    currentFile: null,
    position: null,
    duration: null,
    paused: true,
    volume: 100,
    videoWidth: null,
    videoHeight: null,
  };

  private playbackListeners = new Set<(status: PlaybackStatus) => void>();

  constructor(customFuncsGetter?: () => MpvFunctions) {
    this.funcsGetter = customFuncsGetter ?? (() => getMpvFunctions());
  }

  public setVideoWindowHwnd(hwnd: bigint | number | null): void {
    this.videoWindowHwnd = hwnd;
  }

  public getVideoWindowHwnd(): bigint | number | null {
    return this.videoWindowHwnd;
  }

  public getStatus(): PlayerServiceStatus {
    const status: PlayerServiceStatus = {
      state: this.state,
    };
    if (this.apiVersion) {
      status.apiVersion = { ...this.apiVersion };
    }
    if (this.lastError) {
      status.error = this.lastError;
    }
    return status;
  }

  public getPlaybackStatus(): PlaybackStatus {
    return { ...this.playbackStatus };
  }

  public onPlaybackStatusChange(listener: (status: PlaybackStatus) => void): () => void {
    this.playbackListeners.add(listener);
    // Emit immediate current state
    try {
      listener(this.getPlaybackStatus());
    } catch {
      // Ignore initial subscriber error
    }
    return () => {
      this.playbackListeners.delete(listener);
    };
  }

  private notifyPlaybackChange(): void {
    const snapshot = this.getPlaybackStatus();
    for (const listener of this.playbackListeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('[NativePlayerService] Error in playback listener:', err);
      }
    }
  }

  public async initialize(): Promise<PlayerServiceStatus> {
    console.log('[NativePlayerService] initialize() called, current state:', this.state);
    if (this.state === 'shutting-down') {
      throw new Error('Cannot initialize: Native player is currently shutting down');
    }

    if (this.state === 'initialized') {
      throw new Error('Duplicate initialization attempt: Native player is already initialized');
    }

    if (this.state === 'initializing' && this.initPromise) {
      return this.initPromise;
    }

    this.state = 'initializing';
    this.lastError = undefined;
    this.cancelInitRequested = false;
    this.isShuttingDown = false;

    this.initPromise = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      let allocatedHandle: unknown | null = null;
      try {
        if (!this.funcs) {
          console.log('[NativePlayerService] getting mpv functions...');
          this.funcs = this.funcsGetter();
        }

        if (!this.apiVersion) {
          const rawVer = this.funcs.mpv_client_api_version();
          const major = rawVer >> 16;
          const minor = rawVer & 0xffff;
          if (major !== 2) {
            throw new Error(`Incompatible libmpv major API version: expected 2, received ${major}.${minor}`);
          }
          this.apiVersion = { raw: rawVer, major, minor, formatted: `${major}.${minor}` };
        }

        if (this.cancelInitRequested) {
          throw new Error('Initialization aborted by shutdown request');
        }

        console.log('[NativePlayerService] calling mpv_create()...');
        allocatedHandle = this.funcs.mpv_create();
        if (!allocatedHandle) {
          throw new Error('mpv_create returned NULL pointer');
        }
        console.log('[NativePlayerService] mpv_create() succeeded');

        if (this.cancelInitRequested) {
          this.funcs.mpv_terminate_destroy(allocatedHandle);
          allocatedHandle = null;
          throw new Error('Initialization aborted by shutdown request');
        }

        // Configure video output embedding options before initialize
        console.log('[NativePlayerService] configuring vo, wid, and idle...');
        if (this.videoWindowHwnd && this.videoWindowHwnd !== 0 && this.videoWindowHwnd !== 0n) {
          console.log('[NativePlayerService] Embedding into native child HWND:', String(this.videoWindowHwnd));
          this.funcs.mpv_set_property_string(allocatedHandle, 'wid', String(this.videoWindowHwnd));
          this.funcs.mpv_set_property_string(allocatedHandle, 'vo', 'gpu');
        } else {
          console.log('[NativePlayerService] No video HWND provided; falling back to vo=null');
          this.funcs.mpv_set_property_string(allocatedHandle, 'vo', 'null');
        }
        this.funcs.mpv_set_property_string(allocatedHandle, 'idle', 'yes');

        console.log('[NativePlayerService] calling mpv_initialize()...');
        const code = this.funcs.mpv_initialize(allocatedHandle);
        console.log('[NativePlayerService] mpv_initialize() returned:', code);
        if (code < 0) {
          const errStr = this.funcs.mpv_error_string(code) || 'unknown error';
          this.funcs.mpv_terminate_destroy(allocatedHandle);
          allocatedHandle = null;
          throw new Error(`mpv_initialize failed with code ${code} (${errStr})`);
        }

        // Observe essential properties
        console.log('[NativePlayerService] observing properties...');
        this.funcs.mpv_observe_property(allocatedHandle, 1, 'pause', 0);
        this.funcs.mpv_observe_property(allocatedHandle, 2, 'time-pos', 0);
        this.funcs.mpv_observe_property(allocatedHandle, 3, 'duration', 0);
        this.funcs.mpv_observe_property(allocatedHandle, 4, 'volume', 0);
        this.funcs.mpv_observe_property(allocatedHandle, 5, 'eof-reached', 0);
        this.funcs.mpv_observe_property(allocatedHandle, 6, 'dwidth', 0);
        this.funcs.mpv_observe_property(allocatedHandle, 7, 'dheight', 0);

        this.handle = allocatedHandle;
        this.state = 'initialized';

        // Start safe periodic event drain loop
        this.startEventPolling();

        // Refresh baseline properties and drain initial events
        console.log('[NativePlayerService] refreshing state from native...');
        this.drainEvents();
        this.refreshStateFromNative();
        console.log('[NativePlayerService] initialization fully complete!');

        return this.getStatus();
      } catch (err) {
        console.error('[NativePlayerService] initialize error:', err);
        if (allocatedHandle && !this.handle) {
          try {
            this.funcs?.mpv_terminate_destroy(allocatedHandle);
          } catch {
            // Teardown fallback
          }
          allocatedHandle = null;
        }

        this.handle = null;
        this.state = 'failed';
        this.lastError = err instanceof Error ? err.message : String(err);
        throw err;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  private startEventPolling(): void {
    if (this.eventPollInterval) {
      clearInterval(this.eventPollInterval);
    }
    this.eventPollInterval = setInterval(() => {
      this.drainEvents();
    }, 100);
    this.eventPollInterval.unref();
  }

  private stopEventPolling(): void {
    if (this.eventPollInterval) {
      clearInterval(this.eventPollInterval);
      this.eventPollInterval = null;
    }
  }

  private drainEvents(): void {
    if (!this.handle || !this.funcs || this.isShuttingDown) {
      return;
    }

    while (this.handle && !this.isShuttingDown) {
      const evPtr = this.funcs.mpv_wait_event(this.handle, 0);
      if (!evPtr) break;

      const ev = decodeMpvEvent(evPtr);
      if (!ev || ev.event_id === MPV_EVENT.NONE) {
        break;
      }

      switch (ev.event_id) {
        case MPV_EVENT.START_FILE:
          this.playbackStatus.mediaState = 'loading';
          this.playbackStatus.error = undefined;
          this.notifyPlaybackChange();
          break;

        case MPV_EVENT.FILE_LOADED:
          this.refreshStateFromNative();
          this.playbackStatus.mediaState = this.playbackStatus.paused ? 'paused' : 'playing';
          this.updatePositionPolling();
          this.notifyPlaybackChange();
          break;

        case MPV_EVENT.END_FILE:
          this.playbackStatus.mediaState = 'ended';
          this.playbackStatus.position = this.playbackStatus.duration;
          this.updatePositionPolling();
          this.notifyPlaybackChange();
          break;

        case MPV_EVENT.PLAYBACK_RESTART:
        case MPV_EVENT.PROPERTY_CHANGE:
        case MPV_EVENT.SEEK:
          this.refreshStateFromNative();
          this.updatePositionPolling();
          this.notifyPlaybackChange();
          break;

        case MPV_EVENT.SHUTDOWN:
          this.playbackStatus.mediaState = 'idle';
          this.notifyPlaybackChange();
          break;

        default:
          break;
      }
    }
  }

  private refreshStateFromNative(): void {
    if (!this.handle || !this.funcs) return;

    console.log('[refreshStateFromNative] reading pause...');
    const pauseStr = safeGetMpvPropertyString(this.funcs, this.handle, 'pause');
    console.log('[refreshStateFromNative] pause value:', pauseStr);
    if (pauseStr !== null) {
      this.playbackStatus.paused = pauseStr === 'yes';
      if (this.playbackStatus.mediaState === 'playing' && this.playbackStatus.paused) {
        this.playbackStatus.mediaState = 'paused';
      } else if (this.playbackStatus.mediaState === 'paused' && !this.playbackStatus.paused) {
        this.playbackStatus.mediaState = 'playing';
      }
    }

    console.log('[refreshStateFromNative] reading volume...');
    const volumeStr = safeGetMpvPropertyString(this.funcs, this.handle, 'volume');
    console.log('[refreshStateFromNative] volume value:', volumeStr);
    if (volumeStr !== null) {
      const volNum = parseFloat(volumeStr);
      if (Number.isFinite(volNum)) {
        this.playbackStatus.volume = Math.round(volNum);
      }
    }

    console.log('[refreshStateFromNative] reading duration...');
    const durStr = safeGetMpvPropertyString(this.funcs, this.handle, 'duration');
    console.log('[refreshStateFromNative] duration value:', durStr);
    if (durStr !== null) {
      const durNum = parseFloat(durStr);
      this.playbackStatus.duration = Number.isFinite(durNum) ? durNum : null;
    }

    console.log('[refreshStateFromNative] reading time-pos...');
    const posStr = safeGetMpvPropertyString(this.funcs, this.handle, 'time-pos');
    console.log('[refreshStateFromNative] time-pos value:', posStr);
    if (posStr !== null) {
      const posNum = parseFloat(posStr);
      this.playbackStatus.position = Number.isFinite(posNum) ? posNum : null;
    }

    const dwidthStr = safeGetMpvPropertyString(this.funcs, this.handle, 'dwidth');
    if (dwidthStr !== null) {
      const w = parseInt(dwidthStr, 10);
      this.playbackStatus.videoWidth = Number.isFinite(w) && w > 0 ? w : null;
    }

    const dheightStr = safeGetMpvPropertyString(this.funcs, this.handle, 'dheight');
    if (dheightStr !== null) {
      const h = parseInt(dheightStr, 10);
      this.playbackStatus.videoHeight = Number.isFinite(h) && h > 0 ? h : null;
    }
    console.log('[refreshStateFromNative] done refreshing!');
  }

  private updatePositionPolling(): void {
    if (this.playbackStatus.mediaState === 'playing') {
      if (!this.positionPollInterval) {
        this.positionPollInterval = setInterval(() => {
          if (this.handle && this.funcs && this.playbackStatus.mediaState === 'playing') {
            const posStr = safeGetMpvPropertyString(this.funcs, this.handle, 'time-pos');
            if (posStr !== null) {
              const posNum = parseFloat(posStr);
              if (Number.isFinite(posNum) && posNum !== this.playbackStatus.position) {
                this.playbackStatus.position = posNum;
                this.notifyPlaybackChange();
              }
            }
          }
        }, 250);
        this.positionPollInterval.unref();
      }
    } else {
      if (this.positionPollInterval) {
        clearInterval(this.positionPollInterval);
        this.positionPollInterval = null;
      }
    }
  }

  // --- Playback Commands ---

  public async loadMedia(filePath: string): Promise<PlaybackStatus> {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path: Must provide a non-empty string path');
    }

    const ext = path.extname(filePath).toLowerCase();
    const isSupported = SUPPORTED_VIDEO_EXTENSIONS.includes(ext as (typeof SUPPORTED_VIDEO_EXTENSIONS)[number]);
    if (!isSupported) {
      throw new Error(`Unsupported video format "${ext}". Supported extensions: ${SUPPORTED_VIDEO_EXTENSIONS.join(', ')}`);
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    if (this.state !== 'initialized') {
      await this.initialize();
    }

    if (!this.handle || !this.funcs) {
      throw new Error('Cannot load media: Native player handle is not ready');
    }

    this.playbackStatus.currentFile = filePath;
    this.playbackStatus.mediaState = 'loading';
    this.playbackStatus.position = null;
    this.playbackStatus.duration = null;
    this.playbackStatus.error = undefined;
    this.notifyPlaybackChange();

    const code = this.funcs.mpv_command(this.handle, ['loadfile', filePath, 'replace', null]);
    if (code < 0) {
      const errStr = this.funcs.mpv_error_string(code) || 'unknown error';
      this.playbackStatus.mediaState = 'error';
      this.playbackStatus.error = `Failed to load file: ${errStr} (code ${code})`;
      this.notifyPlaybackChange();
      throw new Error(this.playbackStatus.error);
    }

    return this.getPlaybackStatus();
  }

  public async play(): Promise<PlaybackStatus> {
    if (!this.handle || !this.funcs) {
      throw new Error('Cannot play: Native player instance is not initialized');
    }
    const code = this.funcs.mpv_set_property_string(this.handle, 'pause', 'no');
    if (code < 0) {
      const errStr = this.funcs.mpv_error_string(code);
      throw new Error(`Failed to play media: ${errStr}`);
    }
    this.playbackStatus.paused = false;
    if (this.playbackStatus.mediaState === 'paused') {
      this.playbackStatus.mediaState = 'playing';
    }
    this.updatePositionPolling();
    this.notifyPlaybackChange();
    return this.getPlaybackStatus();
  }

  public async pause(): Promise<PlaybackStatus> {
    if (!this.handle || !this.funcs) {
      throw new Error('Cannot pause: Native player instance is not initialized');
    }
    const code = this.funcs.mpv_set_property_string(this.handle, 'pause', 'yes');
    if (code < 0) {
      const errStr = this.funcs.mpv_error_string(code);
      throw new Error(`Failed to pause media: ${errStr}`);
    }
    this.playbackStatus.paused = true;
    if (this.playbackStatus.mediaState === 'playing') {
      this.playbackStatus.mediaState = 'paused';
    }
    this.updatePositionPolling();
    this.notifyPlaybackChange();
    return this.getPlaybackStatus();
  }

  public async togglePause(): Promise<PlaybackStatus> {
    if (this.playbackStatus.paused) {
      return this.play();
    }
    return this.pause();
  }

  public async seek(positionSeconds: number): Promise<PlaybackStatus> {
    if (typeof positionSeconds !== 'number' || !Number.isFinite(positionSeconds)) {
      throw new Error('Invalid seek position: Value must be a finite number');
    }
    if (positionSeconds < 0) {
      throw new Error('Invalid seek position: Cannot seek to a negative timestamp');
    }
    if (this.playbackStatus.duration !== null && positionSeconds > this.playbackStatus.duration) {
      positionSeconds = this.playbackStatus.duration;
    }

    if (!this.handle || !this.funcs) {
      throw new Error('Cannot seek: Native player instance is not initialized');
    }

    const code = this.funcs.mpv_command(this.handle, ['seek', String(positionSeconds), 'absolute', null]);
    if (code < 0) {
      const errStr = this.funcs.mpv_error_string(code);
      throw new Error(`Seek command failed: ${errStr}`);
    }

    this.playbackStatus.position = positionSeconds;
    this.notifyPlaybackChange();
    return this.getPlaybackStatus();
  }

  public async setVolume(volumePercent: number): Promise<PlaybackStatus> {
    if (typeof volumePercent !== 'number' || !Number.isFinite(volumePercent)) {
      throw new Error('Invalid volume: Value must be a finite number');
    }
    if (volumePercent < 0 || volumePercent > 100) {
      throw new Error('Invalid volume: Value must be between 0 and 100');
    }

    if (!this.handle || !this.funcs) {
      throw new Error('Cannot set volume: Native player instance is not initialized');
    }

    const target = Math.round(volumePercent);
    const code = this.funcs.mpv_set_property_string(this.handle, 'volume', String(target));
    if (code < 0) {
      const errStr = this.funcs.mpv_error_string(code);
      throw new Error(`Failed to set volume: ${errStr}`);
    }

    this.playbackStatus.volume = target;
    this.notifyPlaybackChange();
    return this.getPlaybackStatus();
  }

  // --- Shutdown ---

  public async shutdown(): Promise<PlayerServiceStatus> {
    if (this.state === 'shutdown') {
      return this.getStatus();
    }

    if (this.state === 'shutting-down' && this.shutdownPromise) {
      return this.shutdownPromise;
    }

    if (this.state === 'initializing') {
      this.cancelInitRequested = true;
    }

    this.state = 'shutting-down';
    this.isShuttingDown = true;

    this.stopEventPolling();
    if (this.positionPollInterval) {
      clearInterval(this.positionPollInterval);
      this.positionPollInterval = null;
    }

    this.shutdownPromise = (async () => {
      try {
        if (this.initPromise) {
          try {
            await this.initPromise;
          } catch {
            // Expected if cancelled or failed
          }
        }

        if (this.handle && this.funcs) {
          try {

            // Drain remaining events without blocking
            try {
              let ev = this.funcs.mpv_wait_event(this.handle, 0);
              while (ev) {
                const dec = decodeMpvEvent(ev);
                if (!dec || dec.event_id === MPV_EVENT.NONE) break;
                ev = this.funcs.mpv_wait_event(this.handle, 0);
              }
            } catch {
              // Ignore event drain errors during teardown
            }

            this.funcs.mpv_terminate_destroy(this.handle);
          } catch (err) {
            console.error('[NativePlayerService] Error during terminate_destroy:', err);
          } finally {
            this.handle = null;
          }
        }

        this.state = 'shutdown';
        this.cancelInitRequested = false;
        this.playbackStatus = {
          mediaState: 'idle',
          currentFile: null,
          position: null,
          duration: null,
          paused: true,
          volume: 100,
          videoWidth: null,
          videoHeight: null,
        };
        this.notifyPlaybackChange();

        return this.getStatus();
      } finally {
        this.shutdownPromise = null;
      }
    })();

    return this.shutdownPromise;
  }
}
