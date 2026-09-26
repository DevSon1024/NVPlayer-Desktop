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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.devson.nosvedplayerkmp.player.mpv.render.AspectRatioMode

/**
 * Dropdown selector for video aspect ratio presentation modes (FIT, FILL, ORIGINAL).
 */
@Composable
fun AspectRatioSelector(
    currentMode: AspectRatioMode,
    onModeSelected: (AspectRatioMode) -> Unit,
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
                text = currentMode.name,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium
            )
        }

        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            modifier = Modifier.background(PlayerTheme.SurfaceVariant)
        ) {
            for (mode in AspectRatioMode.entries) {
                val isSelected = mode == currentMode
                DropdownMenuItem(
                    text = {
                        Text(
                            text = mode.name,
                            color = if (isSelected) PlayerTheme.SecondaryAccent else PlayerTheme.TextPrimary,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                            fontSize = 12.sp
                        )
                    },
                    onClick = {
                        onModeSelected(mode)
                        expanded = false
                    },
                    modifier = if (isSelected) Modifier.background(PlayerTheme.SurfaceElevated) else Modifier
                )
            }
        }
    }
}
