package com.devson.nosvedplayerkmp.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.onPointerEvent
import androidx.compose.ui.input.pointer.pointerInput
import com.devson.nosvedplayerkmp.player.api.Player
import com.devson.nosvedplayerkmp.player.mpv.render.AspectRatioMode
import com.devson.nosvedplayerkmp.ui.VideoSurface

/**
 * Dedicated container for the video rendering surface.
 *
 * Handles mouse interactions:
 * - Single click: toggle play/pause
 * - Double click: toggle fullscreen
 * - Mouse movement: wake controls and reset auto-hide
 * - Mouse scroll wheel: adjust volume
 */
@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun VideoSurfaceContainer(
    player: Player,
    aspectRatioMode: AspectRatioMode,
    onSingleClick: () -> Unit,
    onDoubleClick: () -> Unit,
    onMouseMove: () -> Unit,
    onMouseWheel: (Float) -> Unit,
    onSurfaceAttached: (Boolean) -> Unit = {},
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
            .onPointerEvent(PointerEventType.Move) {
                onMouseMove()
            }
            .onPointerEvent(PointerEventType.Scroll) { event ->
                val deltaY = event.changes.firstOrNull()?.scrollDelta?.y ?: 0f
                if (deltaY != 0f) {
                    onMouseWheel(-deltaY * 5f)
                }
            }
            .pointerInput(Unit) {
                detectTapGestures(
                    onDoubleTap = {
                        onDoubleClick()
                    },
                    onTap = {
                        onSingleClick()
                    }
                )
            }
    ) {
        VideoSurface(
            player = player,
            aspectRatioMode = aspectRatioMode,
            onSurfaceAttached = onSurfaceAttached,
            onSingleClick = onSingleClick,
            onDoubleClick = onDoubleClick,
            onMouseMove = onMouseMove,
            onMouseWheel = onMouseWheel,
            modifier = Modifier.fillMaxSize()
        )
    }
}
