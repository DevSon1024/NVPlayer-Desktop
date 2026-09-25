package com.devson.nosvedplayerkmp.player.mpv

import com.devson.nosvedplayerkmp.player.model.PlayerError
import com.devson.nosvedplayerkmp.player.model.PlayerException
import com.devson.nosvedplayerkmp.player.mpv.native.LibMpvNative
import com.devson.nosvedplayerkmp.player.mpv.native.MpvLibraryLoader
import com.sun.jna.Pointer
import java.util.concurrent.atomic.AtomicReference

/**
 * Lifecycle state of an [MpvInstance].
 */
enum class MpvState {
    CREATED,
    INITIALIZED,
    TERMINATED
}

/**
 * Manages the native lifecycle of a single libmpv client handle (`mpv_handle*`).
 */
class MpvInstance internal constructor(
    internal val native: LibMpvNative
) : AutoCloseable {

    private val handleRef = AtomicReference<Pointer?>(null)
    private val stateRef = AtomicReference(MpvState.CREATED)

    /** The client API version reported by libmpv. */
    val apiVersion: Long = native.mpv_client_api_version()

    /** Current lifecycle state. */
    val state: MpvState get() = stateRef.get()

    /**
     * The raw native pointer to `mpv_handle`.
     *
     * @throws IllegalStateException if the handle has been terminated or not created.
     */
    internal val rawHandle: Pointer
        get() = handleRef.get() ?: throw IllegalStateException("mpv_handle is null or has already been terminated")

    /**
     * Checks if the instance is currently initialized and ready for commands.
     */
    val isInitialized: Boolean
        get() = stateRef.get() == MpvState.INITIALIZED && handleRef.get() != null

    companion object {
        /**
         * Creates and initializes a new [MpvInstance] with production-safe defaults.
         *
         * @param defaultOptions Additional options to configure before calling mpv_initialize.
         */
        fun createAndInitialize(
            defaultOptions: Map<String, String> = emptyMap()
        ): MpvInstance {
            val native = MpvLibraryLoader.load()
            val instance = MpvInstance(native)
            instance.create()

            // Safe baseline options before initialization:
            // - config=no: do not load random mpv.conf from user's system
            // - terminal=no: do not attach to stdout console directly
            // - vo=null: headless for Phase 0 (rendering will be hooked up in Phase 2)
            // - idle=yes: keep player alive waiting for commands rather than exiting
            val baseOptions = mapOf(
                "config" to "no",
                "terminal" to "no",
                "vo" to "libmpv",
                "idle" to "yes"
            ) + defaultOptions


            for ((key, value) in baseOptions) {
                instance.setOption(key, value)
            }

            instance.initialize()
            return instance
        }
    }

    /**
     * Invokes mpv_create to allocate a native mpv handle.
     */
    internal fun create() {
        val handle = native.mpv_create()
            ?: throw PlayerException(PlayerError.InitializationFailed("mpv_create() returned NULL pointer"))
        handleRef.set(handle)
        stateRef.set(MpvState.CREATED)
    }

    /**
     * Sets an option before or after initialization using mpv_set_option_string.
     */
    fun setOption(name: String, value: String) {
        val handle = rawHandle
        val status = native.mpv_set_option_string(handle, name, value)
        if (status < 0) {
            val errorDesc = native.mpv_error_string(status) ?: "Unknown error"
            throw PlayerException(
                PlayerError.InitializationFailed(
                    "Failed to set mpv option '$name=$value': code $status ($errorDesc)",
                    errorCode = status
                )
            )
        }
    }

    /**
     * Initializes the player core with mpv_initialize().
     */
    internal fun initialize() {
        if (!stateRef.compareAndSet(MpvState.CREATED, MpvState.INITIALIZED)) {
            throw IllegalStateException("Cannot initialize MpvInstance in state: ${stateRef.get()}")
        }

        val handle = rawHandle
        val status = native.mpv_initialize(handle)
        if (status < 0) {
            stateRef.set(MpvState.TERMINATED)
            val errorDesc = native.mpv_error_string(status) ?: "Unknown error"
            native.mpv_destroy(handle)
            handleRef.set(null)
            throw PlayerException(
                PlayerError.InitializationFailed(
                    "mpv_initialize() failed with error code $status: $errorDesc",
                    errorCode = status
                )
            )
        }
    }

    /**
     * Cleanly shuts down the player and destroys the client handle.
     */
    fun terminateAndDestroy() {
        val handle = handleRef.getAndSet(null) ?: return
        stateRef.set(MpvState.TERMINATED)
        try {
            native.mpv_terminate_destroy(handle)
        } catch (e: Exception) {
            throw PlayerException(PlayerError.ShutdownFailed("Error while terminating mpv: ${e.message}", e))
        }
    }

    override fun close() {
        terminateAndDestroy()
    }
}
