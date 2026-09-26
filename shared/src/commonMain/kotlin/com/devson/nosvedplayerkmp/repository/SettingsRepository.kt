package com.devson.nosvedplayerkmp.repository

import kotlinx.coroutines.flow.StateFlow

/**
 * UI theme presentation modes.
 */
enum class ThemeMode {
    DARK,
    LIGHT,
    SYSTEM
}

/**
 * Repository interface governing user application settings and preferences.
 */
interface SettingsRepository {
    val themeMode: StateFlow<ThemeMode>

    suspend fun setThemeMode(mode: ThemeMode)
}
