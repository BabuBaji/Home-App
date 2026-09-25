package com.homehelp.pro

import android.content.Context
import android.widget.Toast
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController

/**
 * A flat content section — no box, no shadow. Content sits on the page and a hairline below
 * separates it from the next section, the way native list screens are laid out.
 */
@Composable
fun Card(modifier: Modifier = Modifier, padding: Dp16 = Dp16.M, content: @Composable () -> Unit) {
    Column(modifier.fillMaxWidth()) {
        Column(Modifier.padding(vertical = padding.value)) { content() }
        HairlineDivider()
    }
}

/** Full-bleed rounded premium hero banner: the brand (or given) gradient, a soft violet
 *  glow, and two decorative light "glow orbs" for depth — matching the Home hero. */
@Composable
fun GradientBanner(
    modifier: Modifier = Modifier,
    gradient: Brush = BrandGradient,
    radius: Int = 20,
    padding: Int = 18,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit,
) {
    Box(
        modifier
            .fillMaxWidth()
            .shadow(18.dp, RoundedCornerShape(radius.dp), spotColor = Violet, ambientColor = Violet)
            .clip(RoundedCornerShape(radius.dp))
            .background(gradient),
    ) {
        Box(Modifier.align(Alignment.TopEnd).offset(x = 34.dp, y = (-34).dp).size(120.dp)
            .background(Color.White.copy(alpha = 0.10f), RoundedCornerShape(Radius.pill)))
        Box(Modifier.align(Alignment.BottomStart).offset(x = (-28).dp, y = 30.dp).size(94.dp)
            .background(Color.White.copy(alpha = 0.07f), RoundedCornerShape(Radius.pill)))
        Column(Modifier.padding(padding.dp), content = content)
    }
}

// XS matches the 1_home design frame, where cards carry ~8dp of inner padding. Home has to fit
// its whole dashboard without scrolling, so padding it doesn't need is padding that shrinks the
// type (see FitToScreen).
enum class Dp16(val value: Dp) { XS(8.dp), S(12.dp), M(16.dp) }

// The app's NavController (provided by AppRoot) so shared chrome can navigate (wallet/profile).
val LocalNav = staticCompositionLocalOf<NavHostController?> { null }
// Live wallet balance + worker initials, provided by AppRoot, so the shared Header's top-right
// chips can show the running balance and an avatar without threading the VM into every screen.
val LocalWalletBalance = compositionLocalOf { 0 }
val LocalWorkerInitials = compositionLocalOf { "" }

/**
 * Standard top header, present on every screen: ☰ menu (opens the side drawer) on the left,
 * optional back arrow, the title, an optional screen-specific trailing slot, and quick
 * Wallet + Profile shortcuts on the right.
 */
@Composable
fun Header(title: String, onBack: (() -> Unit)? = null, trailing: (@Composable () -> Unit)? = null) {
    if (onBack != null) {
        AppTopBar(title, onBack = onBack, trailing = trailing)
        return
    }
    val nav = LocalNav.current
    Box(
        Modifier
            .fillMaxWidth()
            .shadow(14.dp, RoundedCornerShape(bottomStart = 28.dp, bottomEnd = 28.dp), spotColor = Purple.copy(alpha = 0.35f), ambientColor = Purple.copy(alpha = 0.14f))
            .clip(RoundedCornerShape(bottomStart = 28.dp, bottomEnd = 28.dp))
            .background(HeroGradient),
    ) {
        // subtle glow orb for depth
        Box(Modifier.align(Alignment.TopEnd).offset(x = 30.dp, y = (-28).dp).size(110.dp)
            .background(Color.White.copy(alpha = 0.08f), RoundedCornerShape(Radius.pill)))
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = Space.l)
                .padding(top = 14.dp, bottom = 18.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                tr(title),
                fontSize = 22.sp,
                fontWeight = FontWeight.ExtraBold,
                color = Color.White,
                letterSpacing = (-0.4).sp,
                modifier = Modifier.weight(1f),
            )
            if (trailing != null) { trailing(); Spacer(Modifier.width(Space.s)) }
            WalletChip(LocalWalletBalance.current, onDark = true) { nav?.navigateApp(Routes.WALLET) }
            Spacer(Modifier.width(Space.s))
            ProfileChip(LocalWorkerInitials.current, onDark = true) { nav?.navigateApp(Routes.PROFILE) }
        }
    }
}

