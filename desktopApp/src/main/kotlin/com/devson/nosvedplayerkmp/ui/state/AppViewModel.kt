package com.devson.nosvedplayerkmp.ui.state

import com.devson.nosvedplayerkmp.history.model.PlaybackHistoryItem
import com.devson.nosvedplayerkmp.media.model.MediaFile
import com.devson.nosvedplayerkmp.media.model.MediaFolder
import com.devson.nosvedplayerkmp.media.service.MediaScanner
import com.devson.nosvedplayerkmp.player.api.Player
import com.devson.nosvedplayerkmp.player.model.PlaybackState
import com.devson.nosvedplayerkmp.playlist.model.Playlist
import com.devson.nosvedplayerkmp.queue.PlaybackQueueManager
import com.devson.nosvedplayerkmp.queue.model.PlaybackMode
import com.devson.nosvedplayerkmp.queue.model.QueueItem
import com.devson.nosvedplayerkmp.repository.FavoritesRepository
import com.devson.nosvedplayerkmp.repository.FileFavoritesRepository
import com.devson.nosvedplayerkmp.repository.FileHistoryRepository
import com.devson.nosvedplayerkmp.repository.FileMediaLibraryRepository
import com.devson.nosvedplayerkmp.repository.FilePlaylistRepository
import com.devson.nosvedplayerkmp.repository.FileSettingsRepository
import com.devson.nosvedplayerkmp.repository.HistoryRepository
import com.devson.nosvedplayerkmp.repository.MediaLibraryRepository
import com.devson.nosvedplayerkmp.repository.PlaylistRepository
import com.devson.nosvedplayerkmp.repository.SettingsRepository
import com.devson.nosvedplayerkmp.repository.ThemeMode
import com.devson.nosvedplayerkmp.ui.navigation.Screen
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import kotlin.time.Duration.Companion.milliseconds

/**
 * Top-level application ViewModel managing navigation, media library, playlists,
 * history, favorites, playback queue, and coordination with the player engine.
 */
