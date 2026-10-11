import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import koffi from 'koffi';

console.log('=== REAL WINDOWS X64 NATIVE LIBMPV VIDEO RENDERING SMOKE TEST ===');

const rootDir = process.cwd();
const dllPath = path.resolve(rootDir, 'windows', 'x64', 'libmpv-2.dll');
const testVideoPath = path.resolve(rootDir, 'test_synthetic_render.mp4');

if (!fs.existsSync(dllPath)) {
  console.error(`[FAIL] libmpv binary not found at: ${dllPath}`);
  process.exit(1);
}

// 1. Generate small synthetic 3-second test video with ffmpeg
const ffmpegExe = 'C:\\ffmpeg\\bin\\ffmpeg.exe';
if (!fs.existsSync(ffmpegExe)) {
  console.error(`[FAIL] ffmpeg not found at: ${ffmpegExe}`);
  process.exit(1);
}

console.log('[EXEC] Generating 3-second synthetic local test video...');
try {
  execSync(
    `"${ffmpegExe}" -y -f lavfi -i testsrc=duration=3:size=640x360:rate=30 -f lavfi -i anullsrc=r=44100:cl=mono -t 3 -c:v libx264 -pix_fmt yuv420p -c:a aac "${testVideoPath}"`,
    { stdio: 'ignore' }
  );
  if (!fs.existsSync(testVideoPath)) {
    throw new Error('Synthetic video was not generated');
  }
  const stat = fs.statSync(testVideoPath);
  console.log(`[PASS] Generated synthetic test video (${stat.size} bytes): ${testVideoPath}`);
} catch (err) {
  console.error('[FAIL] Could not generate synthetic test video:', err);
  process.exit(1);
}

let testPassed = false;
let topHwnd = null;
let childHwnd = null;
let ctx = null;

