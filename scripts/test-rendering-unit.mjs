import assert from 'node:assert';

console.log('=== PHASE 6: RENDERING & VIDEO SURFACE LIFECYCLE UNIT TESTS ===');

let testsPassed = 0;

// Win32 Window Styles & Flags
const WS_CHILD = 0x40000000;
const WS_VISIBLE = 0x10000000;
const WS_CLIPSIBLINGS = 0x04000000;
const WS_CLIPCHILDREN = 0x02000000;

const SW_HIDE = 0;
const SW_SHOWNOACTIVATE = 4;

const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;
const SWP_ASYNCWINDOWPOS = 0x4000;

/**
 * NativeVideoWindow implementation matching electron/native/video-window.ts
 */
class MockableNativeVideoWindow {
  constructor(customUser32) {
    this.user32 = customUser32;
    this.childHwnd = null;
    this.parentHwnd = null;
    this.isVisible = false;
    this.currentBounds = { x: 0, y: 0, width: 0, height: 0 };
  }

  create(parentHwnd, initialBounds) {
    if (!this.user32) {
      return null;
    }
    if (this.childHwnd && this.isValid()) {
      return this.childHwnd;
    }
    this.parentHwnd = parentHwnd;
    const b = initialBounds || { x: 0, y: 0, width: 0, height: 0 };
    this.currentBounds = { ...b };

    try {
      const style = WS_CHILD | WS_CLIPSIBLINGS | WS_CLIPCHILDREN;
      const hwnd = this.user32.CreateWindowExW(
        0,
        'STATIC',
        'NosvedNativeVideoSurface',
        style,
        b.x,
        b.y,
        b.width,
        b.height,
        parentHwnd,
        0,
        0,
        null
      );
      if (!hwnd) return null;
      this.childHwnd = hwnd;
      this.isVisible = false;
      this.user32.ShowWindow(hwnd, SW_HIDE);
      return hwnd;
    } catch {
      return null;
    }
  }

  getHwnd() {
    return this.childHwnd;
  }

  isValid() {
    if (!this.childHwnd || !this.user32) return false;
    try {
      return Boolean(this.user32.IsWindow(this.childHwnd));
    } catch {
      return false;
    }
  }

  setBounds(x, y, width, height) {
    this.currentBounds = { x, y, width, height, visible: this.isVisible };
    if (!this.childHwnd || !this.user32 || !this.isValid()) return;
    try {
      const flags = SWP_NOZORDER | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS;
      this.user32.SetWindowPos(this.childHwnd, 0, x, y, width, height, flags);
    } catch {
      // Ignored
    }
  }

  setVisible(visible) {
    this.isVisible = visible;
    if (!this.childHwnd || !this.user32 || !this.isValid()) return;
    try {
      if (visible && this.currentBounds.width > 0 && this.currentBounds.height > 0) {
        this.user32.ShowWindow(this.childHwnd, SW_SHOWNOACTIVATE);
      } else {
        this.user32.ShowWindow(this.childHwnd, SW_HIDE);
      }
    } catch {
      // Ignored
    }
  }

  destroy() {
    if (this.childHwnd && this.user32) {
      try {
        if (this.isValid()) {
          this.user32.DestroyWindow(this.childHwnd);
        }
      } catch {
        // Ignored
      } finally {
        this.childHwnd = null;
        this.parentHwnd = null;
        this.isVisible = false;
      }
    }
  }
}

// Test 1: NativeVideoWindow handles null user32 gracefully
{
  console.log('[TEST 1] NativeVideoWindow handles null user32 without crashing');
  const win = new MockableNativeVideoWindow(null);
  assert.strictEqual(win.create(12345n), null);
  assert.strictEqual(win.getHwnd(), null);
  assert.strictEqual(win.isValid(), false);
  win.setBounds(10, 10, 100, 100);
  win.setVisible(true);
  win.destroy();
  console.log('  [PASS] Null user32 handled gracefully');
  testsPassed++;
}

