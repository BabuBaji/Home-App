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
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.homehelp.pro.network.TrainingModuleDto

/* Phase 7 — training & assessment (worker side).
 *
 * The module list is whatever the admin has PUBLISHED, so an empty list means "nothing written
 * yet", not a failure — the screen says exactly that rather than showing a broken-looking blank.
 * The quiz paper arrives without an answer key and the score comes back from the server; there is
 * deliberately nothing to check, and nothing to cheat, on this side.
 */

@Composable
fun TrainingScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    var reading by remember { mutableStateOf<TrainingModuleDto?>(null) }
    var quizOpen by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { vm.loadTraining() }
    LaunchedEffect(vm.trainingError) { vm.trainingError?.let { toast(ctx, it); vm.clearTrainingError() } }

    val reader = reading
    if (reader != null) { ModuleReader(vm, reader, onBack = { reading = null }); return }
    if (quizOpen) { QuizScreen(vm, onExit = { quizOpen = false }); return }

    val q = vm.quizState
    val p = vm.trainingProgress

    DetailScaffold("Training", nav) {
        if (q.passed) {
            Card(padding = Dp16.S) {
                Row(Modifier.padding(Space.xs), verticalAlignment = Alignment.CenterVertically) {
                    IconChip(Icons.Filled.WorkspacePremium, GreenSuccess, GreenLight)
                    Spacer(Modifier.width(Space.m))
                    Column {
                        Text("Assessment passed", fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp)
                        Text(
                            "You scored ${q.bestPct ?: 0}%. Your admin will confirm the rest of your onboarding.",
                            fontSize = 12.sp, color = TextGray, lineHeight = 17.sp,
                        )
                    }
                }
            }
        } else {
            Card(padding = Dp16.S) {
                Row(Modifier.padding(Space.xs), verticalAlignment = Alignment.CenterVertically) {
                    IconChip(Icons.Filled.Info, Purple, PurpleLight)
                    Spacer(Modifier.width(Space.m))
                    Text(
                        "Read each module, then take the assessment — ${q.size} questions, ${q.passPct}% to pass.",
                        fontSize = 12.sp, color = TextGray, lineHeight = 17.sp,
                    )
                }
            }
        }

        if (vm.trainingModules.isEmpty()) {
            Card {
                Text("No modules yet", fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp)
                Spacer(Modifier.height(Space.xs))
                Text(
                    "Your admin hasn't published any training yet. Check back soon — there's nothing for you to do here right now.",
                    fontSize = 12.5.sp, color = TextGray, lineHeight = 18.sp,
                )
            }
            return@DetailScaffold
        }

        Card {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Your progress", fontWeight = FontWeight.SemiBold, color = TextDark, modifier = Modifier.weight(1f))
                Text("${p.completed} of ${p.total}", fontSize = 12.5.sp, color = TextGray)
            }
            Spacer(Modifier.height(Space.s))
            LinearProgressIndicator(
                progress = { if (p.total == 0) 0f else p.completed.toFloat() / p.total },
                modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(Radius.pill)),
                color = Purple, trackColor = FieldFill,
            )
        }

        vm.trainingModules.forEach { m ->
            Card(modifier = Modifier.clickable { reading = m }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconChip(
                        if (m.completed) Icons.Filled.CheckCircle else Icons.AutoMirrored.Filled.MenuBook,
                        if (m.completed) GreenSuccess else Purple,
                        if (m.completed) GreenLight else PurpleLight,
                    )
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text(m.title, fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp)
                        Text(if (m.completed) "Read — tap to read again" else "Not read yet", fontSize = 12.sp, color = TextGray)
                    }
                    if (m.completed) StatusPill("Done", GreenLight, GreenSuccess)
                }
            }
        }

        Spacer(Modifier.height(Space.s))

        // Say WHY the assessment can't be started. Each of these has a different fix, and a greyed
        // out button tells a worker none of them.
        val blocker = when {
            q.passed -> null
            !q.ready -> "The assessment isn't ready yet. Ask your admin to finish setting it up."
            !q.modulesDone -> "Read all ${p.total} modules first — ${p.total - p.completed} to go."
            q.onCooldown -> "You've just had an attempt. You can try again shortly."
            else -> null
        }
        if (blocker != null) {
            Text(blocker, fontSize = 12.5.sp, color = TextGray, lineHeight = 18.sp, modifier = Modifier.padding(horizontal = Space.xs))
        }
        if (q.attempts > 0 && !q.passed) {
            Text(
                "Best so far: ${q.bestPct ?: 0}% over ${q.attempts} attempt${if (q.attempts == 1) "" else "s"}. You need ${q.passPct}%.",
                fontSize = 12.5.sp, color = TextGray, modifier = Modifier.padding(horizontal = Space.xs),
            )
        }

        if (!q.passed) {
            PrimaryButton(
                if (q.attempts > 0) "Try the assessment again" else "Start the assessment",
                enabled = blocker == null && !vm.loadingQuiz,
                loading = vm.loadingQuiz,
            ) { vm.startQuiz { quizOpen = true } }
        }
        Spacer(Modifier.height(Space.xl))
    }
}

