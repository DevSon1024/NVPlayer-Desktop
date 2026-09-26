package com.devson.nosvedplayerkmp.media.service

import com.devson.nosvedplayerkmp.media.model.MediaFile
import com.devson.nosvedplayerkmp.media.model.SupportedFormats
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Service performing asynchronous filesystem scanning for supported media files.
 */
class MediaScanner {

    /**
     * Scans the provided directory recursively on [Dispatchers.IO].
     */
    suspend fun scanDirectory(
        directory: File,
        maxDepth: Int = 5,
        onProgress: ((scannedCount: Int) -> Unit)? = null
    ): List<MediaFile> = withContext(Dispatchers.IO) {
        if (!directory.exists() || !directory.isDirectory) {
            return@withContext emptyList()
        }

        val results = mutableListOf<MediaFile>()
        scanRecursive(directory, 0, maxDepth, results, onProgress)
        results
    }

    private fun scanRecursive(
        dir: File,
        currentDepth: Int,
        maxDepth: Int,
        outList: MutableList<MediaFile>,
        onProgress: ((Int) -> Unit)?
    ) {
        if (currentDepth > maxDepth) return

        val files = dir.listFiles() ?: return
        for (file in files) {
            if (file.isHidden || file.name.startsWith(".")) continue

            if (file.isDirectory) {
                val name = file.name
                if (name.equals("\$Recycle.Bin", ignoreCase = true) ||
                    name.equals("System Volume Information", ignoreCase = true) ||
                    name.equals("node_modules", ignoreCase = true) ||
                    name.equals(".git", ignoreCase = true)
                ) {
                    continue
                }
                scanRecursive(file, currentDepth + 1, maxDepth, outList, onProgress)
            } else if (file.isFile) {
                val ext = file.extension.lowercase()
                if (SupportedFormats.isSupportedMedia(ext)) {
                    val mediaFile = MediaFile(
                        id = file.absolutePath.hashCode().toString(),
                        title = file.nameWithoutExtension,
                        path = file.absolutePath,
                        sizeBytes = file.length(),
                        lastModifiedMs = file.lastModified(),
                        durationMs = 0L,
                        extension = ext
                    )
                    outList.add(mediaFile)
                    onProgress?.invoke(outList.size)
                }
            }
        }
    }
}