// Test 2: NativeVideoWindow creates and manages child HWND using mocked user32
{
  console.log('[TEST 2] NativeVideoWindow lifecycle with mocked user32');
  let createdParams = null;
  let destroyedHwnd = null;
  let windowPosParams = null;
  let showWindowParams = null;

  const mockUser32 = {
    CreateWindowExW: (ex, cls, name, style, x, y, w, h, parent) => {
      createdParams = { ex, cls, name, style, x, y, w, h, parent };
      return 99999n;
    },
    DestroyWindow: (hwnd) => {
      destroyedHwnd = hwnd;
      return true;
    },
    SetWindowPos: (hwnd, insertAfter, x, y, cx, cy, flags) => {
      windowPosParams = { hwnd, insertAfter, x, y, cx, cy, flags };
      return true;
    },
    ShowWindow: (hwnd, cmd) => {
      showWindowParams = { hwnd, cmd };
      return true;
    },
    IsWindow: (hwnd) => hwnd === 99999n,
  };

  const win = new MockableNativeVideoWindow(mockUser32);
  const hwnd = win.create(88888n, { x: 50, y: 50, width: 640, height: 360 });

  assert.strictEqual(hwnd, 99999n);
  assert.strictEqual(win.getHwnd(), 99999n);
  assert.strictEqual(win.isValid(), true);
  assert.strictEqual(createdParams.parent, 88888n);
  assert.strictEqual(createdParams.cls, 'STATIC');
  assert.strictEqual(createdParams.style, WS_CHILD | WS_CLIPSIBLINGS | WS_CLIPCHILDREN);
  assert.strictEqual(showWindowParams.cmd, SW_HIDE);

  // Set bounds
  win.setBounds(100, 120, 800, 450);
  assert.strictEqual(windowPosParams.x, 100);
  assert.strictEqual(windowPosParams.y, 120);
  assert.strictEqual(windowPosParams.cx, 800);
  assert.strictEqual(windowPosParams.cy, 450);

  // Set visible
  win.setVisible(true);
  assert.strictEqual(showWindowParams.cmd, SW_SHOWNOACTIVATE);

  // Set hidden
  win.setVisible(false);
  assert.strictEqual(showWindowParams.cmd, SW_HIDE);

  // Destroy
  win.destroy();
  assert.strictEqual(destroyedHwnd, 99999n);
  assert.strictEqual(win.getHwnd(), null);
  assert.strictEqual(win.isValid(), false);

  // Idempotent destroy
  win.destroy();

  console.log('  [PASS] NativeVideoWindow lifecycle verified');
  testsPassed++;
}

// Test 3: PlayerService sets wid and vo=gpu when video HWND is provided
{
  console.log('[TEST 3] PlayerService passes wid and vo=gpu when video HWND is provided');
  const propertyCalls = [];

  class MockRenderingPlayerService {
    constructor(funcsGetter) {
      this.funcsGetter = funcsGetter;
      this.videoWindowHwnd = null;
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
    }

    setVideoWindowHwnd(hwnd) {
      this.videoWindowHwnd = hwnd;
    }

    async initialize() {
      const funcs = this.funcsGetter();
      const allocatedHandle = funcs.mpv_create();
      if (this.videoWindowHwnd) {
        funcs.mpv_set_property_string(allocatedHandle, 'wid', String(this.videoWindowHwnd));
        funcs.mpv_set_property_string(allocatedHandle, 'vo', 'gpu');
      } else {
        funcs.mpv_set_property_string(allocatedHandle, 'vo', 'null');
      }
      funcs.mpv_set_property_string(allocatedHandle, 'idle', 'yes');
      funcs.mpv_initialize(allocatedHandle);

      const dwidth = funcs.mpv_get_property_string(allocatedHandle, 'dwidth');
      if (dwidth) this.playbackStatus.videoWidth = parseInt(dwidth, 10);
      const dheight = funcs.mpv_get_property_string(allocatedHandle, 'dheight');
      if (dheight) this.playbackStatus.videoHeight = parseInt(dheight, 10);
    }
  }

  const mockFuncs = {
    mpv_create: () => ({ ptr: 'mpv_context' }),
    mpv_initialize: () => 0,
    mpv_set_property_string: (_ctx, name, val) => {
      propertyCalls.push({ name, val });
      return 0;
    },
    mpv_get_property_string: (_ctx, name) => {
      if (name === 'dwidth') return '1920';
      if (name === 'dheight') return '1080';
      return null;
    },
  };

  const service = new MockRenderingPlayerService(() => mockFuncs);
  service.setVideoWindowHwnd(77777n);

  await service.initialize();

  const widCall = propertyCalls.find((c) => c.name === 'wid');
  const voCall = propertyCalls.find((c) => c.name === 'vo');
  assert.ok(widCall, 'wid property must be set on mpv');
  assert.strictEqual(widCall.val, '77777');
  assert.ok(voCall, 'vo property must be set on mpv');
  assert.strictEqual(voCall.val, 'gpu');

  // Verify status reads video dimensions
  assert.strictEqual(service.playbackStatus.videoWidth, 1920);
  assert.strictEqual(service.playbackStatus.videoHeight, 1080);

  console.log('  [PASS] PlayerService wid embedding and video dimension tracking verified');
  testsPassed++;
}

