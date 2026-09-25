package com.devson.nosvedplayerkmp.player.mpv

import com.devson.nosvedplayerkmp.player.model.EndReason
import com.devson.nosvedplayerkmp.player.model.PlayerError
import com.devson.nosvedplayerkmp.player.model.PlayerEvent
import com.devson.nosvedplayerkmp.player.mpv.native.MpvEndFileReason
import com.devson.nosvedplayerkmp.player.mpv.native.MpvEventEndFileNative
import com.devson.nosvedplayerkmp.player.mpv.native.MpvEventId
import com.devson.nosvedplayerkmp.player.mpv.native.MpvEventLogMessageNative
import com.devson.nosvedplayerkmp.player.mpv.native.MpvEventNative
import com.devson.nosvedplayerkmp.player.mpv.native.MpvEventPropertyNative
import com.devson.nosvedplayerkmp.player.mpv.native.MpvEventStartFileNative
import com.devson.nosvedplayerkmp.player.mpv.native.MpvFormat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Asynchronous event pump for libmpv.
 *
 * Runs a dedicated event loop calling `mpv_wait_event()` and dispatches
 * parsed [PlayerEvent] instances into a [SharedFlow].
 */
class MpvEventHandler(
    private val instance: MpvInstance
) : AutoCloseable {

    private val isRunning = AtomicBoolean(false)
    private var eventJob: Job? = null

    private val _events = MutableSharedFlow<PlayerEvent>(extraBufferCapacity = 128)
    val events: SharedFlow<PlayerEvent> = _events.asSharedFlow()

    /**
     * Starts listening for mpv events in a background coroutine.
     */
    fun start(scope: CoroutineScope) {
        if (!isRunning.compareAndSet(false, true)) {
            return
        }

        eventJob = scope.launch(Dispatchers.IO) {
            runEventLoop()
        }
    }

    /**
     * The internal event pump loop.
     */
    private suspend fun CoroutineScope.runEventLoop() {
        while (isRunning.get() && isActive && instance.isInitialized) {
            val eventPtr = try {
                // Poll with a 50ms timeout so the loop remains responsive to cancellation
                instance.native.mpv_wait_event(instance.rawHandle, 0.05)
            } catch (e: Exception) {
                if (isRunning.get()) {
                    _events.tryEmit(PlayerEvent.Error(PlayerError.Unknown("Event loop wait failed: ${e.message}", e)))
                }
                break
            }

            if (eventPtr == null) continue

            val event = try {
                MpvEventNative(eventPtr)
            } catch (e: Throwable) {
                continue
            }

            if (event.event_id == MpvEventId.NONE) {
                continue
            }

            if (event.error < 0) {
                val errorStr = instance.native.mpv_error_string(event.error) ?: "Unknown error"
                _events.tryEmit(
                    PlayerEvent.Error(
                        PlayerError.NativeError(
                            message = "mpv event error: code ${event.error} ($errorStr)",
                            errorCode = event.error
                        )
                    )
                )
            }

            when (event.event_id) {
                MpvEventId.START_FILE -> {
                    val entryId = event.data?.let {
                        try {
                            MpvEventStartFileNative(it).playlist_entry_id
                        } catch (e: Throwable) {
                            0L
                        }
                    } ?: 0L
                    _events.tryEmit(PlayerEvent.FileStarted(playlistEntryId = entryId))
                }

                MpvEventId.FILE_LOADED -> {
                    _events.tryEmit(PlayerEvent.FileLoaded)
                }

                MpvEventId.END_FILE -> {
                    val endFileData = event.data?.let {
                        try {
                            MpvEventEndFileNative(it)
                        } catch (e: Throwable) {
                            null
                        }
                    }
                    val reason = when (endFileData?.reason) {
                        MpvEndFileReason.EOF -> EndReason.EOF
                        MpvEndFileReason.STOP -> EndReason.STOP
                        MpvEndFileReason.QUIT -> EndReason.QUIT
                        MpvEndFileReason.ERROR -> EndReason.ERROR
                        MpvEndFileReason.REDIRECT -> EndReason.REDIRECT
                        else -> EndReason.UNKNOWN
                    }
                    val endError = if (endFileData != null && endFileData.error < 0) {
                        val desc = instance.native.mpv_error_string(endFileData.error) ?: "Playback failed"
                        PlayerError.MediaLoadFailed("Media playback ended with error: $desc", uri = "", errorCode = endFileData.error)
                    } else null

                    _events.tryEmit(PlayerEvent.FileEnded(reason, endError))
                }

                MpvEventId.PROPERTY_CHANGE -> {
                    val prop = event.data?.let {
                        try {
                            MpvEventPropertyNative(it)
                        } catch (e: Throwable) {
                            null
                        }
                    }

                    val propName = prop?.name?.let {
                        try {
                            it.getString(0, "UTF-8")
                        } catch (e: Throwable) {
                            null
                        }
                    }

                    if (prop != null && propName != null) {
                        val parsedValue = extractPropertyValue(prop)
                        _events.tryEmit(PlayerEvent.PropertyChanged(propName, parsedValue))
                    }
                }

                MpvEventId.LOG_MESSAGE -> {
                    val log = event.data?.let {
                        try {
                            MpvEventLogMessageNative(it)
                        } catch (e: Throwable) {
                            null
                        }
                    }
                    if (log != null) {
                        val prefix = log.prefix?.let { try { it.getString(0, "UTF-8") } catch (_: Throwable) { "" } } ?: ""
                        val level = log.level?.let { try { it.getString(0, "UTF-8") } catch (_: Throwable) { "" } } ?: ""
                        val text = log.text?.let { try { it.getString(0, "UTF-8") } catch (_: Throwable) { "" } } ?: ""
                        _events.tryEmit(
                            PlayerEvent.LogMessage(
                                prefix = prefix,
                                level = level,
                                message = text.trimEnd()
                            )
                        )
                    }
                }

                MpvEventId.SHUTDOWN -> {
                    _events.tryEmit(PlayerEvent.Shutdown)
                    break
                }
            }
        }
    }

    /**
     * Extracts strongly-typed Kotlin values from [MpvEventPropertyNative].
     */
    private fun extractPropertyValue(prop: MpvEventPropertyNative): Any? {
        val dataPtr = prop.data ?: return null
        return try {
            when (prop.format) {
                MpvFormat.FLAG -> dataPtr.getInt(0) == 1
                MpvFormat.INT64 -> dataPtr.getLong(0)
                MpvFormat.DOUBLE -> dataPtr.getDouble(0)
                MpvFormat.STRING -> {
                    val strPtr = dataPtr.getPointer(0)
                    strPtr?.getString(0, "UTF-8")
                }
                else -> null
            }
        } catch (e: Throwable) {
            null
        }
    }

    /**
     * Interrupts and stops the event loop, waiting until the loop coroutine has finished.
     */
    suspend fun stop() {
        if (isRunning.compareAndSet(true, false)) {
            try {
                if (instance.isInitialized) {
                    instance.native.mpv_wakeup(instance.rawHandle)
                }
            } catch (_: Exception) {}
            eventJob?.cancelAndJoin()
            eventJob = null
        }
    }

    override fun close() {
        if (isRunning.compareAndSet(true, false)) {
            try {
                if (instance.isInitialized) {
                    instance.native.mpv_wakeup(instance.rawHandle)
                }
            } catch (_: Exception) {}
            eventJob?.cancel()
            eventJob = null
        }
    }
}
