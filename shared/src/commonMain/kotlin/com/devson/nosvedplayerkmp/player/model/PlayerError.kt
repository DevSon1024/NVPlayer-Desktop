package com.devson.nosvedplayerkmp.player.model

/**
 * Domain error hierarchy representing player and playback failures.
 */
sealed class PlayerError(
    open val message: String,
    open val cause: Throwable? = null
) {
    /**
     * The required native library (e.g., libmpv-2.dll) could not be found.
     */
    data class LibraryNotFound(
        override val message: String,
        val searchedPaths: List<String> = emptyList(),
        override val cause: Throwable? = null
    ) : PlayerError(message, cause)

    /**
     * The runtime architecture or operating system is incompatible with the native library.
     */
    data class IncompatibleArchitecture(
        override val message: String,
        val detectedOs: String,
        val detectedArch: String,
        override val cause: Throwable? = null
    ) : PlayerError(message, cause)

    /**
     * Initialization of the underlying player instance failed.
     */
    data class InitializationFailed(
        override val message: String,
        val errorCode: Int? = null,
        override val cause: Throwable? = null
    ) : PlayerError(message, cause)

    /**
     * An mpv or playback command failed to execute.
     */
    data class CommandExecutionFailed(
        override val message: String,
        val command: String,
        val errorCode: Int? = null,
        override val cause: Throwable? = null
    ) : PlayerError(message, cause)

    /**
     * Getting or setting a player property failed.
     */
    data class PropertyAccessFailed(
        override val message: String,
        val propertyName: String,
        val errorCode: Int? = null,
        override val cause: Throwable? = null
    ) : PlayerError(message, cause)

    /**
     * Media loading or decoding failed.
     */
    data class MediaLoadFailed(
        override val message: String,
        val uri: String,
        val errorCode: Int? = null,
        override val cause: Throwable? = null
    ) : PlayerError(message, cause)

    /**
     * Shutdown or resource cleanup failed.
     */
    data class ShutdownFailed(
        override val message: String,
        override val cause: Throwable? = null
    ) : PlayerError(message, cause)

    /**
     * Generic native error from the underlying player engine.
     */
    data class NativeError(
        override val message: String,
        val errorCode: Int,
        override val cause: Throwable? = null
    ) : PlayerError(message, cause)

    /**
     * An unexpected or unclassified player error.
     */
    data class Unknown(
        override val message: String,
        override val cause: Throwable? = null
    ) : PlayerError(message, cause)

    override fun toString(): String = "${this::class.simpleName}: $message${cause?.let { " (cause: $it)" } ?: ""}"
}

/**
 * Exception wrapper for throwing [PlayerError] in contexts that require an Exception.
 */
class PlayerException(
    val error: PlayerError
) : Exception(error.message, error.cause)
