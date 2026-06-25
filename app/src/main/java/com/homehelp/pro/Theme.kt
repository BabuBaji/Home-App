package com.homehelp.pro

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Clean white professional palette with a teal brand accent.
// Names kept stable so every screen recolors in place.
val Purple = Color(0xFF0E9F8E)        // primary — teal
val PurpleDark = Color(0xFF0B7E70)    // primary pressed / dark teal
val PurpleLight = Color(0xFFEAF6F4)   // primary tint — banners, indicators (very light teal)
val GreenSuccess = Color(0xFF15A06B)  // success / online — emerald
val GreenLight = Color(0xFFEAF7F0)    // success tint
val Gold = Color(0xFFE0A106)          // accent — amber (ratings, pending, warnings)
val ScreenBg = Color(0xFFFFFFFF)      // app background — pure white
val CardBg = Color(0xFFFFFFFF)
val TextDark = Color(0xFF111827)      // headings — neutral near-black slate
val TextGray = Color(0xFF6B7280)      // secondary text — neutral slate
val RedCancel = Color(0xFFDC2626)
val Divider = Color(0xFFE7EAEE)       // hairline borders / separators

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
