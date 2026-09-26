package com.devson.nosvedplayerkmp.repository

import com.devson.nosvedplayerkmp.media.model.MediaFile
import com.devson.nosvedplayerkmp.media.model.MediaFolder
import kotlinx.coroutines.flow.StateFlow

/**
 * Repository interface governing indexed media folders and discovered library files.
 */
interface MediaLibraryRepository {
    val folders: StateFlow<List<MediaFolder>>
    val mediaFiles: StateFlow<List<MediaFile>>

    suspend fun addFolder(path: String, name: String): MediaFolder
    suspend fun removeFolder(folderId: String)
    suspend fun updateFolderItems(folderId: String, items: List<MediaFile>)
    suspend fun getMediaByPath(path: String): MediaFile?
    suspend fun search(query: String): List<MediaFile>
}
