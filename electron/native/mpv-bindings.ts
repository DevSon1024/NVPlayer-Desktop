import path from 'node:path';
import fs from 'node:fs';
import koffi from 'koffi';

/**
 * Clean, safe diagnostic result for the proof-of-concept lifecycle.
 * Raw native pointers and sensitive disk paths are never exposed.
 */
export interface MpvProofOfConceptResult {
  success: boolean;
  stage: 'uninitialized' | 'dll_loaded' | 'version_checked' | 'instance_created' | 'instance_initialized' | 'instance_destroyed';
  apiVersion?: {
    raw: number;
    major: number;
    minor: number;
    formatted: string;
  };
  error?: string;
  errorCode?: number;
}

export interface MpvFunctions {
  mpv_client_api_version: () => number;
  mpv_create: () => unknown;
  mpv_initialize: (ctx: unknown) => number;
  mpv_terminate_destroy: (ctx: unknown) => void;
  mpv_error_string: (error: number) => string;
  mpv_command: (ctx: unknown, args: (string | null)[]) => number;
  mpv_set_property_string: (ctx: unknown, name: string, data: string) => number;
  mpv_get_property_string: (ctx: unknown, name: string) => string | null;
  mpv_free: (data: unknown) => void;
  mpv_wait_event: (ctx: unknown, timeout: number) => unknown;
  mpv_wakeup: (ctx: unknown) => void;
  mpv_set_wakeup_callback: (ctx: unknown, cb: unknown, d: unknown) => void;
  mpv_observe_property: (ctx: unknown, reply_userdata: number | bigint, name: string, format: number) => number;
  mpv_unobserve_property: (ctx: unknown, registered_reply_userdata: number | bigint) => number;
}

export interface MpvEventDecoded {
  event_id: number;
  error: number;
  reply_userdata: number | bigint;
  data: unknown;
}

export const MPV_EVENT = {
  NONE: 0,
  SHUTDOWN: 1,
  LOG_MESSAGE: 2,
  GET_PROPERTY_REPLY: 3,
  SET_PROPERTY_REPLY: 4,
  COMMAND_REPLY: 5,
  START_FILE: 6,
  END_FILE: 7,
  FILE_LOADED: 8,
  IDLE: 11,
  TICK: 14,
  CLIENT_MESSAGE: 16,
  VIDEO_RECONFIG: 17,
  AUDIO_RECONFIG: 18,
  SEEK: 20,
  PLAYBACK_RESTART: 21,
  PROPERTY_CHANGE: 22,
  QUEUE_OVERFLOW: 24,
  HOOK: 25,
} as const;

export const MPV_FORMAT = {
  NONE: 0,
  STRING: 1,
  OSD_STRING: 2,
  FLAG: 3,
  INT64: 4,
  DOUBLE: 5,
  NODE: 6,
} as const;

let cachedFunctions: MpvFunctions | null = null;
let cachedDllPath: string | null = null;
let mpvEventStruct: unknown = null;
let wakeupCallbackProto: unknown = null;

/**
 * Resolves the explicit path to libmpv-2.dll based on environment.
 * Prefers process.resourcesPath in packaged app, or workspace root in development.
 */
export function resolveLibmpvPath(appRoot?: string): string {
  // If explicitly passed
  if (appRoot) {
    const candidate = path.join(appRoot, 'windows', 'x64', 'libmpv-2.dll');
    if (fs.existsSync(candidate)) return candidate;
  }

  // Packaged app path (process.resourcesPath/windows/x64/libmpv-2.dll)
  if (typeof process !== 'undefined' && (process as { resourcesPath?: string }).resourcesPath) {
    const packagedPath = path.join(process.resourcesPath, 'windows', 'x64', 'libmpv-2.dll');
    if (fs.existsSync(packagedPath)) return packagedPath;
  }

  // Development fallback from current working directory or module location
  const devPath = path.resolve(process.cwd(), 'windows', 'x64', 'libmpv-2.dll');
  if (fs.existsSync(devPath)) return devPath;

  // Relative to this source file
  const relativeDev = path.resolve(__dirname, '../../windows/x64/libmpv-2.dll');
  if (fs.existsSync(relativeDev)) return relativeDev;

  return devPath; // Return standard dev path for clear error reporting
}

