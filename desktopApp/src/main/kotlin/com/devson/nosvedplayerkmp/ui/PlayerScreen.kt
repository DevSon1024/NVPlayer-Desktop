package com.devson.nosvedplayerkmp.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.devson.nosvedplayerkmp.ui.components.EmptyState
import com.devson.nosvedplayerkmp.ui.components.ErrorOverlay
import com.devson.nosvedplayerkmp.ui.components.LoadingOverlay
import com.devson.nosvedplayerkmp.ui.components.PlayerControls
import com.devson.nosvedplayerkmp.ui.components.PlayerTheme
import com.devson.nosvedplayerkmp.ui.components.VideoSurfaceContainer
import com.devson.nosvedplayerkmp.ui.input.PlayerShortcutHandler
import com.devson.nosvedplayerkmp.ui.state.PlayerViewModel
import java.awt.FileDialog
import java.awt.Frame

/**
 * Main desktop player screen unifying video display, overlays, controls, and shortcut routing.
 */
@Composable
fun PlayerScreen(
    viewModel: PlayerViewModel,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()
    val focusRequester = remember { FocusRequester() }
    val shortcutHandler = remember { PlayerShortcutHandler() }

    fun launchFileDialog() {
        val dialog = FileDialog(null as Frame?, "Open Video File", FileDialog.LOAD).apply {
            // Note: AWT FileDialog on Windows filters by filename pattern
            file = "*.mp4;*.mkv;*.avi;*.mov;*.webm;*.flv;*.wmv;*.ts;*.m4v"
            isVisible = true
        }
        val directory = dialog.directory
        val file = dialog.file
        if (directory != null && file != null) {
            val fullPath = java.io.File(directory, file).absolutePath
            viewModel.openFile(fullPath)
        }
    }

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(focusRequester)
            .focusable()
            .onPreviewKeyEvent { event ->
                val action = shortcutHandler.handleKeyEvent(event)
                if (action != null) {
                    if (action == com.devson.nosvedplayerkmp.ui.input.PlayerAction.OpenFile) {
                        launchFileDialog()
                    } else {
                        viewModel.dispatchAction(action)
                    }
                    true
                } else {
                    false
                }
            }
    ) {
        // 1. Video Rendering Surface
        VideoSurfaceContainer(
            player = viewModel.player,
            aspectRatioMode = uiState.aspectRatioMode,
            onSingleClick = { viewModel.togglePlayPause() },
            onDoubleClick = { viewModel.toggleFullscreen() },
            onMouseMove = { viewModel.onUserActivity() },
            onMouseWheel = { delta -> viewModel.adjustVolume(delta) },
            modifier = Modifier.fillMaxSize()
        )

        // 2. Empty State (When no video is loaded)
        if (!uiState.isMediaLoaded) {
            EmptyState(
                onOpenFile = { launchFileDialog() },
                modifier = Modifier.fillMaxSize()
            )
        }

        // 3. Top Title Bar Overlay (Shows when controls are active)
        AnimatedVisibility(
            visible = uiState.areControlsVisible && uiState.isMediaLoaded,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.TopCenter)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(PlayerTheme.TopBarGradient)
                    .padding(horizontal = 24.dp, vertical = 14.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "Nosved Player",
                        color = PlayerTheme.PrimaryAccent,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                    if (!uiState.mediaTitle.isNullOrBlank()) {
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(
                            text = "•",
                            color = PlayerTheme.TextTertiary,
                            fontSize = 12.sp
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(
                            text = uiState.mediaTitle ?: "",
                            color = PlayerTheme.TextPrimary,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }
        }

        // 4. Loading Overlay (Buffering / initializing)
        LoadingOverlay(
            isLoading = uiState.isLoading,
            modifier = Modifier.align(Alignment.Center)
        )

        // 5. Error Overlay (Dismissible floating banner)
        ErrorOverlay(
            errorMessage = uiState.errorMessage,
            errorDetails = uiState.errorDetails,
            onDismiss = { viewModel.dismissError() },
            modifier = Modifier.align(Alignment.TopCenter).padding(top = 40.dp)
        )

        // 6. Bottom Playback Controls Overlay
        PlayerControls(
            uiState = uiState,
            onPlay = { viewModel.play() },
            onPause = { viewModel.pause() },
            onTogglePlayPause = { viewModel.togglePlayPause() },
            onStop = { viewModel.stop() },
            onSeekRelative = { viewModel.seekRelative(it) },
            onScrubStart = { viewModel.onScrubStart(it) },
            onScrubMove = { viewModel.onScrubMove(it) },
            onScrubEnd = { viewModel.onScrubEnd(it) },
            onVolumeChanged = { viewModel.setVolume(it) },
            onToggleMute = { viewModel.toggleMute() },
            onSpeedSelected = { viewModel.setSpeed(it) },
            onAspectRatioSelected = { viewModel.setAspectRatio(it) },
            onToggleFullscreen = { viewModel.toggleFullscreen() },
            onOpenFile = { launchFileDialog() },
            modifier = Modifier.align(Alignment.BottomCenter)
        )
    }
}
