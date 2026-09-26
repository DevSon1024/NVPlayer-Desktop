package com.devson.nosvedplayerkmp.history.model

import com.devson.nosvedplayerkmp.media.model.MediaFile

/**
 * Domain entity recording playback session history and resume progress.
 */
data class PlaybackHistoryItem(
    val media: MediaFile,
    val lastPositionMs: Long = 0L,
    val durationMs: Long = 0L,
    val lastPlayedTimestampMs: Long = 0L,
    val isCompleted: Boolean = false
) {
    val progressFraction: Float
        get() = if (durationMs > 0L) {
            (lastPositionMs.toFloat() / durationMs.toFloat()).coerceIn(0f, 1f)
        } else {
            0f
        }

    val isContinueWatching: Boolean
        get() = !isCompleted && lastPositionMs >= 5000L && (durationMs <= 0L || lastPositionMs < (durationMs * 0.92))

    val formattedLastPosition: String
        get() {
            val totalSeconds = (lastPositionMs / 1000).coerceAtLeast(0)
            val minutes = totalSeconds / 60
            val seconds = totalSeconds % 60
            val hours = minutes / 60
            return if (hours > 0) {
                val remMinutes = minutes % 60
                val hStr = hours.toString().padStart(2, '0')
                val mStr = remMinutes.toString().padStart(2, '0')
                val sStr = seconds.toString().padStart(2, '0')
                "$hStr:$mStr:$sStr"
            } else {
                val mStr = minutes.toString().padStart(2, '0')
                val sStr = seconds.toString().padStart(2, '0')
                "$mStr:$sStr"
            }
        }
}