/**
 * The one top bar for every detail screen: a tinted rounded back button, a bold left-aligned
 * title (with an optional subtitle) and an optional trailing slot. Replaces the six slightly
 * different white bars the screens used to draw for themselves.
 */
@Composable
fun AppTopBar(
    title: String,
    onBack: (() -> Unit)? = null,
    subtitle: String? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(CardBg)
            .padding(horizontal = Space.l)
            .padding(top = 12.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onBack != null) {
            BackButton(onBack)
            Spacer(Modifier.width(Space.m))
        }
        Column(Modifier.weight(1f)) {
            Text(
                tr(title), color = TextDark, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold,
                letterSpacing = (-0.4).sp, maxLines = 1,
            )
            if (!subtitle.isNullOrBlank()) {
                Text(tr(subtitle), color = TextGray, fontSize = 12.5.sp, maxLines = 1)
            }
        }
        if (trailing != null) { Spacer(Modifier.width(Space.s)); trailing() }
    }
}

/** 42dp rounded-square back button tinted with the brand wash. */
@Composable
fun BackButton(onClick: () -> Unit) {
    Box(
        Modifier
            .size(42.dp)
            .clip(RoundedCornerShape(Radius.field))
            .background(Primary50)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Purple, modifier = Modifier.size(21.dp))
    }
}

/** Trailing top-bar action — same tinted rounded square as [BackButton]. */
@Composable
fun TopBarAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Box(
        Modifier
            .size(42.dp)
            .clip(RoundedCornerShape(Radius.field))
            .background(Primary50)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = label, tint = Purple, modifier = Modifier.size(20.dp))
    }
}

/** 40dp circular tap target for header actions — accessible touch size + subtle press tint. */
@Composable
private fun HeaderIcon(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    tint: Color,
    onClick: () -> Unit,
) {
    Box(
        Modifier
            .size(40.dp)
            .clip(RoundedCornerShape(Radius.pill))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = label, tint = tint, modifier = Modifier.size(23.dp))
    }
}

/** Top-right wallet action rendered as a pill that shows the live balance ON the icon —
 *  a compact "₹1,250" chip. `onDark` switches to a translucent-white look for gradient headers. */
@Composable
fun WalletChip(balance: Int, onDark: Boolean = false, onClick: () -> Unit) {
    val bg = if (onDark) Color.White.copy(alpha = 0.18f) else PurpleLight
    val fg = if (onDark) Color.White else Purple
    Surface(
        shape = RoundedCornerShape(Radius.pill),
        color = bg,
        modifier = Modifier.clip(RoundedCornerShape(Radius.pill)).clickable(onClick = onClick),
    ) {
        Row(
            Modifier.padding(start = 10.dp, end = 12.dp, top = 7.dp, bottom = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.AccountBalanceWallet, contentDescription = "Wallet", tint = fg, modifier = Modifier.size(17.dp))
            Spacer(Modifier.width(5.dp))
            Text(
                "₹" + java.text.NumberFormat.getIntegerInstance(java.util.Locale("en", "IN")).format(balance),
                color = fg, fontWeight = FontWeight.Bold, fontSize = 13.sp,
            )
        }
    }
}

/** Top-right profile action rendered as a gradient avatar with the worker's initials
 *  (falls back to a person glyph). `onDark` gives a translucent-white avatar on gradients. */
@Composable
fun ProfileChip(initials: String, onDark: Boolean = false, onClick: () -> Unit) {
    Box(
        Modifier
            .size(38.dp)
            .clip(RoundedCornerShape(Radius.pill))
            .then(if (onDark) Modifier.background(Color.White.copy(alpha = 0.22f)) else Modifier.background(BrandGradient))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (initials.isBlank()) {
            Icon(Icons.Filled.Person, contentDescription = "Profile", tint = Color.White, modifier = Modifier.size(20.dp))
        } else {
            Text(initials, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        }
    }
}

/** 1px hairline divider used to separate surfaces. */
@Composable
fun HairlineDivider(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(1.dp).background(Divider))
}

@Composable
fun BellHeader(title: String, onBell: (() -> Unit)? = null) {
    Header(title, trailing = {
        Box(
            Modifier.size(40.dp).clip(RoundedCornerShape(Radius.pill))
                .background(Color.White.copy(alpha = 0.16f))
                .then(if (onBell != null) Modifier.clickable { onBell() } else Modifier),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.Notifications, contentDescription = "Alerts", tint = Color.White, modifier = Modifier.size(21.dp))
        }
    })
}

