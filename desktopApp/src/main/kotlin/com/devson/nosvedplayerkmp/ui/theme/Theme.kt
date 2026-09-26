package com.devson.nosvedplayerkmp.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import com.devson.nosvedplayerkmp.repository.ThemeMode

/**
 * Main application theme provider implementing Material 3 / Material 3 Expressive principles.
 */
@Composable
fun NosvedTheme(
    themeMode: ThemeMode = ThemeMode.DARK,
    content: @Composable () -> Unit
) {
    val isDark = when (themeMode) {
        ThemeMode.DARK -> true
        ThemeMode.LIGHT -> false
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
    }

    val colorScheme = if (isDark) NosvedDarkColorScheme else NosvedLightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        typography = NosvedTypography,
        shapes = NosvedShapes,
        content = content
    )
}
