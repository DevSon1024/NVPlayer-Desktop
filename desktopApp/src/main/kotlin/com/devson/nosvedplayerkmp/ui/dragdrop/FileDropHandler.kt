package com.devson.nosvedplayerkmp.ui.dragdrop

import java.awt.Component
import java.awt.datatransfer.DataFlavor
import java.awt.dnd.DnDConstants
import java.awt.dnd.DropTarget
import java.awt.dnd.DropTargetAdapter
import java.awt.dnd.DropTargetDragEvent
import java.awt.dnd.DropTargetDropEvent
import java.io.File

/**
 * Handles Drag & Drop of media files from the desktop file explorer directly onto the player window.
 */
class FileDropHandler(
    private val onFileDropped: (String) -> Unit
) : DropTargetAdapter() {

    override fun dragOver(dtde: DropTargetDragEvent) {
        if (dtde.isDataFlavorSupported(DataFlavor.javaFileListFlavor)) {
            dtde.acceptDrag(DnDConstants.ACTION_COPY)
        } else {
            dtde.rejectDrag()
        }
    }

    @Suppress("UNCHECKED_CAST")
    override fun drop(dtde: DropTargetDropEvent) {
        try {
            if (dtde.isDataFlavorSupported(DataFlavor.javaFileListFlavor)) {
                dtde.acceptDrop(DnDConstants.ACTION_COPY)
                val files = dtde.transferable.getTransferData(DataFlavor.javaFileListFlavor) as? List<File>
                val firstValidFile = files?.firstOrNull { it.exists() && it.isFile }
                if (firstValidFile != null) {
                    onFileDropped(firstValidFile.absolutePath)
                    dtde.dropComplete(true)
                    return
                }
            }
            dtde.rejectDrop()
        } catch (e: Exception) {
            System.err.println("[FileDropHandler] Failed to process dropped file: ${e.message}")
            try {
                dtde.dropComplete(false)
            } catch (_: Throwable) {}
        }
    }

    /**
     * Attaches this drop target to an AWT/Swing component.
     */
    fun attachTo(component: Component): DropTarget {
        return DropTarget(component, DnDConstants.ACTION_COPY, this, true)
    }

    companion object {
        val SUPPORTED_EXTENSIONS = setOf(
            "mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "m4v", "ts", "m2ts",
            "mp3", "wav", "flac", "ogg", "aac", "m4a"
        )

        fun isSupportedMediaFile(file: File): Boolean {
            val ext = file.extension.lowercase()
            return ext in SUPPORTED_EXTENSIONS
        }
    }
}
