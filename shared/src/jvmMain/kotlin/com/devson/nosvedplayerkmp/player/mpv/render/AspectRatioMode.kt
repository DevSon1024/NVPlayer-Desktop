package com.devson.nosvedplayerkmp.player.mpv.render

import kotlin.math.roundToInt

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
     * Display video using native aspect ratio without stretching (1:1 native scale, centered).
     */
    ORIGINAL;

    /**
     * libmpv panscan option value corresponding to this presentation mode.
     */
    val panscan: String
        get() = when (this) {
            FIT -> "0.0"
            FILL -> "1.0"
            ORIGINAL -> "0.0"
        }

    /**
     * libmpv video-unscaled option value corresponding to this presentation mode.
     */
    val unscaled: String
        get() = when (this) {
            FIT -> "no"
            FILL -> "no"
            ORIGINAL -> "downscale-big"
        }

    /**
     * Calculates the exact destination rectangle (x, y, width, height) to render a video
     * of dimensions [videoWidth] x [videoHeight] centered inside a container of [containerWidth] x [containerHeight].
     */
    fun calculateBounds(
        containerWidth: Int,
        containerHeight: Int,
        videoWidth: Int,
        videoHeight: Int
    ): ViewportBounds {
        if (containerWidth <= 0 || containerHeight <= 0) {
            return ViewportBounds(0, 0, 1, 1)
        }
        if (videoWidth <= 0 || videoHeight <= 0) {
            return ViewportBounds(0, 0, containerWidth, containerHeight)
        }

        val videoAspect = videoWidth.toDouble() / videoHeight.toDouble()
        val containerAspect = containerWidth.toDouble() / containerHeight.toDouble()

        return when (this) {
            FIT -> {
                val targetW: Int
                val targetH: Int
                if (containerAspect > videoAspect) {
                    targetH = containerHeight
                    targetW = (containerHeight * videoAspect).roundToInt().coerceAtLeast(1)
                } else {
                    targetW = containerWidth
                    targetH = (containerWidth / videoAspect).roundToInt().coerceAtLeast(1)
                }
                val offsetX = (containerWidth - targetW) / 2
                val offsetY = (containerHeight - targetH) / 2
                ViewportBounds(offsetX, offsetY, targetW, targetH)
            }
            FILL -> {
                val targetW: Int
                val targetH: Int
                if (containerAspect > videoAspect) {
                    targetW = containerWidth
                    targetH = (containerWidth / videoAspect).roundToInt().coerceAtLeast(1)
                } else {
                    targetH = containerHeight
                    targetW = (containerHeight * videoAspect).roundToInt().coerceAtLeast(1)
                }
                val offsetX = (containerWidth - targetW) / 2
                val offsetY = (containerHeight - targetH) / 2
                ViewportBounds(offsetX, offsetY, targetW, targetH)
            }
            ORIGINAL -> {
                val targetW = videoWidth.coerceAtMost(containerWidth).coerceAtLeast(1)
                val targetH = videoHeight.coerceAtMost(containerHeight).coerceAtLeast(1)
                val offsetX = (containerWidth - targetW) / 2
                val offsetY = (containerHeight - targetH) / 2
                ViewportBounds(offsetX, offsetY, targetW, targetH)
            }
        }
    }
}

/**
 * Encapsulates computed viewport dimensions and offsets.
 */
data class ViewportBounds(
    val x: Int,
    val y: Int,
    val width: Int,
    val height: Int
)

