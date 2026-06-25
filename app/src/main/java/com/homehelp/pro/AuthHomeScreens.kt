package com.homehelp.pro

import androidx.compose.foundation.background
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Phone
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController

@Composable
fun LoginScreen(vm: AppViewModel, nav: NavHostController) {
    var phone by remember { mutableStateOf("") }
    var otp by remember { mutableStateOf("") }
    var otpSent by remember { mutableStateOf(false) }

    Column(
        Modifier
            .fillMaxSize()
            .background(Color.White)
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(40.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(36.dp).background(Purple, RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Home, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
            }
            Spacer(Modifier.width(8.dp))
            Text("HomeHelp", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = TextDark)
            Text(" Pro", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Purple)
        }
        Spacer(Modifier.height(40.dp))
        Text("Hello Pro!", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = TextDark, modifier = Modifier.fillMaxWidth())
        Text("Login to continue", fontSize = 15.sp, color = TextGray, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(24.dp))

        OutlinedTextField(
            value = phone,
            onValueChange = { if (it.length <= 10 && it.all(Char::isDigit)) phone = it },
            leadingIcon = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Spacer(Modifier.width(8.dp))
                    Icon(Icons.Filled.Phone, contentDescription = null, tint = TextGray, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("+91", color = TextDark, fontWeight = FontWeight.Medium)
                }
            },
            placeholder = { Text("Enter mobile number") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
        )
        Spacer(Modifier.height(16.dp))

        if (otpSent) {
            OutlinedTextField(
                value = otp,
                onValueChange = { if (it.length <= 4 && it.all(Char::isDigit)) otp = it },
                placeholder = { Text("Enter 4-digit OTP") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
            )
            Text("Demo OTP: any 4 digits", color = TextGray, fontSize = 12.sp, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
            Spacer(Modifier.height(16.dp))
            PrimaryButton("Verify & Continue", enabled = otp.length == 4) {
                vm.login(phone, otp)
                nav.navigate(Routes.HOME) {
                    popUpTo(Routes.LOGIN) { inclusive = true }
                }
            }
        } else {
            PrimaryButton("Get OTP", enabled = phone.length == 10) { otpSent = true }
        }

        Spacer(Modifier.height(40.dp))
        Box(
            Modifier.fillMaxWidth().height(180.dp).background(PurpleLight, RoundedCornerShape(16.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Text("🧹  House Help Professional", color = Purple, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(24.dp))
        Text(
            "By continuing, you agree to our",
            color = TextGray, fontSize = 12.sp, textAlign = TextAlign.Center,
        )
        Text(
            "Terms & Conditions & Privacy Policy",
            color = Purple, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
        )
    }
}

@Composable
fun HomeScreen(vm: AppViewModel, nav: NavHostController) {
    Column(Modifier.fillMaxSize().background(ScreenBg)) {
        Column(Modifier.fillMaxWidth().background(Color.White)) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Menu, contentDescription = null, tint = TextDark, modifier = Modifier.size(24.dp))
                Text("Home", fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = TextDark, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
                Spacer(Modifier.size(24.dp))
            }
            HairlineDivider()
        }

        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // Greeting banner
            Box(Modifier.fillMaxWidth().background(PurpleLight, RoundedCornerShape(16.dp)).padding(18.dp)) {
                Column {
                    Text(if (vm.isOnline) "You're online 🎉" else "Go Online to start", fontSize = 17.sp, fontWeight = FontWeight.Bold, color = TextDark)
                    Text(if (vm.isOnline) "Waiting for job requests…" else "receiving jobs", fontSize = 14.sp, color = TextGray)
                }
            }

            // Online toggle
            Card {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(if (vm.isOnline) "You are Online" else "You are Offline", fontWeight = FontWeight.SemiBold, color = TextDark)
                        Text(if (vm.isOnline) "Receiving job requests" else "Go online to receive job requests", fontSize = 13.sp, color = TextGray)
                    }
                    Switch(
                        checked = vm.isOnline,
                        onCheckedChange = { vm.goOnline(it) },
                        colors = SwitchDefaults.colors(checkedTrackColor = GreenSuccess, checkedThumbColor = Color.White),
                    )
                }
            }

            if (vm.isOnline) {
                PrimaryButton("🔔  Simulate New Job Request") {
                    vm.requestJob()
                    nav.navigate(Routes.NEW_JOB)
                }
            }

            OutlineButton("🗺️  View Hyderabad Map", modifier = Modifier.fillMaxWidth()) {
                nav.navigate(Routes.HYDERABAD_MAP)
            }

            // Today's summary
            Box(Modifier.fillMaxWidth().background(Purple, RoundedCornerShape(16.dp)).padding(16.dp)) {
                Column {
                    Text("Today's Summary", color = Color.White, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(12.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        SummaryStat("₹${vm.todayEarnings}", "Earnings")
                        SummaryStat("${vm.todayJobs}", "Jobs")
                        SummaryStat("${vm.todayHours}", "Hours")
                    }
                }
            }

            // This week
            Card {
                SectionTitle("This Week")
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    MiniStat("₹3,250", "Earnings", "↑ 12%")
                    MiniStat("18", "Jobs", "↑ 8%")
                }
            }

            // Performance
            Card {
                SectionTitle("Performance")
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    MiniStat("4.8 ★", "Rating", null)
                    MiniStat("98%", "Completion", null)
                    MiniStat("92%", "On-time", null)
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun SummaryStat(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Text(label, color = Color.White.copy(alpha = 0.85f), fontSize = 12.sp)
    }
}

@Composable
private fun MiniStat(value: String, label: String, delta: String?) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = TextDark, fontSize = 17.sp, fontWeight = FontWeight.Bold)
        Text(label, color = TextGray, fontSize = 12.sp)
        if (delta != null) Text(delta, color = GreenSuccess, fontSize = 11.sp, fontWeight = FontWeight.Medium)
    }
}
