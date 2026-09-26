package com.devson.nosvedplayerkmp.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.VolumeDown
import androidx.compose.material.icons.automirrored.rounded.VolumeMute
import androidx.compose.material.icons.automirrored.rounded.VolumeOff
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Compact volume control with mute toggle, collapsible/expandable slider, and percentage indicator.
 */
@Composable
fun VolumeControl(
    volume: Float,
    isMuted: Boolean,
    onVolumeChanged: (Float) -> Unit,
    onToggleMute: () -> Unit,
    modifier: Modifier = Modifier
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isHovered by interactionSource.collectIsHoveredAsState()

    val volumeIcon = when {
        isMuted || volume <= 0.01f -> Icons.AutoMirrored.Rounded.VolumeOff
        volume < 30f -> Icons.AutoMirrored.Rounded.VolumeMute
        volume < 70f -> Icons.AutoMirrored.Rounded.VolumeDown
        else -> Icons.AutoMirrored.Rounded.VolumeUp
    }

    Row(
        modifier = modifier
            .hoverable(interactionSource)
            .padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(
            onClick = onToggleMute,
            modifier = Modifier.width(36.dp)
        ) {
            Icon(
                imageVector = volumeIcon,
                contentDescription = if (isMuted) "Unmute" else "Mute",
                tint = if (isMuted) PlayerTheme.ErrorRed else PlayerTheme.TextPrimary
            )
        }

        // Show volume slider and percentage
        AnimatedVisibility(
            visible = isHovered || true, // Keep accessible while compact
            enter = fadeIn(animationSpec = tween(150)),
            exit = fadeOut(animationSpec = tween(150))
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                Slider(
                    value = if (isMuted) 0f else volume,
                    onValueChange = { onVolumeChanged(it) },
                    valueRange = 0f..100f,
                    modifier = Modifier.width(80.dp),
                    colors = SliderDefaults.colors(
                        thumbColor = PlayerTheme.SliderThumb,
                        activeTrackColor = PlayerTheme.PrimaryAccent,
                        inactiveTrackColor = PlayerTheme.SliderTrackInactive
                    )
                )

                Spacer(modifier = Modifier.width(6.dp))

                Text(
                    text = "${if (isMuted) 0 else volume.toInt()}%",
                    color = PlayerTheme.TextSecondary,
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier.width(34.dp)
                )
            }
        }
    }
}
