package com.devson.nosvedplayerkmp.ui.state

import com.devson.nosvedplayerkmp.player.model.PlaybackState
import com.devson.nosvedplayerkmp.player.mpv.render.AspectRatioMode
import kotlin.time.Duration

/**
 * Immutable representation of the player UI presentation state.
 */
data class PlayerUiState(
    val mediaTitle: String? = null,
    val mediaPath: String? = null,
    val playbackState: PlaybackState = PlaybackState.IDLE,
    val position: Duration = Duration.ZERO,
    val duration: Duration = Duration.ZERO,
    val progress: Float = 0f,
    val volume: Float = 100f,
    val isMuted: Boolean = false,
    val lastUnmutedVolume: Float = 100f,
    val speed: Float = 1.0f,
    val aspectRatioMode: AspectRatioMode = AspectRatioMode.FIT,
    val isFullscreen: Boolean = false,
    val areControlsVisible: Boolean = true,
    val isScrubbing: Boolean = false,
    val scrubPosition: Duration = Duration.ZERO,
    val errorMessage: String? = null,
    val errorDetails: String? = null,
    val supportedSpeeds: List<Float> = listOf(0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 2.0f)
) {
    val isMediaLoaded: Boolean
        get() = mediaPath != null && playbackState != PlaybackState.IDLE

    val isPlaying: Boolean
        get() = playbackState == PlaybackState.PLAYING

    val isLoading: Boolean
        get() = playbackState == PlaybackState.LOADING || playbackState == PlaybackState.INITIALIZING

    val hasError: Boolean
        get() = errorMessage != null || playbackState == PlaybackState.ERROR

    val displayPosition: Duration
        get() = if (isScrubbing) scrubPosition else position

    val displayProgress: Float
        get() = if (duration.inWholeMilliseconds > 0) {
            (displayPosition.inWholeMilliseconds.toFloat() / duration.inWholeMilliseconds.toFloat()).coerceIn(0f, 1f)
        } else {
            0f
        }

    val formattedPosition: String
        get() = formatTime(displayPosition)

    val formattedDuration: String
        get() = formatTime(duration)

    companion object {
        fun formatTime(duration: Duration): String {
            val totalSeconds = duration.inWholeSeconds.coerceAtLeast(0)
            val hours = totalSeconds / 3600
            val minutes = (totalSeconds % 3600) / 60
            val seconds = totalSeconds % 60

            return if (hours > 0) {
                "%02d:%02d:%02d".format(hours, minutes, seconds)
            } else {
                "%02d:%02d".format(minutes, seconds)
            }
        }
    }
}
