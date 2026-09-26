package com.devson.nosvedplayerkmp.media.model

/**
 * Domain entity representing an indexed library folder.
 */
data class MediaFolder(
    val id: String,
    val path: String,
    val name: String,
    val itemCount: Int = 0,
    val lastScannedMs: Long = 0L
)
