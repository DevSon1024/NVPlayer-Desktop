package com.devson.nosvedplayerkmp.player.mpv

import com.devson.nosvedplayerkmp.player.api.Player
import com.devson.nosvedplayerkmp.player.model.MediaItem
import com.devson.nosvedplayerkmp.player.model.PlaybackState
import com.devson.nosvedplayerkmp.player.model.PlayerError
import com.devson.nosvedplayerkmp.player.model.PlayerEvent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.time.Duration

/**
 * Placeholder player implementation for Android target.
 * Full Android mpv integration will be implemented in subsequent phases.
 */
class AndroidMpvPlayer : Player {
    private val _playbackState = MutableStateFlow(PlaybackState.IDLE)
    override val playbackState: StateFlow<PlaybackState> = _playbackState.asStateFlow()

    private val _position = MutableStateFlow(Duration.ZERO)
    override val position: StateFlow<Duration> = _position.asStateFlow()

    private val _duration = MutableStateFlow(Duration.ZERO)
    override val duration: StateFlow<Duration> = _duration.asStateFlow()

    private val _volume = MutableStateFlow(100f)
    override val volume: StateFlow<Float> = _volume.asStateFlow()

    private val _playbackSpeed = MutableStateFlow(1f)
    override val playbackSpeed: StateFlow<Float> = _playbackSpeed.asStateFlow()

    private val _errors = MutableSharedFlow<PlayerError>()
    override val errors: Flow<PlayerError> = _errors.asSharedFlow()

    private val _events = MutableSharedFlow<PlayerEvent>()
    override val events: Flow<PlayerEvent> = _events.asSharedFlow()

    override suspend fun initialize() {
        // Stub for Phase 0
    }

    override suspend fun loadMedia(mediaItem: MediaItem, autoPlay: Boolean) {
        throw UnsupportedOperationException("Android player is not implemented in Phase 0")
    }

    override suspend fun play() {}

    override suspend fun pause() {}

    override suspend fun stop() {}

    override suspend fun seekTo(position: Duration) {}

    override suspend fun setVolume(volume: Float) {
        _volume.value = volume
    }

    override suspend fun setPlaybackSpeed(speed: Float) {
        _playbackSpeed.value = speed
    }

    override suspend fun release() {}
}
