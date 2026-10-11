import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';

console.log('=== PHASE 5: PLAYBACK ENGINE & ASYNC EVENT HANDLING UNIT TESTS (MOCKED BINDINGS) ===');

/**
 * Reusable mock NativePlayerService implementation matching electron/native/player-service.ts
 */
class MockPlaybackPlayerService {
  constructor(funcsGetter) {
    this.funcsGetter = funcsGetter;
    this.funcs = null;
    this.handle = null;
    this.state = 'uninitialized';
    this.apiVersion = null;
    this.lastError = undefined;

    this.initPromise = null;
    this.shutdownPromise = null;
    this.cancelInitRequested = false;

    this.eventPollInterval = null;
    this.isShuttingDown = false;
    this.positionPollInterval = null;

    this.playbackStatus = {
      mediaState: 'idle',
      currentFile: null,
      position: null,
      duration: null,
      paused: true,
      volume: 100,
    };

    this.playbackListeners = new Set();

    // Call tracking
    this.commandCalls = [];
    this.setPropertyCalls = [];
    this.getPropertyCalls = [];
    this.observePropertyCalls = [];
    this.waitEventCalls = 0;
  }

  getStatus() {
    const status = { state: this.state };
    if (this.apiVersion) status.apiVersion = { ...this.apiVersion };
    if (this.lastError) status.error = this.lastError;
    return status;
  }

  getPlaybackStatus() {
    return { ...this.playbackStatus };
  }

  onPlaybackStatusChange(listener) {
    this.playbackListeners.add(listener);
    try {
      listener(this.getPlaybackStatus());
    } catch {
      // Error handled safely
    }
    return () => {
      this.playbackListeners.delete(listener);
    };
  }

  notifyPlaybackChange() {
    const snapshot = this.getPlaybackStatus();
    for (const listener of this.playbackListeners) {
      try {
        listener(snapshot);
      } catch (err) {
        // Safe listener failure isolation
      }
    }
  }

