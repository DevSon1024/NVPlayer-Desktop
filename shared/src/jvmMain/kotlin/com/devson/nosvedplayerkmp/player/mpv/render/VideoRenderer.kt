package com.devson.nosvedplayerkmp.player.mpv.render

import java.awt.Component

/**
 * Interface representing a native video rendering backend.
 * Responsible for managing the native rendering surface, GPU context,
 * display synchronization, and resizing without exposing raw pointers to UI.
 */
interface VideoRenderer : AutoCloseable {
    /** True if a native surface is currently attached and active. */
    val isAttached: Boolean

    /** Returns true if the renderer is currently attached to the specific native component. */
    fun isAttachedTo(surface: Component): Boolean

    /**
     * Attaches a native GUI component (e.g. [java.awt.Canvas]) to the rendering pipeline.
     */
    fun attachSurface(surface: Component)

    /**
     * Detaches the currently attached surface and releases native graphics resources.
     */
    fun detachSurface()

    /**
     * Updates viewport dimensions when the surface or container is resized.
     */
    fun setSurfaceSize(width: Int, height: Int)

    /**
     * Configures the aspect ratio presentation mode (FIT, FILL, ORIGINAL).
     */
    fun setAspectRatioMode(mode: AspectRatioMode)

    /**
     * Triggers a manual redraw of the current video frame.
     */
    fun triggerRedraw()
}
