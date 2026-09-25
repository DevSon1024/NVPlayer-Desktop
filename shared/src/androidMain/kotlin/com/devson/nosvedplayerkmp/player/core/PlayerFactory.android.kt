package com.devson.nosvedplayerkmp.player.core

import com.devson.nosvedplayerkmp.player.api.Player
import com.devson.nosvedplayerkmp.player.mpv.AndroidMpvPlayer

actual fun createPlatformPlayer(): Player = AndroidMpvPlayer()
