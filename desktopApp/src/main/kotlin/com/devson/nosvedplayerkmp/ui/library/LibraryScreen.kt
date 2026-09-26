package com.devson.nosvedplayerkmp.ui.library

import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ViewList
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.VideoLibrary
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.devson.nosvedplayerkmp.media.model.MediaFile
import com.devson.nosvedplayerkmp.ui.components.EmptyState
import com.devson.nosvedplayerkmp.ui.components.MediaGridCard
import com.devson.nosvedplayerkmp.ui.components.MediaListItem
import com.devson.nosvedplayerkmp.ui.state.AppViewModel

@Composable
fun LibraryScreen(
    appViewModel: AppViewModel,
    modifier: Modifier = Modifier
) {
    val folders by appViewModel.folders.collectAsState()
    val mediaFiles by appViewModel.mediaFiles.collectAsState()
    val favoritePaths by appViewModel.favoritePaths.collectAsState()
    val isScanning by appViewModel.isScanning.collectAsState()
    val searchQuery by appViewModel.searchQuery.collectAsState()
    val searchResults by appViewModel.searchResults.collectAsState()

    var isGridView by remember { mutableStateOf(true) }
    var selectedFolderId by remember { mutableStateOf<String?>(null) }

    // Filter displayed media based on active folder & active search
    val displayedFiles = remember(mediaFiles, searchResults, searchQuery, selectedFolderId, folders) {
        val baseList = if (searchQuery.isNotBlank()) searchResults else mediaFiles
        if (selectedFolderId == null) {
            baseList
        } else {
            val selectedFolder = folders.find { it.id == selectedFolderId }
            if (selectedFolder != null) {
                baseList.filter { it.path.startsWith(selectedFolder.path) }
            } else {
                baseList
            }
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp, vertical = 20.dp)
    ) {
        // Top Toolbar
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "Media Library",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(modifier = Modifier.width(10.dp))
                Box(
                    modifier = Modifier
                        .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp))
                        .padding(horizontal = 10.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = "${displayedFiles.size} videos",
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp
                    )
                }
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (isScanning) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(10.dp))
                            .padding(horizontal = 12.dp, vertical = 6.dp)
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Scanning...",
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                } else {
                    FilledTonalButton(
                        onClick = { appViewModel.scanAllFolders() },
                        enabled = folders.isNotEmpty(),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Icon(Icons.Rounded.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Rescan All")
                    }
                }

                Button(
                    onClick = { appViewModel.showAddFolderDialog(true) },
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Add Folder")
                }

                // Grid / List Toggle
                IconButton(onClick = { isGridView = !isGridView }) {
                    Icon(
                        imageVector = if (isGridView) Icons.AutoMirrored.Rounded.ViewList else Icons.Rounded.GridView,
                        contentDescription = "Toggle Grid/List view",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        // Folder Filter Chips
        if (folders.isNotEmpty()) {
            Spacer(modifier = Modifier.height(14.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                FilterChip(
                    selected = selectedFolderId == null,
                    onClick = { selectedFolderId = null },
                    label = { Text("All Folders (${mediaFiles.size})") },
                    leadingIcon = if (selectedFolderId == null) {
                        { Icon(Icons.Rounded.Check, contentDescription = null, modifier = Modifier.size(16.dp)) }
                    } else null,
                    colors = FilterChipDefaults.filterChipColors()
                )

                folders.forEach { folder ->
                    FilterChip(
                        selected = selectedFolderId == folder.id,
                        onClick = {
                            selectedFolderId = if (selectedFolderId == folder.id) null else folder.id
                        },
                        label = { Text("${folder.name} (${folder.itemCount})") },
                        leadingIcon = {
                            Icon(Icons.Rounded.Folder, contentDescription = null, modifier = Modifier.size(16.dp))
                        }
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Content Area
        if (displayedFiles.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        Icons.Rounded.VideoLibrary,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                        modifier = Modifier.size(64.dp)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = if (searchQuery.isNotBlank()) "No media matching \"$searchQuery\""
                        else if (folders.isEmpty()) "No folders added to your library"
                        else "No supported media files found in selected folders",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    if (folders.isEmpty()) {
                        Button(onClick = { appViewModel.showAddFolderDialog(true) }) {
                            Text("Add Media Folder")
                        }
                    } else if (searchQuery.isBlank()) {
                        FilledTonalButton(onClick = { appViewModel.scanAllFolders() }) {
                            Text("Rescan Folders")
                        }
                    }
                }
            }
        } else {
            if (isGridView) {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(minSize = 220.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    contentPadding = PaddingValues(bottom = 80.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(displayedFiles, key = { it.path }) { media ->
                        MediaGridCard(
                            media = media,
                            isFavorite = favoritePaths.contains(media.path),
                            progressFraction = 0f,
                            onPlay = {
                                appViewModel.playMedia(
                                    media = media,
                                    contextQueue = displayedFiles,
                                    startIndex = displayedFiles.indexOf(media)
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
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(bottom = 80.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(displayedFiles, key = { it.path }) { media ->
                        MediaListItem(
                            media = media,
                            isFavorite = favoritePaths.contains(media.path),
                            progressFraction = 0f,
                            onPlay = {
                                appViewModel.playMedia(
                                    media = media,
                                    contextQueue = displayedFiles,
                                    startIndex = displayedFiles.indexOf(media)
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
