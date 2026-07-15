package com.homehelp.pro

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Home profile header — greeting + name, an encouragement line, a tappable online-status
 * pill, and the worker's avatar with a KYC-verified badge over a rating chip.
 *
 * Rendered on the light screen background (not a gradient), so every colour here is the
 * on-light variant of the brand palette.
 */
@Composable
fun WorkerProfileHeader(
    greeting: String,
    firstName: String,
    online: Boolean,
    rating: Double,
    onToggleOnline: () -> Unit,
    onProfileClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Column(Modifier.weight(1f)) {
            Text(
                "$greeting, $firstName 👋",
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                color = TextDark,
                letterSpacing = (-0.3).sp,
            )
            Spacer(Modifier.height(3.dp))
            Text("Stay active, earn more!", fontSize = 13.sp, color = TextGray)
            Spacer(Modifier.height(7.dp))
            OnlineStatusPill(online = online, onClick = onToggleOnline)
        }
        Spacer(Modifier.width(Space.m))
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            VerifiedAvatar(onClick = onProfileClick)
            Spacer(Modifier.height(5.dp))
            // Always shown (as in the design). A worker with no ratings yet reads "—".
            RatingChip(rating = rating)
        }
    }
}

/**
 * Circular profile photo ringed in brand purple, with the trusted badge over its corner.
 *
 * The photo is a bundled placeholder: the worker API carries no photo URL, so there is no
 * real image to load.
 */
@Composable
fun VerifiedAvatar(onClick: () -> Unit) {
    Box(Modifier.size(56.dp)) {
        Box(
            Modifier
                .size(52.dp)
                .align(Alignment.TopCenter)
                .clip(RoundedCornerShape(Radius.pill))
                .background(BrandGradient)
                .border(2.5.dp, Purple.copy(alpha = 0.35f), RoundedCornerShape(Radius.pill))
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Image(
                painter = painterResource(R.drawable.dummy_avatar),
                contentDescription = "Profile photo",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(Radius.pill)),
            )
        }
        // Trusted badge — always shown, as in the reference design.
        Box(
            Modifier
                .align(Alignment.BottomEnd)
                .size(20.dp)
                .clip(RoundedCornerShape(Radius.pill))
                .background(Color.White)
                .padding(2.dp),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.Verified,
                contentDescription = "Trusted worker",
                tint = Purple,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

/** White rating badge under the avatar — shield + value + gold star, as in the design. */
@Composable
fun RatingChip(rating: Double) {
    Row(
        Modifier
            .shadow(3.dp, RoundedCornerShape(Radius.pill), spotColor = Color.Black.copy(alpha = 0.12f))
            .clip(RoundedCornerShape(Radius.pill))
            .background(CardBg)
            .padding(horizontal = 9.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Verified, contentDescription = null, tint = Gold, modifier = Modifier.size(13.dp))
        Spacer(Modifier.width(4.dp))
        Text(
            if (rating > 0) String.format("%.1f", rating) else "—",
            color = TextDark, fontSize = 13.sp, fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.width(3.dp))
        Icon(Icons.Filled.Star, contentDescription = null, tint = Gold, modifier = Modifier.size(13.dp))
    }
}

/** Tappable online/offline status pill — green when live, neutral grey when offline. */
@Composable
fun OnlineStatusPill(online: Boolean, onClick: () -> Unit) {
    val bg = if (online) GreenLight else FieldFill
    val fg = if (online) GreenSuccess else TextGray
    Row(
        Modifier
            .clip(RoundedCornerShape(Radius.pill))
            .background(bg)
            .clickable(onClick = onClick)
            .padding(start = 11.dp, end = 7.dp, top = 5.dp, bottom = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(8.dp).clip(RoundedCornerShape(Radius.pill)).background(fg))
        Spacer(Modifier.width(7.dp))
        Text(if (online) "Online" else "Offline", color = fg, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = fg, modifier = Modifier.size(17.dp))
    }
}
