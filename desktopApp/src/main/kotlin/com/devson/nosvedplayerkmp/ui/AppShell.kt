package com.devson.nosvedplayerkmp.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.devson.nosvedplayerkmp.ui.components.AddFolderDialog
import com.devson.nosvedplayerkmp.ui.components.CreatePlaylistDialog
import com.devson.nosvedplayerkmp.ui.components.MediaDetailsDialog
import com.devson.nosvedplayerkmp.ui.components.MiniPlayer
import com.devson.nosvedplayerkmp.ui.components.PlaylistPickerDialog
import com.devson.nosvedplayerkmp.ui.components.SearchBar
import com.devson.nosvedplayerkmp.ui.favorites.FavoritesScreen
import com.devson.nosvedplayerkmp.ui.history.HistoryScreen
import com.devson.nosvedplayerkmp.ui.home.HomeScreen
import com.devson.nosvedplayerkmp.ui.library.LibraryScreen
import com.devson.nosvedplayerkmp.ui.navigation.AppNavigationRail
import com.devson.nosvedplayerkmp.ui.navigation.Screen
import com.devson.nosvedplayerkmp.ui.playlist.PlaylistScreen
import com.devson.nosvedplayerkmp.ui.queue.QueueScreen
import com.devson.nosvedplayerkmp.ui.settings.SettingsScreen
import com.devson.nosvedplayerkmp.ui.state.AppViewModel

/**
 * Main application shell coordinating navigation, top-level search, feature screens,
 * mini player, overlays, and dialogs.
 */
