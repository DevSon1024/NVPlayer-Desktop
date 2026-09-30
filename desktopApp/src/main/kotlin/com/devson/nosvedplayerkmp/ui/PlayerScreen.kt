package com.devson.nosvedplayerkmp.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
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
 *
 * Employs a docked Column layout to guarantee that heavyweight native rendering surfaces
 * do not clip or occlude Compose lightweight controls and overlays.
 */
@Composable
fun PlayerScreen(
    viewModel: PlayerViewModel,
    onBack: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()
    val focusRequester = remember { FocusRequester() }
    val shortcutHandler = remember { PlayerShortcutHandler() }

    fun launchFileDialog() {
        val dialog = FileDialog(null as Frame?, "Open Video File", FileDialog.LOAD).apply {
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

    Column(
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
        // 1. Top Title Bar (Docked above video viewport; auto-hides during playback in fullscreen)
        AnimatedVisibility(
            visible = uiState.areControlsVisible && uiState.isMediaLoaded,
            enter = fadeIn(),
            exit = fadeOut()
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(PlayerTheme.TopBarGradient)
                    .padding(horizontal = 24.dp, vertical = 14.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (onBack != null) {
                        IconButton(
                            onClick = onBack,
                            colors = IconButtonDefaults.iconButtonColors(contentColor = PlayerTheme.TextPrimary)
                        ) {
                            Icon(
                                Icons.AutoMirrored.Rounded.ArrowBack,
                                contentDescription = "Return to library"
                            )
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                    }
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

        // Error Banner docked above video viewport so it is never occluded by native HWND
        if (uiState.errorMessage != null) {
            ErrorOverlay(
                errorMessage = uiState.errorMessage,
                errorDetails = uiState.errorDetails,
                onDismiss = { viewModel.dismissError() },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 8.dp)
            )
        }

        // 2. Video Viewport & Overlays (Expands to full height when controls auto-hide)
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .background(Color.Black)
        ) {
            if (uiState.isMediaLoaded) {
                VideoSurfaceContainer(
                    player = viewModel.player,
                    aspectRatioMode = uiState.aspectRatioMode,
                    onSurfaceAttached = { attached -> viewModel.setSurfaceAttached(attached) },
                    onSingleClick = { viewModel.togglePlayPause() },
                    onDoubleClick = { viewModel.toggleFullscreen() },
                    onMouseMove = { viewModel.onUserActivity() },
                    onMouseWheel = { delta -> viewModel.adjustVolume(delta) },
                    modifier = Modifier.fillMaxSize()
                )
            } else {
                EmptyState(
                    onOpenFile = { launchFileDialog() },
                    modifier = Modifier.fillMaxSize()
                )
            }

            // Loading Overlay (Buffering / initializing)
            if (uiState.isLoading && !uiState.isMediaLoaded) {
                LoadingOverlay(
                    isLoading = true,
                    modifier = Modifier.align(Alignment.Center)
                )
            }
        }

        // 3. Bottom Playback Controls (Docked below video viewport; auto-hides during playback in fullscreen)
        AnimatedVisibility(
            visible = uiState.areControlsVisible && uiState.isMediaLoaded,
            enter = fadeIn(),
            exit = fadeOut()
        ) {
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
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}
