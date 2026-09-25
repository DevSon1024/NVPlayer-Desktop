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
import javax.swing.JPanel
import javax.swing.SwingUtilities

/**
 * Dedicated Compose component for hosting native GPU-accelerated video rendering.
 *
 * Manages the native surface lifecycle, dimensions, and aspect ratio synchronization
 * without containing raw player transport or command logic.
 */
@Composable
fun VideoSurface(
    player: Player,
    modifier: Modifier = Modifier,
    aspectRatioMode: AspectRatioMode = AspectRatioMode.FIT
) {
    val renderer = remember(player) {
        WindowsGlVideoRenderer(player)
    }

    DisposableEffect(renderer) {
        onDispose {
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

                val canvas = Canvas().apply {
                    background = java.awt.Color.BLACK
                    isFocusable = false
                }

                val panel = JPanel(BorderLayout()).apply {
                    background = java.awt.Color.BLACK
                    add(canvas, BorderLayout.CENTER)
                }

                fun tryAttach() {
                    if (!renderer.isAttached && canvas.isDisplayable) {
                        try {
                            renderer.attachSurface(canvas)
                            renderer.setSurfaceSize(canvas.width, canvas.height)
                            renderer.setAspectRatioMode(aspectRatioMode)
                        } catch (e: Exception) {
                            System.err.println("[VideoSurface] Error attaching native surface: ${e.message}")
                        }
                    }
                }

                canvas.addComponentListener(object : ComponentAdapter() {
                    override fun componentResized(e: ComponentEvent) {
                        if (renderer.isAttached) {
                            renderer.setSurfaceSize(canvas.width, canvas.height)
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
                        } catch (_: Exception) {}
                    }
                    if (renderer.isAttached) {
                        renderer.setSurfaceSize(canvas.width, canvas.height)
                        renderer.setAspectRatioMode(aspectRatioMode)
                    }
                }
            }
        )
    }
}