/** Read one module, then mark it done. */
@Composable
private fun ModuleReader(vm: AppViewModel, m: TrainingModuleDto, onBack: () -> Unit) {
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header(m.title, onBack = onBack)
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            Card { Text(m.body, fontSize = 14.sp, color = TextDark, lineHeight = 22.sp) }
            if (m.completed) {
                Row(Modifier.padding(horizontal = Space.xs), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.CheckCircle, null, tint = GreenSuccess, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(Space.s))
                    Text("You've read this one", fontSize = 13.sp, color = TextGray)
                }
            } else {
                PrimaryButton("I've read this") { vm.completeModule(m.id); onBack() }
            }
            Spacer(Modifier.height(Space.xl))
        }
    }
}

@Composable
private fun QuizScreen(vm: AppViewModel, onExit: () -> Unit) {
    val ctx = LocalContext.current
    val answers = remember { mutableStateMapOf<Int, Int>() }
    val result = vm.quizResult
    LaunchedEffect(vm.trainingError) { vm.trainingError?.let { toast(ctx, it); vm.clearTrainingError() } }

    if (result != null) {
        val close = { vm.quizResult = null; onExit() }
        Column(Modifier.fillMaxSize().background(ScreenBg)) {
            Header("Result", onBack = close)
            Column(Modifier.padding(Space.l), horizontalAlignment = Alignment.CenterHorizontally) {
                Spacer(Modifier.height(Space.xxl))
                Box(
                    Modifier.size(96.dp).clip(CircleShape).background(if (result.passed) GreenLight else RedLight),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "${result.pct}%", fontSize = 26.sp, fontWeight = FontWeight.Bold,
                        color = if (result.passed) GreenSuccess else RedCancel,
                    )
                }
                Spacer(Modifier.height(Space.l))
                Text(
                    if (result.passed) "Passed" else "Not passed",
                    fontSize = 18.sp, fontWeight = FontWeight.Bold,
                    color = if (result.passed) GreenSuccess else RedCancel,
                )
                Spacer(Modifier.height(Space.s))
                Text(
                    "You got ${result.score} of ${result.total} right. The pass mark is ${result.passPct}%.",
                    fontSize = 13.sp, color = TextGray,
                )
                if (!result.passed) {
                    Spacer(Modifier.height(Space.s))
                    Text(
                        "Have another read through the modules and try again in a little while.",
                        fontSize = 12.5.sp, color = TextGray, lineHeight = 18.sp,
                    )
                }
                Spacer(Modifier.height(Space.xxl))
                PrimaryButton("Done") { close() }
            }
        }
        return
    }

    val paper = vm.quizPaper
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header("Assessment", onBack = onExit)
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.m),
        ) {
            Text(
                "${answers.size} of ${paper.size} answered · ${vm.quizState.passPct}% to pass",
                fontSize = 12.5.sp, color = TextGray, modifier = Modifier.padding(horizontal = Space.xs),
            )
            paper.forEachIndexed { i, q ->
                Card {
                    Text("${i + 1}. ${q.question}", fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp, lineHeight = 20.sp)
                    Spacer(Modifier.height(Space.s))
                    q.options.forEachIndexed { oi, opt ->
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.field)).clickable { answers[q.id] = oi },
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = answers[q.id] == oi, onClick = { answers[q.id] = oi })
                            Text(opt, fontSize = 13.sp, color = TextDark, lineHeight = 19.sp)
                        }
                    }
                }
            }
            // Blanks are marked wrong — say so, rather than letting someone submit half a paper
            // expecting to be scored only on what they attempted.
            if (answers.size < paper.size) {
                Text(
                    "${paper.size - answers.size} unanswered. Anything you leave blank counts as wrong.",
                    fontSize = 12.5.sp, color = Amber, modifier = Modifier.padding(horizontal = Space.xs),
                )
            }
            PrimaryButton("Submit answers", enabled = !vm.loadingQuiz, loading = vm.loadingQuiz) {
                vm.submitQuiz(answers.toMap())
            }
            Spacer(Modifier.height(Space.xl))
        }
    }
}
