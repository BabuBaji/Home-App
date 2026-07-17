package com.homehelp.pro

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController

/* The worker's 8-step onboarding wizard.
 *
 * This is the home screen while a worker is still onboarding, because the normal home is built
 * around jobs they cannot accept yet — showing it would be a screen full of things that don't work.
 *
 * Steps are not locked in sequence. A worker waiting on a police certificate can still do their
 * bank details; forcing a strict order would just stall them. Order is a suggestion, and the server
 * decides what's actually complete.
 */

/** Which existing screen each step is really about. Step 8 is this screen. */
private val STEP_ROUTE = mapOf(
    "personal" to Routes.P_PERSONAL,
    "address" to Routes.P_PERSONAL, // Phase 2 and 3 share one form
    "documents" to Routes.P_DOCUMENTS,
    "bank" to Routes.P_BANK,
    "skills" to Routes.P_SKILLS,
    "training" to Routes.P_TRAINING,
)

@Composable
fun OnboardingScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    var justSubmitted by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { vm.loadOnboarding() }
    LaunchedEffect(vm.onboardingError) { vm.onboardingError?.let { toast(ctx, it); vm.clearOnboardingError() } }

    val submitted = vm.onboardingSubmittedAt != null

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Getting started")
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            Card {
                Text(
                    if (submitted) "Sent for approval" else "Welcome, ${vm.workerName.split(" ").firstOrNull() ?: ""}",
                    fontWeight = FontWeight.Bold, fontSize = 18.sp, color = TextDark,
                )
                Spacer(Modifier.height(Space.xs))
                Text(
                    if (submitted)
                        "Your admin is reviewing your profile. You'll be able to take jobs once they approve you — we'll let you know. You can still fix anything below."
                    else
                        "Finish these steps so your admin can approve you. You can do them in any order.",
                    fontSize = 12.5.sp, color = TextGray, lineHeight = 18.sp,
                )
                Spacer(Modifier.height(Space.m))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("${vm.onboardingDone} of ${vm.onboardingTotal} done", fontSize = 12.5.sp, color = TextGray, modifier = Modifier.weight(1f))
                    if (submitted) StatusPill("Submitted", GreenLight, GreenSuccess)
                }
                Spacer(Modifier.height(Space.s))
                LinearProgressIndicator(
                    progress = { if (vm.onboardingTotal == 0) 0f else vm.onboardingDone.toFloat() / vm.onboardingTotal },
                    modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(Radius.pill)),
                    color = Purple, trackColor = FieldFill,
                )
            }

            vm.onboardingSteps.forEachIndexed { i, s ->
                val route = STEP_ROUTE[s.key]
                Card(modifier = if (route != null) Modifier.clickable { nav.navigate(route) } else Modifier) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        StepNumber(i + 1, s.done, s.optional)
                        Spacer(Modifier.width(Space.m))
                        Column(Modifier.weight(1f)) {
                            Text(s.label, fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp)
                            Text(
                                s.detail,
                                fontSize = 12.sp,
                                color = if (!s.done && !s.optional) Amber else TextGray,
                                lineHeight = 17.sp,
                            )
                        }
                        if (route != null) Icon(Icons.Filled.ChevronRight, null, tint = TextMuted, modifier = Modifier.size(20.dp))
                    }
                }
            }

            // Step 8 — review & submit.
            Card {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    StepNumber(vm.onboardingSteps.size + 1, submitted, false)
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text("Review & Submit", fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp)
                        Text(
                            when {
                                submitted -> "Sent — your admin is reviewing it"
                                vm.canSubmitOnboarding -> "Everything's filled in. Send it for approval."
                                else -> "Finish the steps above first"
                            },
                            fontSize = 12.sp, color = TextGray, lineHeight = 17.sp,
                        )
                    }
                }
                if (!submitted) {
                    Spacer(Modifier.height(Space.m))
                    PrimaryButton(
                        "Submit for approval",
                        enabled = vm.canSubmitOnboarding && !vm.submittingOnboarding,
                        loading = vm.submittingOnboarding,
                    ) {
                        vm.submitOnboarding { justSubmitted = true; toast(ctx, "Sent to your admin for approval") }
                    }
                }
            }

            // Being told what happens next is the difference between waiting and wondering.
            if (submitted) {
                Card(padding = Dp16.S) {
                    Row(Modifier.padding(Space.xs), verticalAlignment = Alignment.CenterVertically) {
                        IconChip(Icons.Filled.Check, GreenSuccess, GreenLight)
                        Spacer(Modifier.width(Space.m))
                        Text(
                            "Your admin still has to verify your documents and approve your skills before you go live. Nothing else is needed from you right now.",
                            fontSize = 12.sp, color = TextGray, lineHeight = 17.sp,
                        )
                    }
                }
            }
            Spacer(Modifier.height(Space.xl))
        }
    }

    // Submitting doesn't make them live, so send them to the normal home rather than leaving them
    // on a wizard they've finished.
    LaunchedEffect(justSubmitted) {
        if (justSubmitted) {
            justSubmitted = false
            nav.navigate(Routes.HOME) { popUpTo(Routes.ONBOARDING) { inclusive = true } }
        }
    }
}

@Composable
private fun StepNumber(n: Int, done: Boolean, optional: Boolean) {
    val bg = when { done -> GreenLight; optional -> FieldFill; else -> PurpleLight }
    val fg = when { done -> GreenSuccess; optional -> TextMuted; else -> Purple }
    Box(Modifier.size(34.dp).clip(CircleShape).background(bg), contentAlignment = Alignment.Center) {
        if (done) Icon(Icons.Filled.Check, null, tint = fg, modifier = Modifier.size(18.dp))
        else Text("$n", color = fg, fontWeight = FontWeight.Bold, fontSize = 14.sp)
    }
}
