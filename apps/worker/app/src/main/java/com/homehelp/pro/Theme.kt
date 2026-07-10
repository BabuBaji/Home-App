package com.homehelp.pro

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// ─────────────────────────────────────────────────────────────────────────────
// HomeHelp Pro — enterprise design system.
//
// Brand identity (indigo-violet) is preserved so the app stays part of the
// HomeHelp customer/admin family; everything around it — neutrals, semantics,
// typography, shapes, spacing and elevation — is upgraded to a premium,
// enterprise-grade workforce look (Google / Deloitte / TCS class).
//
// All colour *names* are kept 100% stable: every screen references these tokens,
// so refining the values here recolours the whole app with zero layout changes.
// ─────────────────────────────────────────────────────────────────────────────

// ---- Brand (indigo-violet — unchanged hue, shared with customer & admin apps) ----
val Purple = Color(0xFF5B51E8)        // primary — indigo-violet
val PurpleDark = Color(0xFF4840C4)    // primary pressed / deep indigo (gradient end)
val PurpleMid = Color(0xFF7C6DF7)     // gradient light stop
val PurpleLight = Color(0xFFE7E3FD)   // primary tint — banners, indicators, nav pill
val Primary50 = Color(0xFFF4F3FE)     // faint violet tint — icon chips, selected surfaces

// ---- Accents ----
val Coral = Color(0xFFFF7A59)         // warm accent — highlights / promos
val CoralLight = Color(0xFFFFF1EC)    // coral tint

// ---- Semantic (enterprise spec) ----
val GreenSuccess = Color(0xFF22C55E)  // success / online / earnings
val GreenLight = Color(0xFFE7F8EF)    // success tint
val Gold = Color(0xFFF5B301)          // ratings gold
val Amber = Color(0xFFF59E0B)         // warning / pending
val GoldLight = Color(0xFFFEF3DA)     // amber tint
val RedCancel = Color(0xFFEF4444)     // error / destructive
val RedLight = Color(0xFFFDECEC)      // error tint

// ---- Neutrals (enterprise canvas: soft slate background, pure-white surfaces) ----
val ScreenBg = Color(0xFFF8FAFC)      // app background — soft slate so white cards float
val CardBg = Color(0xFFFFFFFF)        // surface — pure white
val TextDark = Color(0xFF111827)      // text primary — near-black slate ink
val TextGray = Color(0xFF6B7280)      // text secondary — muted slate
val TextMuted = Color(0xFF9CA3AF)     // text tertiary — captions / placeholders
val Divider = Color(0xFFE5E7EB)       // hairline borders / separators
val CardBorder = Color(0xFFEEF0F4)    // ultra-light card outline under soft shadows
val FieldFill = Color(0xFFF3F4F6)     // filled text-field / segmented-track background

// ---- Signature brand gradients (buttons, hero banners) ----
val BrandGradient = Brush.linearGradient(listOf(PurpleMid, Purple, PurpleDark))
val BrandGradientH = Brush.horizontalGradient(listOf(PurpleMid, PurpleDark))
val CoralGradient = Brush.linearGradient(listOf(Color(0xFFFF9472), Coral))

// ─────────────────────────────────────────────────────────────────────────────
// Spacing — consistent 8dp system. Use Space.* everywhere instead of raw dp so
// rhythm stays uniform across screens.
// ─────────────────────────────────────────────────────────────────────────────
object Space {
    val xs: Dp = 4.dp
    val s: Dp = 8.dp
    val m: Dp = 12.dp
    val l: Dp = 16.dp
    val xl: Dp = 20.dp
    val xxl: Dp = 24.dp
    val xxxl: Dp = 32.dp
}

// ─────────────────────────────────────────────────────────────────────────────
// Radii tokens — cards 18, buttons 14 (enterprise spec).
// ─────────────────────────────────────────────────────────────────────────────
object Radius {
    val field: Dp = 12.dp
    val button: Dp = 14.dp
    val card: Dp = 18.dp
    val sheet: Dp = 24.dp
    val pill: Dp = 50.dp
}

// ─────────────────────────────────────────────────────────────────────────────
// Typography — enterprise scale (Screen 28/Bold, Section 20/SemiBold, Body 16,
// Caption 13, Button 16/SemiBold). Mapped onto the M3 roles the framework uses.
// ─────────────────────────────────────────────────────────────────────────────
val AppTypography = Typography(
    // Screen title — 28 Bold
    headlineMedium = TextStyle(fontSize = 28.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.4).sp, color = TextDark),
    headlineSmall = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp, color = TextDark),
    // Section title — 20 SemiBold
    titleLarge = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.2).sp, color = TextDark),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = TextDark),
    titleSmall = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = TextDark),
    // Body — 16 / 14
    bodyLarge = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.Normal, lineHeight = 24.sp, color = TextDark),
    bodyMedium = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Normal, lineHeight = 20.sp, color = TextGray),
    // Caption — 13
    bodySmall = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Normal, lineHeight = 18.sp, color = TextGray),
    labelSmall = TextStyle(fontSize = 11.5.sp, fontWeight = FontWeight.Medium, color = TextGray),
    // Button — 16 SemiBold
    labelLarge = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.1.sp),
)

// M3 shapes — drives framework surfaces (dialogs, dropdown menus, date picker,
// menus, snackbars) so they inherit the enterprise rounding automatically.
val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(18.dp),
    extraLarge = RoundedCornerShape(24.dp),
)

private val Scheme = lightColorScheme(
    primary = Purple,
    onPrimary = Color.White,
    primaryContainer = PurpleLight,
    onPrimaryContainer = PurpleDark,
    secondary = Color(0xFF3B82F6),
    onSecondary = Color.White,
    tertiary = Gold,
    onTertiary = Color.White,
    background = ScreenBg,
    onBackground = TextDark,
    surface = CardBg,
    onSurface = TextDark,
    surfaceVariant = FieldFill,
    onSurfaceVariant = TextGray,
    error = RedCancel,
    onError = Color.White,
    errorContainer = RedLight,
    outline = Divider,
    outlineVariant = CardBorder,
)

@Composable
fun HomeHelpTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = Scheme,
        typography = AppTypography,
        shapes = AppShapes,
        content = content,
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// UI CHANGE LOG — Theme.kt
// UI improvements:
//  • Adopted the enterprise neutral canvas: soft-slate background (#F8FAFC) with
//    pure-white surfaces so cards visibly float (was flat pure-white on white).
//  • Refined text palette to slate ink (#111827 / #6B7280 / #9CA3AF) and semantic
//    colours to the spec (Success #22C55E, Warning #F59E0B, Error #EF4444).
//  • Added a full M3 Typography scale (Screen 28/Bold, Section 20/SemiBold,
//    Body 16, Caption 13, Button 16/SemiBold) and M3 Shapes so framework
//    surfaces (dialogs, dropdowns, date picker, menus) inherit enterprise rounding.
//  • Added Space (8dp system) and Radius (field 12 / button 14 / card 18) tokens.
//  • Brand indigo-violet primary preserved to stay consistent with the customer
//    & admin apps; every colour token NAME is unchanged.
// No functionality changed: this file defines colours, typography, shapes and
// spacing only — no business logic, API, navigation, or state.
// ─────────────────────────────────────────────────────────────────────────────
