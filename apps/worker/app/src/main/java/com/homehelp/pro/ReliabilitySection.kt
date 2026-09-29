package com.homehelp.pro

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.homehelp.pro.network.RcPenaltyDto

/* Reliability & Red Cards, at the top of Performance: score, Red Cards against the suspension limit,
 * the level and what it means, then the history — each active penalty can be appealed. All figures
 * come from GET /api/worker/reliability. */
@Composable
fun ReliabilitySection(vm: AppViewModel) {
    LaunchedEffect(Unit) { vm.loadReliability() }
    val r = vm.reliability ?: return
    var appealFor by remember { mutableStateOf<RcPenaltyDto?>(null) }

    val levelColor = when (r.level.key) {
        "excellent", "good" -> GreenSuccess
        "attention", "warning" -> Amber
        else -> RedCancel
    }
    Surface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp), color = Color.White, shadowElevation = 3.dp, border = BorderStroke(1.dp, Divider)) {
        Column(Modifier.padding(18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(tr("Reliability Score"), color = TextGray, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text("${r.score}", color = Purple, fontSize = 40.sp, fontWeight = FontWeight.Bold)
                        Text(" /100", color = TextGray, fontSize = 15.sp, modifier = Modifier.padding(bottom = 7.dp))
                    }
                }
                Box(Modifier.clip(RoundedCornerShape(50)).background(levelColor.copy(alpha = 0.14f)).padding(horizontal = 12.dp, vertical = 6.dp)) {
                    Text(tr(r.level.label), color = levelColor, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(tr("Red Cards"), color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Text("${r.redCards} / ${r.suspendAt}", color = if (r.redCards > 0) RedCancel else TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(6.dp))
            // one segment per card up to the limit
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                repeat(r.suspendAt.coerceIn(1, 12)) { i ->
                    Box(Modifier.weight(1f).height(8.dp).clip(RoundedCornerShape(4.dp)).background(if (i < r.redCards) RedCancel else Divider))
                }
            }
            Spacer(Modifier.height(10.dp))
            Text(tr(r.level.note), color = TextGray, fontSize = 12.5.sp)
            if (r.suspended) {
                Spacer(Modifier.height(10.dp))
                Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(RedLight).padding(12.dp)) {
                    Text(tr("Your account is suspended from new jobs. Operations will review it — you can appeal a penalty below."), color = RedCancel, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                }
            }
            Spacer(Modifier.height(14.dp))
            Row(Modifier.fillMaxWidth()) {
                listOf(tr("Attendance") to r.attendance, tr("On-time") to r.onTime, tr("Acceptance") to r.acceptance, tr("Completion") to r.completion).forEach { (l, v) ->
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("$v%", color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                        Text(l, color = TextGray, fontSize = 11.sp)
                    }
                }
            }
        }
    }

    if (r.history.isNotEmpty()) {
        Spacer(Modifier.height(12.dp))
        Text(tr("Red Card History"), color = TextDark, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        r.history.forEach { p ->
            Surface(Modifier.fillMaxWidth().padding(vertical = 4.dp), shape = RoundedCornerShape(14.dp), color = Color.White, border = BorderStroke(1.dp, Divider)) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(p.reason, color = TextDark, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
                        val sub = buildString {
                            append(p.created.take(10))
                            if (p.ref.isNotBlank() && !p.ref.startsWith("manual-")) append(" · ${p.ref}")
                            append(" · ${tr(statusLabel(p.status))}")
                            p.appeal?.let { append(" · ${tr("Appeal")}: ${tr(it.status)}") }
                        }
                        Text(sub, color = TextGray, fontSize = 11.5.sp)
                        if (p.status == "active" && p.appeal?.status != "pending") {
                            Text(tr("Appeal"), color = Purple, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(top = 4.dp).clickable { appealFor = p })
                        }
                    }
                    Spacer(Modifier.width(8.dp))
                    Text(if (p.points > 0) "+${p.points}" else tr("Warning"), color = if (p.status == "active" && p.points > 0) RedCancel else TextGray, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }

    appealFor?.let { p -> AppealDialog(p, vm) { appealFor = null } }
}

private fun statusLabel(s: String) = when (s) { "active" -> "Active"; "reversed" -> "Removed"; "expired" -> "Expired"; else -> s }

@Composable
private fun AppealDialog(p: RcPenaltyDto, vm: AppViewModel, onClose: () -> Unit) {
    var reason by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = { if (!busy) onClose() },
        title = { Text(tr("Appeal penalty")) },
        text = {
            Column {
                Text(p.reason, color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = reason, onValueChange = { reason = it }, label = { Text(tr("What happened?")) }, minLines = 3)
                error?.let { Spacer(Modifier.height(6.dp)); Text(it, color = RedCancel, fontSize = 12.sp) }
            }
        },
        confirmButton = {
            TextButton(enabled = !busy && reason.trim().length >= 5, onClick = {
                busy = true
                vm.appealPenalty(p.id, reason.trim()) { err -> busy = false; if (err == null) onClose() else error = err }
            }) { Text(if (busy) tr("Sending…") else tr("Send appeal")) }
        },
        dismissButton = { TextButton(enabled = !busy, onClick = onClose) { Text(tr("Cancel")) } },
    )
}
