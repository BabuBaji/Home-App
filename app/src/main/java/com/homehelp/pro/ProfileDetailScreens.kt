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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController

@Composable
private fun DetailScaffold(title: String, nav: NavHostController, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Header(title, onBack = { nav.popBackStack() })
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) { content() }
    }
}

@Composable
private fun Field(label: String, value: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
    )
}

@Composable
fun PersonalInfoScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    DetailScaffold("Personal Information", nav) {
        Card {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(vm.workerName.split(" ").mapNotNull { it.firstOrNull() }.take(2).joinToString(""), size = 56)
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(vm.workerName, fontWeight = FontWeight.Bold, color = TextDark)
                    Text("${vm.workerRating} ★ • ${vm.jobsCompleted} jobs", fontSize = 12.sp, color = TextGray)
                }
            }
        }
        Field("Full Name", vm.workerName) { vm.workerName = it }
        Field("Mobile Number", vm.workerPhone) { vm.workerPhone = it }
        Field("Email", vm.workerEmail) { vm.workerEmail = it }
        Field("City", vm.workerCity) { vm.workerCity = it }
        PrimaryButton("Save Changes") { toast(ctx, "Profile updated") }
    }
}

@Composable
fun DocumentsScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    val docs = listOf(
        "Aadhaar Card" to "Verified",
        "PAN Card" to "Verified",
        "Police Verification" to "Verified",
        "Address Proof" to "Pending",
    )
    DetailScaffold("Documents", nav) {
        docs.forEach { (name, status) ->
            Card {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Verified, contentDescription = null,
                        tint = if (status == "Verified") GreenSuccess else Gold, modifier = Modifier.size(24.dp))
                    Spacer(Modifier.width(12.dp))
                    Text(name, fontWeight = FontWeight.SemiBold, color = TextDark, modifier = Modifier.weight(1f))
                    StatusPill(status, if (status == "Verified") GreenLight else Color(0xFFFFF3D6),
                        if (status == "Verified") GreenSuccess else Gold)
                }
            }
        }
        PrimaryButton("Upload New Document") { toast(ctx, "Opening document upload…") }
    }
}

@Composable
fun BankDetailsScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    DetailScaffold("Bank Details", nav) {
        Card {
            Text("Payouts are sent to this account", fontSize = 12.sp, color = TextGray)
            Spacer(Modifier.height(8.dp))
            Text(vm.bankName, fontWeight = FontWeight.Bold, color = TextDark)
            Text("A/c ${vm.bankAccount}", color = TextDark)
            Text("IFSC ${vm.bankIfsc}", fontSize = 12.sp, color = TextGray)
        }
        Field("Account Holder Name", vm.bankHolder) { vm.bankHolder = it }
        Field("Bank Name", vm.bankName) { vm.bankName = it }
        Field("Account Number", vm.bankAccount) { vm.bankAccount = it }
        Field("IFSC Code", vm.bankIfsc) { vm.bankIfsc = it }
        PrimaryButton("Update Bank Details") { toast(ctx, "Bank details updated (re-verification required)") }
    }
}

@Composable
fun AvailabilityScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    val days = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
    DetailScaffold("Availability", nav) {
        Card {
            Text("Working Days", fontWeight = FontWeight.SemiBold, color = TextDark)
            Spacer(Modifier.height(4.dp))
            days.forEach { d ->
                Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(d, color = TextDark, modifier = Modifier.weight(1f))
                    Switch(
                        checked = vm.availableDays[d] ?: false,
                        onCheckedChange = { vm.availableDays[d] = it },
                        colors = SwitchDefaults.colors(checkedTrackColor = GreenSuccess),
                    )
                }
                Divider(color = Divider)
            }
        }
        Card {
            Text("Working Hours", fontWeight = FontWeight.SemiBold, color = TextDark)
            Spacer(Modifier.height(8.dp))
            LabeledRow("Shift Start", vm.shiftStart)
            LabeledRow("Shift End", vm.shiftEnd)
        }
        PrimaryButton("Save Availability") {
            val active = vm.availableDays.count { it.value }
            toast(ctx, "Availability saved • $active days/week")
        }
    }
}

