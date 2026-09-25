package com.devson.nosvedplayerkmp

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.devson.nosvedplayerkmp.player.api.Player
import com.devson.nosvedplayerkmp.player.model.PlaybackState
import com.devson.nosvedplayerkmp.player.model.PlayerError
import kotlinx.coroutines.launch
import java.awt.FileDialog
import java.awt.Frame
import java.io.File
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds

import com.devson.nosvedplayerkmp.player.mpv.render.AspectRatioMode
import com.devson.nosvedplayerkmp.ui.VideoSurface

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DiagnosticScreen(
    player: Player,
    modifier: Modifier = Modifier
) {
    val coroutineScope = rememberCoroutineScope()
    var aspectRatioMode by remember { mutableStateOf(AspectRatioMode.FIT) }


    val playbackState by player.playbackState.collectAsState()
    val position by player.position.collectAsState()
    val duration by player.duration.collectAsState()
    val progress by player.progress.collectAsState()
    val volume by player.volume.collectAsState()
    val speed by player.playbackSpeed.collectAsState()
    val currentMedia by player.currentMediaItem.collectAsState()

    var lastErrorMessage by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(player) {
        player.errors.collect { error ->
            lastErrorMessage = error.message
        }
    }

    val sampleFiles = remember {
        val root = findProjectRoot()
        val dir = File(root, "test_media")
        if (dir.exists() && dir.isDirectory) {
            dir.listFiles()?.toList() ?: emptyList()
        } else {
            emptyList()
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF141416))
            .padding(24.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Nosved Player — Video Display",
                        color = Color.White,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Phase 2 Native Video Rendering & Compose Integration",
                        color = Color(0xFF888899),
                        fontSize = 13.sp
                    )
                }

                // File Open Button
                Button(
                    onClick = {
                        openFileDialog { selectedFile ->
                            coroutineScope.launch {
                                lastErrorMessage = null
                                try {
                                    player.load(selectedFile.absolutePath, autoPlay = true)
                                } catch (e: Exception) {
                                    lastErrorMessage = e.message
                                }
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2A60E4))
                ) {
                    Text("Open Video", color = Color.White)
                }
            }

            // Native Video Surface Container
            Card(
                colors = CardDefaults.cardColors(containerColor = Color.Black),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(440.dp)
                    .border(1.dp, Color(0xFF2C2C35), RoundedCornerShape(12.dp))
            ) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    VideoSurface(
                        player = player,
                        modifier = Modifier.fillMaxSize(),
                        aspectRatioMode = aspectRatioMode
                    )

                    if (currentMedia == null) {
                        Text(
                            text = "No Video Loaded — Select a sample or click Open Video",
                            color = Color(0xFF666677),
                            fontSize = 14.sp
                        )
                    }
                }
            }

            // Quick Samples Bar
            if (sampleFiles.isNotEmpty()) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1E1E24)),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(
                            text = "Quick Test Samples:",
                            color = Color(0xFFAAAAAA),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            for (file in sampleFiles) {
                                OutlinedButton(
                                    onClick = {
                                        coroutineScope.launch {
                                            lastErrorMessage = null
                                            try {
                                                player.load(file.absolutePath, autoPlay = true)
                                            } catch (e: Exception) {
                                                lastErrorMessage = e.message
                                            }
                                        }
                                    },
                                    shape = RoundedCornerShape(6.dp),
                                    colors = ButtonDefaults.outlinedButtonColors(
                                        contentColor = if (currentMedia?.uri == file.absolutePath) Color(0xFF4CAF50) else Color(0xFFCCCCCC)
                                    )
                                ) {
                                    Text(file.name, fontSize = 11.sp)
                                }
                            }
                        }
                    }
                }
            }

            // Status Card
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E1E24)),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {

                    // File name
                    Text(
                        text = "File: ${currentMedia?.uri?.let { File(it).name } ?: "None loaded"}",
                        color = Color.White,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Spacer(modifier = Modifier.height(10.dp))

                    // Playback State
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = "State: ",
                            color = Color(0xFFAAAAAA),
                            fontSize = 14.sp
                        )
                        val (stateColor, stateLabel) = when (playbackState) {
                            PlaybackState.PLAYING -> Color(0xFF4CAF50) to "Playing"
                            PlaybackState.PAUSED -> Color(0xFFFFB300) to "Paused"
                            PlaybackState.LOADING -> Color(0xFF29B6F6) to "Loading..."
                            PlaybackState.STOPPED -> Color(0xFF9E9E9E) to "Stopped"
                            PlaybackState.ENDED -> Color(0xFFBA68C8) to "Ended"
                            PlaybackState.ERROR -> Color(0xFFEF5350) to "Error"
                            PlaybackState.IDLE -> Color(0xFF757575) to "Idle"
                            PlaybackState.INITIALIZING -> Color(0xFF29B6F6) to "Initializing..."
                        }
                        Text(
                            text = stateLabel,
                            color = stateColor,
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    // Position and Duration
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "Position: ${formatDuration(position)}",
                            color = Color.White,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 14.sp
                        )
                        Text(
                            text = "Duration: ${formatDuration(duration)}",
                            color = Color(0xFFAAAAAA),
                            fontFamily = FontFamily.Monospace,
                            fontSize = 14.sp
                        )
                    }

                    Spacer(modifier = Modifier.height(6.dp))

                    // Progress Slider
                    Slider(
                        value = progress,
                        onValueChange = { targetFraction ->
                            if (duration.inWholeMilliseconds > 0) {
                                val targetMs = (targetFraction * duration.inWholeMilliseconds).toLong()
                                coroutineScope.launch {
                                    player.seekTo(targetMs.milliseconds)
                                }
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }

            // Transport Controls Card
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E1E24)),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    // Playback Transport Buttons
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Button(
                            onClick = { coroutineScope.launch { player.play() } },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))
                        ) {
                            Text("Play")
                        }

                        Button(
                            onClick = { coroutineScope.launch { player.pause() } },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF57F17))
                        ) {
                            Text("Pause")
                        }

                        Button(
                            onClick = { coroutineScope.launch { player.stop() } },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFC62828))
                        ) {
                            Text("Stop")
                        }
                    }

                    // Seek Buttons
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        OutlinedButton(
                            onClick = { coroutineScope.launch { player.seekBackward(10.0) } },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("-10s")
                        }

                        OutlinedButton(
                            onClick = { coroutineScope.launch { player.seekForward(10.0) } },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("+10s")
                        }
                    }

                    // Volume Control
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            text = "Volume: ${volume.toInt()}%",
                            color = Color.White,
                            modifier = Modifier.width(100.dp),
                            fontSize = 13.sp
                        )
                        Slider(
                            value = volume,
                            onValueChange = { coroutineScope.launch { player.setVolume(it) } },
                            valueRange = 0f..100f,
                            modifier = Modifier.weight(1f)
                        )
                    }

                    // Playback Speed Controls
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = "Speed: ${"%.2f".format(speed)}x",
                            color = Color.White,
                            modifier = Modifier.width(100.dp),
                            fontSize = 13.sp
                        )
                        val speeds = listOf(0.5f, 1.0f, 1.25f, 1.5f, 2.0f)
                        for (s in speeds) {
                            OutlinedButton(
                                onClick = { coroutineScope.launch { player.setPlaybackSpeed(s) } },
                                shape = RoundedCornerShape(6.dp),
                                colors = ButtonDefaults.outlinedButtonColors(
                                    contentColor = if (speed == s) Color(0xFF29B6F6) else Color(0xFFAAAAAA)
                                )
                            ) {
                                Text("${s}x", fontSize = 11.sp)
                            }
                        }
                    }

                    // Aspect Ratio Controls
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = "Aspect Ratio:",
                            color = Color.White,
                            modifier = Modifier.width(100.dp),
                            fontSize = 13.sp
                        )
                        for (mode in AspectRatioMode.values()) {
                            OutlinedButton(
                                onClick = { aspectRatioMode = mode },
                                shape = RoundedCornerShape(6.dp),
                                colors = ButtonDefaults.outlinedButtonColors(
                                    contentColor = if (aspectRatioMode == mode) Color(0xFF4CAF50) else Color(0xFFAAAAAA)
                                )
                            ) {
                                Text(mode.name, fontSize = 11.sp)
                            }
                        }
                    }
                }
            }

            // Error Banner
            if (lastErrorMessage != null) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF3E1A1A)),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, Color(0xFFB71C1C), RoundedCornerShape(8.dp))
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(
                            text = "Error: $lastErrorMessage",
                            color = Color(0xFFFF8A80),
                            fontSize = 13.sp
                        )
                    }
                }
            }

            // Footer
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "MPV: Initialized (GPU Render VO: Active)",
                    color = Color(0xFF4CAF50),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "libmpv API: 0x20005 (x64 Windows OpenGL)",
                    color = Color(0xFF777777),
                    fontSize = 12.sp
                )
            }

        }
    }
}

private fun formatDuration(d: Duration): String {
    val totalSeconds = d.inWholeSeconds
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return "%02d:%02d".format(minutes, seconds)
}

private fun openFileDialog(onFileSelected: (File) -> Unit) {
    val dialog = FileDialog(null as Frame?, "Select Video File", FileDialog.LOAD)
    dialog.isVisible = true
    val file = dialog.file
    val dir = dialog.directory
    if (file != null && dir != null) {
        onFileSelected(File(dir, file))
    }
}

private fun findProjectRoot(): File {
    var cur: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
    for (i in 0..5) {
        if (cur == null) break
        if (File(cur, "test_media").exists()) {
            return cur
        }
        cur = cur.parentFile
    }
    return File(".")
}
