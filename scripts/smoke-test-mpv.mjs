import path from 'node:path';
import fs from 'node:fs';
import koffi from 'koffi';

console.log('=== REAL WINDOWS X64 NATIVE LIBMPV SMOKE TEST ===');

const dllPath = path.resolve(process.cwd(), 'windows', 'x64', 'libmpv-2.dll');

if (!fs.existsSync(dllPath)) {
  console.error(`[FAIL] Native libmpv binary not found at: ${dllPath}`);
  process.exit(1);
}

const stats = fs.statSync(dllPath);
console.log(`[PASS] Verified libmpv binary on disk: ${dllPath} (${stats.size} bytes)`);

try {
  console.log('[EXEC] Loading libmpv-2.dll via Koffi C-ABI...');
  const lib = koffi.load(dllPath);

  console.log('[EXEC] Binding minimal proof-of-concept exports...');
  const mpv_handle = koffi.opaque('mpv_handle');
  const mpv_client_api_version = lib.func('unsigned long mpv_client_api_version(void)');
  const mpv_create = lib.func('mpv_handle *mpv_create(void)');
  const mpv_initialize = lib.func('int mpv_initialize(mpv_handle *ctx)');
  const mpv_terminate_destroy = lib.func('void mpv_terminate_destroy(mpv_handle *ctx)');
  const mpv_error_string = lib.func('const char *mpv_error_string(int error)');

  // 1. Query client API version
  const rawVersion = mpv_client_api_version();
  const major = rawVersion >> 16;
  const minor = rawVersion & 0xffff;
  console.log(`[PASS] mpv_client_api_version() returned raw=${rawVersion} (v${major}.${minor})`);

  if (major !== 2) {
    console.error(`[FAIL] Incompatible libmpv API major version: expected 2, got ${major}`);
    process.exit(1);
  }

  // 2. Create instance
  console.log('[EXEC] Creating native mpv instance with mpv_create()...');
  const ctx = mpv_create();
  if (!ctx) {
    console.error('[FAIL] mpv_create() returned NULL pointer');
    process.exit(1);
  }
  console.log('[PASS] mpv_create() succeeded (valid non-null native context)');

  // 3. Initialize instance
  console.log('[EXEC] Initializing native mpv instance with mpv_initialize()...');
  const initResult = mpv_initialize(ctx);
  const errDesc = mpv_error_string(initResult);

  if (initResult < 0) {
    console.error(`[FAIL] mpv_initialize() failed with code ${initResult} (${errDesc})`);
    mpv_terminate_destroy(ctx);
    process.exit(1);
  }
  console.log(`[PASS] mpv_initialize() succeeded with code ${initResult} (${errDesc})`);

  // 4. Terminate and destroy instance
  console.log('[EXEC] Terminating and destroying native mpv instance with mpv_terminate_destroy()...');
  mpv_terminate_destroy(ctx);
  console.log('[PASS] mpv_terminate_destroy() completed cleanly (no crashes, no hangs)');

  console.log('\n>>> REAL NATIVE SMOKE TEST PASSED (All 4 lifecycle steps verified) <<<\n');
  process.exit(0);
} catch (err) {
  console.error('[FAIL] Unexpected exception during native smoke test:', err);
  process.exit(1);
}
