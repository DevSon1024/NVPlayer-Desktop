package com.devson.nosvedplayerkmp.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Forward10
import androidx.compose.material.icons.rounded.Fullscreen
import androidx.compose.material.icons.rounded.FullscreenExit
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Replay10
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.devson.nosvedplayerkmp.ui.state.PlayerUiState

/**
 * Main floating player controls overlay anchored to the bottom of the video viewport.
 */
@Composable
fun PlayerControls(
    uiState: PlayerUiState,
    onPlay: () -> Unit,
    onPause: () -> Unit,
    onTogglePlayPause: () -> Unit,
    onStop: () -> Unit,
    onSeekRelative: (Double) -> Unit,
    onScrubStart: (Float) -> Unit,
    onScrubMove: (Float) -> Unit,
    onScrubEnd: (Float) -> Unit,
    onVolumeChanged: (Float) -> Unit,
    onToggleMute: () -> Unit,
    onSpeedSelected: (Float) -> Unit,
    onAspectRatioSelected: (com.devson.nosvedplayerkmp.player.mpv.render.AspectRatioMode) -> Unit = {},
    onToggleFullscreen: () -> Unit,
    onOpenFile: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(PlayerTheme.ControlsGradient)
            .padding(start = 24.dp, end = 24.dp, top = 20.dp, bottom = 14.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // Seek Bar Row
            SeekBar(
                position = uiState.displayPosition,
                duration = uiState.duration,
                progress = uiState.displayProgress,
                enabled = uiState.isMediaLoaded,
                isScrubbing = uiState.isScrubbing,
                onScrubStart = onScrubStart,
                onScrubMove = onScrubMove,
                onScrubEnd = onScrubEnd
            )

            // Controls & Actions Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                // Left: Primary Transport (Replay, Play/Pause, Forward, Stop) & Volume
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    // Rewind -10s
                    IconButton(
                        onClick = { onSeekRelative(-10.0) },
                        enabled = uiState.isMediaLoaded,
                        modifier = Modifier.size(48.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Replay10,
                            contentDescription = "Seek backward 10 seconds",
                            tint = if (uiState.isMediaLoaded) PlayerTheme.TextPrimary else PlayerTheme.TextTertiary,
                            modifier = Modifier.size(24.dp)
                        )
                    }

                    // Play / Pause FilledIconButton (Standard Material 3 48dp touch target with ripple)
                    FilledIconButton(
                        onClick = onTogglePlayPause,
                        shape = CircleShape,
                        colors = IconButtonDefaults.filledIconButtonColors(
                            containerColor = PlayerTheme.PrimaryAccent,
                            contentColor = Color.White
                        ),
                        modifier = Modifier.size(48.dp)
                    ) {
                        Icon(
                            imageVector = if (uiState.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                            contentDescription = if (uiState.isPlaying) "Pause" else "Play",
                            modifier = Modifier.size(28.dp)
                        )
                    }

                    // Forward +10s
                    IconButton(
                        onClick = { onSeekRelative(10.0) },
                        enabled = uiState.isMediaLoaded,
                        modifier = Modifier.size(48.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Forward10,
                            contentDescription = "Seek forward 10 seconds",
                            tint = if (uiState.isMediaLoaded) PlayerTheme.TextPrimary else PlayerTheme.TextTertiary,
                            modifier = Modifier.size(24.dp)
                        )
                    }

                    // Stop
                    IconButton(
                        onClick = onStop,
                        enabled = uiState.isMediaLoaded,
                        modifier = Modifier.size(48.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Stop,
                            contentDescription = "Stop",
                            tint = if (uiState.isMediaLoaded) PlayerTheme.TextPrimary else PlayerTheme.TextTertiary,
                            modifier = Modifier.size(24.dp)
                        )
                    }

                    Spacer(modifier = Modifier.width(6.dp))

                    // Volume Control
                    VolumeControl(
                        volume = uiState.volume,
                        isMuted = uiState.isMuted,
                        onVolumeChanged = onVolumeChanged,
                        onToggleMute = onToggleMute
                    )
                }

                // Center: Media Title (Ellipsized if long)
                if (!uiState.mediaTitle.isNullOrBlank()) {
                    Text(
                        text = uiState.mediaTitle,
                        color = PlayerTheme.TextSecondary,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .weight(1f, fill = false)
                            .padding(horizontal = 16.dp)
                    )
                }

                // Right: Secondary Controls (Open File, Speed, Fullscreen)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    // Open File Icon Button (48dp touch target)
                    IconButton(
                        onClick = onOpenFile,
                        modifier = Modifier.size(48.dp),
                        colors = IconButtonDefaults.iconButtonColors(contentColor = PlayerTheme.TextSecondary)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.FolderOpen,
                            contentDescription = "Open video file",
                            modifier = Modifier.size(22.dp)
                        )
                    }

                    // Playback Speed Menu
                    PlaybackSpeedMenu(
                        currentSpeed = uiState.speed,
                        supportedSpeeds = uiState.supportedSpeeds,
                        onSpeedSelected = onSpeedSelected
                    )

                    // Fullscreen Toggle (48dp touch target)
                    IconButton(
                        onClick = onToggleFullscreen,
                        modifier = Modifier.size(48.dp),
                        colors = IconButtonDefaults.iconButtonColors(contentColor = PlayerTheme.TextPrimary)
                    ) {
                        Icon(
                            imageVector = if (uiState.isFullscreen) Icons.Rounded.FullscreenExit else Icons.Rounded.Fullscreen,
                            contentDescription = if (uiState.isFullscreen) "Exit fullscreen" else "Fullscreen",
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }
            }
        }
    }
}
