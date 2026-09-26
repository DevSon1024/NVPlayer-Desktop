package com.devson.nosvedplayerkmp.queue.model

/**
 * Playback sequencing modes governing queue advancement.
 */
enum class PlaybackMode {
    /** Play tracks in order and stop after the last track finishes. */
    SEQUENTIAL,

    /** Replay the currently playing track indefinitely. */
    REPEAT_ONE,

    /** Loop back to the first track when the queue completes. */
    REPEAT_ALL,

    /** Play tracks in pseudo-random order. */
    SHUFFLE
}
