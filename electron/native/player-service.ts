import { getMpvFunctions, MpvFunctions } from './mpv-bindings';

export type PlayerLifecycleState =
  | 'uninitialized'
  | 'initializing'
  | 'initialized'
  | 'failed'
  | 'shutting-down'
  | 'shutdown';

export interface PlayerServiceStatus {
  state: PlayerLifecycleState;
  apiVersion?: {
    raw: number;
    major: number;
    minor: number;
    formatted: string;
  };
  error?: string;
}

/**
 * Native Player Service managing single-instance libmpv lifecycle,
 * state machine transitions, concurrent request serialization,
 * and safe idempotent shutdown.
 */
export class NativePlayerService {
  private funcsGetter: () => MpvFunctions;
  private funcs: MpvFunctions | null = null;
  private handle: unknown | null = null;
  private state: PlayerLifecycleState = 'uninitialized';
  private apiVersion?: PlayerServiceStatus['apiVersion'];
  private lastError?: string;

  private initPromise: Promise<PlayerServiceStatus> | null = null;
  private shutdownPromise: Promise<PlayerServiceStatus> | null = null;
  private cancelInitRequested = false;

  constructor(customFuncsGetter?: () => MpvFunctions) {
    this.funcsGetter = customFuncsGetter ?? (() => getMpvFunctions());
  }

  public getStatus(): PlayerServiceStatus {
    const status: PlayerServiceStatus = {
      state: this.state,
    };
    if (this.apiVersion) {
      status.apiVersion = { ...this.apiVersion };
    }
    if (this.lastError) {
      status.error = this.lastError;
    }
    return status;
  }

  public async initialize(): Promise<PlayerServiceStatus> {
    if (this.state === 'shutting-down') {
      throw new Error('Cannot initialize: Native player is currently shutting down');
    }

    if (this.state === 'initialized') {
      throw new Error('Duplicate initialization attempt: Native player is already initialized');
    }

    if (this.state === 'initializing' && this.initPromise) {
      // Safely serialize / attach to active initialization
      return this.initPromise;
    }

    this.state = 'initializing';
    this.lastError = undefined;
    this.cancelInitRequested = false;

    this.initPromise = (async () => {
      // Yield to event loop so concurrent callers in the same tick safely serialize to this promise
      await new Promise((resolve) => setTimeout(resolve, 0));
      let allocatedHandle: unknown | null = null;
      try {
        if (!this.funcs) {
          this.funcs = this.funcsGetter();
        }

        // Verify API Version
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

        // Create native mpv context
        allocatedHandle = this.funcs.mpv_create();
        if (!allocatedHandle) {
          throw new Error('mpv_create returned NULL pointer');
        }

        if (this.cancelInitRequested) {
          this.funcs.mpv_terminate_destroy(allocatedHandle);
          allocatedHandle = null;
          throw new Error('Initialization aborted by shutdown request');
        }

        // Initialize mpv context
        const code = this.funcs.mpv_initialize(allocatedHandle);
        if (code < 0) {
          const errStr = this.funcs.mpv_error_string(code) || 'unknown error';
          // Clean up partial initialization immediately
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

  public async shutdown(): Promise<PlayerServiceStatus> {
    if (this.state === 'shutdown') {
      // Safe, idempotent repeated shutdown
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
            // Expected if cancelled or failed
          }
        }

        if (this.handle && this.funcs) {
          try {
            this.funcs.mpv_terminate_destroy(this.handle);
          } catch (err) {
            console.error('[NativePlayerService] Error during terminate_destroy:', err);
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
