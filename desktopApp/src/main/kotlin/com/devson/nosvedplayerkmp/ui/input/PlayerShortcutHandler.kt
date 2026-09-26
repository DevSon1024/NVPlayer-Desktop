package com.devson.nosvedplayerkmp.ui.input

import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.type

/**
 * Handles keyboard shortcuts and translates Compose [KeyEvent]s into high-level [PlayerAction]s.
 *
 * Configurable via [keyMap] so keyboard shortcuts can be customized in future phases.
 */
class PlayerShortcutHandler(
    customKeyMap: Map<Key, PlayerAction>? = null
) {
    private val keyMap: Map<Key, PlayerAction> = customKeyMap ?: defaultKeyBindings

    /**
     * Resolves a [Key] directly with modifier status to a [PlayerAction].
     */
    fun handleKey(key: Key, isCtrlPressed: Boolean = false): PlayerAction? {
        if (isCtrlPressed && key == Key.O) {
            return PlayerAction.OpenFile
        }
        return keyMap[key]
    }

    /**
     * Attempts to resolve a [KeyEvent] to a corresponding [PlayerAction].
     * Returns null if no action is bound or if the event is not a key press.
     */
    fun handleKeyEvent(event: KeyEvent): PlayerAction? {
        if (event.type != KeyEventType.KeyDown) {
            return null
        }
        return handleKey(event.key, event.isCtrlPressed)
    }

    companion object {
        /**
         * Default shortcut bindings adhering to standard media player conventions:
         * - Space: Play / Pause toggle
         * - Left Arrow: -10s seek
         * - Right Arrow: +10s seek
         * - Up Arrow: +5% volume
         * - Down Arrow: -5% volume
         * - M: Toggle mute
         * - F: Toggle fullscreen
         * - F11: Toggle fullscreen
         * - Esc: Exit fullscreen
         * - [: Decrease playback speed
         * - ]: Increase playback speed
         */
        val defaultKeyBindings: Map<Key, PlayerAction> = mapOf(
            Key.Spacebar to PlayerAction.TogglePlayPause,
            Key.DirectionLeft to PlayerAction.SeekRelative(-10.0),
            Key.DirectionRight to PlayerAction.SeekRelative(10.0),
            Key.DirectionUp to PlayerAction.AdjustVolume(5.0f),
            Key.DirectionDown to PlayerAction.AdjustVolume(-5.0f),
            Key.M to PlayerAction.ToggleMute,
            Key.F to PlayerAction.ToggleFullscreen,
            Key.F11 to PlayerAction.ToggleFullscreen,
            Key.Escape to PlayerAction.ExitFullscreen,
            Key.LeftBracket to PlayerAction.StepSpeedDown,
            Key.RightBracket to PlayerAction.StepSpeedUp
        )
    }
}
