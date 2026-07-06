package com.homehelp.pro

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

// Advanced Light Premium palette — indigo-violet brand on a soft off-white, matching the customer
// & admin apps. Names kept stable so every screen recolors in place (no layout/flow changes).
val Purple = Color(0xFF5B51E8)        // primary — indigo-violet
val PurpleDark = Color(0xFF4840C4)    // primary pressed / deep indigo (gradient end)
val PurpleMid = Color(0xFF7C6DF7)     // gradient light stop
val PurpleLight = Color(0xFFE7E3FD)   // primary tint — banners, indicators
val Primary50 = Color(0xFFF4F3FE)     // faint violet tint — icon chips, selected surfaces
val Coral = Color(0xFFFF7A59)         // warm accent (customer-app coral) — highlights/CTAs
val CoralLight = Color(0xFFFFF1EC)    // coral tint (--accent-bg)
val GreenSuccess = Color(0xFF16A34A)  // success / online / earnings
val GreenLight = Color(0xFFE7F7EE)    // success tint
val Gold = Color(0xFFF5B301)          // ratings gold (--amber)
val Amber = Color(0xFFF59E0B)         // pending / warnings
val GoldLight = Color(0xFFFDF3DC)     // amber tint
val ScreenBg = Color(0xFFFFFFFF)      // app background — pure white (Advanced Light Premium)
val CardBg = Color(0xFFFFFFFF)
val TextDark = Color(0xFF14152B)      // headings — near-black indigo ink
val TextGray = Color(0xFF6B6E84)      // secondary text — muted
val TextMuted = Color(0xFF9A9CB2)     // tertiary text — captions / placeholders
val RedCancel = Color(0xFFE23B3B)
val RedLight = Color(0xFFFDEAEA)
val Divider = Color(0xFFECECF3)       // hairline borders / separators (--line)
val CardBorder = Color(0xFFF0F0F6)    // ultra-light card outline under soft shadows

// Signature brand gradients — light violet → brand → deep indigo (buttons, hero banners).
val BrandGradient = Brush.linearGradient(listOf(PurpleMid, Purple, PurpleDark))
val BrandGradientH = Brush.horizontalGradient(listOf(PurpleMid, PurpleDark))
// Warm coral gradient for spotlight tiles / promos.
val CoralGradient = Brush.linearGradient(listOf(Color(0xFFFF9472), Coral))

private val Scheme = lightColorScheme(
    primary = Purple,
    onPrimary = Color.White,
    primaryContainer = PurpleLight,
    onPrimaryContainer = PurpleDark,
    secondary = GreenSuccess,
    onSecondary = Color.White,
    tertiary = Gold,
    onTertiary = Color.White,
    background = ScreenBg,
    onBackground = TextDark,
    surface = CardBg,
    onSurface = TextDark,
    outline = Divider,
)

@Composable
fun HomeHelpTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Scheme, content = content)
}
