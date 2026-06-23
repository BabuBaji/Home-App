package com.homehelp.pro

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Purple = Color(0xFF4A26C9)
val PurpleDark = Color(0xFF3A1E9E)
val PurpleLight = Color(0xFFEDE9FB)
val GreenSuccess = Color(0xFF2E9E5B)
val GreenLight = Color(0xFFE6F6EC)
val Gold = Color(0xFFFFB400)
val ScreenBg = Color(0xFFF5F5F8)
val CardBg = Color(0xFFFFFFFF)
val TextDark = Color(0xFF1C1B2E)
val TextGray = Color(0xFF8A8A9E)
val RedCancel = Color(0xFFE53935)
val Divider = Color(0xFFEDEDF2)

private val Scheme = lightColorScheme(
    primary = Purple,
    onPrimary = Color.White,
    secondary = GreenSuccess,
    background = ScreenBg,
    onBackground = TextDark,
    surface = CardBg,
    onSurface = TextDark,
)

@Composable
fun HomeHelpTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Scheme, content = content)
}
