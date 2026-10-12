import path from 'node:path';
import fs from 'node:fs';
import {
  getMpvFunctions,
  MpvFunctions,
  MPV_EVENT,
  MPV_END_FILE_REASON,
  decodeMpvEvent,
  decodeMpvEndFileEvent,
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
  muted: boolean;
  videoWidth?: number | null;
  videoHeight?: number | null;
  error?: string;
}

export interface MediaTrackInfo {
  id: number;
  type: 'video' | 'audio' | 'sub';
  title?: string;
  lang?: string;
  codec?: string;
  selected: boolean;
  isDefault?: boolean;
}

export interface PlayerTracksSnapshot {
  audioTracks: MediaTrackInfo[];
  subtitleTracks: MediaTrackInfo[];
  selectedAudioId: number | string | null;
  selectedSubtitleId: number | string | null;
  subtitlesVisible: boolean;
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
    muted: false,
    videoWidth: null,
    videoHeight: null,
  };

  private playbackListeners = new Set<(status: PlaybackStatus) => void>();
  private fullscreenToggleListeners = new Set<() => void>();
  private lastMpvFullscreen: string | null = null;

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

  public onFullscreenToggle(listener: () => void): () => void {
    this.fullscreenToggleListeners.add(listener);
    return () => {
      this.fullscreenToggleListeners.delete(listener);
    };
  }

  private notifyFullscreenToggle(): void {
    for (const listener of this.fullscreenToggleListeners) {
      try {
        listener();
      } catch (err) {
        console.error('[NativePlayerService] Error in fullscreen toggle listener:', err);
      }
    }
  }

  public async initialize(): Promise<PlayerServiceStatus> {
    console.log('[NativePlayerService] initialize() called, current state:', this.state);
    if (this.state === 'shutting-down') {
      throw new Error('Cannot initialize: Native player is currently shutting down');
    }

    if (this.state === 'initialized') {
      return this.getStatus();
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
        this.funcs.mpv_set_property_string(allocatedHandle, 'input-default-bindings', 'no');
        this.funcs.mpv_set_property_string(allocatedHandle, 'input-vo-keyboard', 'no');
        this.funcs.mpv_set_property_string(allocatedHandle, 'input-cursor', 'yes');

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
        this.funcs.mpv_observe_property(allocatedHandle, 8, 'mute', 0);
        this.funcs.mpv_observe_property(allocatedHandle, 9, 'fullscreen', 0);
        this.funcs.mpv_command(allocatedHandle, ['keybind', 'MBTN_LEFT_DBL', 'cycle fullscreen', null]);

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

        case MPV_EVENT.END_FILE: {
          const endData = decodeMpvEndFileEvent(ev.data);
          const reason = endData?.reason ?? MPV_END_FILE_REASON.EOF;
          if (reason === MPV_END_FILE_REASON.ERROR) {
            const errCode = endData?.error ?? -1;
            const errStr = this.funcs?.mpv_error_string(errCode) || 'unsupported or corrupt media file';
            this.playbackStatus.mediaState = 'error';
            this.playbackStatus.error = `Playback error: ${errStr} (code ${errCode})`;
          } else if (reason === MPV_END_FILE_REASON.EOF) {
            this.playbackStatus.mediaState = 'ended';
            this.playbackStatus.position = this.playbackStatus.duration;
          } else if (reason === MPV_END_FILE_REASON.STOP || reason === MPV_END_FILE_REASON.REDIRECT) {
            if (this.playbackStatus.mediaState !== 'loading') {
              this.playbackStatus.mediaState = 'idle';
            }
          }
          this.updatePositionPolling();
          this.notifyPlaybackChange();
          break;
        }

        case MPV_EVENT.PLAYBACK_RESTART:
        case MPV_EVENT.PROPERTY_CHANGE:
        case MPV_EVENT.SEEK:
          if (ev.event_id === MPV_EVENT.PROPERTY_CHANGE && Number(ev.reply_userdata) === 9) {
            const currentFs = safeGetMpvPropertyString(this.funcs, this.handle, 'fullscreen');
            if (this.lastMpvFullscreen !== null && currentFs !== this.lastMpvFullscreen) {
              this.notifyFullscreenToggle();
            }
            this.lastMpvFullscreen = currentFs;
            break;
          }
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

    const muteStr = safeGetMpvPropertyString(this.funcs, this.handle, 'mute');
    if (muteStr !== null) {
      this.playbackStatus.muted = muteStr === 'yes';
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
    if (!this.playbackStatus.currentFile || this.playbackStatus.mediaState === 'idle') {
      throw new Error('Cannot play: No media file loaded');
    }
    if (this.playbackStatus.mediaState === 'loading') {
      throw new Error('Cannot play: Media is currently loading');
    }

    // Rewind to beginning if playing from ended state
    if (this.playbackStatus.mediaState === 'ended') {
      this.funcs.mpv_command(this.handle, ['seek', '0', 'absolute', null]);
      this.playbackStatus.position = 0;
    }

    const code = this.funcs.mpv_set_property_string(this.handle, 'pause', 'no');
    if (code < 0) {
      const errStr = this.funcs.mpv_error_string(code);
      throw new Error(`Failed to play media: ${errStr}`);
    }
    this.playbackStatus.paused = false;
    this.playbackStatus.mediaState = 'playing';
    this.updatePositionPolling();
    this.notifyPlaybackChange();
    return this.getPlaybackStatus();
  }

  public async pause(): Promise<PlaybackStatus> {
    if (!this.handle || !this.funcs) {
      throw new Error('Cannot pause: Native player instance is not initialized');
    }
    if (!this.playbackStatus.currentFile || this.playbackStatus.mediaState === 'idle') {
      throw new Error('Cannot pause: No media file loaded');
    }
    if (this.playbackStatus.mediaState === 'loading') {
      throw new Error('Cannot pause: Media is currently loading');
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
    if (this.playbackStatus.paused || this.playbackStatus.mediaState === 'ended') {
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
    if (!this.handle || !this.funcs) {
      throw new Error('Cannot seek: Native player instance is not initialized');
    }
    if (!this.playbackStatus.currentFile || this.playbackStatus.mediaState === 'idle') {
      throw new Error('Cannot seek: No media file loaded');
    }
    if (this.playbackStatus.mediaState === 'loading') {
      throw new Error('Cannot seek: Media is currently loading');
    }

    if (this.playbackStatus.duration !== null && positionSeconds > this.playbackStatus.duration) {
      positionSeconds = this.playbackStatus.duration;
    }

    const code = this.funcs.mpv_command(this.handle, ['seek', String(positionSeconds), 'absolute', null]);
    if (code < 0) {
      const errStr = this.funcs.mpv_error_string(code);
      throw new Error(`Seek command failed: ${errStr}`);
    }

    this.playbackStatus.position = positionSeconds;
    if (this.playbackStatus.mediaState === 'ended' && positionSeconds < (this.playbackStatus.duration ?? positionSeconds)) {
      this.playbackStatus.mediaState = this.playbackStatus.paused ? 'paused' : 'playing';
    }
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
    if (this.playbackStatus.muted && target > 0) {
      try {
        this.funcs.mpv_set_property_string(this.handle, 'mute', 'no');
        this.playbackStatus.muted = false;
      } catch {
        // Fallback
      }
    }
    this.notifyPlaybackChange();
    return this.getPlaybackStatus();
  }

  public async setMuted(muted: boolean): Promise<PlaybackStatus> {
    if (!this.handle || !this.funcs) {
      throw new Error('Cannot set mute: Native player instance is not initialized');
    }

    const code = this.funcs.mpv_set_property_string(this.handle, 'mute', muted ? 'yes' : 'no');
    if (code < 0) {
      const errStr = this.funcs.mpv_error_string(code);
      throw new Error(`Failed to set mute: ${errStr}`);
    }

    this.playbackStatus.muted = muted;
    this.notifyPlaybackChange();
    return this.getPlaybackStatus();
  }

  public async toggleMute(): Promise<PlaybackStatus> {
    return this.setMuted(!this.playbackStatus.muted);
  }

  // Track Management
  public getTracks(): PlayerTracksSnapshot {
    if (!this.handle || !this.funcs) {
      return {
        audioTracks: [],
        subtitleTracks: [],
        selectedAudioId: null,
        selectedSubtitleId: null,
        subtitlesVisible: true,
      };
    }

    const audioTracks: MediaTrackInfo[] = [];
    const subtitleTracks: MediaTrackInfo[] = [];

    const countStr = safeGetMpvPropertyString(this.funcs, this.handle, 'track-list/count');
    const count = countStr ? parseInt(countStr, 10) : 0;

    for (let i = 0; i < count; i++) {
      const type = safeGetMpvPropertyString(this.funcs, this.handle, `track-list/${i}/type`);
      const idStr = safeGetMpvPropertyString(this.funcs, this.handle, `track-list/${i}/id`);
      const title = safeGetMpvPropertyString(this.funcs, this.handle, `track-list/${i}/title`) || undefined;
      const lang = safeGetMpvPropertyString(this.funcs, this.handle, `track-list/${i}/lang`) || undefined;
      const codec = safeGetMpvPropertyString(this.funcs, this.handle, `track-list/${i}/codec`) || undefined;
      const selectedStr = safeGetMpvPropertyString(this.funcs, this.handle, `track-list/${i}/selected`);
      const defaultStr = safeGetMpvPropertyString(this.funcs, this.handle, `track-list/${i}/default`);

      const id = idStr ? parseInt(idStr, 10) : i + 1;
      const selected = selectedStr === 'yes';
      const isDefault = defaultStr === 'yes';

      if (type === 'audio') {
        audioTracks.push({
          id,
          type: 'audio',
          title,
          lang,
          codec,
          selected,
          isDefault,
        });
      } else if (type === 'sub') {
        subtitleTracks.push({
          id,
          type: 'sub',
          title,
          lang,
          codec,
          selected,
          isDefault,
        });
      }
    }

    const aidStr = safeGetMpvPropertyString(this.funcs, this.handle, 'aid');
    const sidStr = safeGetMpvPropertyString(this.funcs, this.handle, 'sid');
    const subVisStr = safeGetMpvPropertyString(this.funcs, this.handle, 'sub-visibility');

    return {
      audioTracks,
      subtitleTracks,
      selectedAudioId: aidStr === 'no' ? 'no' : aidStr ? parseInt(aidStr, 10) : null,
      selectedSubtitleId: sidStr === 'no' ? 'no' : sidStr ? parseInt(sidStr, 10) : null,
      subtitlesVisible: subVisStr !== 'no',
    };
  }

  public async setAudioTrack(trackId: number | string): Promise<PlayerTracksSnapshot> {
    if (!this.handle || !this.funcs) {
      throw new Error('Cannot set audio track: Native player instance is not initialized');
    }
    const val = String(trackId);
    const code = this.funcs.mpv_set_property_string(this.handle, 'aid', val);
    if (code < 0) {
      const errStr = this.funcs.mpv_error_string(code);
      throw new Error(`Failed to set audio track: ${errStr}`);
    }
    return this.getTracks();
  }

  public async setSubtitleTrack(trackId: number | string): Promise<PlayerTracksSnapshot> {
    if (!this.handle || !this.funcs) {
      throw new Error('Cannot set subtitle track: Native player instance is not initialized');
    }
    const val = String(trackId);
    const code = this.funcs.mpv_set_property_string(this.handle, 'sid', val);
    if (code < 0) {
      const errStr = this.funcs.mpv_error_string(code);
      throw new Error(`Failed to set subtitle track: ${errStr}`);
    }
    if (val !== 'no') {
      this.funcs.mpv_set_property_string(this.handle, 'sub-visibility', 'yes');
    }
    return this.getTracks();
  }

  public async setSubtitlesVisible(visible: boolean): Promise<PlayerTracksSnapshot> {
    if (!this.handle || !this.funcs) {
      throw new Error('Cannot set subtitle visibility: Native player instance is not initialized');
    }
    const code = this.funcs.mpv_set_property_string(this.handle, 'sub-visibility', visible ? 'yes' : 'no');
    if (code < 0) {
      const errStr = this.funcs.mpv_error_string(code);
      throw new Error(`Failed to set subtitle visibility: ${errStr}`);
    }
    return this.getTracks();
  }

  public async addSubtitleFile(filePath: string): Promise<PlayerTracksSnapshot> {
    if (!this.handle || !this.funcs) {
      throw new Error('Cannot add subtitle file: Native player instance is not initialized');
    }
    if (!fs.existsSync(filePath)) {
      throw new Error(`Subtitle file does not exist: ${filePath}`);
    }
    const code = this.funcs.mpv_command(this.handle, ['sub-add', filePath, 'select', null]);
    if (code < 0) {
      const errStr = this.funcs.mpv_error_string(code);
      throw new Error(`Failed to add subtitle file: ${errStr}`);
    }
    return this.getTracks();
  }

  public async setSubtitleDelay(seconds: number): Promise<number> {
    if (!this.handle || !this.funcs) {
      throw new Error('Cannot set subtitle delay: Native player instance is not initialized');
    }
    const code = this.funcs.mpv_set_property_string(this.handle, 'sub-delay', String(seconds));
    if (code < 0) {
      const errStr = this.funcs.mpv_error_string(code);
      throw new Error(`Failed to set subtitle delay: ${errStr}`);
    }
    return seconds;
  }

  public async setAudioDelay(seconds: number): Promise<number> {
    if (!this.handle || !this.funcs) {
      throw new Error('Cannot set audio delay: Native player instance is not initialized');
    }
    const code = this.funcs.mpv_set_property_string(this.handle, 'audio-delay', String(seconds));
    if (code < 0) {
      const errStr = this.funcs.mpv_error_string(code);
      throw new Error(`Failed to set audio delay: ${errStr}`);
    }
    return seconds;
  }

  // Shutdown

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
        this.lastMpvFullscreen = null;
        this.playbackStatus = {
          mediaState: 'idle',
          currentFile: null,
          position: null,
          duration: null,
          paused: true,
          volume: 100,
          muted: false,
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
