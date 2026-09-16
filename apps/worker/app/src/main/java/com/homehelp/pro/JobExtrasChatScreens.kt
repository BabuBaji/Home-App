package com.homehelp.pro

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import kotlinx.coroutines.delay

/**
 * CHAT / CALL CUSTOMER (module 20) — the in-job message thread with the customer.
 *
 * Messages live on the server (dispatch `job_messages`), so the thread survives navigation and
 * restarts, and the customer side reads the same rows. Polls every 4s while open — the app has no
 * socket transport, and a poll is honest about what it can deliver.
 */
@Composable
fun JobChatScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    val job = vm.activeJob
    var draft by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    LaunchedEffect(Unit) {
        vm.loadMessages()
        while (true) { delay(4000); vm.loadMessages() }
    }
    // While this screen is up the background poller must not raise message alerts — the thread is
    // already in front of the worker. Also clears any alert they tapped through to get here.
    DisposableEffect(Unit) {
        JobAlertService.chatVisible = true
        JobAlertService.clearMessageAlert(ctx)
        onDispose { JobAlertService.chatVisible = false }
    }
    // Keep the newest message in view as the thread grows.
    LaunchedEffect(vm.messages.size) {
        if (vm.messages.isNotEmpty()) listState.animateScrollToItem(vm.messages.size - 1)
    }

    Column(Modifier.fillMaxSize().background(ScreenBg).imePadding()) {
        Header(title = job?.customerName ?: "Customer", onBack = { nav.popBackStack() }) {
            Box(
                Modifier.size(40.dp).clip(RoundedCornerShape(Radius.pill)).background(Primary50)
                    .clickable { job?.customerPhone?.let { dialCustomerPhone(ctx, it) } },
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.Phone, contentDescription = "Call customer", tint = Purple, modifier = Modifier.size(20.dp)) }
        }

        if (job == null) {
            EmptyState("💬", "No active job", "Chat opens once you accept a job.")
            return@Column
        }

        if (vm.messages.isEmpty()) {
            Column(
                Modifier.weight(1f).fillMaxWidth().padding(Space.xxl),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("💬", fontSize = 40.sp)
                Spacer(Modifier.height(Space.m))
                Text("No messages yet", color = TextDark, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Spacer(Modifier.height(4.dp))
                Text(
                    "Send ${job.customerName} an update — they see it in their app.",
                    color = TextGray, fontSize = 13.sp,
                )
            }
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(Space.l),
                verticalArrangement = Arrangement.spacedBy(Space.s),
            ) {
                items(vm.messages, key = { it.id }) { m -> ChatBubble(m.body, m.fromWorker) }
            }
        }

        // Composer
        Row(
            Modifier.fillMaxWidth().background(Color.White).padding(Space.m),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Message ${job.customerName}…", fontSize = 14.sp) },
                shape = RoundedCornerShape(Radius.pill),
                maxLines = 3,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = FieldFill,
                    unfocusedContainerColor = FieldFill,
                    focusedBorderColor = Purple,
                    unfocusedBorderColor = Color.Transparent,
                    cursorColor = Purple,
                ),
            )
            Spacer(Modifier.width(Space.s))
            val canSend = draft.isNotBlank() && !vm.chatSending
            Box(
                Modifier.size(48.dp).clip(RoundedCornerShape(Radius.pill))
                    .background(if (canSend) Purple else Divider)
                    .clickable(enabled = canSend) { vm.sendMessage(draft); draft = "" },
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send", tint = Color.White, modifier = Modifier.size(20.dp)) }
        }
    }
}

@Composable
private fun ChatBubble(text: String, mine: Boolean) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start,
    ) {
        Box(
            // widthIn, not fillMaxWidth(fraction): a bubble hugs its text and only wraps once
            // it would cross ~3/4 of the screen.
            Modifier.widthIn(max = 290.dp)
                .clip(
                    RoundedCornerShape(
                        topStart = 16.dp, topEnd = 16.dp,
                        bottomStart = if (mine) 16.dp else 4.dp,
                        bottomEnd = if (mine) 4.dp else 16.dp,
                    ),
                )
                .background(if (mine) Purple else Color.White)
                .border(
                    1.dp,
                    if (mine) Color.Transparent else Divider,
                    RoundedCornerShape(
                        topStart = 16.dp, topEnd = 16.dp,
                        bottomStart = if (mine) 16.dp else 4.dp,
                        bottomEnd = if (mine) 4.dp else 16.dp,
                    ),
                )
                .padding(horizontal = 13.dp, vertical = 9.dp),
        ) {
            Text(text, color = if (mine) Color.White else TextDark, fontSize = 14.sp)
        }
    }
}

