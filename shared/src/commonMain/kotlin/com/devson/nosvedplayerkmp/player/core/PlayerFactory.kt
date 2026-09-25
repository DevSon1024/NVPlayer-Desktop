package com.devson.nosvedplayerkmp.player.core

import com.devson.nosvedplayerkmp.player.api.Player

/**
 * Creates the platform-specific [Player] implementation.
 *
 * - On JVM / Desktop (Windows), returns an mpv-backed player.
 * - On Android, returns the Android player implementation.
 */
expect fun createPlatformPlayer(): Player