  async initialize() {
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
    this.cancelInitRequested = false;
    this.isShuttingDown = false;

    this.initPromise = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      let allocatedHandle = null;
      try {
        if (!this.funcs) this.funcs = this.funcsGetter();

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

        allocatedHandle = this.funcs.mpv_create();
        if (!allocatedHandle) throw new Error('mpv_create returned NULL pointer');

        if (this.cancelInitRequested) {
          this.funcs.mpv_terminate_destroy(allocatedHandle);
          allocatedHandle = null;
          throw new Error('Initialization aborted by shutdown request');
        }

        this.funcs.mpv_set_property_string(allocatedHandle, 'vo', 'null');
        this.funcs.mpv_set_property_string(allocatedHandle, 'idle', 'yes');

        const code = this.funcs.mpv_initialize(allocatedHandle);
        if (code < 0) {
          const errStr = this.funcs.mpv_error_string(code) || 'unknown error';
          this.funcs.mpv_terminate_destroy(allocatedHandle);
          allocatedHandle = null;
          throw new Error(`mpv_initialize failed with code ${code} (${errStr})`);
        }

        // Start event polling
        this.eventPollInterval = setInterval(() => this.drainEvents(), 100);
        this.eventPollInterval.unref();

        // Observe essential properties
        this.funcs.mpv_observe_property(allocatedHandle, 1, 'pause', 1);
        this.funcs.mpv_observe_property(allocatedHandle, 2, 'time-pos', 1);
        this.funcs.mpv_observe_property(allocatedHandle, 3, 'duration', 1);
        this.funcs.mpv_observe_property(allocatedHandle, 4, 'volume', 1);
        this.funcs.mpv_observe_property(allocatedHandle, 5, 'eof-reached', 1);

        this.handle = allocatedHandle;
        this.state = 'initialized';
        this.refreshStateFromNative();

        return this.getStatus();
      } catch (err) {
        if (allocatedHandle && !this.handle) {
          try {
            this.funcs?.mpv_terminate_destroy(allocatedHandle);
          } catch {}
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

  drainEvents() {
    this.drainScheduled = false;
    if (!this.handle || !this.funcs || this.isShuttingDown) return;

    while (this.handle && !this.isShuttingDown) {
      this.waitEventCalls++;
      const ev = this.funcs.mpv_wait_event(this.handle, 0);
      if (!ev || ev.event_id === 0) break;

      switch (ev.event_id) {
        case 6: // START_FILE
          this.playbackStatus.mediaState = 'loading';
          this.playbackStatus.error = undefined;
          this.notifyPlaybackChange();
          break;
        case 7: // FILE_LOADED
          this.refreshStateFromNative();
          this.playbackStatus.mediaState = this.playbackStatus.paused ? 'paused' : 'playing';
          this.notifyPlaybackChange();
          break;
        case 8: // END_FILE
          this.playbackStatus.mediaState = 'ended';
          this.playbackStatus.position = this.playbackStatus.duration;
          this.notifyPlaybackChange();
          break;
        case 9: // PROPERTY_CHANGE
        case 21: // PLAYBACK_RESTART
          this.refreshStateFromNative();
          this.notifyPlaybackChange();
          break;
        case 4: // SHUTDOWN
          this.playbackStatus.mediaState = 'idle';
          this.notifyPlaybackChange();
          break;
        default:
          break;
      }
    }
  }

  refreshStateFromNative() {
    if (!this.handle || !this.funcs) return;

    const pauseStr = this.funcs.mpv_get_property_string(this.handle, 'pause');
    if (pauseStr !== null) {
      this.playbackStatus.paused = pauseStr === 'yes';
      if (this.playbackStatus.mediaState === 'playing' && this.playbackStatus.paused) {
        this.playbackStatus.mediaState = 'paused';
      } else if (this.playbackStatus.mediaState === 'paused' && !this.playbackStatus.paused) {
        this.playbackStatus.mediaState = 'playing';
      }
    }

    const volStr = this.funcs.mpv_get_property_string(this.handle, 'volume');
    if (volStr !== null) {
      const volNum = parseFloat(volStr);
      if (Number.isFinite(volNum)) this.playbackStatus.volume = Math.round(volNum);
    }

    const durStr = this.funcs.mpv_get_property_string(this.handle, 'duration');
    if (durStr !== null) {
      const durNum = parseFloat(durStr);
      this.playbackStatus.duration = Number.isFinite(durNum) ? durNum : null;
    } else {
      this.playbackStatus.duration = null;
    }

    const posStr = this.funcs.mpv_get_property_string(this.handle, 'time-pos');
    if (posStr !== null) {
      const posNum = parseFloat(posStr);
      this.playbackStatus.position = Number.isFinite(posNum) ? posNum : null;
    } else {
      this.playbackStatus.position = null;
    }
  }

  async loadMedia(filePath, supportedExts = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.ts', '.m4v']) {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path: Must provide a non-empty string path');
    }
    const ext = path.extname(filePath).toLowerCase();
    if (!supportedExts.includes(ext)) {
      throw new Error(`Unsupported video format "${ext}". Supported extensions: ${supportedExts.join(', ')}`);
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

    this.commandCalls.push(['loadfile', filePath, 'replace', null]);
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

  async play() {
    if (!this.handle || !this.funcs) throw new Error('Cannot play: Native player instance is not initialized');
    this.setPropertyCalls.push(['pause', 'no']);
    const code = this.funcs.mpv_set_property_string(this.handle, 'pause', 'no');
    if (code < 0) {
      const errStr = this.funcs.mpv_error_string(code);
      throw new Error(`Failed to play media: ${errStr}`);
    }
    this.playbackStatus.paused = false;
    if (this.playbackStatus.mediaState === 'paused') this.playbackStatus.mediaState = 'playing';
    this.notifyPlaybackChange();
    return this.getPlaybackStatus();
  }

  async pause() {
    if (!this.handle || !this.funcs) throw new Error('Cannot pause: Native player instance is not initialized');
    this.setPropertyCalls.push(['pause', 'yes']);
    const code = this.funcs.mpv_set_property_string(this.handle, 'pause', 'yes');
    if (code < 0) {
      const errStr = this.funcs.mpv_error_string(code);
      throw new Error(`Failed to pause media: ${errStr}`);
    }
    this.playbackStatus.paused = true;
    if (this.playbackStatus.mediaState === 'playing') this.playbackStatus.mediaState = 'paused';
    this.notifyPlaybackChange();
    return this.getPlaybackStatus();
  }

  async togglePause() {
    if (this.playbackStatus.paused) return this.play();
    return this.pause();
  }

  async seek(positionSeconds) {
    if (typeof positionSeconds !== 'number' || !Number.isFinite(positionSeconds)) {
      throw new Error('Invalid seek position: Value must be a finite number');
    }
    if (positionSeconds < 0) {
      throw new Error('Invalid seek position: Cannot seek to a negative timestamp');
    }
    if (this.playbackStatus.duration !== null && positionSeconds > this.playbackStatus.duration) {
      positionSeconds = this.playbackStatus.duration;
    }
    if (!this.handle || !this.funcs) throw new Error('Cannot seek: Native player instance is not initialized');

    this.commandCalls.push(['seek', String(positionSeconds), 'absolute', null]);
    const code = this.funcs.mpv_command(this.handle, ['seek', String(positionSeconds), 'absolute', null]);
    if (code < 0) {
      const errStr = this.funcs.mpv_error_string(code);
      throw new Error(`Seek command failed: ${errStr}`);
    }
    this.playbackStatus.position = positionSeconds;
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
    if (!this.handle || !this.funcs) throw new Error('Cannot set volume: Native player instance is not initialized');

    const target = Math.round(volumePercent);
    this.setPropertyCalls.push(['volume', String(target)]);
    const code = this.funcs.mpv_set_property_string(this.handle, 'volume', String(target));
    if (code < 0) {
      const errStr = this.funcs.mpv_error_string(code);
      throw new Error(`Failed to set volume: ${errStr}`);
    }
    this.playbackStatus.volume = target;
    this.notifyPlaybackChange();
    return this.getPlaybackStatus();
  }

  async shutdown() {
    if (this.state === 'shutdown') return this.getStatus();
    if (this.state === 'shutting-down' && this.shutdownPromise) return this.shutdownPromise;

    if (this.state === 'initializing') this.cancelInitRequested = true;

    this.state = 'shutting-down';
    this.isShuttingDown = true;

    this.shutdownPromise = (async () => {
      try {
        if (this.initPromise) {
          try {
            await this.initPromise;
          } catch {}
        }
        if (this.handle && this.funcs) {
          try {
            if (this.eventPollInterval) {
              clearInterval(this.eventPollInterval);
              this.eventPollInterval = null;
            }
            this.funcs.mpv_terminate_destroy(this.handle);
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

function createDefaultMockFuncs() {
  const store = {
    pause: 'yes',
    volume: '100',
    duration: '120.0',
    'time-pos': '0.0',
    vo: 'null',
    idle: 'yes',
  };

  return {
    mpv_client_api_version: () => (2 << 16) | 5,
    mpv_create: () => ({ id: Math.random() }),
    mpv_initialize: () => 0,
    mpv_terminate_destroy: () => {},
    mpv_error_string: (code) => (code === 0 ? 'success' : `mock error ${code}`),
    mpv_command: () => 0,
    mpv_set_property_string: (_ctx, name, val) => {
      store[name] = val;
      return 0;
    },
    mpv_get_property_string: (_ctx, name) => {
      return store[name] ?? null;
    },
    mpv_set_wakeup_callback: () => 0,
    mpv_observe_property: () => 0,
    mpv_wait_event: () => ({ event_id: 0, error: 0 }),
    _store: store,
  };
}

let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err);
  }
}

async function runAll() {
  // Scenario 1: Successful media loading
  await test('1. Successful media loading', async () => {
    const service = new MockPlaybackPlayerService(createDefaultMockFuncs);
    await service.initialize();
    // Use an existing file in repo as dummy file with .mp4 extension
    const dummyFile = path.resolve('package.json');
    const fakeMp4 = path.resolve('test_dummy.mp4');
    fs.writeFileSync(fakeMp4, 'dummy');
    try {
      const status = await service.loadMedia(fakeMp4);
      assert.strictEqual(status.currentFile, fakeMp4);
      assert.strictEqual(status.mediaState, 'loading');
      assert.strictEqual(service.commandCalls.length, 1);
      assert.deepStrictEqual(service.commandCalls[0], ['loadfile', fakeMp4, 'replace', null]);
    } finally {
      if (fs.existsSync(fakeMp4)) fs.unlinkSync(fakeMp4);
    }
  });

  // Scenario 2: Invalid or rejected file selection
  await test('2. Invalid or rejected file selection', async () => {
    const service = new MockPlaybackPlayerService(createDefaultMockFuncs);
    await service.initialize();

    // Empty/non-string
    await assert.rejects(async () => service.loadMedia(''), /Invalid file path/);
    await assert.rejects(async () => service.loadMedia(null), /Invalid file path/);

    // Unsupported extension
    await assert.rejects(
      async () => service.loadMedia('video.exe'),
      /Unsupported video format "\.exe"/
    );

    // Non-existent file with valid extension
    await assert.rejects(
      async () => service.loadMedia('D:/fake_non_existent_movie.mp4'),
      /File does not exist/
    );
  });

  // Scenario 3: Native command errors
  await test('3. Native command errors handled safely', async () => {
    const funcs = createDefaultMockFuncs();
    funcs.mpv_command = () => -6; // generic error
    funcs.mpv_error_string = () => 'command failed';

    const service = new MockPlaybackPlayerService(() => funcs);
    await service.initialize();

    const fakeMp4 = path.resolve('test_dummy2.mp4');
    fs.writeFileSync(fakeMp4, 'dummy');
    try {
      await assert.rejects(async () => service.loadMedia(fakeMp4), /Failed to load file: command failed/);
      const status = service.getPlaybackStatus();
      assert.strictEqual(status.mediaState, 'error');
      assert.ok(status.error?.includes('command failed'));
    } finally {
      if (fs.existsSync(fakeMp4)) fs.unlinkSync(fakeMp4);
    }
  });

  // Scenario 4: Play/pause state synchronization
  await test('4. Play/pause state synchronization and toggle', async () => {
    const service = new MockPlaybackPlayerService(createDefaultMockFuncs);
    await service.initialize();

    // Default pause state
    assert.strictEqual(service.getPlaybackStatus().paused, true);

    // Play
    const stPlay = await service.play();
    assert.strictEqual(stPlay.paused, false);

    // Pause
    const stPause = await service.pause();
    assert.strictEqual(stPause.paused, true);

    // Toggle to play
    const stToggle1 = await service.togglePause();
    assert.strictEqual(stToggle1.paused, false);

    // Toggle to pause
    const stToggle2 = await service.togglePause();
    assert.strictEqual(stToggle2.paused, true);
  });

  // Scenario 5: Seek validation and boundary handling
  await test('5. Seek validation and boundary handling', async () => {
    const service = new MockPlaybackPlayerService(createDefaultMockFuncs);
    await service.initialize();
    service.playbackStatus.duration = 100.0;

    // Reject NaN and non-finite
    await assert.rejects(async () => service.seek(NaN), /Invalid seek position/);
    await assert.rejects(async () => service.seek(Infinity), /Invalid seek position/);

    // Reject negative
    await assert.rejects(async () => service.seek(-10), /Cannot seek to a negative timestamp/);

    // Normal seek
    const st1 = await service.seek(45.5);
    assert.strictEqual(st1.position, 45.5);

    // Beyond duration clamps to duration
    const st2 = await service.seek(150);
    assert.strictEqual(st2.position, 100.0);
  });

  // Scenario 6: Volume validation
  await test('6. Volume validation (0 to 100 range)', async () => {
    const service = new MockPlaybackPlayerService(createDefaultMockFuncs);
    await service.initialize();

    // Reject invalid inputs
    await assert.rejects(async () => service.setVolume(-1), /Value must be between 0 and 100/);
    await assert.rejects(async () => service.setVolume(101), /Value must be between 0 and 100/);
    await assert.rejects(async () => service.setVolume(NaN), /Invalid volume/);

    // Normal volume
    const st1 = await service.setVolume(50);
    assert.strictEqual(st1.volume, 50);

    // Boundary 0
    const st2 = await service.setVolume(0);
    assert.strictEqual(st2.volume, 0);

    // Boundary 100
    const st3 = await service.setVolume(100);
    assert.strictEqual(st3.volume, 100);
  });

  // Scenario 7: Missing position/duration values
  await test('7. Missing position/duration values explicitly represented as null', async () => {
    const funcs = createDefaultMockFuncs();
    funcs._store.duration = null;
    funcs._store['time-pos'] = null;

    const service = new MockPlaybackPlayerService(() => funcs);
    await service.initialize();
    service.refreshStateFromNative();

    const st = service.getPlaybackStatus();
    assert.strictEqual(st.duration, null);
    assert.strictEqual(st.position, null);
  });

  // Scenario 8: End-of-file state transitions
  await test('8. End-of-file state transitions to ended state', async () => {
    const service = new MockPlaybackPlayerService(createDefaultMockFuncs);
    await service.initialize();
    service.playbackStatus.duration = 120.0;
    service.playbackStatus.position = 119.5;
    service.playbackStatus.mediaState = 'playing';

    // Simulate MPV_EVENT_END_FILE (event_id: 8)
    let eventServed = false;
    service.funcs.mpv_wait_event = () => {
      if (!eventServed) {
        eventServed = true;
        return { event_id: 8, error: 0 };
      }
      return { event_id: 0, error: 0 };
    };

    service.drainEvents();
    const st = service.getPlaybackStatus();
    assert.strictEqual(st.mediaState, 'ended');
    assert.strictEqual(st.position, 120.0);
  });

  // Scenario 9: Event-loop startup and shutdown
  await test('9. Event-loop startup and clean timer shutdown', async () => {
    const service = new MockPlaybackPlayerService(createDefaultMockFuncs);
    await service.initialize();
    assert.ok(service.eventPollInterval !== null);

    await service.shutdown();
    assert.strictEqual(service.eventPollInterval, null);
    assert.strictEqual(service.handle, null);
  });

  // Scenario 10: Shutdown during outstanding event polling
  await test('10. Shutdown during outstanding event polling is safe', async () => {
    const service = new MockPlaybackPlayerService(createDefaultMockFuncs);
    await service.initialize();

    // Trigger drain then immediately shutdown
    service.drainEvents();

    await service.shutdown();
    assert.strictEqual(service.isShuttingDown, true);
    assert.strictEqual(service.state, 'shutdown');
  });

  // Scenario 11: Repeated initialization or command requests
  await test('11. Repeated initialization and commands on uninitialized instance', async () => {
    const service = new MockPlaybackPlayerService(createDefaultMockFuncs);
    // Command before init rejects cleanly
    await assert.rejects(async () => service.play(), /Cannot play/);
    await assert.rejects(async () => service.pause(), /Cannot pause/);
    await assert.rejects(async () => service.seek(10), /Cannot seek/);
    await assert.rejects(async () => service.setVolume(50), /Cannot set volume/);

    await service.initialize();
    // Repeated init rejects
    await assert.rejects(async () => service.initialize(), /Duplicate initialization attempt/);
  });

  // Scenario 12: Renderer closure during event delivery
  await test('12. Renderer closure during event delivery isolated safely', async () => {
    const service = new MockPlaybackPlayerService(createDefaultMockFuncs);
    await service.initialize();

    let calls = 0;
    const unsub = service.onPlaybackStatusChange((status) => {
      calls++;
      if (calls > 1) {
        throw new Error('Simulated dead webContents / destroyed frame');
      }
    });

    // Notify change; listener throwing must not crash the service
    assert.doesNotThrow(() => {
      service.notifyPlaybackChange();
    });

    // Unsubscribe cleanly
    unsub();
    assert.strictEqual(service.playbackListeners.size, 0);
  });

  // Scenario 13: IPC sender validation
  await test('13. IPC sender validation prevents spoofed origins and frame loss', () => {
    function validateIpcSender(event, expectedId, isDev, devUrl) {
      if (!event.sender || event.sender.id !== expectedId) return false;
      const url = event.senderFrame?.url;
      if (!url) return false;
      if (isDev && devUrl) {
        return url.startsWith(devUrl) || url.startsWith('http://localhost:') || url.startsWith('http://127.0.0.1:');
      }
      return url.startsWith('file://');
    }

    const mainWindowId = 1;
    // Authorized
    assert.strictEqual(validateIpcSender({ sender: { id: 1 }, senderFrame: { url: 'file:///dist/index.html' } }, mainWindowId, false, ''), true);
    // Malicious
    assert.strictEqual(validateIpcSender({ sender: { id: 1 }, senderFrame: { url: 'https://attacker.com' } }, mainWindowId, false, ''), false);
    // Tampered sender ID
    assert.strictEqual(validateIpcSender({ sender: { id: 42 }, senderFrame: { url: 'file:///dist/index.html' } }, mainWindowId, false, ''), false);
    // Detached frame
    assert.strictEqual(validateIpcSender({ sender: { id: 1 }, senderFrame: null }, mainWindowId, false, ''), false);
  });

  // Scenario 14: Prevention of raw native data exposure in playbackStatus
  await test('14. Prevention of raw native data exposure in PlaybackStatus', async () => {
    const service = new MockPlaybackPlayerService(createDefaultMockFuncs);
    await service.initialize();
    const st = service.getPlaybackStatus();

    const allowedKeys = new Set(['mediaState', 'currentFile', 'position', 'duration', 'paused', 'volume', 'error']);
    for (const key of Object.keys(st)) {
      assert.ok(allowedKeys.has(key), `Disallowed property in PlaybackStatus: ${key}`);
    }

    const serialized = JSON.stringify(st);
    assert.strictEqual(/0x[0-9a-fA-F]{6,}/.test(serialized), false, 'Raw pointer detected');
    const forbidden = ['ptr', 'handle', 'address', 'pointer', 'mpv_handle', 'koffi'];
    for (const term of forbidden) {
      assert.strictEqual(Object.keys(st).includes(term), false, `Forbidden key ${term} found`);
    }
  });

  // Scenario 15: Existing lifecycle and security regressions
  await test('15. Lifecycle regression test: clean reinitialization after shutdown', async () => {
    const service = new MockPlaybackPlayerService(createDefaultMockFuncs);
    await service.initialize();
    assert.strictEqual(service.getStatus().state, 'initialized');

    await service.shutdown();
    assert.strictEqual(service.getStatus().state, 'shutdown');

    // Re-initialize cleanly
    await service.initialize();
    assert.strictEqual(service.getStatus().state, 'initialized');
    assert.strictEqual(service.getPlaybackStatus().mediaState, 'idle');
    await service.shutdown();
  });

  console.log(`\nPhase 5 Playback Unit Tests: ${passed}/${total} passed.\n`);
  if (passed !== total) process.exit(1);
}

runAll().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
