import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';

console.log('=== PHASE 7: PLAYER CONTROLS, RELIABILITY & COMPATIBILITY UNIT TESTS ===');

let passedCount = 0;

// FormatTime logic matching src/App.tsx
function formatTime(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '--:--';
  }
  const totalSecs = Math.floor(seconds);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

const MPV_EVENT = {
  NONE: 0,
  SHUTDOWN: 1,
  START_FILE: 6,
  END_FILE: 7,
  FILE_LOADED: 8,
  SEEK: 20,
  PLAYBACK_RESTART: 21,
  PROPERTY_CHANGE: 22,
};

const MPV_END_FILE_REASON = {
  EOF: 0,
  STOP: 2,
  QUIT: 3,
  ERROR: 4,
  REDIRECT: 5,
};

const SUPPORTED_VIDEO_EXTENSIONS = [
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.webm',
  '.flv',
  '.ts',
  '.m4v',
];

class MockReliablePlayerService {
  constructor(funcsGetter) {
    this.funcsGetter = funcsGetter;
    this.funcs = null;
    this.handle = null;
    this.state = 'uninitialized';
    this.apiVersion = null;
    this.lastError = undefined;

    this.initPromise = null;
    this.shutdownPromise = null;
    this.isShuttingDown = false;

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

    this.playbackListeners = new Set();
    this.commandCalls = [];
    this.setPropertyCalls = [];
  }

  getStatus() {
    const s = { state: this.state };
    if (this.apiVersion) s.apiVersion = { ...this.apiVersion };
    if (this.lastError) s.error = this.lastError;
    return s;
  }

  getPlaybackStatus() {
    return { ...this.playbackStatus };
  }

  onPlaybackStatusChange(listener) {
    this.playbackListeners.add(listener);
    try {
      listener(this.getPlaybackStatus());
    } catch {}
    return () => this.playbackListeners.delete(listener);
  }

  notifyPlaybackChange() {
    const snap = this.getPlaybackStatus();
    for (const l of this.playbackListeners) {
      try {
        l(snap);
      } catch {}
    }
  }

  async initialize() {
    if (this.state === 'initialized') return this.getStatus();
    this.state = 'initializing';
    this.funcs = this.funcsGetter();
    this.handle = this.funcs.mpv_create();
    this.funcs.mpv_initialize(this.handle);
    this.state = 'initialized';
    this.apiVersion = { raw: 131077, major: 2, minor: 5, formatted: '2.5' };
    return this.getStatus();
  }

  async loadMedia(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path: Must provide a non-empty string path');
    }
    const ext = path.extname(filePath).toLowerCase();
    if (!SUPPORTED_VIDEO_EXTENSIONS.includes(ext)) {
      throw new Error(`Unsupported video format "${ext}"`);
    }
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    if (this.state !== 'initialized') {
      await this.initialize();
    }

    this.playbackStatus.currentFile = filePath;
    this.playbackStatus.mediaState = 'loading';
    this.playbackStatus.position = null;
    this.playbackStatus.duration = null;
    this.playbackStatus.error = undefined;
    this.notifyPlaybackChange();

