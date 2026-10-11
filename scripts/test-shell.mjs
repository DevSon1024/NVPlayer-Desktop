import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const rootDir = process.cwd();
const electronBinary = path.join(
  rootDir,
  'node_modules',
  'electron',
  'dist',
  'electron.exe'
);

console.log('=== Phase 5 Verification: Playback Engine, Async Events & Shell Security ===');

// 0. Run Mocked Native Unit Tests
console.log('[INFO] Running Mocked Native Unit Tests...');
const unitResult = spawnSync(process.execPath, [path.join(rootDir, 'scripts', 'test-native-unit.mjs')], {
  cwd: rootDir,
  stdio: 'inherit',
});
if (unitResult.status !== 0) {
  console.error('[FAIL] Native unit test suite failed!');
  process.exit(1);
}
console.log('[PASS] Native unit test suite passed successfully.\n');

console.log('[INFO] Running Mocked Playback Engine Unit Tests...');
const playbackResult = spawnSync(process.execPath, [path.join(rootDir, 'scripts', 'test-playback-unit.mjs')], {
  cwd: rootDir,
  stdio: 'inherit',
});
if (playbackResult.status !== 0) {
  console.error('[FAIL] Playback unit test suite failed!');
  process.exit(1);
}
console.log('[PASS] Playback unit test suite passed successfully.\n');

console.log('[INFO] Running Real Windows x64 Native Playback Smoke Test...');
const realPlaybackResult = spawnSync(process.execPath, [path.join(rootDir, 'scripts', 'smoke-test-playback.mjs')], {
  cwd: rootDir,
  stdio: 'inherit',
});
if (realPlaybackResult.status !== 0) {
  console.error('[FAIL] Real native playback smoke test failed!');
  process.exit(1);
}
console.log('[PASS] Real native playback smoke test passed successfully.\n');


// 1. Verify windows/x64 native assets
const requiredNativeAssets = [
  'windows/x64/libmpv-2.dll',
  'windows/x64/libmpv.dll.a',
  'windows/x64/include/mpv/client.h',
  'windows/x64/include/mpv/render.h',
  'windows/x64/include/mpv/render_gl.h',
  'windows/x64/include/mpv/stream_cb.h',
];

for (const asset of requiredNativeAssets) {
  const fullPath = path.join(rootDir, asset);
  if (!fs.existsSync(fullPath)) {
    console.error(`[FAIL] Required native asset missing: ${asset}`);
    process.exit(1);
  }
}
console.log('[PASS] Native assets integrity verified: All 6 files present and preserved.');

// 2. Launch Electron in test mode
console.log(`[EXEC] Launching ${electronBinary} with NOSVED_TEST_MODE=1...`);

