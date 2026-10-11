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

console.log('=== Phase 3 Verification: libmpv Integration & Shell Security ===');

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

    if (!result.nativeMpvResult || !result.nativeMpvResult.success) {
      console.error('[FAIL] Native libmpv IPC proof of concept failed:', result.nativeMpvResult);
      failures++;
    } else {
      console.log(`[PASS] Native libmpv IPC PoC verified (API Version: ${result.nativeMpvResult.apiVersion?.formatted})`);
      if (result.nativeMpvResult.rawPointerLeakCheck === false) {
        console.error('[FAIL] Raw native pointers or internal handles detected in payload');
        failures++;
      } else {
        console.log('[PASS] Raw native pointer leakage check passed: main-to-renderer barrier intact');
      }
    }

    if (failures > 0) {
      console.error(`[FAIL] Verification finished with ${failures} failure(s)`);
      process.exit(1);
    }

    console.log('\n>>> ALL PHASE 3 SHELL, NATIVE LIBMPV & SECURITY CHECKS PASSED <<<\n');
    process.exit(0);
  } catch (err) {
    console.error('[FAIL] Failed to parse verification payload:', err);
    process.exit(1);
  }
});
