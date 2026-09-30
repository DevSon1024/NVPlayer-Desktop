package com.devson.nosvedplayerkmp.ui.state

import com.devson.nosvedplayerkmp.player.api.Player
import com.devson.nosvedplayerkmp.player.model.PlaybackState
import com.devson.nosvedplayerkmp.player.mpv.render.AspectRatioMode
import com.devson.nosvedplayerkmp.ui.input.PlayerAction
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds

/**
 * ViewModel orchestrating presentation state and user actions for Nosved Player.
 *
 * Adheres strictly to the architectural hierarchy:
 * Compose UI -> PlayerViewModel -> Player API -> MpvPlayer -> libmpv
 */
class PlayerViewModel(
    val player: Player,
    parentScope: CoroutineScope = CoroutineScope(Dispatchers.Main + SupervisorJob()),
    private val onOpenFileRequested: () -> Unit = {}
) {
    private val viewModelJob = SupervisorJob(parentScope.coroutineContext[Job])
    private val scope = CoroutineScope(parentScope.coroutineContext + viewModelJob)

    private val _uiState = MutableStateFlow(PlayerUiState())
    val uiState: StateFlow<PlayerUiState> = _uiState.asStateFlow()

    private val _isSurfaceAttached = MutableStateFlow(false)
    val isSurfaceAttached: StateFlow<Boolean> = _isSurfaceAttached.asStateFlow()

    fun setSurfaceAttached(attached: Boolean) {
        _isSurfaceAttached.value = attached
    }

    fun prepareForPlayback(path: String, title: String? = null) {
        _uiState.update { current ->
            current.copy(
                mediaPath = path,
                mediaTitle = title ?: File(path).name,
                playbackState = PlaybackState.LOADING,
                errorMessage = null,
                errorDetails = null
            )
        }
    }

    private var autoHideJob: Job? = null

    init {
        observePlayerState()
    }

    private fun observePlayerState() {
        scope.launch {
            player.playbackState.collect { state ->
                _uiState.update { current ->
                    current.copy(
                        playbackState = state,
                        // Always keep controls visible when stopped, paused, ended, or in windowed mode
                        areControlsVisible = if (!current.isFullscreen || state != PlaybackState.PLAYING) true else current.areControlsVisible
                    )
                }
                if (state == PlaybackState.PLAYING && _uiState.value.isFullscreen) {
                    scheduleAutoHide()
                } else {
                    autoHideJob?.cancel()
                }
            }
        }

        scope.launch {
            player.position.collect { pos ->
                if (!_uiState.value.isScrubbing) {
                    _uiState.update { it.copy(position = pos) }
                }
            }
        }

        scope.launch {
            player.duration.collect { dur ->
                _uiState.update { it.copy(duration = dur) }
            }
        }

        scope.launch {
            player.progress.collect { prog ->
                if (!_uiState.value.isScrubbing) {
                    _uiState.update { it.copy(progress = prog) }
                }
            }
        }

        scope.launch {
            player.volume.collect { vol ->
                _uiState.update { current ->
                    val isMuted = vol <= 0.01f
                    current.copy(
                        volume = vol,
                        isMuted = isMuted,
                        lastUnmutedVolume = if (!isMuted) vol else current.lastUnmutedVolume
                    )
                }
            }
        }

        scope.launch {
            player.playbackSpeed.collect { spd ->
                _uiState.update { it.copy(speed = spd) }
            }
        }

        scope.launch {
            player.currentMediaItem.collect { media ->
                _uiState.update { current ->
                    current.copy(
                        mediaPath = media?.uri,
                        mediaTitle = media?.title ?: media?.uri?.let { File(it).name }
                    )
                }
            }
        }

        scope.launch {
            player.errors.collect { error ->
                _uiState.update { current ->
                    current.copy(
                        errorMessage = error.message,
                        errorDetails = error.cause?.localizedMessage ?: error.toString()
                    )
                }
            }
        }
    }

    /**
     * User activity event (mouse movement, interaction) that reveals controls and restarts auto-hide.
     */
    fun onUserActivity() {
        _uiState.update { it.copy(areControlsVisible = true) }
        if (_uiState.value.isFullscreen) {
            scheduleAutoHide()
        }
    }

    private fun scheduleAutoHide() {
        autoHideJob?.cancel()
        if (_uiState.value.isFullscreen && _uiState.value.playbackState == PlaybackState.PLAYING && !_uiState.value.isScrubbing) {
            autoHideJob = scope.launch {
                delay(2500)
                _uiState.update { it.copy(areControlsVisible = false) }
            }
        }
    }

    fun play() {
        scope.launch { player.play() }
    }

    fun pause() {
        scope.launch { player.pause() }
    }

    fun togglePlayPause() {
        scope.launch { player.togglePause() }
    }

    fun stop() {
        scope.launch { player.stop() }
    }

    fun seekRelative(seconds: Double) {
        scope.launch { player.seekRelative(seconds) }
    }

    fun onScrubStart(fraction: Float) {
        val totalMs = _uiState.value.duration.inWholeMilliseconds
        val targetMs = (fraction.coerceIn(0f, 1f) * totalMs).toLong()
        autoHideJob?.cancel()
        _uiState.update {
            it.copy(
                isScrubbing = true,
                areControlsVisible = true,
                scrubPosition = targetMs.milliseconds
            )
        }
    }

    fun onScrubMove(fraction: Float) {
        val totalMs = _uiState.value.duration.inWholeMilliseconds
        val targetMs = (fraction.coerceIn(0f, 1f) * totalMs).toLong()
        _uiState.update {
            it.copy(scrubPosition = targetMs.milliseconds)
        }
    }

    fun onScrubEnd(fraction: Float) {
        val totalMs = _uiState.value.duration.inWholeMilliseconds
        val targetMs = (fraction.coerceIn(0f, 1f) * totalMs).toLong()
        _uiState.update {
            it.copy(
                isScrubbing = false,
                position = targetMs.milliseconds
            )
        }
        scope.launch {
            player.seekTo(targetMs.milliseconds)
            if (_uiState.value.isFullscreen) {
                scheduleAutoHide()
            }
        }
    }

    fun setVolume(volume: Float) {
        val clamped = volume.coerceIn(0f, 100f)
        scope.launch { player.setVolume(clamped) }
    }

    fun adjustVolume(deltaPercent: Float) {
        val newVol = (_uiState.value.volume + deltaPercent).coerceIn(0f, 100f)
        setVolume(newVol)
        onUserActivity()
    }

    fun toggleMute() {
        val current = _uiState.value
        if (current.isMuted) {
            val restoreVol = if (current.lastUnmutedVolume > 0f) current.lastUnmutedVolume else 100f
            setVolume(restoreVol)
        } else {
            setVolume(0f)
        }
        onUserActivity()
    }

    fun setSpeed(speed: Float) {
        scope.launch { player.setPlaybackSpeed(speed) }
        onUserActivity()
    }

    fun stepSpeed(increase: Boolean) {
        val speeds = _uiState.value.supportedSpeeds
        val currentSpeed = _uiState.value.speed
        val currentIndex = speeds.indexOfFirst { kotlin.math.abs(it - currentSpeed) < 0.05f }
        val targetIndex = if (currentIndex >= 0) {
            if (increase) (currentIndex + 1).coerceAtMost(speeds.size - 1)
            else (currentIndex - 1).coerceAtLeast(0)
        } else {
            if (increase) speeds.indexOfFirst { it > currentSpeed }.takeIf { it >= 0 } ?: (speeds.size - 1)
            else speeds.indexOfLast { it < currentSpeed }.takeIf { it >= 0 } ?: 0
        }
        setSpeed(speeds[targetIndex])
    }

    fun setAspectRatio(mode: AspectRatioMode) {
        _uiState.update { it.copy(aspectRatioMode = mode) }
        onUserActivity()
    }

    fun toggleFullscreen() {
        val willBeFullscreen = !_uiState.value.isFullscreen
        _uiState.update {
            it.copy(
                isFullscreen = willBeFullscreen,
                areControlsVisible = true
            )
        }
        if (willBeFullscreen) {
            scheduleAutoHide()
        } else {
            autoHideJob?.cancel()
        }
    }

    fun exitFullscreen() {
        if (_uiState.value.isFullscreen) {
            autoHideJob?.cancel()
            _uiState.update {
                it.copy(
                    isFullscreen = false,
                    areControlsVisible = true
                )
            }
        }
    }

    fun openFile(path: String) {
        scope.launch {
            _uiState.update { it.copy(errorMessage = null, errorDetails = null) }
            prepareForPlayback(path)
            if (player.requiresNativeSurface && !_isSurfaceAttached.value) {
                withTimeoutOrNull(5000) {
                    _isSurfaceAttached.first { it }
                }
            }
            try {
                player.load(path, autoPlay = true)
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        errorMessage = "Failed to load media file: ${e.message}",
                        errorDetails = e.localizedMessage
                    )
                }
            }
        }
    }

    fun requestOpenFile() {
        onOpenFileRequested()
    }

    fun dismissError() {
        _uiState.update { it.copy(errorMessage = null, errorDetails = null) }
    }

    /**
     * Dispatches any [PlayerAction] to the appropriate ViewModel method.
     */
    fun dispatchAction(action: PlayerAction) {
        when (action) {
            PlayerAction.Play -> play()
            PlayerAction.Pause -> pause()
            PlayerAction.TogglePlayPause -> togglePlayPause()
            PlayerAction.Stop -> stop()
            is PlayerAction.SeekRelative -> seekRelative(action.seconds)
            is PlayerAction.AdjustVolume -> adjustVolume(action.deltaPercent)
            PlayerAction.ToggleMute -> toggleMute()
            PlayerAction.ToggleFullscreen -> toggleFullscreen()
            PlayerAction.ExitFullscreen -> exitFullscreen()
            PlayerAction.StepSpeedUp -> stepSpeed(increase = true)
            PlayerAction.StepSpeedDown -> stepSpeed(increase = false)
            PlayerAction.OpenFile -> requestOpenFile()
            PlayerAction.ToggleControls -> {
                _uiState.update { it.copy(areControlsVisible = !it.areControlsVisible) }
                if (_uiState.value.isFullscreen && _uiState.value.areControlsVisible) {
                    scheduleAutoHide()
                } else if (!_uiState.value.areControlsVisible) {
                    autoHideJob?.cancel()
                }
            }
        }
    }

    fun release() {
        autoHideJob?.cancel()
        viewModelJob.cancel()
    }
}
