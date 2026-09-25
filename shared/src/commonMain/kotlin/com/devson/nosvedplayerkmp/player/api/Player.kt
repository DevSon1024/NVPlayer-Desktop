package com.devson.nosvedplayerkmp.player.api

import com.devson.nosvedplayerkmp.player.model.MediaItem
import com.devson.nosvedplayerkmp.player.model.PlaybackState
import com.devson.nosvedplayerkmp.player.model.PlayerError
import com.devson.nosvedplayerkmp.player.model.PlayerEvent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlin.time.Duration

/**
 * Platform-independent media player interface.
 *
 * Provides reactive observation of playback state, timing, and errors,
 * as well as asynchronous transport controls.
 */
interface Player {
    /** Observable current playback state. */
    val playbackState: StateFlow<PlaybackState>

    /** Observable current playback position. */
    val position: StateFlow<Duration>

    /** Observable total duration of the currently loaded media. */
    val duration: StateFlow<Duration>

    /** Observable playback progress fraction (0.0f to 1.0f). */
    val progress: StateFlow<Float>

    /** Observable current volume level (0.0f to 100.0f). */
    val volume: StateFlow<Float>

    /** Observable playback speed multiplier (e.g., 1.0f). */
    val playbackSpeed: StateFlow<Float>

    /** Observable descriptor of the currently loaded media item, or null if none. */
    val currentMediaItem: StateFlow<MediaItem?>

    /** Stream of non-fatal and fatal player errors. */
    val errors: Flow<PlayerError>

    /** Stream of low-level and high-level player events. */
    val events: Flow<PlayerEvent>

    /**
     * Initializes the underlying player engine and prepares it for playback.
     */
    suspend fun initialize()

    /**
     * Loads a media file or URL for playback.
     *
     * @param path Absolute file path or stream URL.
     * @param autoPlay If true, playback starts immediately once loaded.
     */
    suspend fun load(path: String, autoPlay: Boolean = true) {
        loadMedia(MediaItem(path), autoPlay)
    }

    /**
     * Loads a structured media item for playback.
     *
     * @param mediaItem The media descriptor to load.
     * @param autoPlay If true, playback starts immediately once loaded.
     */
    suspend fun loadMedia(mediaItem: MediaItem, autoPlay: Boolean = true)

    /**
     * Resumes or starts playback.
     */
    suspend fun play()

    /**
     * Pauses playback.
     */
    suspend fun pause()

    /**
     * Toggles between play and pause states.
     */
    suspend fun togglePause() {
        if (playbackState.value == PlaybackState.PLAYING) {
            pause()
        } else {
            play()
        }
    }

    /**
     * Stops playback and unloads current media.
     */
    suspend fun stop()

    /**
     * Seeks to a specified absolute position within the current media.
     *
     * @param position Target time offset.
     */
    suspend fun seekTo(position: Duration)

    /**
     * Seeks relative to the current playback position.
     *
     * @param seconds Relative offset in seconds (positive to seek forward, negative to seek backward).
     */
    suspend fun seekRelative(seconds: Double)

    /**
     * Seeks forward by a specified number of seconds.
     *
     * @param seconds Seconds to seek forward (defaults to 10.0).
     */
    suspend fun seekForward(seconds: Double = 10.0) {
        seekRelative(seconds)
    }

    /**
     * Seeks backward by a specified number of seconds.
     *
     * @param seconds Seconds to seek backward (defaults to 10.0).
     */
    suspend fun seekBackward(seconds: Double = 10.0) {
        seekRelative(-seconds)
    }

    /**
     * Sets playback volume.
     *
     * @param volume Volume level from 0.0f to 100.0f.
     */
    suspend fun setVolume(volume: Float)

    /**
     * Sets playback speed multiplier.
     *
     * @param speed Speed multiplier (e.g. 0.5f, 1.0f, 1.25f, 1.5f, 2.0f).
     */
    suspend fun setPlaybackSpeed(speed: Float)

    /**
     * Cleanly releases all native resources and terminates the player engine.
     * Calling release() multiple times must be safe and idempotent.
     */
    suspend fun release()
}
