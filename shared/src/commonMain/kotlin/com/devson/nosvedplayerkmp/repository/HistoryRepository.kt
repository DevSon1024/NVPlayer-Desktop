package com.devson.nosvedplayerkmp.repository

import com.devson.nosvedplayerkmp.history.model.PlaybackHistoryItem
import com.devson.nosvedplayerkmp.media.model.MediaFile
import kotlinx.coroutines.flow.StateFlow

/**
 * Repository interface governing playback history and resume progress.
 */
interface HistoryRepository {
    val history: StateFlow<List<PlaybackHistoryItem>>

    suspend fun recordPlayback(
        media: MediaFile,
        positionMs: Long,
        durationMs: Long,
        isCompleted: Boolean = false
    )

    suspend fun getContinueWatching(): List<PlaybackHistoryItem>
    suspend fun getRecentMedia(): List<PlaybackHistoryItem>
    suspend fun clearHistory()
}
