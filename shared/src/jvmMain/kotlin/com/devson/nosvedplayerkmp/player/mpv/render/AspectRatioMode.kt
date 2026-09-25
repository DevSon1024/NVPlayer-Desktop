package com.devson.nosvedplayerkmp.player.mpv.render

/**
 * Aspect ratio presentation modes for video rendering.
 */
enum class AspectRatioMode {
    /**
     * Scale video to fit inside the viewport while preserving native aspect ratio.
     * Uses letterboxing or pillarboxing (black bars) if needed. (Default)
     */
    FIT,

    /**
     * Scale video to completely fill the viewport, cropping edges if needed.
     */
    FILL,

    /**
     * Display video using native aspect ratio without stretching.
     */
    ORIGINAL
}
