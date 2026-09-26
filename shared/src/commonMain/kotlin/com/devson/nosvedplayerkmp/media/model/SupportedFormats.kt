package com.devson.nosvedplayerkmp.media.model

/**
 * Centralized registry of supported video file extensions for Nosved Player.
 *
 * libmpv remains responsible for underlying container and codec decoding compatibility.
 */
object SupportedFormats {
    val VIDEO_EXTENSIONS: Set<String> = setOf(
        "mp4",
        "mkv",
        "avi",
        "mov",
        "webm",
        "m4v",
        "mpeg",
        "mpg",
        "ts",
        "m2ts",
        "flv",
        "wmv",
        "3gp",
        "ogv"
    )

    val AUDIO_EXTENSIONS: Set<String> = setOf(
        "mp3",
        "flac",
        "wav",
        "ogg",
        "m4a",
        "aac",
        "opus",
        "wma"
    )

    val ALL_SUPPORTED_EXTENSIONS: Set<String> = VIDEO_EXTENSIONS + AUDIO_EXTENSIONS

    fun isSupportedVideo(extension: String): Boolean =
        extension.lowercase() in VIDEO_EXTENSIONS

    fun isSupportedAudio(extension: String): Boolean =
        extension.lowercase() in AUDIO_EXTENSIONS

    fun isSupportedMedia(extension: String): Boolean =
        extension.lowercase() in ALL_SUPPORTED_EXTENSIONS
}
