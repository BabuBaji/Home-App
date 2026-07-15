package com.homehelp.pro

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.layout.SubcomposeLayout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Density

private enum class FitSlot { Measure, Content }

/**
 * Lays [content] out so it always fits the available height — no scrolling, nothing clipped.
 *
 * The content is measured at its natural size, then, if it overflows, recomposed against a
 * proportionally smaller [Density] so every dp and sp shrinks by the same factor. Scaling the
 * density rather than drawing through a scaled graphics layer keeps text crisp, keeps touch
 * targets aligned with what's drawn, and lets rows re-wrap to the real screen width instead of
 * leaving bars down the side.
 *
 * Content is composed twice: an off-screen copy at natural density supplies the measurement that
 * the scale factor is derived from. Keep [content] free of side effects that shouldn't run twice
 * (network calls, analytics) — put those in the calling screen instead.
 */
@Composable
fun FitToScreen(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val density = LocalDensity.current
    SubcomposeLayout(modifier.clipToBounds()) { constraints ->
        val width = constraints.maxWidth
        val available = constraints.maxHeight
        // Fixed width, unbounded height: measures what the content actually wants vertically.
        val wanted = Constraints(minWidth = width, maxWidth = width)

        val natural = subcompose(FitSlot.Measure, content).map { it.measure(wanted) }
        val naturalHeight = natural.maxOfOrNull { it.height } ?: 0

        if (naturalHeight == 0 || naturalHeight <= available) {
            return@SubcomposeLayout layout(width, minOf(naturalHeight, available)) {
                natural.forEach { it.place(0, 0) }
            }
        }

        val scale = available.toFloat() / naturalHeight
        val scaled = subcompose(FitSlot.Content) {
            CompositionLocalProvider(
                LocalDensity provides Density(density.density * scale, density.fontScale),
            ) { content() }
        }.map { it.measure(wanted) }
        val scaledHeight = scaled.maxOfOrNull { it.height } ?: 0

        // Height rarely tracks density perfectly — text re-wraps, and minimum touch-target sizes
        // don't shrink. Any leftover overflow is absorbed by a graphics layer so the guarantee
        // holds even when the density pass lands slightly long.
        val residual = if (scaledHeight > available) available.toFloat() / scaledHeight else 1f
        layout(width, available) {
            scaled.forEach { placeable ->
                if (residual == 1f) {
                    placeable.place(0, 0)
                } else {
                    placeable.placeWithLayer(0, 0) {
                        scaleX = residual
                        scaleY = residual
                        transformOrigin = TransformOrigin(0f, 0f)
                    }
                }
            }
        }
    }
}