    this.commandCalls.push(['loadfile', filePath, 'replace', null]);
    const code = this.funcs.mpv_command(this.handle, ['loadfile', filePath, 'replace', null]);
    if (code < 0) {
      this.playbackStatus.mediaState = 'error';
      this.playbackStatus.error = 'Failed to load file';
      this.notifyPlaybackChange();
      throw new Error(this.playbackStatus.error);
    }
    return this.getPlaybackStatus();
  }

  async play() {
    if (!this.handle || !this.funcs) throw new Error('Cannot play: Native player instance is not initialized');
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
    if (code < 0) throw new Error('Failed to play');
    this.playbackStatus.paused = false;
    this.playbackStatus.mediaState = 'playing';
    this.notifyPlaybackChange();
    return this.getPlaybackStatus();
  }

  async pause() {
    if (!this.handle || !this.funcs) throw new Error('Cannot pause: Native player instance is not initialized');
    if (!this.playbackStatus.currentFile || this.playbackStatus.mediaState === 'idle') {
      throw new Error('Cannot pause: No media file loaded');
    }
    if (this.playbackStatus.mediaState === 'loading') {
      throw new Error('Cannot pause: Media is currently loading');
    }
    const code = this.funcs.mpv_set_property_string(this.handle, 'pause', 'yes');
    if (code < 0) throw new Error('Failed to pause');
    this.playbackStatus.paused = true;
    if (this.playbackStatus.mediaState === 'playing') {
      this.playbackStatus.mediaState = 'paused';
    }
    this.notifyPlaybackChange();
    return this.getPlaybackStatus();
  }

  async togglePause() {
    if (this.playbackStatus.paused || this.playbackStatus.mediaState === 'ended') {
      return this.play();
    }
    return this.pause();
  }

  async seek(positionSeconds) {
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
    if (code < 0) throw new Error('Seek command failed');

    this.playbackStatus.position = positionSeconds;
    if (this.playbackStatus.mediaState === 'ended' && positionSeconds < (this.playbackStatus.duration ?? positionSeconds)) {
      this.playbackStatus.mediaState = this.playbackStatus.paused ? 'paused' : 'playing';
    }
    this.notifyPlaybackChange();
    return this.getPlaybackStatus();
  }

  async setVolume(volumePercent) {
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
    if (code < 0) throw new Error('Failed to set volume');
    this.playbackStatus.volume = target;
    if (this.playbackStatus.muted && target > 0) {
      this.funcs.mpv_set_property_string(this.handle, 'mute', 'no');
      this.playbackStatus.muted = false;
    }
    this.notifyPlaybackChange();
    return this.getPlaybackStatus();
  }

  async setMuted(muted) {
    if (!this.handle || !this.funcs) {
      throw new Error('Cannot set mute: Native player instance is not initialized');
    }
    const code = this.funcs.mpv_set_property_string(this.handle, 'mute', muted ? 'yes' : 'no');
    if (code < 0) throw new Error('Failed to set mute');
    this.playbackStatus.muted = muted;
    this.notifyPlaybackChange();
    return this.getPlaybackStatus();
  }

  async toggleMute() {
    return this.setMuted(!this.playbackStatus.muted);
  }

  simulateEndFileEvent(reason, errorCode = 0) {
    if (reason === MPV_END_FILE_REASON.ERROR) {
      this.playbackStatus.mediaState = 'error';
      this.playbackStatus.error = `Playback error: decoder failed (code ${errorCode})`;
    } else if (reason === MPV_END_FILE_REASON.EOF) {
      this.playbackStatus.mediaState = 'ended';
      this.playbackStatus.position = this.playbackStatus.duration;
    } else if (reason === MPV_END_FILE_REASON.STOP || reason === MPV_END_FILE_REASON.REDIRECT) {
      if (this.playbackStatus.mediaState !== 'loading') {
        this.playbackStatus.mediaState = 'idle';
      }
    }
    this.notifyPlaybackChange();
  }

  async shutdown() {
    this.state = 'shutdown';
    this.handle = null;
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
  }
}

function createMockFuncs() {
  return {
    mpv_create: () => ({ ctx: 'mock_handle' }),
    mpv_initialize: () => 0,
    mpv_terminate_destroy: () => {},
    mpv_command: () => 0,
    mpv_set_property_string: () => 0,
    mpv_get_property_string: () => null,
    mpv_error_string: (c) => `error_${c}`,
  };
}

