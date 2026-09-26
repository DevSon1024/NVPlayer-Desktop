package com.devson.nosvedplayerkmp.ui.components

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * Modern Dark Media Player Design Tokens for Nosved Player.
 */
object PlayerTheme {
    val Background = Color(0xFF0C0C10)
    val Surface = Color(0xFF16161E)
    val SurfaceVariant = Color(0xFF22222E)
    val SurfaceElevated = Color(0xFF2C2C3C)

    val PrimaryAccent = Color(0xFF6C5CE7)
    val PrimaryAccentHover = Color(0xFF7D6EF5)
    val SecondaryAccent = Color(0xFF00CEC9)

    val TextPrimary = Color(0xFFFFFFFF)
    val TextSecondary = Color(0xFFA0A0B2)
    val TextTertiary = Color(0xFF66667A)

    val SliderTrackInactive = Color(0xFF38384A)
    val SliderTrackActive = PrimaryAccent
    val SliderThumb = Color.White

    val ErrorRed = Color(0xFFFF5252)
    val ErrorSurface = Color(0xFF2D1515)
    val ErrorBorder = Color(0xFF5A2020)

    val ControlsGradient = Brush.verticalGradient(
        0.0f to Color.Transparent,
        0.4f to Color(0x99000000),
        1.0f to Color(0xF00A0A0E)
    )

    val TopBarGradient = Brush.verticalGradient(
        0.0f to Color(0xD00A0A0E),
        0.6f to Color(0x66000000),
        1.0f to Color.Transparent
    )
}
