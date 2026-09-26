package com.devson.nosvedplayerkmp.repository

import com.devson.nosvedplayerkmp.media.model.MediaFile
import com.devson.nosvedplayerkmp.playlist.model.Playlist
import kotlinx.coroutines.flow.StateFlow

/**
 * Repository interface governing user playlists.
 */
interface PlaylistRepository {
    val playlists: StateFlow<List<Playlist>>

    suspend fun createPlaylist(name: String, description: String = ""): Playlist
    suspend fun renamePlaylist(playlistId: String, newName: String)
    suspend fun deletePlaylist(playlistId: String)
    suspend fun addMediaToPlaylist(playlistId: String, media: MediaFile)
    suspend fun removeMediaFromPlaylist(playlistId: String, mediaPath: String)
    suspend fun reorderMediaInPlaylist(playlistId: String, fromIndex: Int, toIndex: Int)
    suspend fun clearPlaylist(playlistId: String)
    suspend fun getPlaylistById(playlistId: String): Playlist?
}
