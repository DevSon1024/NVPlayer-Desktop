package com.devson.nosvedplayerkmp.ui.navigation

/**
 * Top-level application destinations and screens.
 */
sealed interface Screen {
    data object Home : Screen
    data object Library : Screen
    data object Playlists : Screen
    data class PlaylistDetail(val playlistId: String) : Screen
    data object Queue : Screen
    data object History : Screen
    data object Favorites : Screen
    data object Player : Screen
    data object Settings : Screen
}
