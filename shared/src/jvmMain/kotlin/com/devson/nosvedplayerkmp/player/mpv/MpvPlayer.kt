package com.devson.nosvedplayerkmp.player.mpv

import com.devson.nosvedplayerkmp.player.api.Player
import com.devson.nosvedplayerkmp.player.model.MediaItem
import com.devson.nosvedplayerkmp.player.model.PlaybackState
import com.devson.nosvedplayerkmp.player.model.PlayerError
import com.devson.nosvedplayerkmp.player.model.PlayerEvent
import com.devson.nosvedplayerkmp.player.model.PlayerException
import com.devson.nosvedplayerkmp.player.mpv.native.MpvFormat
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
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

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

    private val _volume = MutableStateFlow(100f)
    override val volume: StateFlow<Float> = _volume.asStateFlow()

    private val _playbackSpeed = MutableStateFlow(1.0f)
    override val playbackSpeed: StateFlow<Float> = _playbackSpeed.asStateFlow()

    private val _errors = MutableSharedFlow<PlayerError>(extraBufferCapacity = 64)
    override val errors: Flow<PlayerError> = _errors.asSharedFlow()

    private val _events = MutableSharedFlow<PlayerEvent>(extraBufferCapacity = 128)
    override val events: Flow<PlayerEvent> = _events.asSharedFlow()

    override suspend fun initialize(): Unit = mutex.withLock {
        if (mpvInstance?.isInitialized == true) return@withLock

        _playbackState.value = PlaybackState.INITIALIZING
        try {
            val instance = MpvInstance.createAndInitialize(defaultOptions)
            val handler = MpvEventHandler(instance)

            mpvInstance = instance
            eventHandler = handler

            // Observe core playback properties
            MpvProperties.observe(instance, replyUserdata = 1, name = MpvProperties.PAUSE, format = MpvFormat.FLAG)
            MpvProperties.observe(instance, replyUserdata = 2, name = MpvProperties.TIME_POS, format = MpvFormat.DOUBLE)
            MpvProperties.observe(instance, replyUserdata = 3, name = MpvProperties.DURATION, format = MpvFormat.DOUBLE)
            MpvProperties.observe(instance, replyUserdata = 4, name = MpvProperties.VOLUME, format = MpvFormat.DOUBLE)
            MpvProperties.observe(instance, replyUserdata = 5, name = MpvProperties.SPEED, format = MpvFormat.DOUBLE)
            MpvProperties.observe(instance, replyUserdata = 6, name = MpvProperties.CORE_IDLE, format = MpvFormat.FLAG)
            MpvProperties.observe(instance, replyUserdata = 7, name = MpvProperties.EOF_REACHED, format = MpvFormat.FLAG)

            // Subscribe to incoming mpv events
            handler.start(scope)
            scope.launch {
                handler.events.collect { event ->
                    handleMpvEvent(event)
                }
            }

            // Sync initial property state
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

    override suspend fun loadMedia(mediaItem: MediaItem, autoPlay: Boolean): Unit = mutex.withLock {
        val instance = checkInitialized()
        _playbackState.value = PlaybackState.LOADING

        val result = MpvCommands.loadFile(instance, mediaItem.uri)
        result.onFailure {
            val error = PlayerError.MediaLoadFailed(
                message = "Failed to load media: ${mediaItem.uri}",
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

    override suspend fun play(): Unit = mutex.withLock {
        val instance = checkInitialized()
        MpvCommands.play(instance).onFailure(::handleCommandFailure)
    }

    override suspend fun pause(): Unit = mutex.withLock {
        val instance = checkInitialized()
        MpvCommands.pause(instance).onFailure(::handleCommandFailure)
    }

    override suspend fun stop(): Unit = mutex.withLock {
        val instance = checkInitialized()
        MpvCommands.stop(instance).onFailure(::handleCommandFailure)
        _playbackState.value = PlaybackState.STOPPED
        _position.value = Duration.ZERO
    }

    override suspend fun seekTo(position: Duration): Unit = mutex.withLock {
        val instance = checkInitialized()
        val seconds = position.inWholeMilliseconds.toDouble() / 1000.0
        MpvCommands.seek(instance, seconds, "absolute").onFailure(::handleCommandFailure)
    }

    override suspend fun setVolume(volume: Float): Unit = mutex.withLock {
        val instance = checkInitialized()
        val clamped = volume.coerceIn(0f, 100f)
        MpvProperties.setDouble(instance, MpvProperties.VOLUME, clamped.toDouble())
            .onSuccess { _volume.value = clamped }
            .onFailure(::handleCommandFailure)
    }

    override suspend fun setPlaybackSpeed(speed: Float): Unit = mutex.withLock {
        val instance = checkInitialized()
        val clamped = speed.coerceIn(0.01f, 100f)
        MpvProperties.setDouble(instance, MpvProperties.SPEED, clamped.toDouble())
            .onSuccess { _playbackSpeed.value = clamped }
            .onFailure(::handleCommandFailure)
    }

    override suspend fun release(): Unit = mutex.withLock {
        _playbackState.value = PlaybackState.IDLE
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

    private fun handleMpvEvent(event: PlayerEvent) {
        _events.tryEmit(event)
        when (event) {
            is PlayerEvent.FileStarted -> {
                _playbackState.value = PlaybackState.LOADING
            }
            is PlayerEvent.FileLoaded -> {
                if (_playbackState.value == PlaybackState.LOADING) {
                    _playbackState.value = PlaybackState.PLAYING
                }
            }
            is PlayerEvent.FileEnded -> {
                _playbackState.value = PlaybackState.ENDED
                event.error?.let { _errors.tryEmit(it) }
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
                    } else if (!value && _playbackState.value == PlaybackState.PAUSED) {
                        _playbackState.value = PlaybackState.PLAYING
                    }
                }
            }
            MpvProperties.TIME_POS -> {
                if (value is Double) {
                    _position.value = value.seconds
                }
            }
            MpvProperties.DURATION -> {
                if (value is Double) {
                    _duration.value = value.seconds
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
}