/** Opens the dialer on the customer's number (ACTION_DIAL needs no CALL_PHONE permission). */
fun dialCustomerPhone(ctx: android.content.Context, phone: String) {
    if (phone.isBlank()) return
    runCatching {
        ctx.startActivity(
            android.content.Intent(android.content.Intent.ACTION_DIAL, android.net.Uri.parse("tel:$phone"))
                .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}

/**
 * ADD EXTRA SERVICE (module 19) — bill work the customer asked for on top of the booking.
 *
 * Extras are server-held per job. They are recorded against the booking and shown on the job's
 * payout summary; converting them into the customer's invoice total is a booking-service change
 * that does not exist yet, so today they are an itemised record, not a charge.
 */
@Composable
fun AddExtraServiceScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    var name by remember { mutableStateOf("") }
    var price by remember { mutableStateOf("") }

    LaunchedEffect(Unit) { vm.loadJobState(); vm.loadAddons() }

    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header(title = "Add Extra Service", onBack = { nav.popBackStack() })

        if (vm.activeJob == null) {
            EmptyState("➕", "No active job", "Extras attach to a job you're working on.")
            return@Column
        }

        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Space.l),
            verticalArrangement = Arrangement.spacedBy(Space.l),
        ) {
            // Only rendered once the catalogue answers. An app-side price list here would quote
            // the customer figures the catalogue disagrees with, and could only be corrected by
            // shipping a new build — so when there's nothing to offer, the custom field below is
            // the whole screen.
            if (vm.addons.isNotEmpty()) {
                Card {
                    Text("Suggested extras", color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(Space.m))
                    // Tap to prefill — typing a price on a phone mid-job is the slow path.
                    vm.addons.chunked(2).forEach { row ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Space.s)) {
                            row.forEach { a ->
                                Row(
                                    Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(Primary50)
                                        .clickable { name = a.name; price = a.price.toString() }
                                        .padding(horizontal = 10.dp, vertical = 9.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(a.name, color = TextDark, fontSize = 12.sp, modifier = Modifier.weight(1f), maxLines = 1)
                                    Text("₹${a.price}", color = Purple, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                            if (row.size == 1) Spacer(Modifier.weight(1f))
                        }
                        Spacer(Modifier.height(Space.s))
                    }
                }
            }

            Card {
                Text("Custom extra", color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(Space.m))
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("What did you do?") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(Radius.button),
                    singleLine = true,
                )
                Spacer(Modifier.height(Space.m))
                OutlinedTextField(
                    value = price,
                    onValueChange = { v -> price = v.filter { it.isDigit() }.take(5) },
                    label = { Text("Price (₹)") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(Radius.button),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
                Spacer(Modifier.height(Space.l))
                PrimaryButton(
                    "Add Extra",
                    modifier = Modifier.fillMaxWidth(),
                    enabled = name.isNotBlank() && (price.toIntOrNull() ?: 0) > 0,
                ) {
                    vm.addExtra(name.trim(), price.toInt())
                    toast(ctx, "Added ${name.trim()} · ₹$price")
                    name = ""; price = ""
                }
            }

            if (vm.extras.isNotEmpty()) {
                Card {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Added to this job", color = TextDark, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                        Text("₹${vm.extrasTotal}", color = GreenSuccess, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.height(Space.m))
                    vm.extras.forEach { e ->
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = 7.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(e.name, color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                                Text("Extra service", color = TextGray, fontSize = 11.5.sp)
                            }
                            Text("₹${e.price}", color = TextDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.width(Space.m))
                            Box(
                                Modifier.size(30.dp).clip(RoundedCornerShape(Radius.pill)).background(RedLight)
                                    .clickable { vm.removeExtra(e.id) },
                                contentAlignment = Alignment.Center,
                            ) { Icon(Icons.Filled.Close, contentDescription = "Remove", tint = RedCancel, modifier = Modifier.size(16.dp)) }
                        }
                    }
                }
            }
        }
    }
}