/**
 * Loads and binds the set of libmpv functions required for playback and event handling.
 */
export function getMpvFunctions(customDllPath?: string): MpvFunctions {
  const dllPath = customDllPath || resolveLibmpvPath();

  if (cachedFunctions && cachedDllPath === dllPath) {
    return cachedFunctions;
  }

  if (!fs.existsSync(dllPath)) {
    throw new Error('Native libmpv library not found at expected location');
  }

  try {
    const lib = koffi.load(dllPath);
    const mpv_handle = koffi.opaque('mpv_handle');

    if (!mpvEventStruct) {
      mpvEventStruct = koffi.struct('mpv_event', {
        event_id: 'int',
        error: 'int',
        reply_userdata: 'uint64',
        data: 'void *',
      });
    }

    if (!wakeupCallbackProto) {
      wakeupCallbackProto = koffi.proto('void wakeup_cb(void *d)');
    }

    const funcs: MpvFunctions = {
      mpv_client_api_version: lib.func('unsigned long mpv_client_api_version(void)'),
      mpv_create: lib.func('mpv_handle *mpv_create(void)'),
      mpv_initialize: lib.func('int mpv_initialize(mpv_handle *ctx)'),
      mpv_terminate_destroy: lib.func('void mpv_terminate_destroy(mpv_handle *ctx)'),
      mpv_error_string: lib.func('const char *mpv_error_string(int error)'),
      mpv_command: lib.func('int mpv_command(mpv_handle *ctx, const char **args)'),
      mpv_set_property_string: lib.func('int mpv_set_property_string(mpv_handle *ctx, const char *name, const char *data)'),
      mpv_get_property_string: lib.func('char *mpv_get_property_string(mpv_handle *ctx, const char *name)'),
      mpv_free: lib.func('void mpv_free(void *data)'),
      mpv_wait_event: lib.func('mpv_event *mpv_wait_event(mpv_handle *ctx, double timeout)'),
      mpv_wakeup: lib.func('void mpv_wakeup(mpv_handle *ctx)'),
      mpv_set_wakeup_callback: lib.func('void mpv_set_wakeup_callback(mpv_handle *ctx, wakeup_cb *cb, void *d)'),
      mpv_observe_property: lib.func('int mpv_observe_property(mpv_handle *ctx, uint64_t reply_userdata, const char *name, int format)'),
      mpv_unobserve_property: lib.func('int mpv_unobserve_property(mpv_handle *ctx, uint64_t registered_reply_userdata)'),
    };

    cachedFunctions = funcs;
    cachedDllPath = dllPath;
    return funcs;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load native libmpv binary or bind exports: ${message}`);
  }
}

/**
 * Unpacks an event pointer returned from mpv_wait_event.
 */
export function decodeMpvEvent(evPtr: unknown): MpvEventDecoded | null {
  if (!evPtr || !mpvEventStruct) return null;
  try {
    return (koffi.decode(evPtr, mpvEventStruct) as MpvEventDecoded) ?? null;
  } catch {
    return null;
  }
}

/**
 * Safely reads a string property and automatically frees the native buffer.
 */
export function safeGetMpvPropertyString(funcs: MpvFunctions, ctx: unknown, name: string): string | null {
  try {
    return funcs.mpv_get_property_string(ctx, name);
  } catch {
    return null;
  }
}

/**
 * Registers a native wakeup callback using Koffi and returns an unregister handle.
 */
export function registerMpvWakeupCallback(callback: () => void): { pointer: unknown; unregister: () => void } {
  if (!wakeupCallbackProto) {
    wakeupCallbackProto = koffi.proto('void wakeup_cb(void *d)');
  }
  const cb = koffi.register(() => {
    callback();
  }, koffi.pointer(wakeupCallbackProto));

  return {
    pointer: cb,
    unregister: () => {
      try {
        koffi.unregister(cb);
      } catch {
        // Ignored if already unregistered
      }
    },
  };
}

/**
 * Stateful instance controller ensuring single-instance lifecycle,
 * idempotent teardown, and prevention of duplicate initialization.
 */
export class MpvLifecycleSession {
  private funcs: MpvFunctions;
  private handle: unknown | null = null;
  private isInitialized = false;

  constructor(funcs: MpvFunctions) {
    this.funcs = funcs;
  }

  getHandle(): unknown | null {
    return this.handle;
  }

  create(): void {
    if (this.handle) {
      throw new Error('Duplicate initialization attempt: An active mpv instance already exists');
    }
    const ctx = this.funcs.mpv_create();
    if (!ctx) {
      throw new Error('mpv_create returned NULL pointer');
    }
    this.handle = ctx;
  }

  initialize(): void {
    if (!this.handle) {
      throw new Error('Cannot initialize: No active mpv instance created');
    }
    if (this.isInitialized) {
      throw new Error('Duplicate initialization attempt: mpv is already initialized');
    }

    const code = this.funcs.mpv_initialize(this.handle);
    if (code < 0) {
      const errStr = this.funcs.mpv_error_string(code) || 'unknown error';
      // Cleanup partially initialized context safely
      this.destroy();
      throw new Error(`mpv_initialize failed with code ${code} (${errStr})`);
    }

    this.isInitialized = true;
  }

  destroy(): void {
    if (this.handle) {
      try {
        this.funcs.mpv_terminate_destroy(this.handle);
      } finally {
        this.handle = null;
        this.isInitialized = false;
      }
    }
  }
}

/**
 * Executes the complete proof of concept sequence:
 * 1. Resolves and loads libmpv-2.dll.
 * 2. Queries mpv_client_api_version().
 * 3. Creates an instance via mpv_create().
 * 4. Initializes via mpv_initialize().
 * 5. Cleans up via mpv_terminate_destroy().
 * 6. Returns a safe, typed diagnostic payload.
 */
export async function runMpvProofOfConcept(injectedFuncs?: MpvFunctions): Promise<MpvProofOfConceptResult> {
  let stage: MpvProofOfConceptResult['stage'] = 'uninitialized';
  let funcs: MpvFunctions;

  try {
    funcs = injectedFuncs ?? getMpvFunctions();
    stage = 'dll_loaded';
  } catch (err) {
    return {
      success: false,
      stage,
      error: err instanceof Error ? err.message : 'Failed to locate or load native libmpv library',
    };
  }

  // 1. Verify API Version
  let rawVer: number;
  try {
    rawVer = funcs.mpv_client_api_version();
    const major = rawVer >> 16;
    const minor = rawVer & 0xffff;

    if (major !== 2) {
      return {
        success: false,
        stage: 'version_checked',
        error: `Incompatible libmpv major API version: expected 2, received ${major}.${minor}`,
        apiVersion: { raw: rawVer, major, minor, formatted: `${major}.${minor}` },
      };
    }
    stage = 'version_checked';
  } catch (err) {
    return {
      success: false,
      stage,
      error: 'Failed to query mpv_client_api_version',
    };
  }

  const major = rawVer >> 16;
  const minor = rawVer & 0xffff;
  const apiVersion = { raw: rawVer, major, minor, formatted: `${major}.${minor}` };

  // 2. Lifecycle Session
  const session = new MpvLifecycleSession(funcs);

  try {
    session.create();
    stage = 'instance_created';

    session.initialize();
    stage = 'instance_initialized';

    session.destroy();
    stage = 'instance_destroyed';

    return {
      success: true,
      stage,
      apiVersion,
    };
  } catch (err) {
    // Ensure clean teardown if any step threw
    session.destroy();

    return {
      success: false,
      stage,
      apiVersion,
      error: err instanceof Error ? err.message : 'Lifecycle proof-of-concept failed',
    };
  }
}
