package com.devson.nosvedplayerkmp.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.rounded.FullscreenExit
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.onPointerEvent
import com.devson.nosvedplayerkmp.player.model.PlaybackState
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.awt.Cursor
import java.awt.KeyboardFocusManager
import java.awt.Point
import java.awt.Toolkit
import java.awt.image.BufferedImage
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

private val invisibleCursor: Cursor by lazy {
    val transparentImg = BufferedImage(16, 16, BufferedImage.TYPE_INT_ARGB)
    Toolkit.getDefaultToolkit().createCustomCursor(
        transparentImg,
        Point(0, 0),
        "invisibleCursor"
    )
}

private fun setSystemCursorVisible(visible: Boolean) {
    try {
        val cursor = if (visible) Cursor.getDefaultCursor() else invisibleCursor
        val window = KeyboardFocusManager.getCurrentKeyboardFocusManager().activeWindow
        window?.cursor = cursor
    } catch (_: Throwable) {}
}

/**
 * Main desktop player screen unifying video display, overlays, controls, and shortcut routing.
 *
 * Implements an immersive auto-hiding UI with smooth slide and fade transitions, mouse
 * movement tracking, and system cursor hiding during active playback.
 */
@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun PlayerScreen(
    viewModel: PlayerViewModel,
    onBack: (() -> Unit)? = null,
    onToggleFullscreen: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()
    val focusRequester = remember { FocusRequester() }
    val shortcutHandler = remember { PlayerShortcutHandler() }

    var isUiVisible by remember { mutableStateOf(true) }
    val coroutineScope = rememberCoroutineScope()
    var hideJob by remember { mutableStateOf<Job?>(null) }

    fun resetHideTimer() {
        isUiVisible = true
        hideJob?.cancel()
        if (uiState.playbackState == PlaybackState.PLAYING && !uiState.isScrubbing) {
            hideJob = coroutineScope.launch {
                delay(2500)
                isUiVisible = false
            }
        }
    }

    LaunchedEffect(uiState.playbackState, uiState.isScrubbing) {
        if (uiState.playbackState != PlaybackState.PLAYING || uiState.isScrubbing) {
            hideJob?.cancel()
            isUiVisible = true
        } else {
            resetHideTimer()
        }
    }

    LaunchedEffect(isUiVisible, uiState.playbackState) {
        val shouldHide = !isUiVisible && uiState.playbackState == PlaybackState.PLAYING
        setSystemCursorVisible(!shouldHide)
    }

    DisposableEffect(Unit) {
        onDispose {
            setSystemCursorVisible(true)
        }
    }

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
            .onPointerEvent(PointerEventType.Move) {
                resetHideTimer()
            }
            .onPreviewKeyEvent { event ->
                resetHideTimer()
                if (event.type == KeyEventType.KeyDown && event.key == Key.Escape && uiState.isFullscreen) {
                    viewModel.exitFullscreen()
                    return@onPreviewKeyEvent true
                }
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
        // 1. Top Title Bar (Auto-hides during active playback)
        AnimatedVisibility(
            visible = isUiVisible && uiState.isMediaLoaded,
            enter = fadeIn(animationSpec = tween(250)) + slideInVertically(animationSpec = tween(250)) { -it },
            exit = fadeOut(animationSpec = tween(250)) + slideOutVertically(animationSpec = tween(250)) { -it }
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(PlayerTheme.TopBarGradient)
                    .padding(horizontal = 24.dp, vertical = 14.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.weight(1f, fill = false)
                    ) {
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

                    // Dedicated UI button to exit fullscreen
                    if (uiState.isFullscreen) {
                        IconButton(
                            onClick = { onToggleFullscreen?.invoke() ?: viewModel.exitFullscreen() },
                            colors = IconButtonDefaults.iconButtonColors(contentColor = PlayerTheme.TextPrimary)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.FullscreenExit,
                                contentDescription = "Exit fullscreen"
                            )
                        }
                    }
                }
            }
        }

        // Error Banner
        if (uiState.errorMessage != null) {
            ErrorOverlay(
                errorMessage = uiState.errorMessage ?: "",
                errorDetails = uiState.errorDetails,
                onDismiss = { viewModel.dismissError() },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 8.dp)
            )
        }

        // 2. Video Surface Viewport (Expands to 100% full screen when controls auto-hide)
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
                    onSingleClick = {
                        resetHideTimer()
                        viewModel.togglePlayPause()
                    },
                    onDoubleClick = {
                        resetHideTimer()
                        onToggleFullscreen?.invoke() ?: viewModel.toggleFullscreen()
                    },
                    onMouseMove = {
                        resetHideTimer()
                        viewModel.onUserActivity()
                    },
                    onMouseWheel = { delta ->
                        resetHideTimer()
                        viewModel.adjustVolume(delta)
                    },
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

        // 3. Bottom Playback Controls (Auto-hides smoothly during playback)
        AnimatedVisibility(
            visible = isUiVisible && uiState.isMediaLoaded,
            enter = fadeIn(animationSpec = tween(250)) + slideInVertically(animationSpec = tween(250)) { it },
            exit = fadeOut(animationSpec = tween(250)) + slideOutVertically(animationSpec = tween(250)) { it }
        ) {
            PlayerControls(
                uiState = uiState,
                onPlay = { resetHideTimer(); viewModel.play() },
                onPause = { resetHideTimer(); viewModel.pause() },
                onTogglePlayPause = { resetHideTimer(); viewModel.togglePlayPause() },
                onStop = { resetHideTimer(); viewModel.stop() },
                onSeekRelative = { resetHideTimer(); viewModel.seekRelative(it) },
                onScrubStart = { resetHideTimer(); viewModel.onScrubStart(it) },
                onScrubMove = { resetHideTimer(); viewModel.onScrubMove(it) },
                onScrubEnd = { resetHideTimer(); viewModel.onScrubEnd(it) },
                onVolumeChanged = { resetHideTimer(); viewModel.setVolume(it) },
                onToggleMute = { resetHideTimer(); viewModel.toggleMute() },
                onSpeedSelected = { resetHideTimer(); viewModel.setSpeed(it) },
                onAspectRatioSelected = { resetHideTimer(); viewModel.setAspectRatio(it) },
                onToggleFullscreen = { resetHideTimer(); onToggleFullscreen?.invoke() ?: viewModel.toggleFullscreen() },
                onOpenFile = { launchFileDialog() },
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}
