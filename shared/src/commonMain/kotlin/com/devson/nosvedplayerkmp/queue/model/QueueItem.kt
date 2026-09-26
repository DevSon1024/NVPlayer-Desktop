package com.devson.nosvedplayerkmp.queue.model

import com.devson.nosvedplayerkmp.media.model.MediaFile

/**
 * Domain entity representing an individual item within the playback queue.
 */
data class QueueItem(
    val id: String,
    val media: MediaFile
)