@Composable
fun PreferencesScreen(vm: AppViewModel, nav: NavHostController) {
    val ctx = LocalContext.current
    DetailScaffold("Preferences", nav) {
        Card {
            Text("Job types you want to receive", fontWeight = FontWeight.SemiBold, color = TextDark)
            Spacer(Modifier.height(4.dp))
            vm.jobPreferences.keys.toList().forEach { service ->
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = vm.jobPreferences[service] ?: false,
                        onCheckedChange = { vm.jobPreferences[service] = it },
                        colors = CheckboxDefaults.colors(checkedColor = Purple),
                    )
                    Text(service, color = TextDark)
                }
            }
        }
        PrimaryButton("Save Preferences") {
            val n = vm.jobPreferences.count { it.value }
            toast(ctx, "Preferences saved • $n job types enabled")
        }
    }
}

@Composable
fun NotificationsScreen(vm: AppViewModel, nav: NavHostController) {
    DetailScaffold("Notification Settings", nav) {
        Card {
            NotifRow("New job alerts", vm.notifNewJobs) { vm.notifNewJobs = it }
            Divider(color = Divider)
            NotifRow("Payment updates", vm.notifPayments) { vm.notifPayments = it }
            Divider(color = Divider)
            NotifRow("Ratings & feedback", vm.notifRatings) { vm.notifRatings = it }
            Divider(color = Divider)
            NotifRow("Promotions & offers", vm.notifPromotions) { vm.notifPromotions = it }
        }
    }
}

@Composable
private fun NotifRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = TextDark, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange,
            colors = SwitchDefaults.colors(checkedTrackColor = Purple))
    }
}

@Composable
fun HelpSupportScreen(nav: NavHostController) {
    val ctx = LocalContext.current
    DetailScaffold("Help & Support", nav) {
        Card {
            Row(Modifier.fillMaxWidth().clickable { toast(ctx, "Calling support: 1800-123-456") }
                .padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Phone, contentDescription = null, tint = Purple, modifier = Modifier.size(22.dp))
                Spacer(Modifier.width(12.dp))
                Column {
                    Text("Call Support", fontWeight = FontWeight.SemiBold, color = TextDark)
                    Text("1800-123-456 • 24x7", fontSize = 12.sp, color = TextGray)
                }
            }
            Divider(color = Divider)
            Row(Modifier.fillMaxWidth().clickable { toast(ctx, "Opening email to support@homehelp.pro") }
                .padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Email, contentDescription = null, tint = Purple, modifier = Modifier.size(22.dp))
                Spacer(Modifier.width(12.dp))
                Column {
                    Text("Email Us", fontWeight = FontWeight.SemiBold, color = TextDark)
                    Text("support@homehelp.pro", fontSize = 12.sp, color = TextGray)
                }
            }
        }
        Card {
            Text("FAQs", fontWeight = FontWeight.SemiBold, color = TextDark)
            Spacer(Modifier.height(8.dp))
            listOf(
                "How do I receive jobs?",
                "When do I get paid?",
                "How is my rating calculated?",
                "How do I withdraw my earnings?",
            ).forEach {
                Text("•  $it", color = TextDark, fontSize = 14.sp,
                    modifier = Modifier.fillMaxWidth().clickable { toast(ctx, "Opening: $it") }.padding(vertical = 8.dp))
                Divider(color = Divider)
            }
        }
    }
}

@Composable
fun AboutScreen(nav: NavHostController) {
    DetailScaffold("About Us", nav) {
        Card {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(48.dp).background(Purple, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = Color.White, modifier = Modifier.size(28.dp))
                }
                Spacer(Modifier.width(12.dp))
                Column {
                    Text("HomeHelp Pro", fontWeight = FontWeight.Bold, color = TextDark, fontSize = 17.sp)
                    Text("Version 1.3", fontSize = 12.sp, color = TextGray)
                }
            }
        }
        Card {
            Text(
                "HomeHelp Pro is the partner app for verified house-help and cleaning professionals. " +
                    "Go online, accept nearby jobs, navigate to customers, verify with OTP, complete the " +
                    "service and get paid — all from one app.",
                color = TextDark, fontSize = 14.sp,
            )
        }
        Card {
            LabeledRow("Terms & Conditions", "›")
            Divider(color = Divider)
            LabeledRow("Privacy Policy", "›")
            Divider(color = Divider)
            LabeledRow("Licenses", "›")
        }
        Text("© 2026 HomeHelp Technologies", color = TextGray, fontSize = 12.sp,
            modifier = Modifier.fillMaxWidth(), )
    }
}
