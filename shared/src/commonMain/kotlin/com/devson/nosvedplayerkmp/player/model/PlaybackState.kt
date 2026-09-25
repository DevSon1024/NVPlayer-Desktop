package com.devson.nosvedplayerkmp.player.model

/**
 * Represents the current playback state of the player.
 */
enum class PlaybackState {
    /** The player is idle and no media is loaded. */
    IDLE,

    /** The player core is initializing. */
    INITIALIZING,

    /** Media is currently being loaded or buffered. */
    LOADING,

    /** Media is actively playing. */
    PLAYING,

    /** Playback is paused. */
    PAUSED,

    /** Playback was stopped. */
    STOPPED,

    /** Playback reached the end of the media file. */
    ENDED,

    /** The player encountered an unrecoverable error. */
    ERROR
}
