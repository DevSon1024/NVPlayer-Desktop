package com.devson.nosvedplayerkmp.media.model

/**
 * Domain entity representing a discovered local media file.
 */
data class MediaFile(
    val id: String,
    val title: String,
    val path: String,
    val sizeBytes: Long = 0L,
    val lastModifiedMs: Long = 0L,
    val durationMs: Long = 0L,
    val extension: String = ""
) {
    val formattedDuration: String
        get() {
            if (durationMs <= 0L) return "--:--"
            val totalSeconds = durationMs / 1000
            val hours = totalSeconds / 3600
            val minutes = (totalSeconds % 3600) / 60
            val seconds = totalSeconds % 60
            return if (hours > 0) {
                "%02d:%02d:%02d".format(hours, minutes, seconds)
            } else {
                "%02d:%02d".format(minutes, seconds)
            }
        }

    val formattedSize: String
        get() {
            if (sizeBytes <= 0L) return "0 B"
            val units = arrayOf("B", "KB", "MB", "GB", "TB")
            var size = sizeBytes.toDouble()
            var unitIndex = 0
            while (size >= 1024.0 && unitIndex < units.size - 1) {
                size /= 1024.0
                unitIndex++
            }
            return "%.1f %s".format(size, units[unitIndex])
        }
}
