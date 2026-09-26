package com.devson.nosvedplayerkmp.repository

import com.devson.nosvedplayerkmp.history.model.PlaybackHistoryItem
import com.devson.nosvedplayerkmp.media.model.MediaFile
import com.devson.nosvedplayerkmp.media.model.MediaFolder
import com.devson.nosvedplayerkmp.playlist.model.Playlist
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext
import java.io.File

/**
 * File-based local storage manager for Nosved Player metadata.
 */
object NosvedDataStorage {
    val baseDir: File by lazy {
        val userHome = System.getProperty("user.home") ?: "."
        val dir = File(userHome, ".nosved")
        if (!dir.exists()) {
            dir.mkdirs()
        }
        dir
    }

    fun getFile(name: String): File = File(baseDir, name)
}

/**
 * Persistent Settings repository storing preferences in local configuration.
 */
class FileSettingsRepository(
    private val configFile: File = NosvedDataStorage.getFile("settings.cfg")
) : SettingsRepository {

    private val _themeMode = MutableStateFlow(ThemeMode.DARK)
    override val themeMode: StateFlow<ThemeMode> = _themeMode.asStateFlow()

    init {
        loadSettings()
    }

    private fun loadSettings() {
        try {
            if (configFile.exists()) {
                val lines = configFile.readLines()
                for (line in lines) {
                    val parts = line.split("=")
                    if (parts.size == 2 && parts[0].trim() == "themeMode") {
                        val modeStr = parts[1].trim()
                        _themeMode.value = ThemeMode.entries.firstOrNull { it.name.equals(modeStr, ignoreCase = true) } ?: ThemeMode.DARK
                    }
                }
            }
        } catch (_: Throwable) {}
    }

    override suspend fun setThemeMode(mode: ThemeMode) {
        _themeMode.value = mode
        withContext(Dispatchers.IO) {
            try {
                configFile.writeText("themeMode=${mode.name}\n")
            } catch (_: Throwable) {}
        }
    }
}

/**
 * Persistent Media Library repository maintaining scanned folders and media files.
 */
class FileMediaLibraryRepository(
    private val storageFile: File = NosvedDataStorage.getFile("library_folders.tsv")
) : MediaLibraryRepository {

    private val _folders = MutableStateFlow<List<MediaFolder>>(emptyList())
    override val folders: StateFlow<List<MediaFolder>> = _folders.asStateFlow()

    private val _mediaFiles = MutableStateFlow<List<MediaFile>>(emptyList())
    override val mediaFiles: StateFlow<List<MediaFile>> = _mediaFiles.asStateFlow()

    init {
        loadFolders()
    }

    private fun loadFolders() {
        try {
            if (storageFile.exists()) {
                val list = mutableListOf<MediaFolder>()
                storageFile.forEachLine { line ->
                    val parts = line.split("\t")
                    if (parts.size >= 4) {
                        list.add(
                            MediaFolder(
                                id = parts[0],
                                path = parts[1],
                                name = parts[2],
                                itemCount = parts[3].toIntOrNull() ?: 0,
                                lastScannedMs = parts.getOrNull(4)?.toLongOrNull() ?: 0L
                            )
                        )
                    }
                }
                _folders.value = list
            }
        } catch (_: Throwable) {}
    }

    private suspend fun persistFolders() = withContext(Dispatchers.IO) {
        try {
            val content = _folders.value.joinToString("\n") { f ->
                "${f.id}\t${f.path}\t${f.name}\t${f.itemCount}\t${f.lastScannedMs}"
            }
            storageFile.writeText(content)
        } catch (_: Throwable) {}
    }

    override suspend fun addFolder(path: String, name: String): MediaFolder {
        val existing = _folders.value.find { it.path == path }
        if (existing != null) return existing

        val folder = MediaFolder(
            id = path.hashCode().toString(),
            path = path,
            name = name,
            itemCount = 0,
            lastScannedMs = 0L
        )
        _folders.update { it + folder }
        persistFolders()
        return folder
    }

    override suspend fun removeFolder(folderId: String) {
        val removed = _folders.value.find { it.id == folderId }
        _folders.update { it.filterNot { f -> f.id == folderId } }
        persistFolders()

        if (removed != null) {
            _mediaFiles.update { current ->
                current.filterNot { it.path.startsWith(removed.path) }
            }
        }
    }

    override suspend fun updateFolderItems(folderId: String, items: List<MediaFile>) {
        val folder = _folders.value.find { it.id == folderId } ?: return
        val updatedFolder = folder.copy(
            itemCount = items.size,
            lastScannedMs = System.currentTimeMillis()
        )
        _folders.update { current -> current.map { if (it.id == folderId) updatedFolder else it } }
        persistFolders()

        _mediaFiles.update { current ->
            val otherFiles = current.filterNot { it.path.startsWith(folder.path) }
            otherFiles + items
        }
    }

    override suspend fun getMediaByPath(path: String): MediaFile? {
        return _mediaFiles.value.find { it.path == path }
    }

    override suspend fun search(query: String): List<MediaFile> {
        val q = query.trim().lowercase()
        if (q.isEmpty()) return _mediaFiles.value
        return _mediaFiles.value.filter {
            it.title.lowercase().contains(q) || it.path.lowercase().contains(q)
        }
    }
}