@Composable
fun AppShell(
    appViewModel: AppViewModel,
    onOpenFile: () -> Unit,
    modifier: Modifier = Modifier
) {
    val currentScreen by appViewModel.currentScreen.collectAsState()
    val searchQuery by appViewModel.searchQuery.collectAsState()
    val queue by appViewModel.queue.collectAsState()
    val playlists by appViewModel.playlists.collectAsState()
    val playerUiState by appViewModel.playerViewModel.uiState.collectAsState()

    val selectedMediaForDetails by appViewModel.selectedMediaForDetails.collectAsState()
    val mediaForPlaylistPicker by appViewModel.mediaForPlaylistPicker.collectAsState()
    val showCreatePlaylistDialog by appViewModel.showCreatePlaylistDialog.collectAsState()
    val showAddFolderDialog by appViewModel.showAddFolderDialog.collectAsState()
    val userNotification by appViewModel.userNotification.collectAsState()

    Surface(
        modifier = modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background,
        contentColor = MaterialTheme.colorScheme.onBackground
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            if (playerUiState.isFullscreen) {
                // In Fullscreen, dedicate full window to player
                PlayerScreen(
                    viewModel = appViewModel.playerViewModel,
                    onBack = { appViewModel.playerViewModel.exitFullscreen() }
                )
            } else if (currentScreen is Screen.Player) {
                // Full Player View with Back Arrow
                PlayerScreen(
                    viewModel = appViewModel.playerViewModel,
                    onBack = { appViewModel.navigateTo(Screen.Home) }
                )
            } else {
                // Desktop Application Shell Layout
                Row(modifier = Modifier.fillMaxSize()) {
                    // Navigation Rail on the left
                    AppNavigationRail(
                        currentScreen = currentScreen,
                        queueCount = queue.size,
                        isMediaLoaded = playerUiState.isMediaLoaded,
                        onNavigate = { screen ->
                            appViewModel.navigateTo(screen)
                        }
                    )

                    // Main Content Column
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(MaterialTheme.colorScheme.background)
                    ) {
                        // Top Header with Search Bar
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 24.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(modifier = Modifier.width(420.dp)) {
                                SearchBar(
                                    query = searchQuery,
                                    onQueryChanged = { newQuery ->
                                        appViewModel.onSearchQueryChanged(newQuery)
                                        if (newQuery.isNotBlank() && currentScreen !is Screen.Library) {
                                            appViewModel.navigateTo(Screen.Library)
                                        }
                                    }
                                )
                            }
                        }

                        // Feature Screen Content Area
                        Box(modifier = Modifier.weight(1f)) {
                            Crossfade(targetState = currentScreen) { screen ->
                                when (screen) {
                                    Screen.Home -> HomeScreen(
                                        appViewModel = appViewModel,
                                        onOpenFile = onOpenFile
                                    )
                                    Screen.Library -> LibraryScreen(
                                        appViewModel = appViewModel
                                    )
                                    Screen.Playlists, is Screen.PlaylistDetail -> PlaylistScreen(
                                        appViewModel = appViewModel
                                    )
                                    Screen.Queue -> QueueScreen(
                                        appViewModel = appViewModel
                                    )
                                    Screen.History -> HistoryScreen(
                                        appViewModel = appViewModel
                                    )
                                    Screen.Favorites -> FavoritesScreen(
                                        appViewModel = appViewModel
                                    )
                                    Screen.Settings -> SettingsScreen(
                                        appViewModel = appViewModel
                                    )
                                    Screen.Player -> PlayerScreen(
                                        viewModel = appViewModel.playerViewModel,
                                        onBack = { appViewModel.navigateTo(Screen.Home) }
                                    )
                                }
                            }
                        }

                        // Mini Player docked at the bottom
                        MiniPlayer(
                            uiState = playerUiState,
                            onTogglePlayPause = { appViewModel.playerViewModel.togglePlayPause() },
                            onNext = { appViewModel.playNextTrack() },
                            onPrevious = { appViewModel.playPreviousTrack() },
                            onExpandToFullPlayer = { appViewModel.navigateTo(Screen.Player) },
                            onStop = { appViewModel.stopPlayback() }
                        )
                    }
                }
            }

            // Notification / Toast Banner
            AnimatedVisibility(
                visible = userNotification != null,
                enter = fadeIn() + slideInVertically { it },
                exit = fadeOut() + slideOutVertically { it },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = if (playerUiState.isMediaLoaded && currentScreen !is Screen.Player) 76.dp else 24.dp)
            ) {
                userNotification?.let { msg ->
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.inverseSurface,
                            contentColor = MaterialTheme.colorScheme.inverseOnSurface
                        ),
                        shape = RoundedCornerShape(12.dp),
                        elevation = CardDefaults.cardElevation(8.dp)
                    ) {
                        Text(
                            text = msg,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp)
                        )
                    }
                }
            }
        }
    }

    // Common Dialogs Hosted Globally
    selectedMediaForDetails?.let { media ->
        MediaDetailsDialog(
            media = media,
            lastPositionMs = 0L,
            onDismiss = { appViewModel.dismissMediaDetails() },
            onPlay = {
                appViewModel.playMedia(media)
                appViewModel.dismissMediaDetails()
            },
            onResume = null,
            onAddToQueue = {
                appViewModel.addToQueue(media)
                appViewModel.dismissMediaDetails()
            }
        )
    }

    mediaForPlaylistPicker?.let { media ->
        PlaylistPickerDialog(
            media = media,
            playlists = playlists,
            onSelectPlaylist = { playlistId ->
                appViewModel.addMediaToPlaylist(playlistId, media)
            },
            onCreateNewPlaylist = {
                appViewModel.dismissPlaylistPicker()
                appViewModel.showCreatePlaylistDialog(true)
            },
            onDismiss = { appViewModel.dismissPlaylistPicker() }
        )
    }

    if (showCreatePlaylistDialog) {
        CreatePlaylistDialog(
            onConfirm = { name, desc ->
                appViewModel.createPlaylist(name, desc)
            },
            onDismiss = { appViewModel.showCreatePlaylistDialog(false) }
        )
    }

    if (showAddFolderDialog) {
        AddFolderDialog(
            onConfirm = { path, name ->
                appViewModel.addFolder(path, name)
                appViewModel.showAddFolderDialog(false)
            },
            onDismiss = { appViewModel.showAddFolderDialog(false) }
        )
    }
}
