package com.devson.nosvedplayerkmp.ui.input

/**
 * High-level user actions dispatched by UI controls, mouse gestures, or keyboard shortcuts.
 *
 * This layer decouples player interactions from specific keyboard keys or UI widgets,
 * enabling customizable keymaps and uniform action routing.
 */
sealed interface PlayerAction {
    data object TogglePlayPause : PlayerAction
    data object Play : PlayerAction
    data object Pause : PlayerAction
    data object Stop : PlayerAction

    data class SeekRelative(val seconds: Double) : PlayerAction
    data class AdjustVolume(val deltaPercent: Float) : PlayerAction

    data object ToggleMute : PlayerAction
    data object ToggleFullscreen : PlayerAction
    data object ExitFullscreen : PlayerAction

    data object StepSpeedUp : PlayerAction
    data object StepSpeedDown : PlayerAction

    data object OpenFile : PlayerAction
    data object ToggleControls : PlayerAction
}
