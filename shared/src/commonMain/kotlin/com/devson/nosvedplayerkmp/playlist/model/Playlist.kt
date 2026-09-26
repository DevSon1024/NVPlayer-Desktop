package com.devson.nosvedplayerkmp.playlist.model

import com.devson.nosvedplayerkmp.media.model.MediaFile

/**
 * Domain entity representing a user-created media playlist.
 */
data class Playlist(
    val id: String,
    val name: String,
    val description: String = "",
    val items: List<MediaFile> = emptyList(),
    val createdAtMs: Long = 0L,
    val updatedAtMs: Long = 0L
) {
    val totalDurationMs: Long
        get() = items.sumOf { it.durationMs }

    val itemCount: Int
        get() = items.size
}