/**
 * Gradient primary CTA — brand gradient fill, ripple, greyed when disabled, and an
 * optional loading state (spinner + non-interactive) for async actions.
 */
@Composable
fun PrimaryButton(
    text: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    onClick: () -> Unit,
) {
    val active = enabled && !loading
    val fill = if (enabled) BrandGradient else Brush.linearGradient(listOf(PurpleLight, PurpleLight))
    Box(
        modifier
            .fillMaxWidth()
            .height(56.dp)
            .then(if (active) Modifier.shadow(16.dp, RoundedCornerShape(Radius.button), spotColor = Violet, ambientColor = Purple) else Modifier)
            .clip(RoundedCornerShape(Radius.button))
            .background(fill)
            .clickable(enabled = active, onClick = onClick)
            .padding(horizontal = Space.l),
        contentAlignment = Alignment.Center,
    ) {
        if (loading) {
            CircularProgressIndicator(color = Color.White, strokeWidth = 2.4.dp, modifier = Modifier.size(22.dp))
        } else {
            Text(tr(text), color = if (enabled) Color.White else Purple.copy(alpha = 0.45f), fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 0.2.sp)
        }
    }
}

@Composable
fun OutlineButton(text: String, modifier: Modifier = Modifier, color: Color = Purple, onClick: () -> Unit) {
    Surface(
        modifier = modifier.height(56.dp).clip(RoundedCornerShape(Radius.button)).clickable { onClick() },
        shape = RoundedCornerShape(Radius.button),
        color = color.copy(alpha = 0.06f).compositeOver(CardBg),
        border = BorderStroke(1.5.dp, color.copy(alpha = 0.55f)),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(tr(text), color = color, fontSize = 16.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.2.sp)
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
    Surface(modifier = modifier.fillMaxWidth(), shape = RoundedCornerShape(Radius.field), color = PurpleLight.copy(alpha = 0.6f)) {
        Row(Modifier.padding(Space.xs), horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
            options.forEach { opt ->
                val isSel = opt == selected
                val label = counts?.get(opt)?.let { "${tr(opt)} ($it)" } ?: tr(opt)
                Box(
                    modifier = Modifier.weight(1f).height(40.dp)
                        .then(if (isSel) Modifier.shadow(8.dp, RoundedCornerShape(11.dp), spotColor = Violet, ambientColor = Purple) else Modifier)
                        .clip(RoundedCornerShape(11.dp))
                        .then(if (isSel) Modifier.background(BrandGradient) else Modifier)
                        .clickable { onSelect(opt) },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        label,
                        color = if (isSel) Color.White else TextGray,
                        fontWeight = if (isSel) FontWeight.Bold else FontWeight.SemiBold,
                        fontSize = 13.sp,
                    )
                }
            }
        }
    }
}

/** Friendly centered empty-state placeholder for filtered lists with no results. */
@Composable
fun EmptyState(emoji: String, title: String, subtitle: String) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 56.dp, horizontal = Space.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.size(84.dp).clip(RoundedCornerShape(Radius.pill)).background(Primary50),
            contentAlignment = Alignment.Center,
        ) {
            Text(emoji, fontSize = 38.sp)
        }
        Spacer(Modifier.height(Space.l))
        Text(tr(title), fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 17.sp)
        Spacer(Modifier.height(Space.xs))
        Text(tr(subtitle), color = TextGray, fontSize = 13.sp, textAlign = TextAlign.Center, lineHeight = 18.sp)
    }
}

