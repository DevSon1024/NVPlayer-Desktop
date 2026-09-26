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
import com.devson.nosvedplayerkmp.ui.AppShell
import com.devson.nosvedplayerkmp.ui.dragdrop.FileDropHandler
import com.devson.nosvedplayerkmp.ui.state.AppViewModel
import com.devson.nosvedplayerkmp.ui.state.PlayerViewModel
import com.devson.nosvedplayerkmp.ui.theme.NosvedTheme
import kotlinx.coroutines.runBlocking
import java.awt.FileDialog
import java.awt.Frame
import java.io.File

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
            size = DpSize(1280.dp, 760.dp),
            position = WindowPosition(Alignment.Center)
        )

        fun launchFileDialog(onSelected: (String) -> Unit) {
            val dialog = FileDialog(null as Frame?, "Open Video File", FileDialog.LOAD).apply {
                file = "*.mp4;*.mkv;*.avi;*.mov;*.webm;*.flv;*.wmv;*.ts;*.m4v;*.mpeg;*.mpg"
                isVisible = true
            }
            val dir = dialog.directory
            val file = dialog.file
            if (dir != null && file != null) {
                onSelected(File(dir, file).absolutePath)
            }
        }

        lateinit var pvm: PlayerViewModel
        val playerViewModel = remember {
            PlayerViewModel(
                player = player,
                onOpenFileRequested = {
                    // Open file requested via keyboard shortcut (Ctrl+O)
                    launchFileDialog { path -> pvm.openFile(path) }
                }
            ).also { pvm = it }
        }

        val appViewModel = remember {
            AppViewModel(
                player = player,
                playerViewModel = playerViewModel
            )
        }

        val playerUiState by playerViewModel.uiState.collectAsState()
        val themeMode by appViewModel.themeMode.collectAsState()

        // Sync Fullscreen state with Window placement
        LaunchedEffect(playerUiState.isFullscreen) {
            windowState.placement = if (playerUiState.isFullscreen) {
                WindowPlacement.Fullscreen
            } else {
                WindowPlacement.Floating
            }
        }

        LaunchedEffect(windowState.placement) {
            if (windowState.placement != WindowPlacement.Fullscreen && playerUiState.isFullscreen) {
                playerViewModel.exitFullscreen()
            }
        }

        val windowTitle = if (!playerUiState.mediaTitle.isNullOrBlank()) {
            "${playerUiState.mediaTitle} — Nosved Player"
        } else {
            "Nosved Player"
        }

        Window(
            onCloseRequest = {
                appViewModel.release()
                playerViewModel.release()
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
                        appViewModel.openFile(droppedPath)
                    }.attachTo(window)
                } catch (e: Exception) {
                    System.err.println("[Nosved Player] Could not attach DropTarget: ${e.message}")
                }
            }

            NosvedTheme(themeMode = themeMode) {
                if (useDiagnosticsScreen) {
                    DiagnosticScreen(player = player)
                } else {
                    AppShell(
                        appViewModel = appViewModel,
                        onOpenFile = {
                            launchFileDialog { selectedPath ->
                                appViewModel.openFile(selectedPath)
                            }
                        }
                    )
                }
            }
        }
    }
}