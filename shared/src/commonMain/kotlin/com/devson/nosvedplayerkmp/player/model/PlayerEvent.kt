package com.devson.nosvedplayerkmp.player.model

/**
 * Reason for media playback ending.
 */
enum class EndReason {
    /** Reached end of file naturally. */
    EOF,

    /** Playback was stopped by user or external request. */
    STOP,

    /** Playback ended because player is shutting down. */
    QUIT,

    /** Playback ended due to an error. */
    ERROR,

    /** File was a playlist redirect. */
    REDIRECT,

    /** Unknown end reason. */
    UNKNOWN
}

/**
 * Asynchronous events emitted by the player.
 */
sealed interface PlayerEvent {
    /** Playback state changed. */
    data class StateChanged(val state: PlaybackState) : PlayerEvent

    /** Playback of a new file was initiated. */
    data class FileStarted(val playlistEntryId: Long) : PlayerEvent

    /** File headers were read and decoding started. */
    data object FileLoaded : PlayerEvent

    /** File playback completed or stopped. */
    data class FileEnded(val reason: EndReason, val error: PlayerError? = null) : PlayerEvent

    /** An observed property changed value. */
    data class PropertyChanged(val name: String, val value: Any?) : PlayerEvent

    /** Diagnostic log message from the player engine. */
    data class LogMessage(val prefix: String, val level: String, val message: String) : PlayerEvent

    /** The player instance has shut down. */
    data object Shutdown : PlayerEvent

    /** An error occurred in the player engine. */
    data class Error(val error: PlayerError) : PlayerEvent
}