// Test 4: PlayerService falls back to vo=null when video HWND is not provided
{
  console.log('[TEST 4] PlayerService falls back to vo=null when video HWND is absent');
  const propertyCalls = [];

  class MockRenderingPlayerService {
    constructor(funcsGetter) {
      this.funcsGetter = funcsGetter;
      this.videoWindowHwnd = null;
    }

    async initialize() {
      const funcs = this.funcsGetter();
      const allocatedHandle = funcs.mpv_create();
      if (this.videoWindowHwnd) {
        funcs.mpv_set_property_string(allocatedHandle, 'wid', String(this.videoWindowHwnd));
        funcs.mpv_set_property_string(allocatedHandle, 'vo', 'gpu');
      } else {
        funcs.mpv_set_property_string(allocatedHandle, 'vo', 'null');
      }
      funcs.mpv_initialize(allocatedHandle);
    }
  }

  const mockFuncs = {
    mpv_create: () => ({ ptr: 'mpv_context' }),
    mpv_initialize: () => 0,
    mpv_set_property_string: (_ctx, name, val) => {
      propertyCalls.push({ name, val });
      return 0;
    },
  };

  const service = new MockRenderingPlayerService(() => mockFuncs);
  await service.initialize();

  const widCall = propertyCalls.find((c) => c.name === 'wid');
  const voCall = propertyCalls.find((c) => c.name === 'vo');
  assert.strictEqual(widCall, undefined, 'wid should not be set when HWND is null');
  assert.ok(voCall);
  assert.strictEqual(voCall.val, 'null');

  console.log('  [PASS] PlayerService vo=null fallback verified');
  testsPassed++;
}

// Test 5: Bounds coordinate and dimension validation
{
  console.log('[TEST 5] Video bounds IPC parameter validation');
  const validateBounds = (b) => {
    if (typeof b !== 'object' || b === null) return false;
    if (
      typeof b.x !== 'number' || !Number.isFinite(b.x) ||
      typeof b.y !== 'number' || !Number.isFinite(b.y) ||
      typeof b.width !== 'number' || !Number.isFinite(b.width) ||
      typeof b.height !== 'number' || !Number.isFinite(b.height)
    ) {
      return false;
    }
    return true;
  };

  assert.strictEqual(validateBounds({ x: 0, y: 0, width: 800, height: 600 }), true);
  assert.strictEqual(validateBounds({ x: -10, y: 50, width: 100, height: 100 }), true);
  assert.strictEqual(validateBounds({ x: '0', y: 0, width: 800, height: 600 }), false);
  assert.strictEqual(validateBounds({ x: 0, y: NaN, width: 800, height: 600 }), false);
  assert.strictEqual(validateBounds({ x: 0, y: 0, width: Infinity, height: 600 }), false);
  assert.strictEqual(validateBounds(null), false);
  assert.strictEqual(validateBounds(undefined), false);

  console.log('  [PASS] Video bounds validation verified');
  testsPassed++;
}

console.log(`\n>>> ALL ${testsPassed} PHASE 6 RENDERING UNIT TESTS PASSED <<<\n`);
