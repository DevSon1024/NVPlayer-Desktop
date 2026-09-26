package com.devson.nosvedplayerkmp.ui.theme

import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

// Expressive Brand Accents
val PurplePrimary = Color(0xFF7C4DFF)
val PurplePrimaryDark = Color(0xFF651FFF)
val PurpleLight = Color(0xFFB388FF)

val CyanSecondary = Color(0xFF00E5FF)
val CyanSecondaryDark = Color(0xFF00B0FF)
val CyanLight = Color(0xFF84FFFF)

val AmberTertiary = Color(0xFFFFAB00)

// Dark Theme Surfaces (Deep Obsidian & Slate Tonal Elevation)
val DarkBackground = Color(0xFF0A0A0F)
val DarkSurface = Color(0xFF13131A)
val DarkSurfaceVariant = Color(0xFF1C1C26)
val DarkSurfaceContainer = Color(0xFF242432)
val DarkSurfaceContainerHigh = Color(0xFF2C2C3D)
val DarkSurfaceContainerHighest = Color(0xFF353549)

val DarkOutline = Color(0xFF3F3F54)
val DarkOutlineVariant = Color(0xFF2B2B3A)

val DarkOnSurface = Color(0xFFF1F1F8)
val DarkOnSurfaceVariant = Color(0xFFB0B0C4)

// Light Theme Surfaces
val LightBackground = Color(0xFFF8F9FE)
val LightSurface = Color(0xFFFFFFFF)
val LightSurfaceVariant = Color(0xFFE8E9F2)
val LightSurfaceContainer = Color(0xFFDEE0EC)
val LightSurfaceContainerHigh = Color(0xFFD4D6E4)
val LightSurfaceContainerHighest = Color(0xFFCACCDD)

val LightOutline = Color(0xFF9092A2)
val LightOutlineVariant = Color(0xFFC4C6D6)

val LightOnSurface = Color(0xFF181920)
val LightOnSurfaceVariant = Color(0xFF4C4D5A)

val NosvedDarkColorScheme = darkColorScheme(
    primary = PurpleLight,
    onPrimary = Color(0xFF1F005D),
    primaryContainer = PurplePrimaryDark,
    onPrimaryContainer = Color(0xFFEADBFF),

    secondary = CyanLight,
    onSecondary = Color(0xFF00363D),
    secondaryContainer = CyanSecondaryDark,
    onSecondaryContainer = Color(0xFFBEEFFF),

    tertiary = AmberTertiary,
    onTertiary = Color(0xFF432C00),

    background = DarkBackground,
    onBackground = DarkOnSurface,

    surface = DarkSurface,
    onSurface = DarkOnSurface,
    surfaceVariant = DarkSurfaceVariant,
    onSurfaceVariant = DarkOnSurfaceVariant,

    surfaceContainer = DarkSurfaceContainer,
    surfaceContainerHigh = DarkSurfaceContainerHigh,
    surfaceContainerHighest = DarkSurfaceContainerHighest,

    outline = DarkOutline,
    outlineVariant = DarkOutlineVariant,

    error = Color(0xFFFF5252),
    onError = Color(0xFF690005),
    errorContainer = Color(0xFF3E1215),
    onErrorContainer = Color(0xFFFFDAD6)
)

val NosvedLightColorScheme = lightColorScheme(
    primary = PurplePrimary,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFEADBFF),
    onPrimaryContainer = Color(0xFF24005B),

    secondary = Color(0xFF006877),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFA1EFFF),
    onSecondaryContainer = Color(0xFF001F25),

    tertiary = Color(0xFF825500),
    onTertiary = Color.White,

    background = LightBackground,
    onBackground = LightOnSurface,

    surface = LightSurface,
    onSurface = LightOnSurface,
    surfaceVariant = LightSurfaceVariant,
    onSurfaceVariant = LightOnSurfaceVariant,

    surfaceContainer = LightSurfaceContainer,
    surfaceContainerHigh = LightSurfaceContainerHigh,
    surfaceContainerHighest = LightSurfaceContainerHighest,

    outline = LightOutline,
    outlineVariant = LightOutlineVariant,

    error = Color(0xFFBA1A1A),
    onError = Color.White,
    errorContainer = Color(0xFFFFDAD6),
    onErrorContainer = Color(0xFF410002)
)
