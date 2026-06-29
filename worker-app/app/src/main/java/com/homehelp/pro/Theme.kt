package com.homehelp.pro

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Advanced Light Premium palette — indigo-violet brand on white, matching the customer & admin
// apps. Names kept stable so every screen recolors in place (no layout/flow changes).
val Purple = Color(0xFF5B51E8)        // primary — indigo-violet
val PurpleDark = Color(0xFF4840C4)    // primary pressed / dark indigo
val PurpleLight = Color(0xFFE7E3FD)   // primary tint — banners, indicators (light violet)
val GreenSuccess = Color(0xFF16A34A)  // success / online
val GreenLight = Color(0xFFE7F7EE)    // success tint
val Gold = Color(0xFFF59E0B)          // accent — amber (ratings, pending, warnings)
val ScreenBg = Color(0xFFFFFFFF)      // app background — pure white
val CardBg = Color(0xFFFFFFFF)
val TextDark = Color(0xFF14152B)      // headings — near-black navy ink
val TextGray = Color(0xFF6E6E76)      // secondary text — muted
val RedCancel = Color(0xFFE23B3B)
val Divider = Color(0xFFECECED)       // hairline borders / separators

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