/** Full-screen centered loader for initial data fetches. */
@Composable
fun LoadingScreen(message: String = "Loading…") {
    Column(
        Modifier.fillMaxSize().background(ScreenBg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator(color = Purple, strokeWidth = 3.dp, modifier = Modifier.size(40.dp))
        Spacer(Modifier.height(Space.l))
        Text(tr(message), color = TextGray, fontSize = 14.sp, fontWeight = FontWeight.Medium)
    }
}

/** Centered error state with an optional retry action. */
@Composable
fun ErrorState(title: String = "Something went wrong", subtitle: String = "Please try again.", onRetry: (() -> Unit)? = null) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 56.dp, horizontal = Space.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.size(84.dp).clip(RoundedCornerShape(Radius.pill)).background(RedLight),
            contentAlignment = Alignment.Center,
        ) { Text("⚠️", fontSize = 34.sp) }
        Spacer(Modifier.height(Space.l))
        Text(tr(title), fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 17.sp)
        Spacer(Modifier.height(Space.xs))
        Text(tr(subtitle), color = TextGray, fontSize = 13.sp, textAlign = TextAlign.Center)
        if (onRetry != null) {
            Spacer(Modifier.height(Space.l))
            OutlineButton("Retry", modifier = Modifier.width(160.dp), onClick = onRetry)
        }
    }
}

/** Animated shimmer placeholder block — use while content loads (skeleton lists/cards). */
@Composable
fun ShimmerBox(modifier: Modifier = Modifier, height: Dp = 16.dp, corner: Dp = 8.dp) {
    val transition = rememberInfiniteTransition(label = "shimmer")
    val x by transition.animateFloat(
        initialValue = -2f,
        targetValue = 2f,
        animationSpec = infiniteRepeatable(tween(1100), RepeatMode.Restart),
        label = "shimmerX",
    )
    val brush = Brush.linearGradient(
        colors = listOf(Color(0xFFEDEFF3), Color(0xFFF6F7F9), Color(0xFFEDEFF3)),
        start = Offset(x * 200f, 0f),
        end = Offset(x * 200f + 400f, 0f),
    )
    Box(modifier.height(height).clip(RoundedCornerShape(corner)).background(brush))
}