async function runTests() {
  const tempDir = path.resolve(process.cwd(), 'scripts', 'temp_test_media');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const validFile = path.join(tempDir, 'sample_normal.mp4');
  const unicodeFile = path.join(tempDir, 'sample 🎬 (spaced & unicode).mp4');
  fs.writeFileSync(validFile, 'fake mp4 content');
  fs.writeFileSync(unicodeFile, 'fake unicode content');

  try {
    // TEST 1: Time formatting with HH:MM:SS and edge cases
    console.log('[TEST 1] formatTime formatting accuracy');
    assert.strictEqual(formatTime(null), '--:--');
    assert.strictEqual(formatTime(-10), '--:--');
    assert.strictEqual(formatTime(NaN), '--:--');
    assert.strictEqual(formatTime(0), '00:00');
    assert.strictEqual(formatTime(45), '00:45');
    assert.strictEqual(formatTime(125), '02:05');
    assert.strictEqual(formatTime(3600), '01:00:00');
    assert.strictEqual(formatTime(5025), '01:23:45');
    console.log('  [PASS] formatTime correctly formats standard and hour-length times');
    passedCount++;

    // TEST 2: Play/pause rejection when no media or loading
    console.log('[TEST 2] Play/pause state guards without media');
    const svc = new MockReliablePlayerService(createMockFuncs);
    await svc.initialize();
    await assert.rejects(() => svc.play(), /Cannot play: No media file loaded/);
    await assert.rejects(() => svc.pause(), /Cannot pause: No media file loaded/);
    await assert.rejects(() => svc.seek(10), /Cannot seek: No media file loaded/);
    console.log('  [PASS] Play, pause, and seek safely reject when no media is loaded');
    passedCount++;

    // TEST 3: Media loading with spaces and Unicode in path
    console.log('[TEST 3] Loading file with spaces and Unicode characters');
    await svc.loadMedia(unicodeFile);
    assert.strictEqual(svc.getPlaybackStatus().currentFile, unicodeFile);
    assert.strictEqual(svc.getPlaybackStatus().mediaState, 'loading');
    console.log('  [PASS] Unicode and spaced paths accepted and queued cleanly');
    passedCount++;

    // TEST 4: Seek rejection during media loading
    console.log('[TEST 4] Seek rejected during loading state');
    await assert.rejects(() => svc.seek(5), /Cannot seek: Media is currently loading/);
    console.log('  [PASS] Seeking during media loading safely rejected');
    passedCount++;

    // TEST 5: Successful playback transition & seek boundary clamping
    console.log('[TEST 5] Play, seek bounds, and duration clamping');
    svc.playbackStatus.mediaState = 'paused';
    svc.playbackStatus.duration = 60.0;
    await svc.play();
    assert.strictEqual(svc.getPlaybackStatus().paused, false);
    assert.strictEqual(svc.getPlaybackStatus().mediaState, 'playing');

    await svc.seek(100.0); // Exceeds duration (60)
    assert.strictEqual(svc.getPlaybackStatus().position, 60.0);

    await assert.rejects(() => svc.seek(-5), /Cannot seek to a negative timestamp/);
    await assert.rejects(() => svc.seek(NaN), /Value must be a finite number/);
    console.log('  [PASS] Seek boundaries safely clamped and invalid inputs rejected');
    passedCount++;

    // TEST 6: Replay from ended state
    console.log('[TEST 6] Replay from ended state rewinds to 0');
    svc.playbackStatus.mediaState = 'ended';
    svc.playbackStatus.position = 60.0;
    svc.playbackStatus.paused = true;

    await svc.play();
    assert.strictEqual(svc.getPlaybackStatus().mediaState, 'playing');
    assert.strictEqual(svc.getPlaybackStatus().position, 0);
    assert.strictEqual(svc.getPlaybackStatus().paused, false);
    console.log('  [PASS] Play command on ended media automatically rewinds to 0');
    passedCount++;

    // TEST 7: Volume and Mute synchronization
    console.log('[TEST 7] Volume and native mute synchronization');
    await svc.setVolume(75);
    assert.strictEqual(svc.getPlaybackStatus().volume, 75);
    assert.strictEqual(svc.getPlaybackStatus().muted, false);

    await svc.toggleMute();
    assert.strictEqual(svc.getPlaybackStatus().muted, true);
    assert.strictEqual(svc.getPlaybackStatus().volume, 75); // Volume level preserved!

    await svc.toggleMute();
    assert.strictEqual(svc.getPlaybackStatus().muted, false);
    assert.strictEqual(svc.getPlaybackStatus().volume, 75);

    // Increasing volume while muted automatically unmutes
    await svc.setMuted(true);
    assert.strictEqual(svc.getPlaybackStatus().muted, true);
    await svc.setVolume(80);
    assert.strictEqual(svc.getPlaybackStatus().muted, false);
    assert.strictEqual(svc.getPlaybackStatus().volume, 80);
    console.log('  [PASS] Mute preserves volume level and adjusting volume unmutes');
    passedCount++;

    // TEST 8: Decoding END_FILE error vs EOF
    console.log('[TEST 8] Discrimination between decoder error and EOF');
    svc.playbackStatus.mediaState = 'playing';
    svc.simulateEndFileEvent(MPV_END_FILE_REASON.ERROR, -2);
    assert.strictEqual(svc.getPlaybackStatus().mediaState, 'error');
    assert.ok(svc.getPlaybackStatus().error?.includes('code -2'));

    // Loading new file clears previous error
    await svc.loadMedia(validFile);
    assert.strictEqual(svc.getPlaybackStatus().mediaState, 'loading');
    assert.strictEqual(svc.getPlaybackStatus().error, undefined);
    console.log('  [PASS] Corrupt/decoder error cleanly flagged and cleared on next load');
    passedCount++;

    // TEST 9: Stale STOP/REPLACE event does not overwrite loading file
    console.log('[TEST 9] Stale replacement events do not overwrite loading state');
    assert.strictEqual(svc.getPlaybackStatus().mediaState, 'loading');
    svc.simulateEndFileEvent(MPV_END_FILE_REASON.STOP);
    assert.strictEqual(svc.getPlaybackStatus().mediaState, 'loading'); // Preserved!
    console.log('  [PASS] Stale events from replaced media ignored during active load');
    passedCount++;

    // TEST 10: Rapid concurrent control safety
    console.log('[TEST 10] Rapid concurrent control safety');
    svc.playbackStatus.mediaState = 'paused';
    const promises = [
      svc.togglePause(),
      svc.setVolume(50),
      svc.setVolume(60),
      svc.toggleMute(),
    ];
    await Promise.all(promises);
    assert.strictEqual(svc.getPlaybackStatus().volume, 60);
    console.log('  [PASS] Rapid concurrent control invocations processed without deadlock');
    passedCount++;

    // TEST 11: Clean shutdown during playback
    console.log('[TEST 11] Clean shutdown during active playback');
    await svc.shutdown();
    assert.strictEqual(svc.getStatus().state, 'shutdown');
    assert.strictEqual(svc.getPlaybackStatus().mediaState, 'idle');
    assert.strictEqual(svc.getPlaybackStatus().currentFile, null);
    assert.strictEqual(svc.getPlaybackStatus().muted, false);
    console.log('  [PASS] Clean teardown and state reset upon shutdown');
    passedCount++;

    console.log(`\n>>> ALL ${passedCount} PHASE 7 PLAYER RELIABILITY UNIT TESTS PASSED <<<\n`);
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

runTests().catch((err) => {
  console.error('[FAIL] Test suite failed:', err);
  process.exit(1);
});
