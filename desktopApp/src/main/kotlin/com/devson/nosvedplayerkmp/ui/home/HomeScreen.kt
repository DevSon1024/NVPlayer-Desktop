package com.devson.nosvedplayerkmp.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.PlaylistAdd
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.PlayCircle
import androidx.compose.material.icons.rounded.VideoLibrary
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.devson.nosvedplayerkmp.history.model.PlaybackHistoryItem
import com.devson.nosvedplayerkmp.media.model.MediaFile
import com.devson.nosvedplayerkmp.ui.components.MediaGridCard
import com.devson.nosvedplayerkmp.ui.navigation.Screen
import com.devson.nosvedplayerkmp.ui.state.AppViewModel

@Composable
fun HomeScreen(
    appViewModel: AppViewModel,
    onOpenFile: () -> Unit,
    modifier: Modifier = Modifier
) {
    val continueWatching by appViewModel.continueWatching.collectAsState()
    val history by appViewModel.history.collectAsState()
    val mediaFiles by appViewModel.mediaFiles.collectAsState()
    val favoritePaths by appViewModel.favoritePaths.collectAsState()

    val scrollState = rememberScrollState()

    val hasAnyContent = continueWatching.isNotEmpty() || history.isNotEmpty() || mediaFiles.isNotEmpty()

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(24.dp)
    ) {
        // Hero / Welcome Banner
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(20.dp)),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceContainerHigh
            ),
            shape = RoundedCornerShape(20.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Nosved Player",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "High-performance hardware-accelerated desktop media playback.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                // Quick Action Buttons
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = onOpenFile,
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.Rounded.PlayCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Open File")
                    }

                    FilledTonalButton(
                        onClick = { appViewModel.showAddFolderDialog(true) },
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.Rounded.FolderOpen, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Add Folder")
                    }

                    OutlinedButton(
                        onClick = { appViewModel.showCreatePlaylistDialog(true) },
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.AutoMirrored.Rounded.PlaylistAdd, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("New Playlist")
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(28.dp))

        if (!hasAnyContent) {
            // First run / empty library state
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 40.dp),
                contentAlignment = Alignment.Center
            ) {
                Card(
                    modifier = Modifier.width(460.dp),
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceContainer
                    )
                ) {
                    Column(
                        modifier = Modifier.padding(32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            Icons.Rounded.VideoLibrary,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(56.dp)
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "Your Media Library is Empty",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Add a local media folder to index your video files, or open any file to start watching immediately.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(20.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Button(onClick = { appViewModel.showAddFolderDialog(true) }) {
                                Icon(Icons.Rounded.Add, contentDescription = null)
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Add Media Folder")
                            }
                            OutlinedButton(onClick = onOpenFile) {
                                Text("Open Single File")
                            }
                        }
                    }
                }
            }
        } else {
            // 1. Continue Watching Section
            if (continueWatching.isNotEmpty()) {
                HomeSectionHeader(
                    title = "Continue Watching",
                    count = continueWatching.size,
                    actionText = null,
                    onAction = null
                )

                Spacer(modifier = Modifier.height(14.dp))

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    continueWatching.forEach { item ->
                        MediaGridCard(
                            media = item.media,
                            isFavorite = favoritePaths.contains(item.media.path),
                            progressFraction = item.progressFraction,
                            onPlay = {
                                appViewModel.playMedia(
                                    media = item.media,
                                    resumePositionMs = item.lastPositionMs
                                )
                            },
                            onPlayNext = { appViewModel.playNextInQueue(item.media) },
                            onAddToQueue = { appViewModel.addToQueue(item.media) },
                            onAddToPlaylist = { appViewModel.showPlaylistPicker(item.media) },
                            onToggleFavorite = { appViewModel.toggleFavorite(item.media.path) },
                            onShowDetails = { appViewModel.showMediaDetails(item.media) }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(28.dp))
            }

            // 2. Recently Played Section
            if (history.isNotEmpty()) {
                HomeSectionHeader(
                    title = "Recently Played",
                    count = history.size,
                    actionText = "View All",
                    onAction = { appViewModel.navigateTo(Screen.History) }
                )

                Spacer(modifier = Modifier.height(14.dp))

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    history.take(8).forEach { item ->
                        MediaGridCard(
                            media = item.media,
                            isFavorite = favoritePaths.contains(item.media.path),
                            progressFraction = item.progressFraction,
                            onPlay = {
                                appViewModel.playMedia(
                                    media = item.media,
                                    resumePositionMs = if (item.isCompleted) 0L else item.lastPositionMs
                                )
                            },
                            onPlayNext = { appViewModel.playNextInQueue(item.media) },
                            onAddToQueue = { appViewModel.addToQueue(item.media) },
                            onAddToPlaylist = { appViewModel.showPlaylistPicker(item.media) },
                            onToggleFavorite = { appViewModel.toggleFavorite(item.media.path) },
                            onShowDetails = { appViewModel.showMediaDetails(item.media) }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(28.dp))
            }

            // 3. Recently Added to Library
            if (mediaFiles.isNotEmpty()) {
                HomeSectionHeader(
                    title = "Library Videos",
                    count = mediaFiles.size,
                    actionText = "Go to Library",
                    onAction = { appViewModel.navigateTo(Screen.Library) }
                )

                Spacer(modifier = Modifier.height(14.dp))

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    mediaFiles.take(12).forEach { media ->
                        MediaGridCard(
                            media = media,
                            isFavorite = favoritePaths.contains(media.path),
                            progressFraction = 0f,
                            onPlay = {
                                appViewModel.playMedia(
                                    media = media,
                                    contextQueue = mediaFiles,
                                    startIndex = mediaFiles.indexOf(media)
                                )
                            },
                            onPlayNext = { appViewModel.playNextInQueue(media) },
                            onAddToQueue = { appViewModel.addToQueue(media) },
                            onAddToPlaylist = { appViewModel.showPlaylistPicker(media) },
                            onToggleFavorite = { appViewModel.toggleFavorite(media.path) },
                            onShowDetails = { appViewModel.showMediaDetails(media) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun HomeSectionHeader(
    title: String,
    count: Int,
    actionText: String?,
    onAction: (() -> Unit)?
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Spacer(modifier = Modifier.width(8.dp))
            Box(
                modifier = Modifier
                    .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp))
                    .padding(horizontal = 8.dp, vertical = 2.dp)
            ) {
                Text(
                    text = count.toString(),
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold,
                    fontSize = 11.sp
                )
            }
        }

        if (actionText != null && onAction != null) {
            androidx.compose.material3.TextButton(onClick = onAction) {
                Text(actionText, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}