/**
 * Persistent Playlist repository managing user playlists and their contents.
 */
class FilePlaylistRepository(
    private val storageFile: File = NosvedDataStorage.getFile("playlists.tsv")
) : PlaylistRepository {

    private val _playlists = MutableStateFlow<List<Playlist>>(emptyList())
    override val playlists: StateFlow<List<Playlist>> = _playlists.asStateFlow()

    init {
        loadPlaylists()
    }

    private fun loadPlaylists() {
        try {
            if (storageFile.exists()) {
                val list = mutableListOf<Playlist>()
                var currentPlaylist: Playlist? = null
                val currentItems = mutableListOf<MediaFile>()

                storageFile.forEachLine { line ->
                    if (line.startsWith("PLAYLIST\t")) {
                        if (currentPlaylist != null) {
                            list.add(currentPlaylist!!.copy(items = currentItems.toList()))
                            currentItems.clear()
                        }
                        val parts = line.split("\t")
                        if (parts.size >= 5) {
                            currentPlaylist = Playlist(
                                id = parts[1],
                                name = parts[2],
                                description = parts[3],
                                createdAtMs = parts[4].toLongOrNull() ?: 0L,
                                updatedAtMs = parts.getOrNull(5)?.toLongOrNull() ?: 0L
                            )
                        }
                    } else if (line.startsWith("ITEM\t")) {
                        val parts = line.split("\t")
                        if (parts.size >= 8) {
                            currentItems.add(
                                MediaFile(
                                    id = parts[1],
                                    title = parts[2],
                                    path = parts[3],
                                    sizeBytes = parts[4].toLongOrNull() ?: 0L,
                                    lastModifiedMs = parts[5].toLongOrNull() ?: 0L,
                                    durationMs = parts[6].toLongOrNull() ?: 0L,
                                    extension = parts[7]
                                )
                            )
                        }
                    }
                }
                if (currentPlaylist != null) {
                    list.add(currentPlaylist.copy(items = currentItems.toList()))
                }
                _playlists.value = list
            }
        } catch (_: Throwable) {}
    }

    private suspend fun persistPlaylists() = withContext(Dispatchers.IO) {
        try {
            val sb = StringBuilder()
            for (p in _playlists.value) {
                sb.append("PLAYLIST\t${p.id}\t${p.name}\t${p.description}\t${p.createdAtMs}\t${p.updatedAtMs}\n")
                for (item in p.items) {
                    sb.append("ITEM\t${item.id}\t${item.title}\t${item.path}\t${item.sizeBytes}\t${item.lastModifiedMs}\t${item.durationMs}\t${item.extension}\n")
                }
            }
            storageFile.writeText(sb.toString())
        } catch (_: Throwable) {}
    }

    override suspend fun createPlaylist(name: String, description: String): Playlist {
        val now = System.currentTimeMillis()
        val playlist = Playlist(
            id = now.toString(),
            name = name,
            description = description,
            items = emptyList(),
            createdAtMs = now,
            updatedAtMs = now
        )
        _playlists.update { it + playlist }
        persistPlaylists()
        return playlist
    }

    override suspend fun renamePlaylist(playlistId: String, newName: String) {
        _playlists.update { list ->
            list.map {
                if (it.id == playlistId) it.copy(name = newName, updatedAtMs = System.currentTimeMillis())
                else it
            }
        }
        persistPlaylists()
    }

    override suspend fun deletePlaylist(playlistId: String) {
        _playlists.update { it.filterNot { p -> p.id == playlistId } }
        persistPlaylists()
    }

    override suspend fun addMediaToPlaylist(playlistId: String, media: MediaFile) {
        _playlists.update { list ->
            list.map {
                if (it.id == playlistId) {
                    val updated = if (it.items.any { item -> item.path == media.path }) it.items else it.items + media
                    it.copy(items = updated, updatedAtMs = System.currentTimeMillis())
                } else it
            }
        }
        persistPlaylists()
    }

    override suspend fun removeMediaFromPlaylist(playlistId: String, mediaPath: String) {
        _playlists.update { list ->
            list.map {
                if (it.id == playlistId) {
                    it.copy(items = it.items.filterNot { item -> item.path == mediaPath }, updatedAtMs = System.currentTimeMillis())
                } else it
            }
        }
        persistPlaylists()
    }

    override suspend fun reorderMediaInPlaylist(playlistId: String, fromIndex: Int, toIndex: Int) {
        _playlists.update { list ->
            list.map {
                if (it.id == playlistId) {
                    val mutable = it.items.toMutableList()
                    if (fromIndex in mutable.indices && toIndex in mutable.indices) {
                        val item = mutable.removeAt(fromIndex)
                        mutable.add(toIndex, item)
                        it.copy(items = mutable, updatedAtMs = System.currentTimeMillis())
                    } else it
                } else it
            }
        }
        persistPlaylists()
    }

    override suspend fun clearPlaylist(playlistId: String) {
        _playlists.update { list ->
            list.map { if (it.id == playlistId) it.copy(items = emptyList(), updatedAtMs = System.currentTimeMillis()) else it }
        }
        persistPlaylists()
    }

    override suspend fun getPlaylistById(playlistId: String): Playlist? {
        return _playlists.value.find { it.id == playlistId }
    }
}

