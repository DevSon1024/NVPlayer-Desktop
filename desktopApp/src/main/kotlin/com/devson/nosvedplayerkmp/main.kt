package com.devson.nosvedplayerkmp

import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import com.devson.nosvedplayerkmp.player.core.createPlatformPlayer
import kotlinx.coroutines.runBlocking

fun main(args: Array<String>) {
    println("[Nosved Player] Starting Windows Desktop Application...")

    val isDiagnosticsOnly = args.contains("--diagnostics-only") || 
            args.contains("--test") || 
            System.getProperty("nosved.diagnostics") == "true"

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
        Window(
            onCloseRequest = {
                runBlocking {
                    player.release()
                    println("mpv instance released cleanly")
                }
                exitApplication()
            },
            title = "Nosved Player — MPV Test (Phase 1)",
        ) {
            DiagnosticScreen(player = player)
        }
    }
}