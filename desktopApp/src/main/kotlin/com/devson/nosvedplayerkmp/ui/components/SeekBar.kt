package com.devson.nosvedplayerkmp.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerInputChange
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.time.Duration

/**
 * Modern Material 3 scrub bar supporting drag-to-seek, click-to-seek,
 * dynamic hover track expansion, and prominent auto-hiding thumb.
 */
@Composable
fun SeekBar(
    position: Duration,
    duration: Duration,
    progress: Float,
    enabled: Boolean,
    isScrubbing: Boolean,
    onScrubStart: (Float) -> Unit,
    onScrubMove: (Float) -> Unit,
    onScrubEnd: (Float) -> Unit,
    modifier: Modifier = Modifier
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isHovered by interactionSource.collectIsHoveredAsState()

    val isInteractive = isHovered || isScrubbing

    val trackHeight by animateDpAsState(
        targetValue = if (isInteractive) 6.dp else 3.5.dp,
        animationSpec = tween(durationMillis = 180, easing = FastOutSlowInEasing),
        label = "seekBarTrackHeight"
    )
    val thumbRadius by animateDpAsState(
        targetValue = if (isInteractive) 8.dp else 0.dp,
        animationSpec = tween(durationMillis = 180, easing = FastOutSlowInEasing),
        label = "seekBarThumbRadius"
    )

    var widthPx by remember { mutableStateOf(1f) }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(28.dp)
                .hoverable(interactionSource)
                .pointerInput(enabled) {
                    if (!enabled) return@pointerInput
                    detectTapGestures { offset ->
                        val fraction = (offset.x / size.width.toFloat()).coerceIn(0f, 1f)
                        onScrubStart(fraction)
                        onScrubEnd(fraction)
                    }
                }
                .pointerInput(enabled) {
                    if (!enabled) return@pointerInput
                    detectDragGestures(
                        onDragStart = { offset ->
                            val fraction = (offset.x / size.width.toFloat()).coerceIn(0f, 1f)
                            onScrubStart(fraction)
                        },
                        onDrag = { change: PointerInputChange, _ ->
                            change.consume()
                            val fraction = (change.position.x / size.width.toFloat()).coerceIn(0f, 1f)
                            onScrubMove(fraction)
                        },
                        onDragEnd = {
                            val fraction = progress.coerceIn(0f, 1f)
                            onScrubEnd(fraction)
                        },
                        onDragCancel = {
                            val fraction = progress.coerceIn(0f, 1f)
                            onScrubEnd(fraction)
                        }
                    )
                },
            contentAlignment = Alignment.Center
        ) {
            Canvas(modifier = Modifier.fillMaxWidth().height(28.dp)) {
                widthPx = size.width
                val centerY = size.height / 2f
                val h = trackHeight.toPx()
                val radiusPx = thumbRadius.toPx()

                // Background track
                drawRoundRect(
                    color = if (enabled) PlayerTheme.SliderTrackInactive else Color(0xFF22222E),
                    topLeft = Offset(0f, centerY - h / 2f),
                    size = Size(size.width, h),
                    cornerRadius = CornerRadius(h / 2f, h / 2f)
                )

                // Filled progress track
                val filledWidth = (progress.coerceIn(0f, 1f) * size.width).coerceAtLeast(0f)
                if (filledWidth > 0f) {
                    drawRoundRect(
                        color = if (enabled) PlayerTheme.SliderTrackActive else Color(0xFF4A4A58),
                        topLeft = Offset(0f, centerY - h / 2f),
                        size = Size(filledWidth, h),
                        cornerRadius = CornerRadius(h / 2f, h / 2f)
                    )
                }

                // Prominent Material 3 Thumb (only visible on hover or drag)
                if (enabled && radiusPx > 0.5f) {
                    val thumbX = filledWidth.coerceIn(radiusPx, size.width - radiusPx)
                    // Halo / glow
                    drawCircle(
                        color = PlayerTheme.PrimaryAccent.copy(alpha = 0.35f),
                        radius = radiusPx + 4.dp.toPx(),
                        center = Offset(thumbX, centerY)
                    )
                    // Thumb ring
                    drawCircle(
                        color = PlayerTheme.PrimaryAccent,
                        radius = radiusPx,
                        center = Offset(thumbX, centerY)
                    )
                    // Solid center core
                    drawCircle(
                        color = PlayerTheme.SliderThumb,
                        radius = (radiusPx - 2.5.dp.toPx()).coerceAtLeast(1.5.dp.toPx()),
                        center = Offset(thumbX, centerY)
                    )
                }
            }
        }

        // Time labels: Position / Duration
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 2.dp, vertical = 2.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = formatDuration(position),
                color = if (enabled) PlayerTheme.TextPrimary else PlayerTheme.TextTertiary,
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium
            )
            Text(
                text = formatDuration(duration),
                color = if (enabled) PlayerTheme.TextSecondary else PlayerTheme.TextTertiary,
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium
            )
        }
    }
}

private fun formatDuration(duration: Duration): String {
    val totalSeconds = duration.inWholeSeconds.coerceAtLeast(0)
    val hours = totalSeconds / 3600
    val minutes = (totalSeconds % 3600) / 60
    val seconds = totalSeconds % 60

    return if (hours > 0) {
        "%02d:%02d:%02d".format(hours, minutes, seconds)
    } else {
        "%02d:%02d".format(minutes, seconds)
    }
}
