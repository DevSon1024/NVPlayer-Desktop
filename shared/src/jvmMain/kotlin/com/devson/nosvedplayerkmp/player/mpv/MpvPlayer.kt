package com.devson.nosvedplayerkmp.player.mpv

import com.devson.nosvedplayerkmp.player.api.Player
import com.devson.nosvedplayerkmp.player.model.EndReason
import com.devson.nosvedplayerkmp.player.model.MediaItem
import com.devson.nosvedplayerkmp.player.model.PlaybackState
import com.devson.nosvedplayerkmp.player.model.PlayerError
import com.devson.nosvedplayerkmp.player.model.PlayerEvent
import com.devson.nosvedplayerkmp.player.model.PlayerException
import com.devson.nosvedplayerkmp.player.mpv.native.MpvFormat
import com.sun.jna.Pointer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import kotlin.time.DurationUnit

/**
 * Windows desktop [Player] implementation powered by libmpv via JNA.
 */
class MpvPlayer(
    private val defaultOptions: Map<String, String> = emptyMap()
) : Player {

    private val mutex = Mutex()
    private var scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private var mpvInstance: MpvInstance? = null
    private var eventHandler: MpvEventHandler? = null

    private val _playbackState = MutableStateFlow(PlaybackState.IDLE)
    override val playbackState: StateFlow<PlaybackState> = _playbackState.asStateFlow()

    private val _position = MutableStateFlow(Duration.ZERO)
    override val position: StateFlow<Duration> = _position.asStateFlow()

    private val _duration = MutableStateFlow(Duration.ZERO)
    override val duration: StateFlow<Duration> = _duration.asStateFlow()

    private val _progress = MutableStateFlow(0f)
    override val progress: StateFlow<Float> = _progress.asStateFlow()

    private val _volume = MutableStateFlow(100f)
    override val volume: StateFlow<Float> = _volume.asStateFlow()

    private val _playbackSpeed = MutableStateFlow(1.0f)
    override val playbackSpeed: StateFlow<Float> = _playbackSpeed.asStateFlow()

    private val _currentMediaItem = MutableStateFlow<MediaItem?>(null)
    override val currentMediaItem: StateFlow<MediaItem?> = _currentMediaItem.asStateFlow()

    private val _errors = MutableSharedFlow<PlayerError>(extraBufferCapacity = 64)
    override val errors: Flow<PlayerError> = _errors.asSharedFlow()

    private val _events = MutableSharedFlow<PlayerEvent>(extraBufferCapacity = 128)
    override val events: Flow<PlayerEvent> = _events.asSharedFlow()

    /**
     * Internal access to the active [MpvInstance].
     * Prepared for Phase 2 video rendering backend attachment.
     */
    internal val currentInstance: MpvInstance?
        get() = mpvInstance

    /**
     * Raw pointer to `mpv_handle` for native rendering backend integration (Phase 2).
     */
    val rawMpvHandle: Pointer?
        get() = mpvInstance?.rawHandle

    override suspend fun initialize(): Unit = withContext(Dispatchers.IO) {
        mutex.withLock {
            if (mpvInstance?.isInitialized == true) return@withLock

            _playbackState.value = PlaybackState.INITIALIZING
            try {
                val instance = MpvInstance.createAndInitialize(defaultOptions)
                val handler = MpvEventHandler(instance)

                mpvInstance = instance
                eventHandler = handler

                // Observe core playback properties using mpv_observe_property
                MpvProperties.observe(instance, replyUserdata = 1, name = MpvProperties.PAUSE, format = MpvFormat.FLAG)
                MpvProperties.observe(instance, replyUserdata = 2, name = MpvProperties.TIME_POS, format = MpvFormat.DOUBLE)
                MpvProperties.observe(instance, replyUserdata = 3, name = MpvProperties.DURATION, format = MpvFormat.DOUBLE)
                MpvProperties.observe(instance, replyUserdata = 4, name = MpvProperties.VOLUME, format = MpvFormat.DOUBLE)
                MpvProperties.observe(instance, replyUserdata = 5, name = MpvProperties.SPEED, format = MpvFormat.DOUBLE)
                MpvProperties.observe(instance, replyUserdata = 6, name = MpvProperties.CORE_IDLE, format = MpvFormat.FLAG)
                MpvProperties.observe(instance, replyUserdata = 7, name = MpvProperties.EOF_REACHED, format = MpvFormat.FLAG)
                MpvProperties.observe(instance, replyUserdata = 8, name = MpvProperties.PATH, format = MpvFormat.STRING)

                // Start asynchronous event loop on background IO dispatcher
                handler.start(scope)
                scope.launch {
                    handler.events.collect { event ->
                        handleMpvEvent(event)
                    }
                }

                // Synchronize initial property state
                MpvProperties.getDouble(instance, MpvProperties.VOLUME).onSuccess {
                    _volume.value = it.toFloat()
                }
                MpvProperties.getDouble(instance, MpvProperties.SPEED).onSuccess {
                    _playbackSpeed.value = it.toFloat()
                }

                _playbackState.value = PlaybackState.IDLE
            } catch (e: PlayerException) {
                _playbackState.value = PlaybackState.ERROR
                _errors.tryEmit(e.error)
                throw e
            } catch (e: Throwable) {
                val error = PlayerError.InitializationFailed("Initialization failure: ${e.message}", cause = e)
                _playbackState.value = PlaybackState.ERROR
                _errors.tryEmit(error)
                throw PlayerException(error)
            }
        }
    }

    override suspend fun loadMedia(mediaItem: MediaItem, autoPlay: Boolean): Unit = withContext(Dispatchers.IO) {
        mutex.withLock {
            val instance = checkInitialized()

            val normalizedPath = normalizePath(mediaItem.uri)
            val isRemote = isRemoteUrl(normalizedPath)

            // Validate local file existence before loading to report actionable errors
            if (!isRemote) {
                val file = File(normalizedPath)
                if (!file.exists()) {
                    val error = PlayerError.MediaLoadFailed(
                        message = "Media file does not exist: $normalizedPath",
                        uri = mediaItem.uri
                    )
                    _playbackState.value = PlaybackState.ERROR
                    _errors.tryEmit(error)
                    throw PlayerException(error)
                }
            }

            // Reset media playback metrics for the new file
            _playbackState.value = PlaybackState.LOADING
            _currentMediaItem.value = mediaItem.copy(uri = normalizedPath)
            _position.value = Duration.ZERO
            _duration.value = Duration.ZERO
            _progress.value = 0f

            // Execute loadfile command via libmpv
            val result = MpvCommands.loadFile(instance, normalizedPath, mode = "replace")
            result.onFailure {
                val error = PlayerError.MediaLoadFailed(
                    message = "Failed to load media: $normalizedPath",
                    uri = mediaItem.uri,
                    cause = it
                )
                _playbackState.value = PlaybackState.ERROR
                _errors.tryEmit(error)
                throw PlayerException(error)
            }

            if (!autoPlay) {
                MpvCommands.pause(instance)
            }
        }
    }

    override suspend fun play(): Unit = withContext(Dispatchers.IO) {
        mutex.withLock {
            val instance = checkInitialized()
            // If playback previously reached the end, restart from beginning
            if (_playbackState.value == PlaybackState.ENDED) {
                MpvCommands.seekAbsolute(instance, 0.0)
            }
            MpvCommands.play(instance).onFailure(::handleCommandFailure)
        }
    }

    override suspend fun pause(): Unit = withContext(Dispatchers.IO) {
        mutex.withLock {
            val instance = checkInitialized()
            MpvCommands.pause(instance).onFailure(::handleCommandFailure)
        }
    }

    override suspend fun stop(): Unit = withContext(Dispatchers.IO) {
        mutex.withLock {
            val instance = checkInitialized()
            MpvCommands.stop(instance).onFailure(::handleCommandFailure)
            _playbackState.value = PlaybackState.STOPPED
            _position.value = Duration.ZERO
            _progress.value = 0f
        }
    }

    override suspend fun seekTo(position: Duration): Unit = withContext(Dispatchers.IO) {
        mutex.withLock {
            val instance = checkInitialized()
            val seconds = position.toDouble(DurationUnit.SECONDS).coerceAtLeast(0.0)
            MpvCommands.seekAbsolute(instance, seconds).onFailure(::handleCommandFailure)
            _position.value = position
            updateProgress(seconds, _duration.value.toDouble(DurationUnit.SECONDS))
        }
    }

    override suspend fun seekRelative(seconds: Double): Unit = withContext(Dispatchers.IO) {
        mutex.withLock {
            val instance = checkInitialized()
            MpvCommands.seekRelative(instance, seconds).onFailure(::handleCommandFailure)
            val newSec = (_position.value.toDouble(DurationUnit.SECONDS) + seconds).coerceAtLeast(0.0)
            _position.value = newSec.seconds
            updateProgress(newSec, _duration.value.toDouble(DurationUnit.SECONDS))
        }
    }

    override suspend fun setVolume(volume: Float): Unit = withContext(Dispatchers.IO) {
        mutex.withLock {
            val instance = checkInitialized()
            val clamped = volume.coerceIn(0f, 100f)
            MpvProperties.setDouble(instance, MpvProperties.VOLUME, clamped.toDouble())
                .onSuccess { _volume.value = clamped }
                .onFailure(::handleCommandFailure)
        }
    }

    override suspend fun setPlaybackSpeed(speed: Float): Unit = withContext(Dispatchers.IO) {
        mutex.withLock {
            val instance = checkInitialized()
            val clamped = speed.coerceIn(0.01f, 100f)
            MpvProperties.setDouble(instance, MpvProperties.SPEED, clamped.toDouble())
                .onSuccess { _playbackSpeed.value = clamped }
                .onFailure(::handleCommandFailure)
        }
    }

    override suspend fun release(): Unit = withContext(Dispatchers.IO) {
        mutex.withLock {
            if (mpvInstance == null && eventHandler == null) return@withLock

            _playbackState.value = PlaybackState.IDLE
            _currentMediaItem.value = null

            try {
                eventHandler?.stop()
                eventHandler?.close()
            } catch (_: Exception) {}
            eventHandler = null

            try {
                mpvInstance?.terminateAndDestroy()
                mpvInstance?.close()
            } catch (_: Exception) {}
            mpvInstance = null

            scope.cancel()
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        }
    }

    private fun handleMpvEvent(event: PlayerEvent) {
        _events.tryEmit(event)
        when (event) {
            is PlayerEvent.FileStarted -> {
                _playbackState.value = PlaybackState.LOADING
            }

            is PlayerEvent.FileLoaded -> {
                val isPaused = mpvInstance?.let { MpvProperties.getBoolean(it, MpvProperties.PAUSE).getOrNull() } ?: false
                _playbackState.value = if (isPaused) PlaybackState.PAUSED else PlaybackState.PLAYING
                // Query duration immediately upon load
                mpvInstance?.let {
                    MpvProperties.getDouble(it, MpvProperties.DURATION).onSuccess { dur ->
                        _duration.value = dur.seconds
                        updateProgress(_position.value.toDouble(DurationUnit.SECONDS), dur)
                    }
                }
            }

            is PlayerEvent.FileEnded -> {
                when (event.reason) {
                    EndReason.EOF -> {
                        _playbackState.value = PlaybackState.ENDED
                        _progress.value = 1f
                    }
                    EndReason.STOP -> {
                        // If we are currently loading a replacement file, do not override with STOPPED
                        if (_playbackState.value != PlaybackState.LOADING) {
                            _playbackState.value = PlaybackState.STOPPED
                        }
                    }
                    EndReason.ERROR -> {
                        _playbackState.value = PlaybackState.ERROR
                        event.error?.let { _errors.tryEmit(it) }
                    }
                    EndReason.QUIT -> {
                        _playbackState.value = PlaybackState.IDLE
                    }
                    else -> {}
                }
            }

            is PlayerEvent.PropertyChanged -> {
                handlePropertyChanged(event.name, event.value)
            }

            is PlayerEvent.Error -> {
                _errors.tryEmit(event.error)
            }

            is PlayerEvent.Shutdown -> {
                _playbackState.value = PlaybackState.IDLE
            }

            else -> {}
        }
    }

    private fun handlePropertyChanged(name: String, value: Any?) {
        when (name) {
            MpvProperties.PAUSE -> {
                if (value is Boolean) {
                    if (value && _playbackState.value == PlaybackState.PLAYING) {
                        _playbackState.value = PlaybackState.PAUSED
                    } else if (!value && (_playbackState.value == PlaybackState.PAUSED || _playbackState.value == PlaybackState.STOPPED || _playbackState.value == PlaybackState.ENDED)) {
                        _playbackState.value = PlaybackState.PLAYING
                    }
                }
            }

            MpvProperties.TIME_POS -> {
                if (value is Double) {
                    _position.value = value.seconds
                    updateProgress(value, _duration.value.toDouble(DurationUnit.SECONDS))
                }
            }

            MpvProperties.DURATION -> {
                if (value is Double) {
                    _duration.value = value.seconds
                    updateProgress(_position.value.toDouble(DurationUnit.SECONDS), value)
                }
            }

            MpvProperties.VOLUME -> {
                if (value is Double) {
                    _volume.value = value.toFloat()
                }
            }

            MpvProperties.SPEED -> {
                if (value is Double) {
                    _playbackSpeed.value = value.toFloat()
                }
            }
        }
    }

    private fun updateProgress(currentSeconds: Double, totalSeconds: Double) {
        if (totalSeconds > 0.0) {
            _progress.value = (currentSeconds / totalSeconds).toFloat().coerceIn(0f, 1f)
        }
    }

    private fun handleCommandFailure(throwable: Throwable) {
        val error = if (throwable is PlayerException) throwable.error else {
            PlayerError.CommandExecutionFailed(
                message = throwable.message ?: "Command execution failed",
                command = "unknown",
                cause = throwable
            )
        }
        _errors.tryEmit(error)
    }

    private fun checkInitialized(): MpvInstance {
        val instance = mpvInstance
        if (instance == null || !instance.isInitialized) {
            val error = PlayerError.InitializationFailed("Player is not initialized. Call initialize() first.")
            _errors.tryEmit(error)
            throw PlayerException(error)
        }
        return instance
    }

    /**
     * Normalizes Windows paths, file:// URIs, and Unicode strings for libmpv.
     */
    private fun normalizePath(rawUri: String): String {
        var path = rawUri.trim()

        if (isRemoteUrl(path)) {
            return path
        }

        // Handle file:// URIs
        if (path.startsWith("file:///", ignoreCase = true)) {
            path = path.substring(8)
        } else if (path.startsWith("file://", ignoreCase = true)) {
            path = path.substring(7)
        } else if (path.startsWith("file:/", ignoreCase = true)) {
            path = path.substring(6)
        }

        // Strip leading slash before Windows drive letter: /C:/path -> C:/path
        if (path.length >= 3 && path[0] == '/' && path[1].isLetter() && path[2] == ':') {
            path = path.substring(1)
        }

        // Convert forward slashes to backslashes for local Windows drive paths
        val file = File(path)
        return file.absolutePath
    }

    private fun isRemoteUrl(uri: String): Boolean {
        val lower = uri.lowercase()
        return lower.startsWith("http://") ||
                lower.startsWith("https://") ||
                lower.startsWith("rtmp://") ||
                lower.startsWith("rtsp://")
    }
}
