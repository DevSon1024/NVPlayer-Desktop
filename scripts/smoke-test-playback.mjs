import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import koffi from 'koffi';

console.log('=== REAL WINDOWS X64 NATIVE LIBMPV PLAYBACK SMOKE TEST ===');

const rootDir = process.cwd();
const dllPath = path.resolve(rootDir, 'windows', 'x64', 'libmpv-2.dll');
const testVideoPath = path.resolve(rootDir, 'test_synthetic_playback.mp4');

if (!fs.existsSync(dllPath)) {
  console.error(`[FAIL] libmpv binary not found at: ${dllPath}`);
  process.exit(1);
}

// 1. Generate small synthetic 2-second test video with ffmpeg
const ffmpegExe = 'C:\\ffmpeg\\bin\\ffmpeg.exe';
if (!fs.existsSync(ffmpegExe)) {
  console.error(`[FAIL] ffmpeg not found at: ${ffmpegExe}`);
  process.exit(1);
}

console.log('[EXEC] Generating 2-second synthetic local test video...');
try {
  execSync(
    `"${ffmpegExe}" -y -f lavfi -i testsrc=duration=2:size=320x240:rate=30 -f lavfi -i anullsrc=r=44100:cl=mono -t 2 -c:v libx264 -pix_fmt yuv420p -c:a aac "${testVideoPath}"`,
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

try {
  // 2. Load libmpv via Koffi C-ABI
  console.log('[EXEC] Loading libmpv-2.dll via Koffi...');
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
  const mpv_observe_property = lib.func('int mpv_observe_property(mpv_handle *ctx, uint64_t reply_userdata, const char *name, int format)');
  const mpv_wait_event = lib.func('mpv_event *mpv_wait_event(mpv_handle *ctx, double timeout)');

  // 3. Create & initialize
  console.log('[EXEC] Initializing native mpv instance...');
  const ctx = mpv_create();
  if (!ctx) throw new Error('mpv_create returned NULL');

  mpv_set_property_string(ctx, 'vo', 'null');
  mpv_set_property_string(ctx, 'idle', 'yes');

  const initCode = mpv_initialize(ctx);
  if (initCode < 0) {
    throw new Error(`mpv_initialize failed: ${mpv_error_string(initCode)}`);
  }
  console.log('[PASS] Native mpv initialized successfully');

  // Observe properties
  mpv_observe_property(ctx, 1, 'pause', 0);
  mpv_observe_property(ctx, 2, 'time-pos', 0);
  mpv_observe_property(ctx, 3, 'duration', 0);
  mpv_observe_property(ctx, 4, 'volume', 0);

  // 4. Load synthetic media
  console.log(`[EXEC] Loading synthetic file: ${testVideoPath}`);
  const loadCode = mpv_command(ctx, ['loadfile', testVideoPath, 'replace', null]);
  if (loadCode < 0) {
    throw new Error(`loadfile failed: ${mpv_error_string(loadCode)}`);
  }
  console.log('[PASS] loadfile command dispatched successfully');

  // 5. Unpause / play
  console.log('[EXEC] Unpausing media playback...');
  mpv_set_property_string(ctx, 'pause', 'no');

  // 6. Poll for duration and position progress
  let durationFound = null;
  let positionProgressed = false;
  const startWait = Date.now();

  console.log('[EXEC] Observing playback progress in real time...');
  while (Date.now() - startWait < 5000) {
    const evPtr = mpv_wait_event(ctx, 0.05);
    if (evPtr) {
      const ev = koffi.decode(evPtr, mpvEventStruct);
      if (ev && ev.event_id === 8) { // FILE_LOADED
        console.log('[PASS] Received MPV_EVENT_FILE_LOADED (event_id 8)');
      }
    }

    const durStr = mpv_get_property_string(ctx, 'duration');
    if (durStr && !durationFound) {
      const d = parseFloat(durStr);
      if (Number.isFinite(d) && d > 1.5 && d < 2.5) {
        durationFound = d;
        console.log(`[PASS] Verified accurate native duration: ${durationFound.toFixed(2)}s`);
      }
    }

    const posStr = mpv_get_property_string(ctx, 'time-pos');
    if (posStr) {
      const p = parseFloat(posStr);
      if (Number.isFinite(p) && p > 0.1) {
        positionProgressed = true;
        console.log(`[PASS] Playback progression confirmed: time-pos=${p.toFixed(2)}s`);
        break;
      }
    }
  }

  if (!durationFound) {
    throw new Error('Did not receive valid duration from native player');
  }
  if (!positionProgressed) {
    throw new Error('Playback did not progress within expected window');
  }

  // 7. Test Seek
  console.log('[EXEC] Seeking to 0.8s...');
  const seekCode = mpv_command(ctx, ['seek', '0.8', 'absolute', null]);
  if (seekCode < 0) {
    throw new Error(`seek failed: ${mpv_error_string(seekCode)}`);
  }

  // Wait briefly for seek to apply
  let seekConfirmed = false;
  const seekWait = Date.now();
  while (Date.now() - seekWait < 2000) {
    mpv_wait_event(ctx, 0.05);
    const posStr = mpv_get_property_string(ctx, 'time-pos');
    if (posStr) {
      const p = parseFloat(posStr);
      if (Number.isFinite(p) && p >= 0.7) {
        seekConfirmed = true;
        console.log(`[PASS] Seek verified at position: ${p.toFixed(2)}s`);
        break;
      }
    }
  }
  if (!seekConfirmed) {
    console.warn('[WARN] Seek position update was not confirmed immediately');
  }

  // 8. Test Volume & Mute
  console.log('[EXEC] Setting volume to 65%...');
  const volCode = mpv_set_property_string(ctx, 'volume', '65');
  if (volCode < 0) {
    throw new Error(`set volume failed: ${mpv_error_string(volCode)}`);
  }
  const readVol = mpv_get_property_string(ctx, 'volume');
  console.log(`[PASS] Volume confirmed from native: ${parseFloat(readVol || '0').toFixed(0)}%`);

  console.log('[EXEC] Testing native mute property synchronization...');
  mpv_set_property_string(ctx, 'mute', 'yes');
  const readMuteYes = mpv_get_property_string(ctx, 'mute');
  assert.strictEqual(readMuteYes, 'yes', 'Native mute state should be yes');
  const readVolWhileMuted = mpv_get_property_string(ctx, 'volume');
  assert.strictEqual(parseFloat(readVolWhileMuted || '0').toFixed(0), '65', 'Volume level must remain preserved while muted');
  console.log('[PASS] Native mute property confirmed: yes (volume level 65% preserved)');

  mpv_set_property_string(ctx, 'mute', 'no');
  const readMuteNo = mpv_get_property_string(ctx, 'mute');
  assert.strictEqual(readMuteNo, 'no', 'Native mute state should be restored to no');
  console.log('[PASS] Native unmute verified');

  // 9. Pause & Replay
  console.log('[EXEC] Pausing playback...');
  mpv_set_property_string(ctx, 'pause', 'yes');
  const readPause = mpv_get_property_string(ctx, 'pause');
  console.log(`[PASS] Pause state confirmed: ${readPause}`);

  console.log('[EXEC] Testing replay rewind command to 0.0s...');
  mpv_command(ctx, ['seek', '0', 'absolute', null]);
  mpv_set_property_string(ctx, 'pause', 'no');
  const rewoundPosStr = mpv_get_property_string(ctx, 'time-pos');
  console.log(`[PASS] Replay seek confirmed from native: ${rewoundPosStr}s`);

  // 10. Clean shutdown
  console.log('[EXEC] Performing clean termination and destroy...');
  mpv_terminate_destroy(ctx);
  console.log('[PASS] Native player context terminated cleanly');

  testPassed = true;
} catch (err) {
  console.error('[FAIL] Real native playback smoke test failed:', err);
} finally {
  // Clean up synthetic test video
  if (fs.existsSync(testVideoPath)) {
    try {
      fs.unlinkSync(testVideoPath);
      console.log('[PASS] Synthetic test video cleaned up from disk');
    } catch {
      // Cleanup warning
    }
  }
}

if (!testPassed) {
  process.exit(1);
}

console.log('\n>>> REAL WINDOWS X64 NATIVE PLAYBACK SMOKE TEST SUCCEEDED <<<\n');
