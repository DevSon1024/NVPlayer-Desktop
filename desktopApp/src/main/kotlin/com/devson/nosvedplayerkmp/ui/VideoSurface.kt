package com.devson.nosvedplayerkmp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.awt.SwingPanel
import androidx.compose.ui.graphics.Color
import com.devson.nosvedplayerkmp.player.api.Player
import com.devson.nosvedplayerkmp.player.mpv.render.AspectRatioMode
import com.devson.nosvedplayerkmp.player.mpv.render.WindowsGlVideoRenderer
import java.awt.BorderLayout
import java.awt.Canvas
import java.awt.event.ComponentAdapter
import java.awt.event.ComponentEvent
import java.awt.event.HierarchyEvent
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.awt.event.MouseMotionAdapter
import javax.swing.JPanel
import javax.swing.SwingUtilities
import javax.swing.Timer

/**
 * Dedicated Compose component for hosting native GPU-accelerated video rendering.
 *
 * Manages the native surface lifecycle, dimensions, aspect ratio synchronization,
 * dynamic HWND re-attachment across window modes (normal, maximize, fullscreen),
 * and routes native mouse events directly from the Win32 canvas.
 */
@Composable
fun VideoSurface(
    player: Player,
    modifier: Modifier = Modifier,
    aspectRatioMode: AspectRatioMode = AspectRatioMode.FIT,
    onSurfaceAttached: (Boolean) -> Unit = {},
    onSingleClick: () -> Unit = {},
    onDoubleClick: () -> Unit = {},
    onMouseMove: () -> Unit = {},
    onMouseWheel: (Float) -> Unit = {}
) {
    val renderer = remember(player) {
        WindowsGlVideoRenderer(player)
    }

    DisposableEffect(renderer) {
        onDispose {
            onSurfaceAttached(false)
            renderer.close()
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black),
        contentAlignment = Alignment.Center
    ) {
        SwingPanel(
            modifier = Modifier.fillMaxSize(),
            factory = {
                val canvas = object : Canvas() {
                    override fun paint(g: java.awt.Graphics) {}
                    override fun update(g: java.awt.Graphics) {}
                }.apply {
                    ignoreRepaint = true
                    background = java.awt.Color.BLACK
                    isFocusable = false
                }

                // Forward mouse events from native heavyweight Win32 Canvas
                canvas.addMouseListener(object : MouseAdapter() {
                    override fun mouseClicked(e: MouseEvent) {
                        if (e.button == MouseEvent.BUTTON1) {
                            if (e.clickCount >= 2) {
                                onDoubleClick()
                            } else {
                                onSingleClick()
                            }
                        }
                    }
                })

                canvas.addMouseMotionListener(object : MouseMotionAdapter() {
                    override fun mouseMoved(e: MouseEvent) {
                        onMouseMove()
                    }

                    override fun mouseDragged(e: MouseEvent) {
                        onMouseMove()
                    }
                })

                canvas.addMouseWheelListener { e ->
                    val delta = e.preciseWheelRotation.toFloat()
                    if (delta != 0f) {
                        onMouseWheel(-delta * 5f)
                    }
                }

                val host = VideoSurfaceHost(canvas)

                fun updatePhysicalDimensions() {
                    val transform = canvas.graphicsConfiguration?.defaultTransform
                    val scaleX = transform?.scaleX ?: 1.0
                    val scaleY = transform?.scaleY ?: 1.0
                    val physicalW = (canvas.width * scaleX).toInt().coerceAtLeast(1)
                    val physicalH = (canvas.height * scaleY).toInt().coerceAtLeast(1)
                    renderer.setSurfaceSize(physicalW, physicalH)
                }

                canvas.addComponentListener(object : ComponentAdapter() {
                    override fun componentResized(e: ComponentEvent) {
                        updatePhysicalDimensions()
                        if (renderer.isAttachedTo(canvas)) {
                            renderer.triggerRedraw()
                        } else {
                            host.sync(renderer, aspectRatioMode, onSurfaceAttached)
                        }
                    }

                    override fun componentShown(e: ComponentEvent) {
                        updatePhysicalDimensions()
                        host.sync(renderer, aspectRatioMode, onSurfaceAttached)
                    }
                })

                canvas.addHierarchyListener { e ->
                    val flags = e.changeFlags
                    if ((flags and (HierarchyEvent.DISPLAYABILITY_CHANGED.toLong() or HierarchyEvent.SHOWING_CHANGED.toLong())) != 0L) {
                        if (canvas.isDisplayable) {
                            updatePhysicalDimensions()
                            host.syncDebounced(renderer, aspectRatioMode, onSurfaceAttached)
                        } else {
                            host.onDetached(renderer, onSurfaceAttached)
                        }
                    }
                }

                host.addComponentListener(object : ComponentAdapter() {
                    override fun componentResized(e: ComponentEvent) {
                        updatePhysicalDimensions()
                        if (renderer.isAttachedTo(canvas)) {
                            renderer.triggerRedraw()
                        } else {
                            host.sync(renderer, aspectRatioMode, onSurfaceAttached)
                        }
                    }

                    override fun componentShown(e: ComponentEvent) {
                        updatePhysicalDimensions()
                        host.sync(renderer, aspectRatioMode, onSurfaceAttached)
                    }
                })

                host.addHierarchyListener { e ->
                    val flags = e.changeFlags
                    if ((flags and (HierarchyEvent.DISPLAYABILITY_CHANGED.toLong() or HierarchyEvent.SHOWING_CHANGED.toLong())) != 0L) {
                        if (host.isDisplayable) {
                            updatePhysicalDimensions()
                            host.syncDebounced(renderer, aspectRatioMode, onSurfaceAttached)
                        } else {
                            host.onDetached(renderer, onSurfaceAttached)
                        }
                    }
                }

                host
            },
            update = { host ->
                host.sync(renderer, aspectRatioMode, onSurfaceAttached)
            }
        )
    }
}