/**
 * Persistent History repository tracking recently played media and resume timestamps.
 */
class FileHistoryRepository(
    private val storageFile: File = NosvedDataStorage.getFile("history.tsv"),
    private val maxEntries: Int = 60
) : HistoryRepository {

    private val _history = MutableStateFlow<List<PlaybackHistoryItem>>(emptyList())
    override val history: StateFlow<List<PlaybackHistoryItem>> = _history.asStateFlow()

    init {
        loadHistory()
    }

    private fun loadHistory() {
        try {
            if (storageFile.exists()) {
                val list = mutableListOf<PlaybackHistoryItem>()
                storageFile.forEachLine { line ->
                    val parts = line.split("\t")
                    if (parts.size >= 10) {
                        val media = MediaFile(
                            id = parts[0],
                            title = parts[1],
                            path = parts[2],
                            sizeBytes = parts[3].toLongOrNull() ?: 0L,
                            lastModifiedMs = parts[4].toLongOrNull() ?: 0L,
                            durationMs = parts[5].toLongOrNull() ?: 0L,
                            extension = parts[6]
                        )
                        val pos = parts[7].toLongOrNull() ?: 0L
                        val dur = parts[8].toLongOrNull() ?: 0L
                        val time = parts[9].toLongOrNull() ?: 0L
                        val comp = parts.getOrNull(10)?.toBooleanStrictOrNull() ?: false

                        list.add(
                            PlaybackHistoryItem(
                                media = media,
                                lastPositionMs = pos,
                                durationMs = dur,
                                lastPlayedTimestampMs = time,
                                isCompleted = comp
                            )
                        )
                    }
                }
                _history.value = list
            }
        } catch (_: Throwable) {}
    }

    private suspend fun persistHistory() = withContext(Dispatchers.IO) {
        try {
            val content = _history.value.joinToString("\n") { h ->
                "${h.media.id}\t${h.media.title}\t${h.media.path}\t${h.media.sizeBytes}\t${h.media.lastModifiedMs}\t${h.media.durationMs}\t${h.media.extension}\t${h.lastPositionMs}\t${h.durationMs}\t${h.lastPlayedTimestampMs}\t${h.isCompleted}"
            }
            storageFile.writeText(content)
        } catch (_: Throwable) {}
    }

    override suspend fun recordPlayback(
        media: MediaFile,
        positionMs: Long,
        durationMs: Long,
        isCompleted: Boolean
    ) {
        val now = System.currentTimeMillis()
        val item = PlaybackHistoryItem(
            media = media,
            lastPositionMs = positionMs,
            durationMs = if (durationMs > 0L) durationMs else media.durationMs,
            lastPlayedTimestampMs = now,
            isCompleted = isCompleted
        )
        _history.update { current ->
            val filtered = current.filterNot { it.media.path == media.path }
            (listOf(item) + filtered).take(maxEntries)
        }
        persistHistory()
    }

    override suspend fun getContinueWatching(): List<PlaybackHistoryItem> {
        return _history.value.filter { it.isContinueWatching }
    }

    override suspend fun getRecentMedia(): List<PlaybackHistoryItem> {
        return _history.value
    }

    override suspend fun clearHistory() {
        _history.value = emptyList()
        persistHistory()
    }
}

/**
 * Persistent Favorites repository maintaining starred items.
 */
class FileFavoritesRepository(
    private val storageFile: File = NosvedDataStorage.getFile("favorites.txt")
) : FavoritesRepository {

    private val _favoritePaths = MutableStateFlow<Set<String>>(emptySet())
    override val favoritePaths: StateFlow<Set<String>> = _favoritePaths.asStateFlow()

    init {
        loadFavorites()
    }

    private fun loadFavorites() {
        try {
            if (storageFile.exists()) {
                val lines = storageFile.readLines().map { it.trim() }.filter { it.isNotEmpty() }
                _favoritePaths.value = lines.toSet()
            }
        } catch (_: Throwable) {}
    }

    private suspend fun persistFavorites() = withContext(Dispatchers.IO) {
        try {
            storageFile.writeText(_favoritePaths.value.joinToString("\n"))
        } catch (_: Throwable) {}
    }

    override suspend fun toggleFavorite(mediaPath: String): Boolean {
        var isFav = false
        _favoritePaths.update { current ->
            if (current.contains(mediaPath)) {
                isFav = false
                current - mediaPath
            } else {
                isFav = true
                current + mediaPath
            }
        }
        persistFavorites()
        return isFav
    }

    override suspend fun isFavorite(mediaPath: String): Boolean {
        return _favoritePaths.value.contains(mediaPath)
    }

    override suspend fun clearFavorites() {
        _favoritePaths.value = emptySet()
        persistFavorites()
    }
}
