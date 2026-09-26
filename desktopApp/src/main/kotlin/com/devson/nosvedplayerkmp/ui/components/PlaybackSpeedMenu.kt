package com.devson.nosvedplayerkmp.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Dropdown menu for selecting playback speed.
 */
@Composable
fun PlaybackSpeedMenu(
    currentSpeed: Float,
    supportedSpeeds: List<Float>,
    onSpeedSelected: (Float) -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }

    Box(modifier = modifier) {
        OutlinedButton(
            onClick = { expanded = true },
            shape = RoundedCornerShape(6.dp),
            colors = ButtonDefaults.outlinedButtonColors(
                contentColor = PlayerTheme.TextPrimary
            ),
            modifier = Modifier.height(34.dp).padding(horizontal = 2.dp)
        ) {
            Text(
                text = "${"%.2f".format(currentSpeed).trimEnd('0').trimEnd('.')}x",
                fontSize = 12.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Medium
            )
        }

        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            modifier = Modifier.background(PlayerTheme.SurfaceVariant)
        ) {
            for (speed in supportedSpeeds) {
                val isSelected = kotlin.math.abs(speed - currentSpeed) < 0.05f
                DropdownMenuItem(
                    text = {
                        Text(
                            text = "${speed}x",
                            color = if (isSelected) PlayerTheme.SecondaryAccent else PlayerTheme.TextPrimary,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                            fontSize = 13.sp
                        )
                    },
                    onClick = {
                        onSpeedSelected(speed)
                        expanded = false
                    },
                    modifier = if (isSelected) Modifier.background(PlayerTheme.SurfaceElevated) else Modifier
                )
            }
        }
    }
}
