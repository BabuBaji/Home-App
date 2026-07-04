package com.homehelp.pro

import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** White rounded card container with a hairline border (flat, professional). */
@Composable
fun Card(modifier: Modifier = Modifier, padding: Dp16 = Dp16.M, content: @Composable () -> Unit) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Divider),
        shadowElevation = 0.dp,
    ) {
        Column(Modifier.padding(padding.value)) { content() }
    }
}

enum class Dp16(val value: androidx.compose.ui.unit.Dp) { S(12.dp), M(16.dp) }

/** Simple top header with optional back button and a hairline separator below. */
@Composable
fun Header(title: String, onBack: (() -> Unit)? = null, trailing: (@Composable () -> Unit)? = null) {
    Column(Modifier.fillMaxWidth().background(Color.White)) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (onBack != null) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back",
                    tint = TextDark,
                    modifier = Modifier.size(24.dp).clickable { onBack() },
                )
                Spacer(Modifier.width(12.dp))
            }
            Text(title, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = TextDark, modifier = Modifier.weight(1f))
            if (trailing != null) trailing() else Spacer(Modifier.width(24.dp))
        }
        HairlineDivider()
    }
}

/** 1px hairline divider used to separate surfaces on the white UI. */
@Composable
fun HairlineDivider(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(1.dp).background(Divider))
}

@Composable
fun BellHeader(title: String) {
    Header(title, trailing = {
        Icon(Icons.Filled.Notifications, contentDescription = "Alerts", tint = TextDark, modifier = Modifier.size(22.dp))
    })
}

@Composable
fun PrimaryButton(text: String, modifier: Modifier = Modifier, enabled: Boolean = true, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.fillMaxWidth().height(52.dp),
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Purple, contentColor = Color.White),
    ) {
        Text(text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun OutlineButton(text: String, modifier: Modifier = Modifier, color: Color = Purple, onClick: () -> Unit) {
    Surface(
        modifier = modifier.height(52.dp).clickable { onClick() },
        shape = RoundedCornerShape(12.dp),
        color = Color.White,
        border = BorderStroke(1.5.dp, color),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(text, color = color, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

/**
 * iOS-style segmented control: a light track with a white "pill" marking the selection.
 * Cleaner and more aligned than loose buttons, and can show a live count per segment.
 */
@Composable
fun SegmentedTabs(
    options: List<String>,
    selected: String,
    modifier: Modifier = Modifier,
    counts: Map<String, Int>? = null,
    onSelect: (String) -> Unit,
) {
    Surface(modifier = modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), color = Color(0xFFF2F2F5)) {
        Row(Modifier.padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            options.forEach { opt ->
                val isSel = opt == selected
                val label = counts?.get(opt)?.let { "$opt ($it)" } ?: opt
                Surface(
                    modifier = Modifier.weight(1f).height(38.dp).clickable { onSelect(opt) },
                    shape = RoundedCornerShape(9.dp),
                    color = if (isSel) Color.White else Color.Transparent,
                    shadowElevation = if (isSel) 1.dp else 0.dp,
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            label,
                            color = if (isSel) Purple else TextGray,
                            fontWeight = if (isSel) FontWeight.SemiBold else FontWeight.Medium,
                            fontSize = 13.sp,
                        )
                    }
                }
            }
        }
    }
}

/** Friendly centered empty-state placeholder for filtered lists with no results. */
@Composable
fun EmptyState(emoji: String, title: String, subtitle: String) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 56.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(emoji, fontSize = 40.sp)
        Spacer(Modifier.height(10.dp))
        Text(title, fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 16.sp)
        Spacer(Modifier.height(4.dp))
        Text(subtitle, color = TextGray, fontSize = 13.sp, textAlign = TextAlign.Center)
    }
}

/** Rounded, flat progress bar for goals/tier progress on the white UI. */
@Composable
fun ProgressBar(progress: Float, modifier: Modifier = Modifier, track: Color = Divider, fill: Color = Purple, height: Int = 8) {
    val p = progress.coerceIn(0f, 1f)
    Box(modifier.fillMaxWidth().height(height.dp).clip(RoundedCornerShape(50)).background(track)) {
        Box(Modifier.fillMaxWidth(p).height(height.dp).clip(RoundedCornerShape(50)).background(fill))
    }
}

/** Earned performance-tier chip (Bronze/Silver/Gold/Platinum) with its own accent tint. */
@Composable
fun TierBadge(tier: WorkerTier, modifier: Modifier = Modifier) {
    val fg = when (tier) {
        WorkerTier.BRONZE -> Color(0xFF9A6B3F)
        WorkerTier.SILVER -> Color(0xFF6E7787)
        WorkerTier.GOLD -> Color(0xFFB7791F)
        WorkerTier.PLATINUM -> Purple
    }
    val bg = when (tier) {
        WorkerTier.BRONZE -> Color(0xFFF4EBE1)
        WorkerTier.SILVER -> Color(0xFFEEF0F3)
        WorkerTier.GOLD -> Color(0xFFFDF3DC)
        WorkerTier.PLATINUM -> PurpleLight
    }
    Surface(shape = RoundedCornerShape(50), color = bg, modifier = modifier) {
        Row(
            Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(tier.emoji, fontSize = 12.sp)
            Spacer(Modifier.width(5.dp))
            Text("${tier.label} Partner", color = fg, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
fun StatusPill(text: String, bg: Color, fg: Color) {
    Surface(shape = RoundedCornerShape(50), color = bg) {
        Text(text, color = fg, fontSize = 11.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp))
    }
}

@Composable
fun RatingStars(rating: Double, size: Int = 14) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Filled.Star, contentDescription = null, tint = Gold, modifier = Modifier.size(size.dp))
        Spacer(Modifier.width(2.dp))
        Text(rating.toString(), fontSize = (size - 1).sp, fontWeight = FontWeight.SemiBold, color = TextDark)
    }
}

@Composable
fun LabeledRow(label: String, value: String, valueColor: Color = TextDark) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = TextGray, fontSize = 14.sp)
        Text(value, color = valueColor, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun Avatar(initials: String, size: Int = 44, bg: Color = PurpleLight, fg: Color = Purple) {
    Box(
        Modifier.size(size.dp).clip(RoundedCornerShape(50)).background(bg),
        contentAlignment = Alignment.Center,
    ) {
        Text(initials, color = fg, fontWeight = FontWeight.Bold, fontSize = (size / 2.6).sp)
    }
}

@Composable
fun SectionTitle(text: String) {
    Text(text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = TextDark, modifier = Modifier.padding(vertical = 4.dp))
}

fun toast(context: Context, message: String) {
    Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
}
