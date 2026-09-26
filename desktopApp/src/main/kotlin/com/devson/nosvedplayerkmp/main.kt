package com.devson.nosvedplayerkmp

import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.WindowPlacement
import androidx.compose.ui.window.WindowPosition
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState
import com.devson.nosvedplayerkmp.player.core.createPlatformPlayer
import com.devson.nosvedplayerkmp.ui.PlayerScreen
import com.devson.nosvedplayerkmp.ui.dragdrop.FileDropHandler
import com.devson.nosvedplayerkmp.ui.state.PlayerViewModel
import kotlinx.coroutines.runBlocking

fun main(args: Array<String>) {
    println("[Nosved Player] Starting Windows Desktop Application...")

    val isDiagnosticsOnly = args.contains("--diagnostics-only") || 
            args.contains("--test") || 
            System.getProperty("nosved.diagnostics") == "true"

    val useDiagnosticsScreen = args.contains("--diagnostics-ui")

    val player = createPlatformPlayer()

    runBlocking {
        try {
            println("libmpv loaded")
            println("mpv instance created")
            player.initialize()
            println("mpv initialized")
            println("[Nosved Player] Basic property communication: volume=${player.volume.value}, speed=${player.playbackSpeed.value}")
        } catch (e: Exception) {
            System.err.println("[Nosved Player] Initialization error: ${e.message}")
            e.printStackTrace()
            return@runBlocking
        }

        if (isDiagnosticsOnly) {
            player.release()
            println("mpv instance released cleanly")
            return@runBlocking
        }
    }

    if (isDiagnosticsOnly) {
        return
    }

    application {
        val windowState = rememberWindowState(
            size = DpSize(1280.dp, 720.dp),
            position = WindowPosition(Alignment.Center)
        )
        val viewModel = remember { PlayerViewModel(player = player) }
        val uiState by viewModel.uiState.collectAsState()

        // Sync Fullscreen state with Window placement
        LaunchedEffect(uiState.isFullscreen) {
            windowState.placement = if (uiState.isFullscreen) {
                WindowPlacement.Fullscreen
            } else {
                WindowPlacement.Floating
            }
        }

        LaunchedEffect(windowState.placement) {
            if (windowState.placement != WindowPlacement.Fullscreen && uiState.isFullscreen) {
                viewModel.exitFullscreen()
            }
        }

        val windowTitle = if (!uiState.mediaTitle.isNullOrBlank()) {
            "${uiState.mediaTitle} — Nosved Player"
        } else {
            "Nosved Player"
        }

        Window(
            onCloseRequest = {
                viewModel.release()
                runBlocking {
                    player.release()
                    println("mpv instance released cleanly")
                }
                exitApplication()
            },
            state = windowState,
            title = windowTitle
        ) {
            // Attach Drag & Drop listener to the AWT window
            LaunchedEffect(window) {
                try {
                    FileDropHandler { droppedPath ->
                        viewModel.openFile(droppedPath)
                    }.attachTo(window)
                } catch (e: Exception) {
                    System.err.println("[Nosved Player] Could not attach DropTarget: ${e.message}")
                }
            }

            if (useDiagnosticsScreen) {
                DiagnosticScreen(player = player)
            } else {
                PlayerScreen(viewModel = viewModel)
            }
        }
    }
}