private class VideoSurfaceHost(
    val canvas: Canvas
) : JPanel(BorderLayout()) {

    private var attachTimer: Timer? = null

    init {
        background = java.awt.Color.BLACK
        isOpaque = true
        layout = BorderLayout()
        add(canvas, BorderLayout.CENTER)
    }

    override fun doLayout() {
        super.doLayout()
        canvas.setBounds(0, 0, width, height)
    }

    fun sync(
        renderer: WindowsGlVideoRenderer,
        aspectRatioMode: AspectRatioMode,
        onSurfaceAttached: (Boolean) -> Unit
    ) {
        if (!canvas.isDisplayable) return

        updatePhysicalDimensions(renderer)
        if (renderer.isAttachedTo(canvas)) {
            // Already attached to this HWND: only update aspect ratio if changed
            renderer.setAspectRatioMode(aspectRatioMode)
        } else {
            // HWND changed or initial attachment: debounce to let window state changes settle
            syncDebounced(renderer, aspectRatioMode, onSurfaceAttached)
        }
    }

    fun syncDebounced(
        renderer: WindowsGlVideoRenderer,
        aspectRatioMode: AspectRatioMode,
        onSurfaceAttached: (Boolean) -> Unit
    ) {
        attachTimer?.stop()
        attachTimer = Timer(40) {
            attachTimer = null
            doAttach(renderer, aspectRatioMode, onSurfaceAttached)
        }.apply {
            isRepeats = false
            start()
        }
    }

    fun onDetached(
        renderer: WindowsGlVideoRenderer,
        onSurfaceAttached: (Boolean) -> Unit
    ) {
        attachTimer?.stop()
        attachTimer = null
        if (renderer.isAttached) {
            onSurfaceAttached(false)
            renderer.detachSurface()
        }
    }

    private fun doAttach(
        renderer: WindowsGlVideoRenderer,
        aspectRatioMode: AspectRatioMode,
        onSurfaceAttached: (Boolean) -> Unit
    ) {
        if (!canvas.isDisplayable) return

        try {
            updatePhysicalDimensions(renderer)
            renderer.attachSurface(canvas)
            renderer.setAspectRatioMode(aspectRatioMode)
            onSurfaceAttached(true)
        } catch (e: Exception) {
            System.err.println("[VideoSurface] Error attaching native surface: ${e.message}")
        }
    }

    private fun updatePhysicalDimensions(renderer: WindowsGlVideoRenderer) {
        val transform = canvas.graphicsConfiguration?.defaultTransform
        val scaleX = transform?.scaleX ?: 1.0
        val scaleY = transform?.scaleY ?: 1.0
        val physicalW = (canvas.width * scaleX).toInt().coerceAtLeast(1)
        val physicalH = (canvas.height * scaleY).toInt().coerceAtLeast(1)
        renderer.setSurfaceSize(physicalW, physicalH)
    }
}