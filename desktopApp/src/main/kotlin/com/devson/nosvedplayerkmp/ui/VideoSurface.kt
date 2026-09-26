package com.devson.nosvedplayerkmp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
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
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.awt.event.MouseMotionAdapter
import javax.swing.JPanel
import javax.swing.SwingUtilities

/**
 * Dedicated Compose component for hosting native GPU-accelerated video rendering.
 *
 * Manages the native surface lifecycle, dimensions, aspect ratio synchronization,
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
            .background(Color.Black)
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

                val panel = JPanel(BorderLayout()).apply {
                    background = java.awt.Color.BLACK
                    add(canvas, BorderLayout.CENTER)
                }

                fun tryAttach() {
                    if (!renderer.isAttached && canvas.isDisplayable) {
                        try {
                            renderer.attachSurface(canvas)
                            val w = if (canvas.width > 0) canvas.width else 640
                            val h = if (canvas.height > 0) canvas.height else 480
                            renderer.setSurfaceSize(w, h)
                            renderer.setAspectRatioMode(aspectRatioMode)
                            onSurfaceAttached(true)
                        } catch (e: Exception) {
                            System.err.println("[VideoSurface] Error attaching native surface: ${e.message}")
                        }
                    }
                }

                canvas.addComponentListener(object : ComponentAdapter() {
                    override fun componentResized(e: ComponentEvent) {
                        if (renderer.isAttached) {
                            if (canvas.width > 0 && canvas.height > 0) {
                                renderer.setSurfaceSize(canvas.width, canvas.height)
                            }
                        } else {
                            tryAttach()
                        }
                    }

                    override fun componentShown(e: ComponentEvent) {
                        tryAttach()
                    }
                })

                canvas.addHierarchyListener {
                    if (canvas.isDisplayable) {
                        SwingUtilities.invokeLater {
                            tryAttach()
                        }
                    }
                }

                panel
            },
            update = { panel ->
                val canvas = panel.getComponent(0) as? Canvas
                if (canvas != null && canvas.isDisplayable) {
                    if (!renderer.isAttached) {
                        try {
                            renderer.attachSurface(canvas)
                            onSurfaceAttached(true)
                        } catch (_: Exception) {}
                    }
                    if (renderer.isAttached) {
                        if (canvas.width > 0 && canvas.height > 0) {
                            renderer.setSurfaceSize(canvas.width, canvas.height)
                        }
                        renderer.setAspectRatioMode(aspectRatioMode)
                    }
                }
            }
        )
    }
}
