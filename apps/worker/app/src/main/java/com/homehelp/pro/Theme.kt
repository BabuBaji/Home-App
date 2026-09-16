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

// ---- Brand (indigo → violet — exact premium spec) ----
val Purple = Color(0xFF5B3DF5)        // primary — brand violet (#5B3DF5)
val PurpleDark = Color(0xFF4A2FD6)    // primary pressed / deep violet
val PurpleMid = Color(0xFF6D52F8)     // secondary / gradient middle stop (#6D52F8)
val Violet = Color(0xFF7C3AED)        // brand violet — gradient end (#7C3AED)
val VioletDeep = Color(0xFF5B21B6)    // deep violet — layered accents
val IndigoNight = Color(0xFF312E81)   // dark indigo — hero depth / overlays
val PurpleLight = Color(0xFFE7E5FB)   // primary tint — banners, indicators, nav pill
val Primary50 = Color(0xFFF3F3FE)
// 2_job.png draws the ACTIVE job card on a faint lavender wash with a violet hairline, so it
// reads as "this is the live one" against the plain white cards below it. Sampled from the mock.
val ActiveJobTint = Color(0xFFFAF7FE)
val ActiveJobBorder = Color(0x2E6D28D9)     // faint violet tint — icon chips, selected surfaces

// ---- Accents ----
val Coral = Color(0xFFFF7A59)         // warm accent — highlights / promos
val CoralLight = Color(0xFFFFF1EC)    // coral tint

// ---- Semantic (enterprise spec) ----
val GreenSuccess = Color(0xFF22C55E)  // success / online / earnings
val GreenLight = Color(0xFFE7F8EF)    // success tint
val Gold = Color(0xFFF5B301)          // ratings gold
val Amber = Color(0xFFF59E0B)         // warning / pending
val GoldLight = Color(0xFFFEF3DA)     // amber tint
val BlueAccent = Color(0xFF2563EB)    // wallet / balance accent
val BlueAccentLight = Color(0xFFE8F0FE) // wallet tint
val RedCancel = Color(0xFFEF4444)     // error / destructive
val RedLight = Color(0xFFFDECEC)      // error tint

// ---- Neutrals (enterprise canvas: soft slate background, pure-white surfaces) ----
val ScreenBg = Color(0xFFF8FAFC)      // app background — soft slate so white cards float
val CardBg = Color(0xFFFFFFFF)        // surface — pure white
// Secondary/tertiary ink sits one slate step darker than stock: Home fits itself to the
// viewport by scaling down (see FitToScreen), so labels render well under their nominal size
// and the lighter greys went faint on-device.
val TextDark = Color(0xFF0F172A)      // text primary — near-black slate ink
val TextGray = Color(0xFF64748B)      // text secondary — slate (never used for key figures)
val TextMuted = Color(0xFF64748B)     // text tertiary — captions / placeholders
val Divider = Color(0xFFE5E7EB)       // hairline borders / separators
val CardBorder = Color(0xFFEEF0F4)    // ultra-light card outline under soft shadows
val FieldFill = Color(0xFFF3F4F6)     // filled text-field / segmented-track background

// ---- Signature brand gradients (buttons, hero banners) — exact indigo→violet spec ----
// #4F46E5 → #6366F1 → #7C3AED
val BrandGradient = Brush.linearGradient(listOf(Purple, PurpleMid, Violet))

// The 1_home earnings hero: a deep, saturated violet sampled straight from the design —
// top-left #632BDA → bottom-right #4F21BC. Kept separate from BrandGradient, which is a lighter
// indigo-leaning blend (G≈71–98 vs the design's G≈33–58) and reads as a different brand colour.
val EarningsGradient = Brush.linearGradient(
    listOf(Color(0xFF632BDA), Color(0xFF5525C6), Color(0xFF4F21BC)),
)
val BrandGradientH = Brush.horizontalGradient(listOf(Purple, Violet))
// Deeper, layered hero gradient (dark indigo → indigo → violet) for premium depth.
val HeroGradient = Brush.linearGradient(listOf(IndigoNight, Purple, Violet))
val VioletGradient = Brush.linearGradient(listOf(PurpleMid, Violet))
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
    val button: Dp = 18.dp
    val card: Dp = 24.dp
    val sheet: Dp = 24.dp
    val pill: Dp = 50.dp
}

// ─────────────────────────────────────────────────────────────────────────────
// Typography — enterprise scale (Screen 28/Bold, Section 20/SemiBold, Body 16,
// Caption 13, Button 16/SemiBold). Mapped onto the M3 roles the framework uses.
// ─────────────────────────────────────────────────────────────────────────────
// Only three weights are used anywhere in the app — Bold for figures and screen titles,
// SemiBold for section titles and buttons, Regular for everything else. Medium was the fourth
// weight in the old scale and read as "almost bold" beside SemiBold, which is what made the
// hierarchy look inconsistent rather than deliberate.
val AppTypography = Typography(
    // Screen title — 32 Bold
    headlineMedium = TextStyle(fontSize = 32.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.6).sp, color = TextDark),
    headlineSmall = TextStyle(fontSize = 26.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.4).sp, color = TextDark),
    // Section title — 22 SemiBold
    titleLarge = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.2).sp, color = TextDark),
    titleMedium = TextStyle(fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = TextDark),
    titleSmall = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = TextDark),
    // Body — 15
    bodyLarge = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.Normal, lineHeight = 24.sp, color = TextDark),
    bodyMedium = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.Normal, lineHeight = 21.sp, color = TextGray),
    // Caption — 13
    bodySmall = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Normal, lineHeight = 18.sp, color = TextGray),
    labelSmall = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Normal, color = TextGray),
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
    // M3 tints any Surface whose colour equals `surface` with `surfaceTint` in proportion to its
    // tonal elevation. CardBg IS `surface`, so every elevated card, the navigation bar and the
    // app bar came out violet-washed (#F3F1FE) instead of the white this palette specifies.
    //
    // The tint is set to CardBg — i.e. the surface colour itself — so the composite is white on
    // white at any elevation. NOT Color.Transparent: `surfaceColorAtElevation` composites
    // `surfaceTint.copy(alpha = …)` over `surface`, and Color.Transparent is transparent BLACK,
    // so it greys every card out (#EDEDED) instead of leaving it alone. M3's real shadows are
    // drawn separately and survive either way.
    surfaceTint = CardBg,
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
