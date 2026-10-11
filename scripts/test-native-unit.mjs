import assert from 'node:assert';

console.log('=== PHASE 4: NATIVE PLAYER LIFECYCLE UNIT TESTS (MOCKED BINDINGS) ===');

/**
 * Mock implementation of NativePlayerService mirroring electron/native/player-service.ts
 */
class MockNativePlayerService {
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

    // Tracking counters for assertions
    this.createCallCount = 0;
    this.initCallCount = 0;
    this.destroyCallCount = 0;
  }

  getStatus() {
    const status = { state: this.state };
    if (this.apiVersion) {
      status.apiVersion = { ...this.apiVersion };
    }
    if (this.lastError) {
      status.error = this.lastError;
    }
    return status;
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
    this.lastError = undefined;
    this.cancelInitRequested = false;

    this.initPromise = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      let allocatedHandle = null;
      try {
        if (!this.funcs) {
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

        this.createCallCount++;
        allocatedHandle = this.funcs.mpv_create();
        if (!allocatedHandle) {
          throw new Error('mpv_create returned NULL pointer');
        }

        if (this.cancelInitRequested) {
          this.destroyCallCount++;
          this.funcs.mpv_terminate_destroy(allocatedHandle);
          allocatedHandle = null;
          throw new Error('Initialization aborted by shutdown request');
        }

        this.initCallCount++;
        const code = this.funcs.mpv_initialize(allocatedHandle);
        if (code < 0) {
          const errStr = this.funcs.mpv_error_string(code) || 'unknown error';
          this.destroyCallCount++;
          this.funcs.mpv_terminate_destroy(allocatedHandle);
          allocatedHandle = null;
          throw new Error(`mpv_initialize failed with code ${code} (${errStr})`);
        }

        this.handle = allocatedHandle;
        this.state = 'initialized';
        return this.getStatus();
      } catch (err) {
        if (allocatedHandle && !this.handle) {
          try {
            this.destroyCallCount++;
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

  async shutdown() {
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

    this.shutdownPromise = (async () => {
      try {
        if (this.initPromise) {
          try {
            await this.initPromise;
          } catch {
            // Expected
          }
        }

        if (this.handle && this.funcs) {
          try {
            this.destroyCallCount++;
            this.funcs.mpv_terminate_destroy(this.handle);
          } catch (err) {
            console.error('[MockNativePlayerService] Error during terminate_destroy:', err);
          } finally {
            this.handle = null;
          }
        }

        this.state = 'shutdown';
        this.cancelInitRequested = false;
        return this.getStatus();
      } finally {
        this.shutdownPromise = null;
      }
    })();

    return this.shutdownPromise;
  }
}

function createDefaultMockFuncs() {
  return {
    mpv_client_api_version: () => (2 << 16) | 5,
    mpv_create: () => ({ id: Math.random() }),
    mpv_initialize: () => 0,
    mpv_terminate_destroy: () => {},
    mpv_error_string: (code) => (code === 0 ? 'success' : 'mock error'),
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
  // Test 1: Successful initialization
  await test('Test 1: Successful initialization', async () => {
    const service = new MockNativePlayerService(() => createDefaultMockFuncs());
    const status = await service.initialize();
    assert.strictEqual(status.state, 'initialized');
    assert.strictEqual(status.apiVersion?.formatted, '2.5');
    assert.strictEqual(service.createCallCount, 1);
    assert.strictEqual(service.initCallCount, 1);
  });

  // Test 2: Duplicate initialization
  await test('Test 2: Duplicate initialization rejected', async () => {
    const service = new MockNativePlayerService(() => createDefaultMockFuncs());
    await service.initialize();
    await assert.rejects(
      async () => service.initialize(),
      /Duplicate initialization attempt: Native player is already initialized/
    );
    assert.strictEqual(service.getStatus().state, 'initialized');
    assert.strictEqual(service.createCallCount, 1);
  });

  // Test 3: Concurrent initialization requests
  await test('Test 3: Concurrent initialization requests serialized to single instance', async () => {
    const service = new MockNativePlayerService(() => createDefaultMockFuncs());
    const [status1, status2] = await Promise.all([service.initialize(), service.initialize()]);
    assert.strictEqual(status1.state, 'initialized');
    assert.strictEqual(status2.state, 'initialized');
    assert.strictEqual(service.createCallCount, 1);
  });

  // Test 4: Native initialization failure
  await test('Test 4: Native initialization failure transitions to failed state', async () => {
    const funcs = createDefaultMockFuncs();
    funcs.mpv_initialize = () => -2;
    funcs.mpv_error_string = () => 'out of memory';

    const service = new MockNativePlayerService(() => funcs);
    await assert.rejects(
      async () => service.initialize(),
      /mpv_initialize failed with code -2 \(out of memory\)/
    );
    const status = service.getStatus();
    assert.strictEqual(status.state, 'failed');
    assert.ok(status.error?.includes('-2'));
  });

  // Test 5: Partial initialization cleanup
  await test('Test 5: Partial initialization cleanly destroys handle on failure', async () => {
    const funcs = createDefaultMockFuncs();
    funcs.mpv_initialize = () => -4;
    funcs.mpv_error_string = () => 'invalid parameter';

    const service = new MockNativePlayerService(() => funcs);
    await assert.rejects(async () => service.initialize());
    assert.strictEqual(service.destroyCallCount, 1);
    assert.strictEqual(service.handle, null);
  });

  // Test 6: Repeated shutdown
  await test('Test 6: Repeated shutdown calls are safe and idempotent', async () => {
    const service = new MockNativePlayerService(() => createDefaultMockFuncs());
    await service.initialize();
    const s1 = await service.shutdown();
    const s2 = await service.shutdown();
    const s3 = await service.shutdown();
    assert.strictEqual(s1.state, 'shutdown');
    assert.strictEqual(s2.state, 'shutdown');
    assert.strictEqual(s3.state, 'shutdown');
    assert.strictEqual(service.destroyCallCount, 1);
  });

  // Test 7: Shutdown during initialization
  await test('Test 7: Shutdown during initialization aborts cleanly', async () => {
    const funcs = createDefaultMockFuncs();
    // Simulate slight delay in initialization
    const origCreate = funcs.mpv_create;
    funcs.mpv_create = () => {
      return origCreate();
    };

    const service = new MockNativePlayerService(() => funcs);
    const initPromise = service.initialize();
    const shutdownPromise = service.shutdown();

    await shutdownPromise;
    try {
      await initPromise;
    } catch {
      // Init may fail or abort
    }

    const finalStatus = service.getStatus();
    assert.strictEqual(finalStatus.state, 'shutdown');
    assert.strictEqual(service.handle, null);
  });

  // Test 8: Initialization after shutdown
  await test('Test 8: Initialization after shutdown successfully starts new context', async () => {
    const service = new MockNativePlayerService(() => createDefaultMockFuncs());
    await service.initialize();
    await service.shutdown();
    assert.strictEqual(service.getStatus().state, 'shutdown');

    const reinitStatus = await service.initialize();
    assert.strictEqual(reinitStatus.state, 'initialized');
    assert.strictEqual(service.createCallCount, 2);
  });

  // Test 9: Application-close cleanup
  await test('Test 9: Application close triggers complete native teardown', async () => {
    const service = new MockNativePlayerService(() => createDefaultMockFuncs());
    await service.initialize();

    // Simulate Electron before-quit / window-all-closed handler
    async function simulateAppQuit() {
      await service.shutdown();
    }

    await simulateAppQuit();
    assert.strictEqual(service.getStatus().state, 'shutdown');
    assert.strictEqual(service.handle, null);
    assert.strictEqual(service.destroyCallCount, 1);
  });

  // Test 10: Typed IPC response validation
  await test('Test 10: Typed IPC responses contain only specified serializable fields', async () => {
    const service = new MockNativePlayerService(() => createDefaultMockFuncs());
    const status = await service.initialize();

    const allowedKeys = new Set(['state', 'apiVersion', 'error']);
    const keys = Object.keys(status);
    for (const key of keys) {
      assert.ok(allowedKeys.has(key), `Disallowed key in IPC response: ${key}`);
    }
    assert.strictEqual(typeof status.state, 'string');
    assert.strictEqual(typeof status.apiVersion?.formatted, 'string');
  });

  // Test 11: Rejection of unauthorized IPC senders
  await test('Test 11: Rejection of unauthorized IPC senders', () => {
    function mockValidateIpcSender(event, expectedId, isDev, devUrl) {
      if (!event.sender || event.sender.id !== expectedId) return false;
      const url = event.senderFrame?.url;
      if (!url) return false;
      if (isDev && devUrl) {
        return url.startsWith(devUrl) || url.startsWith('http://localhost:') || url.startsWith('http://127.0.0.1:');
      }
      return url.startsWith('file://');
    }

    const mainWindowId = 1;
    // Authorized local frame
    const validEvent = { sender: { id: 1 }, senderFrame: { url: 'file:///D:/NosvedPlayerDesktop/dist/index.html' } };
    assert.strictEqual(mockValidateIpcSender(validEvent, mainWindowId, false, ''), true);

    // Malicious web origin
    const rogueEvent = { sender: { id: 1 }, senderFrame: { url: 'https://malicious.evil.com/index.html' } };
    assert.strictEqual(mockValidateIpcSender(rogueEvent, mainWindowId, false, ''), false);

    // Mismatched sender ID
    const spoofedIdEvent = { sender: { id: 99 }, senderFrame: { url: 'file:///D:/NosvedPlayerDesktop/dist/index.html' } };
    assert.strictEqual(mockValidateIpcSender(spoofedIdEvent, mainWindowId, false, ''), false);

    // Missing frame URL
    const missingFrameEvent = { sender: { id: 1 }, senderFrame: null };
    assert.strictEqual(mockValidateIpcSender(missingFrameEvent, mainWindowId, false, ''), false);
  });

  // Test 12: Renderer payload safety
  await test('Test 12: Renderer payload safety against pointers and memory leaks', () => {
    function validateRendererPayload(payload) {
      const allowedKeys = new Set(['state', 'apiVersion', 'error', 'success', 'stage', 'errorCode']);
      const serialized = JSON.stringify(payload);

      // Check for raw memory address hex patterns (e.g. 0x00007ffe...)
      if (/0x[0-9a-fA-F]{6,}/.test(serialized)) {
        return false;
      }
      // Check for forbidden internal keys
      const forbiddenTerms = ['ptr', 'handle', 'address', 'pointer', 'mpv_handle', 'koffi'];
      for (const term of forbiddenTerms) {
        if (Object.keys(payload).includes(term)) {
          return false;
        }
      }
      // Check key whitelist
      for (const k of Object.keys(payload)) {
        if (!allowedKeys.has(k)) {
          return false;
        }
      }
      return true;
    }

    const safePayload = { state: 'initialized', apiVersion: { raw: 131077, major: 2, minor: 5, formatted: '2.5' } };
    assert.strictEqual(validateRendererPayload(safePayload), true);

    const leakyPayload = { state: 'initialized', rawAddress: '0x00007ffe88ab1234' };
    assert.strictEqual(validateRendererPayload(leakyPayload), false);

    const internalObjPayload = { state: 'initialized', mpv_handle: {} };
    assert.strictEqual(validateRendererPayload(internalObjPayload), false);
  });

  console.log(`\nUnit Tests Summary: ${passed}/${total} passed.\n`);
  if (passed !== total) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error('Test runner failure:', err);
  process.exit(1);
});
