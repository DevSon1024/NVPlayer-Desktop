package com.devson.nosvedplayerkmp.ui.components

import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.VolumeDown
import androidx.compose.material.icons.automirrored.rounded.VolumeMute
import androidx.compose.material.icons.automirrored.rounded.VolumeOff
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Modern Material 3 volume control with mute toggle, responsive slider, and percentage indicator.
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
            .padding(horizontal = 2.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Standard Material 3 48dp touch target with built-in ripple effect
        IconButton(
            onClick = onToggleMute,
            modifier = Modifier.size(48.dp),
            colors = IconButtonDefaults.iconButtonColors(
                contentColor = if (isMuted) PlayerTheme.ErrorRed else PlayerTheme.TextPrimary
            )
        ) {
            Icon(
                imageVector = volumeIcon,
                contentDescription = if (isMuted) "Unmute" else "Mute",
                tint = if (isMuted) PlayerTheme.ErrorRed else PlayerTheme.TextPrimary,
                modifier = Modifier.size(24.dp)
            )
        }

        // Volume slider and percentage indicator
        Row(
            verticalAlignment = Alignment.CenterVertically
        ) {
            Slider(
                value = if (isMuted) 0f else volume,
                onValueChange = { onVolumeChanged(it) },
                valueRange = 0f..100f,
                modifier = Modifier.width(88.dp),
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
                fontSize = 12.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.width(36.dp)
            )
        }
    }
}