class AppViewModel(
    val player: Player,
    val playerViewModel: PlayerViewModel,
    val queueManager: PlaybackQueueManager = PlaybackQueueManager(),
    val settingsRepo: SettingsRepository = FileSettingsRepository(),
    val libraryRepo: MediaLibraryRepository = FileMediaLibraryRepository(),
    val playlistRepo: PlaylistRepository = FilePlaylistRepository(),
    val historyRepo: HistoryRepository = FileHistoryRepository(),
    val favoritesRepo: FavoritesRepository = FileFavoritesRepository(),
    val scanner: MediaScanner = MediaScanner(),
    parentScope: CoroutineScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
) {
    private val viewModelJob = SupervisorJob(parentScope.coroutineContext[Job])
    private val scope = CoroutineScope(parentScope.coroutineContext + viewModelJob)

    // Navigation State
    private val _currentScreen = MutableStateFlow<Screen>(Screen.Home)
    val currentScreen: StateFlow<Screen> = _currentScreen.asStateFlow()

    // Search State
    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    // Scanning State
    private val _isScanning = MutableStateFlow(false)
    val isScanning: StateFlow<Boolean> = _isScanning.asStateFlow()

    // Dialog & Overlay State
    private val _selectedMediaForDetails = MutableStateFlow<MediaFile?>(null)
    val selectedMediaForDetails: StateFlow<MediaFile?> = _selectedMediaForDetails.asStateFlow()

    private val _mediaForPlaylistPicker = MutableStateFlow<MediaFile?>(null)
    val mediaForPlaylistPicker: StateFlow<MediaFile?> = _mediaForPlaylistPicker.asStateFlow()

    private val _showCreatePlaylistDialog = MutableStateFlow(false)
    val showCreatePlaylistDialog: StateFlow<Boolean> = _showCreatePlaylistDialog.asStateFlow()

    private val _showAddFolderDialog = MutableStateFlow(false)
    val showAddFolderDialog: StateFlow<Boolean> = _showAddFolderDialog.asStateFlow()

    private val _userNotification = MutableStateFlow<String?>(null)
    val userNotification: StateFlow<String?> = _userNotification.asStateFlow()

    // Repositories State
    val themeMode: StateFlow<ThemeMode> = settingsRepo.themeMode
    val folders: StateFlow<List<MediaFolder>> = libraryRepo.folders
    val mediaFiles: StateFlow<List<MediaFile>> = libraryRepo.mediaFiles
    val playlists: StateFlow<List<Playlist>> = playlistRepo.playlists
    val history: StateFlow<List<PlaybackHistoryItem>> = historyRepo.history
    val favoritePaths: StateFlow<Set<String>> = favoritesRepo.favoritePaths

    val continueWatching: StateFlow<List<PlaybackHistoryItem>> = historyRepo.history
        .map { list -> list.filter { it.isContinueWatching } }
        .stateIn(scope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Queue State
    val queue: StateFlow<List<QueueItem>> = queueManager.queue
    val currentQueueIndex: StateFlow<Int> = queueManager.currentIndex
    val playbackMode: StateFlow<PlaybackMode> = queueManager.playbackMode

    // Search Filtered Media
    val searchResults: StateFlow<List<MediaFile>> = combine(mediaFiles, searchQuery) { files, query ->
        val q = query.trim().lowercase()
        if (q.isBlank()) emptyList()
        else files.filter { it.title.lowercase().contains(q) || it.path.lowercase().contains(q) }
    }.stateIn(scope, SharingStarted.WhileSubscribed(5000), emptyList())

    private var activeMediaFile: MediaFile? = null

    init {
        observePlayerLifecycle()
        startPeriodicHistoryTracking()
    }

    private fun observePlayerLifecycle() {
        scope.launch {
            player.playbackState.collect { state ->
                if (state == PlaybackState.ENDED) {
                    onTrackEnded()
                }
            }
        }

        scope.launch {
            player.currentMediaItem.collect { mediaItem ->
                if (mediaItem != null) {
                    val path = mediaItem.uri
                    activeMediaFile = mediaFiles.value.find { it.path == path }
                        ?: MediaFile(
                            id = path.hashCode().toString(),
                            title = mediaItem.title ?: File(path).nameWithoutExtension,
                            path = path,
                            sizeBytes = File(path).takeIf { it.exists() }?.length() ?: 0L,
                            lastModifiedMs = File(path).takeIf { it.exists() }?.lastModified() ?: 0L,
                            durationMs = player.duration.value.inWholeMilliseconds,
                            extension = File(path).extension.lowercase()
                        )
                }
            }
        }
    }

    private fun startPeriodicHistoryTracking() {
        scope.launch {
            while (true) {
                delay(4000)
                val currentMedia = activeMediaFile
                if (currentMedia != null && player.playbackState.value == PlaybackState.PLAYING) {
                    val pos = player.position.value.inWholeMilliseconds
                    val dur = player.duration.value.inWholeMilliseconds
                    if (pos > 1000L && dur > 0L) {
                        historyRepo.recordPlayback(
                            media = currentMedia,
                            positionMs = pos,
                            durationMs = dur,
                            isCompleted = false
                        )
                    }
                }
            }
        }
    }

    private fun onTrackEnded() {
        val currentMedia = activeMediaFile
        if (currentMedia != null) {
            val dur = player.duration.value.inWholeMilliseconds
            scope.launch {
                historyRepo.recordPlayback(
                    media = currentMedia,
                    positionMs = dur,
                    durationMs = dur,
                    isCompleted = true
                )
            }
        }

        playNextTrack()
    }

    // Navigation Actions
    fun navigateTo(screen: Screen) {
        _currentScreen.value = screen
    }

    fun onSearchQueryChanged(query: String) {
        _searchQuery.value = query
    }

    fun openFile(path: String) {
        val file = File(path)
        val media = mediaFiles.value.find { it.path == path } ?: MediaFile(
            id = path.hashCode().toString(),
            title = file.nameWithoutExtension,
            path = path,
            sizeBytes = if (file.exists()) file.length() else 0L,
            lastModifiedMs = if (file.exists()) file.lastModified() else 0L,
            durationMs = 0L,
            extension = file.extension.lowercase()
        )
        playMedia(media)
    }

    // Settings
    fun setThemeMode(mode: ThemeMode) {
        scope.launch { settingsRepo.setThemeMode(mode) }
    }

    // Media & Playback Operations
    fun playMedia(
        media: MediaFile,
        contextQueue: List<MediaFile>? = null,
        startIndex: Int = 0,
        resumePositionMs: Long? = null
    ) {
        scope.launch {
            if (contextQueue != null && contextQueue.isNotEmpty()) {
                queueManager.setQueue(contextQueue, startIndex)
            } else {
                val currentQ = queueManager.queue.value
                val existingIndex = currentQ.indexOfFirst { it.media.path == media.path }
                if (existingIndex >= 0) {
                    queueManager.playIndex(existingIndex)
                } else {
                    queueManager.addToQueue(media)
                    queueManager.playIndex(queueManager.queue.value.size - 1)
                }
            }

            activeMediaFile = media

            // Navigate to Player screen first and prepare state
            playerViewModel.prepareForPlayback(media.path, media.title)
            _currentScreen.value = Screen.Player

            if (player.requiresNativeSurface && !playerViewModel.isSurfaceAttached.value) {
                withTimeoutOrNull(5000) {
                    playerViewModel.isSurfaceAttached.first { it }
                }
            }

            player.load(media.path, autoPlay = true)

            if (resumePositionMs != null && resumePositionMs > 1000L) {
                delay(300)
                player.seekTo(resumePositionMs.milliseconds)
            }
        }
    }

    fun playQueueItem(index: Int) {
        val item = queueManager.playIndex(index)
        if (item != null) {
            scope.launch {
                activeMediaFile = item.media
                playerViewModel.prepareForPlayback(item.media.path, item.media.title)
                _currentScreen.value = Screen.Player

                if (player.requiresNativeSurface && !playerViewModel.isSurfaceAttached.value) {
                    withTimeoutOrNull(5000) {
                        playerViewModel.isSurfaceAttached.first { it }
                    }
                }

                player.load(item.media.path, autoPlay = true)
            }
        }
    }

    fun playNextTrack() {
        val next = queueManager.getNextItem()
        if (next != null) {
            scope.launch {
                activeMediaFile = next.media
                player.load(next.media.path, autoPlay = true)
            }
        } else {
            scope.launch { player.stop() }
        }
    }

    fun playPreviousTrack() {
        val prev = queueManager.getPreviousItem()
        if (prev != null) {
            scope.launch {
                activeMediaFile = prev.media
                player.load(prev.media.path, autoPlay = true)
            }
        }
    }

    fun stopPlayback() {
        scope.launch {
            player.stop()
            activeMediaFile = null
        }
    }

    // Queue Operations
    fun addToQueue(media: MediaFile) {
        queueManager.addToQueue(media)
        showNotification("Added \"${media.title}\" to queue")
    }

    fun playNextInQueue(media: MediaFile) {
        queueManager.playNext(media)
        showNotification("Will play \"${media.title}\" next")
    }

    fun removeFromQueue(index: Int) {
        queueManager.removeAt(index)
    }

    fun moveQueueItem(fromIndex: Int, toIndex: Int) {
        queueManager.moveItem(fromIndex, toIndex)
    }

    fun clearQueue() {
        queueManager.clear()
        showNotification("Queue cleared")
    }

    fun cyclePlaybackMode() {
        queueManager.togglePlaybackMode()
    }

    fun setPlaybackMode(mode: PlaybackMode) {
        queueManager.setPlaybackMode(mode)
    }

    // Media Library Operations
    fun addFolder(path: String, name: String) {
        scope.launch {
            val folder = libraryRepo.addFolder(path, name)
            showNotification("Added folder \"${folder.name}\"")
            scanFolder(folder)
        }
    }

    fun removeFolder(folderId: String) {
        scope.launch {
            libraryRepo.removeFolder(folderId)
            showNotification("Folder removed from library")
        }
    }

    fun scanFolder(folder: MediaFolder) {
        scope.launch {
            _isScanning.value = true
            try {
                val dir = File(folder.path)
                val files = scanner.scanDirectory(dir)
                libraryRepo.updateFolderItems(folder.id, files)
                showNotification("Scanned ${files.size} media files in \"${folder.name}\"")
            } catch (e: Exception) {
                showNotification("Scan failed: ${e.message}")
            } finally {
                _isScanning.value = false
            }
        }
    }

    fun scanAllFolders() {
        scope.launch {
            val allFolders = folders.value
            if (allFolders.isEmpty()) return@launch
            _isScanning.value = true
            try {
                var totalFound = 0
                for (folder in allFolders) {
                    val dir = File(folder.path)
                    val files = scanner.scanDirectory(dir)
                    libraryRepo.updateFolderItems(folder.id, files)
                    totalFound += files.size
                }
                showNotification("Scan complete: $totalFound files across ${allFolders.size} folders")
            } catch (e: Exception) {
                showNotification("Library scan failed: ${e.message}")
            } finally {
                _isScanning.value = false
            }
        }
    }

    // Playlist Operations
    fun createPlaylist(name: String, description: String = "") {
        scope.launch {
            val pl = playlistRepo.createPlaylist(name, description)
            _showCreatePlaylistDialog.value = false
            showNotification("Created playlist \"${pl.name}\"")
        }
    }

    fun renamePlaylist(id: String, newName: String) {
        scope.launch {
            playlistRepo.renamePlaylist(id, newName)
            showNotification("Playlist renamed to \"$newName\"")
        }
    }

    fun deletePlaylist(id: String) {
        scope.launch {
            playlistRepo.deletePlaylist(id)
            if (_currentScreen.value is Screen.PlaylistDetail) {
                _currentScreen.value = Screen.Playlists
            }
            showNotification("Playlist deleted")
        }
    }

    fun addMediaToPlaylist(playlistId: String, media: MediaFile) {
        scope.launch {
            playlistRepo.addMediaToPlaylist(playlistId, media)
            _mediaForPlaylistPicker.value = null
            showNotification("Added \"${media.title}\" to playlist")
        }
    }

    fun removeMediaFromPlaylist(playlistId: String, mediaPath: String) {
        scope.launch {
            playlistRepo.removeMediaFromPlaylist(playlistId, mediaPath)
            showNotification("Item removed from playlist")
        }
    }

    fun reorderPlaylist(playlistId: String, fromIndex: Int, toIndex: Int) {
        scope.launch {
            playlistRepo.reorderMediaInPlaylist(playlistId, fromIndex, toIndex)
        }
    }

    fun clearPlaylist(playlistId: String) {
        scope.launch {
            playlistRepo.clearPlaylist(playlistId)
            showNotification("Playlist cleared")
        }
    }

    // History Operations
    fun clearHistory() {
        scope.launch {
            historyRepo.clearHistory()
            showNotification("Playback history cleared")
        }
    }

    // Favorites Operations
    fun toggleFavorite(mediaPath: String) {
        scope.launch {
            val isNowFav = favoritesRepo.toggleFavorite(mediaPath)
            showNotification(if (isNowFav) "Added to Favorites" else "Removed from Favorites")
        }
    }

    // Dialog & UI Controls
    fun showMediaDetails(media: MediaFile) {
        _selectedMediaForDetails.value = media
    }

    fun dismissMediaDetails() {
        _selectedMediaForDetails.value = null
    }

    fun showPlaylistPicker(media: MediaFile) {
        _mediaForPlaylistPicker.value = media
    }

    fun dismissPlaylistPicker() {
        _mediaForPlaylistPicker.value = null
    }

    fun showCreatePlaylistDialog(show: Boolean) {
        _showCreatePlaylistDialog.value = show
    }

    fun showAddFolderDialog(show: Boolean) {
        _showAddFolderDialog.value = show
    }

    fun showNotification(message: String) {
        _userNotification.value = message
        scope.launch {
            delay(2800)
            if (_userNotification.value == message) {
                _userNotification.value = null
            }
        }
    }

    fun dismissNotification() {
        _userNotification.value = null
    }

    fun release() {
        viewModelJob.cancel()
    }
}