/** Rounded, flat progress bar for goals/tier progress. */
@Composable
fun ProgressBar(progress: Float, modifier: Modifier = Modifier, track: Color = Divider, fill: Color = Purple, height: Int = 8) {
    val p = progress.coerceIn(0f, 1f)
    Box(modifier.fillMaxWidth().height(height.dp).clip(RoundedCornerShape(Radius.pill)).background(track)) {
        Box(Modifier.fillMaxWidth(p).height(height.dp).clip(RoundedCornerShape(Radius.pill)).background(fill))
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
        WorkerTier.GOLD -> GoldLight
        WorkerTier.PLATINUM -> PurpleLight
    }
    Surface(shape = RoundedCornerShape(Radius.pill), color = bg, modifier = modifier) {
        Row(
            Modifier.padding(horizontal = Space.m, vertical = 5.dp),
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
    Surface(shape = RoundedCornerShape(Radius.pill), color = bg) {
        Text(tr(text), color = fg, fontSize = 11.5.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = Space.m, vertical = 5.dp))
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
fun LabeledRow(label: String, value: String?, valueColor: Color = TextDark) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(tr(label), color = TextGray, fontSize = 14.sp)
        Text(value ?: "", color = valueColor, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun Avatar(initials: String, size: Int = 44, bg: Color = PurpleLight, fg: Color = Purple) {
    Box(
        Modifier.size(size.dp).clip(RoundedCornerShape(Radius.pill)).background(bg),
        contentAlignment = Alignment.Center,
    ) {
        Text(initials, color = fg, fontWeight = FontWeight.Bold, fontSize = (size / 2.6).sp)
    }
}

@Composable
fun SectionTitle(text: String) {
    Text(tr(text), fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = TextDark, letterSpacing = (-0.4).sp, modifier = Modifier.padding(vertical = Space.xs))
}

fun toast(context: Context, message: String) {
    Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
}

/** Tactile press feedback: springs the element down to 93% while pressed (ripple-free).
 *  Makes tiles/cards feel interactive. Use in place of `.clickable { }` on visual tiles. */
fun Modifier.bounceClick(onClick: () -> Unit): Modifier = composed {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.93f else 1f, label = "bounce")
    graphicsLayer { scaleX = scale; scaleY = scale }
        .clickable(interactionSource = interaction, indication = null, onClick = onClick)
}

// ─────────────────────────────────────────────────────────────────────────────
// UI CHANGE LOG — Components.kt
// UI improvements (all shared widgets — changes propagate app-wide):
//  • Card: 18dp radius + softer, layered enterprise shadow.
//  • PrimaryButton: 14dp radius, ripple, disabled state, and a new optional
//    loading state (spinner) — added as a defaulted param, fully backward-compatible.
//  • OutlineButton / StatusPill / SegmentedTabs / ProgressBar / Avatar / TierBadge:
//    aligned to the new radius, spacing and colour tokens.
//  • Header: larger bold title + 40dp circular accessible tap targets for actions.
//  • EmptyState: friendlier tinted icon medallion + larger type.
//  • Added LoadingScreen, ErrorState (with retry) and ShimmerBox skeleton helpers.
//  • SectionTitle raised to the 20/SemiBold enterprise section scale.
// No functionality changed: every function signature is preserved (new params are
// optional with defaults); these are presentational widgets with no business
// logic, API, navigation, or state.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Native tab screen: a Material 3 large title that collapses into a compact bar as the content
 * scrolls, with optional trailing [actions]. [content] receives the padding to apply and must be
 * vertically scrollable (verticalScroll / LazyColumn) so the title can react to it.
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun TabScaffold(
    title: String,
    subtitle: String? = null,
    actions: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit = {},
    content: @Composable (androidx.compose.foundation.layout.PaddingValues) -> Unit,
) {
    val behavior = androidx.compose.material3.TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
    androidx.compose.material3.Scaffold(
        modifier = Modifier.fillMaxSize()
            .then(Modifier.nestedScroll(behavior.nestedScrollConnection)),
        containerColor = ScreenBg,
        contentWindowInsets = androidx.compose.foundation.layout.WindowInsets(0, 0, 0, 0),
        topBar = {
            androidx.compose.material3.LargeTopAppBar(
                title = {
                    Column {
                        Text(tr(title), fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.6).sp, maxLines = 1)
                        if (!subtitle.isNullOrBlank() && behavior.state.collapsedFraction < 0.5f) {
                            Text(tr(subtitle), color = TextGray, fontSize = 14.sp, fontWeight = FontWeight.Normal, maxLines = 1)
                        }
                    }
                },
                actions = { actions(); Spacer(Modifier.width(Space.s)) },
                scrollBehavior = behavior,
                windowInsets = androidx.compose.foundation.layout.WindowInsets(0, 0, 0, 0),
                colors = androidx.compose.material3.TopAppBarDefaults.largeTopAppBarColors(
                    containerColor = ScreenBg,
                    scrolledContainerColor = CardBg,
                    titleContentColor = TextDark,
                ),
            )
        },
        content = content,
    )
}

/** Round icon action for [TabScaffold] titles, with an optional red count badge. */
@Composable
fun TabAction(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, badge: Int = 0, onClick: () -> Unit) {
    Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) {
        Box(
            Modifier.size(44.dp).clip(RoundedCornerShape(Radius.pill)).clickable(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, contentDescription = label, tint = TextDark, modifier = Modifier.size(24.dp)) }
        if (badge > 0) {
            Box(
                Modifier.align(Alignment.TopEnd).offset(x = (-4).dp, y = 4.dp)
                    .size(18.dp).clip(RoundedCornerShape(Radius.pill)).background(RedCancel),
                contentAlignment = Alignment.Center,
            ) { Text(if (badge > 9) "9+" else "$badge", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold) }
        }
    }
}

/** Native Android tabs: full-width row with a violet underline on the selected tab. */
@Composable
fun UnderlineTabs(
    options: List<String>,
    selected: String,
    counts: Map<String, Int>? = null,
    onSelect: (String) -> Unit,
) {
    val index = options.indexOf(selected).coerceAtLeast(0)
    androidx.compose.material3.TabRow(
        selectedTabIndex = index,
        containerColor = ScreenBg,
        contentColor = Purple,
        divider = { HairlineDivider() },
        indicator = { positions ->
            androidx.compose.material3.TabRowDefaults.SecondaryIndicator(
                Modifier.tabIndicatorOffset(positions[index]),
                height = 3.dp, color = Purple,
            )
        },
    ) {
        options.forEachIndexed { i, opt ->
            val label = counts?.get(opt)?.let { "${tr(opt)} ($it)" } ?: tr(opt)
            androidx.compose.material3.Tab(
                selected = i == index,
                onClick = { onSelect(opt) },
                text = {
                    Text(
                        label, fontSize = 15.sp,
                        fontWeight = if (i == index) FontWeight.Bold else FontWeight.Medium,
                        color = if (i == index) Purple else TextGray, maxLines = 1,
                    )
                },
            )
        }
    }
}
