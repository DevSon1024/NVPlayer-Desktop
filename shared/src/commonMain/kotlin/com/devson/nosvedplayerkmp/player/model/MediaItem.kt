package com.devson.nosvedplayerkmp.player.model

/**
 * Represents a media item to be loaded into the player.
 *
 * @param uri The URI or file path to play (e.g. file:///path/to/video.mp4 or https://...).
 * @param title Optional display title for the media.
 * @param headers Optional HTTP headers for network streaming.
 */
data class MediaItem(
    val uri: String,
    val title: String? = null,
    val headers: Map<String, String> = emptyMap()
)