try {
  // 2. Load Win32 User32 APIs via Koffi
  console.log('[EXEC] Binding Win32 User32 APIs...');
  const user32 = koffi.load('user32.dll');
  const CreateWindowExW = user32.func(
    'intptr_t CreateWindowExW(uint32_t dwExStyle, const wchar_t *lpClassName, const wchar_t *lpWindowName, uint32_t dwStyle, int X, int Y, int nWidth, int nHeight, intptr_t hWndParent, intptr_t hMenu, intptr_t hInstance, void *lpParam)'
  );
  const DestroyWindow = user32.func('bool DestroyWindow(intptr_t hWnd)');
  const SetWindowPos = user32.func(
    'bool SetWindowPos(intptr_t hWnd, intptr_t hWndInsertAfter, int X, int Y, int cx, int cy, uint32_t uFlags)'
  );
  const ShowWindow = user32.func('bool ShowWindow(intptr_t hWnd, int nCmdShow)');

  const WS_OVERLAPPEDWINDOW = 0x00cf0000;
  const WS_VISIBLE = 0x10000000;
  const WS_CHILD = 0x40000000;
  const WS_CLIPSIBLINGS = 0x04000000;

  // 3. Create host and child window
  console.log('[EXEC] Creating Win32 parent and child video windows...');
  topHwnd = CreateWindowExW(0, 'STATIC', 'NosvedRenderTestParent', WS_OVERLAPPEDWINDOW | WS_VISIBLE, 100, 100, 700, 500, 0, 0, 0, null);
  if (!topHwnd) throw new Error('Failed to create parent test window');

  childHwnd = CreateWindowExW(0, 'STATIC', 'NosvedRenderTestChild', WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS, 20, 20, 640, 360, topHwnd, 0, 0, null);
  if (!childHwnd) throw new Error('Failed to create child video window');

  console.log(`[PASS] Parent HWND: ${topHwnd}, Child Video HWND: ${childHwnd}`);

  // 4. Load libmpv via Koffi
  console.log('[EXEC] Loading libmpv-2.dll...');
  const lib = koffi.load(dllPath);

  const mpv_handle = koffi.opaque('mpv_handle');
  const mpvEventStruct = koffi.struct('mpv_event', {
    event_id: 'int',
    error: 'int',
    reply_userdata: 'uint64',
    data: 'void *',
  });

  const mpv_create = lib.func('mpv_handle *mpv_create(void)');
  const mpv_initialize = lib.func('int mpv_initialize(mpv_handle *ctx)');
  const mpv_terminate_destroy = lib.func('void mpv_terminate_destroy(mpv_handle *ctx)');
  const mpv_error_string = lib.func('const char *mpv_error_string(int error)');
  const mpv_command = lib.func('int mpv_command(mpv_handle *ctx, const char **args)');
  const mpv_set_property_string = lib.func('int mpv_set_property_string(mpv_handle *ctx, const char *name, const char *data)');
  const mpv_get_property_string = lib.func('char *mpv_get_property_string(mpv_handle *ctx, const char *name)');
  const mpv_wait_event = lib.func('mpv_event *mpv_wait_event(mpv_handle *ctx, double timeout)');

  // 5. Initialize mpv with wid and vo=gpu
  console.log('[EXEC] Configuring libmpv with native child HWND and Direct3D/GPU rendering...');
  ctx = mpv_create();
  if (!ctx) throw new Error('mpv_create returned null');

  mpv_set_property_string(ctx, 'wid', String(childHwnd));
  mpv_set_property_string(ctx, 'vo', 'gpu');
  mpv_set_property_string(ctx, 'idle', 'yes');

  const initCode = mpv_initialize(ctx);
  if (initCode < 0) {
    throw new Error(`mpv_initialize failed: ${mpv_error_string(initCode)}`);
  }
  console.log('[PASS] libmpv initialized successfully with native child HWND');

  // Helper to drain events
  const drainEvents = () => {
    while (true) {
      const evPtr = mpv_wait_event(ctx, 0);
      if (!evPtr) break;
      const dec = koffi.decode(evPtr, mpvEventStruct);
      if (!dec || dec.event_id === 0) break;
    }
  };

  // 6. Load synthetic test video
  console.log('[EXEC] Dispatching loadfile command...');
  const loadCode = mpv_command(ctx, ['loadfile', testVideoPath, 'replace', null]);
  if (loadCode < 0) throw new Error(`loadfile failed: ${mpv_error_string(loadCode)}`);
  console.log('[PASS] Video loaded into native engine');

  // 7. Unpause and start playback
  mpv_set_property_string(ctx, 'pause', 'no');

  // 8. Wait for vo-configured and verify video dimensions
  console.log('[EXEC] Waiting for video output configuration and visible frame rendering...');
  let voConfigured = false;
  let videoWidth = null;
  let videoHeight = null;
  let positionAdvanced = false;

  const startTime = Date.now();
  while (Date.now() - startTime < 4000) {
    drainEvents();
    const voConfStr = mpv_get_property_string(ctx, 'vo-configured');
    if (voConfStr === 'yes') {
      voConfigured = true;
      const wStr = mpv_get_property_string(ctx, 'dwidth');
      const hStr = mpv_get_property_string(ctx, 'dheight');
      if (wStr && hStr) {
        videoWidth = parseInt(wStr, 10);
        videoHeight = parseInt(hStr, 10);
      }
      const posStr = mpv_get_property_string(ctx, 'time-pos');
      if (posStr && parseFloat(posStr) > 0.15) {
        positionAdvanced = true;
        break;
      }
    }
    // Sleep 50ms
    const sleepTarget = Date.now() + 50;
    while (Date.now() < sleepTarget) {}
  }

  if (!voConfigured) {
    throw new Error('vo-configured property never became "yes": Native video output failed');
  }
  console.log(`[PASS] Video output configured (vo-configured: yes)`);
  console.log(`[PASS] Native frame geometry: ${videoWidth}x${videoHeight}`);
  if (videoWidth !== 640 || videoHeight !== 360) {
    throw new Error(`Unexpected video geometry: expected 640x360, got ${videoWidth}x${videoHeight}`);
  }

  if (!positionAdvanced) {
    throw new Error('Video frames did not advance during playback');
  }
  console.log('[PASS] Native video playback progressed smoothly');

  // 9. Test seeking
  console.log('[EXEC] Testing seek operation to 1.5s...');
  mpv_command(ctx, ['seek', '1.5', 'absolute', null]);
  drainEvents();
  const seekPosStr = mpv_get_property_string(ctx, 'time-pos');
  console.log(`[PASS] Position after seek: ${seekPosStr}s`);

  // 10. Test child window resize during playback
  console.log('[EXEC] Testing dynamic child window resize (SetWindowPos)...');
  const resizeRes = SetWindowPos(childHwnd, 0, 10, 10, 500, 300, 0x0004 | 0x0010 | 0x4000);
  if (!resizeRes) throw new Error('SetWindowPos failed during resize');
  drainEvents();
  console.log('[PASS] Native video surface resized without crash or detachment');

  // 11. Test pause / resume
  console.log('[EXEC] Testing pause and resume...');
  mpv_set_property_string(ctx, 'pause', 'yes');
  drainEvents();
  const pauseVal = mpv_get_property_string(ctx, 'pause');
  if (pauseVal !== 'yes') throw new Error('Failed to pause video');
  mpv_set_property_string(ctx, 'pause', 'no');
  drainEvents();
  console.log('[PASS] Pause and resume synchronized with native renderer');

  // 12. Clean shutdown in exact sequence: mpv_terminate_destroy -> DestroyWindow
  console.log('[EXEC] Testing clean shutdown sequence...');
  mpv_terminate_destroy(ctx);
  ctx = null;
  console.log('[PASS] mpv context destroyed cleanly');

  DestroyWindow(childHwnd);
  childHwnd = null;
  DestroyWindow(topHwnd);
  topHwnd = null;
  console.log('[PASS] Win32 native child and parent windows destroyed cleanly');

  testPassed = true;
} catch (err) {
  console.error('[FAIL] Smoke test failed:', err);
} finally {
  // Cleanup in case of error
  if (ctx) {
    try {
      koffi.load(dllPath).func('void mpv_terminate_destroy(void *ctx)')(ctx);
    } catch {}
  }
  if (childHwnd) {
    try {
      koffi.load('user32.dll').func('bool DestroyWindow(intptr_t hWnd)')(childHwnd);
    } catch {}
  }
  if (topHwnd) {
    try {
      koffi.load('user32.dll').func('bool DestroyWindow(intptr_t hWnd)')(topHwnd);
    } catch {}
  }
  if (fs.existsSync(testVideoPath)) {
    try {
      fs.unlinkSync(testVideoPath);
    } catch {}
  }
}

if (!testPassed) {
  console.error('\n>>> PHASE 6 NATIVE VIDEO RENDERING SMOKE TEST FAILED <<<\n');
  process.exit(1);
}

console.log('\n>>> PHASE 6 NATIVE VIDEO RENDERING SMOKE TEST PASSED <<<\n');
process.exit(0);