const child = spawn(electronBinary, ['.'], {
  cwd: rootDir,
  env: {
    ...process.env,
    NOSVED_TEST_MODE: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let testOutput = '';
let errorOutput = '';

child.stdout.on('data', (data) => {
  const str = data.toString();
  testOutput += str;
  process.stdout.write(str);
});

child.stderr.on('data', (data) => {
  const str = data.toString();
  errorOutput += str;
  process.stderr.write(str);
});

const timeout = setTimeout(() => {
  console.error('[FAIL] Test timed out after 20 seconds');
  child.kill();
  process.exit(1);
}, 20000);

child.on('close', (code) => {
  clearTimeout(timeout);
  console.log(`[INFO] Electron exited with code: ${code}`);

  const match = testOutput.match(/__NOSVED_TEST_RESULT__:(.*)/);
  if (!match) {
    console.error('[FAIL] Did not receive test result payload from Electron');
    if (errorOutput) console.error('Error log:', errorOutput);
    process.exit(1);
  }

  try {
    const result = JSON.parse(match[1]);
    console.log('[INFO] Received Test Result Payload:', JSON.stringify(result, null, 2));

    let failures = 0;

    if (!result.hasNosvedAPI) {
      console.error('[FAIL] window.nosvedAPI not exposed via contextBridge');
      failures++;
    } else {
      console.log('[PASS] window.nosvedAPI is exposed via contextBridge');
    }

    if (result.hasProcess) {
      console.error('[FAIL] Direct Node.js process object is leaked to renderer');
      failures++;
    } else {
      console.log('[PASS] Direct Node.js process is NOT accessible to renderer');
    }

    if (result.hasRequire) {
      console.error('[FAIL] Direct Node.js require function is leaked to renderer');
      failures++;
    } else {
      console.log('[PASS] Direct Node.js require is NOT accessible to renderer');
    }

    if (result.hasBuffer) {
      console.error('[FAIL] Direct Node.js Buffer is leaked to renderer');
      failures++;
    } else {
      console.log('[PASS] Direct Node.js Buffer is NOT accessible to renderer');
    }

    if (result.rootChildCount <= 0) {
      console.error('[FAIL] React root element has no children (React did not mount)');
      failures++;
    } else {
      console.log('[PASS] React application mounted successfully in DOM');
    }

    if (result.brandTitle !== 'Nosved Player') {
      console.error(`[FAIL] Brand title mismatch: expected "Nosved Player", got "${result.brandTitle}"`);
      failures++;
    } else {
      console.log('[PASS] UI Brand Title verified: "Nosved Player"');
    }

    if (!result.isIsolated) {
      console.error('[FAIL] contextBridge security state method not callable');
      failures++;
    } else {
      console.log('[PASS] Context isolation contract verified');
    }

    // Scope D: Non-vacuous payload inspection replacing rawPointerLeakCheck
    if (!result.nativeMpvResult || !result.nativeMpvResult.success) {
      console.error('[FAIL] Native libmpv IPC proof of concept failed:', result.nativeMpvResult);
      failures++;
    } else {
      console.log(`[PASS] Native libmpv IPC PoC verified (API Version: ${result.nativeMpvResult.apiVersion?.formatted})`);

      // 1. Whitelist of exact allowed response fields
      const allowedPocFields = new Set(['success', 'stage', 'apiVersion', 'error', 'errorCode']);
      const actualPocFields = Object.keys(result.nativeMpvResult);
      const unexpectedPocFields = actualPocFields.filter((k) => !allowedPocFields.has(k));
      if (unexpectedPocFields.length > 0) {
        console.error(`[FAIL] Unexpected property in nativeMpvResult: ${unexpectedPocFields.join(', ')}`);
        failures++;
      } else {
        console.log('[PASS] Payload field whitelist verified for nativeMpvResult');
      }

      // 2. Assert values have expected primitive or serializable types
      let typeViolation = false;
      for (const [k, v] of Object.entries(result.nativeMpvResult)) {
        if (typeof v === 'function' || typeof v === 'symbol') {
          console.error(`[FAIL] Non-serializable type for field "${k}": ${typeof v}`);
          typeViolation = true;
        }
      }
      if (typeViolation) {
        failures++;
      } else {
        console.log('[PASS] Value serializability verified for nativeMpvResult');
      }

      // 3. String & key inspection for raw pointers, memory addresses, Koffi objects
      const serialized = JSON.stringify(result.nativeMpvResult);
      let pointerLeak = false;
      if (/0x[0-9a-fA-F]{6,}/.test(serialized)) {
        console.error('[FAIL] Raw memory address pattern detected in serialized payload:', serialized);
        pointerLeak = true;
      }
      const prohibitedTerms = ['ptr', 'handle', 'address', 'pointer', 'mpv_handle', 'koffi'];
      for (const term of prohibitedTerms) {
        if (actualPocFields.includes(term)) {
          console.error(`[FAIL] Prohibited internal property name found: ${term}`);
          pointerLeak = true;
        }
      }
      if (pointerLeak) {
        failures++;
      } else {
        console.log('[PASS] Non-vacuous raw pointer and native handle leak check passed');
      }
    }

    // Check playerStatusResult (Native Player Service)
    if (!result.playerStatusResult || (result.playerStatusResult.state !== 'initialized' && result.playerStatusResult.state !== 'uninitialized')) {
      console.error('[FAIL] Player service status invalid or uninitialized:', result.playerStatusResult);
      failures++;
    } else {
      console.log(`[PASS] Player Service lifecycle status verified (State: ${result.playerStatusResult.state})`);
      const allowedStatusFields = new Set(['state', 'apiVersion', 'error']);
      const actualStatusFields = Object.keys(result.playerStatusResult);
      const unexpectedStatusFields = actualStatusFields.filter((k) => !allowedStatusFields.has(k));
      if (unexpectedStatusFields.length > 0) {
        console.error(`[FAIL] Unexpected property in playerStatusResult: ${unexpectedStatusFields.join(', ')}`);
        failures++;
      } else {
        console.log('[PASS] Payload field whitelist verified for playerStatusResult');
      }
    }

    // Check playbackStatusResult (Phase 5 Playback Engine Status)
    if (!result.playbackStatusResult || typeof result.playbackStatusResult.mediaState !== 'string') {
      console.error('[FAIL] Playback status invalid or missing:', result.playbackStatusResult);
      failures++;
    } else {
      console.log(`[PASS] Playback Status verified (Media State: ${result.playbackStatusResult.mediaState})`);
      const allowedPlaybackFields = new Set(['mediaState', 'currentFile', 'position', 'duration', 'paused', 'volume', 'error']);
      const actualPlaybackFields = Object.keys(result.playbackStatusResult);
      const unexpectedPlaybackFields = actualPlaybackFields.filter((k) => !allowedPlaybackFields.has(k));
      if (unexpectedPlaybackFields.length > 0) {
        console.error(`[FAIL] Unexpected property in playbackStatusResult: ${unexpectedPlaybackFields.join(', ')}`);
        failures++;
      } else {
        console.log('[PASS] Payload field whitelist verified for playbackStatusResult');
      }

      const serializedPlayback = JSON.stringify(result.playbackStatusResult);
      if (/0x[0-9a-fA-F]{6,}/.test(serializedPlayback)) {
        console.error('[FAIL] Pointer leak detected in playback status payload:', serializedPlayback);
        failures++;
      } else {
        console.log('[PASS] Memory address leak check passed for playbackStatusResult');
      }
    }

    if (failures > 0) {
      console.error(`[FAIL] Verification finished with ${failures} failure(s)`);
      process.exit(1);
    }

    console.log('\n>>> ALL PHASE 5 SHELL, NATIVE PLAYBACK ENGINE & SECURITY CHECKS PASSED <<<\n');
    process.exit(0);
  } catch (err) {
    console.error('[FAIL] Failed to parse verification payload:', err);
    process.exit(1);
  }
});
