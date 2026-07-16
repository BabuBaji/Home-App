package com.homehelp.pro

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController

/* Phase 9 — the kit issued to this worker.
 *
 * Read-only by design. The admin issues equipment and Phase 12's "Equipment Issued" check reads
 * those records, so letting a worker tick items off here would hand them the pen for their own
 * Go Live check.
 */
@Composable
fun EquipmentScreen(vm: AppViewModel, nav: NavHostController) {
    LaunchedEffect(Unit) { vm.loadEquipment() }
    val held = vm.equipment.filter { it.status == "issued" }
    val returned = vm.equipment.filter { it.status != "issued" }

    DetailScaffold("My Equipment", nav) {
        Card(padding = Dp16.S) {
            Row(Modifier.padding(Space.xs), verticalAlignment = Alignment.CenterVertically) {
                IconChip(Icons.Filled.Info, Purple, PurpleLight)
                Spacer(Modifier.width(Space.m))
                Text(
                    "Kit your admin has issued to you. Contact them if something here looks wrong.",
                    fontSize = 12.sp, color = TextGray, lineHeight = 17.sp,
                )
            }
        }

        if (vm.equipment.isEmpty()) {
            Card {
                Text("Nothing issued yet", fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp)
                Spacer(Modifier.height(Space.xs))
                Text("Your admin hasn't issued you any equipment.", fontSize = 12.5.sp, color = TextGray, lineHeight = 18.sp)
            }
            return@DetailScaffold
        }

        held.forEach { e ->
            Card {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconChip(Icons.Filled.Inventory2, Purple, PurpleLight)
                    Spacer(Modifier.width(Space.m))
                    Column(Modifier.weight(1f)) {
                        Text(e.name, fontWeight = FontWeight.SemiBold, color = TextDark, fontSize = 14.sp)
                        val bits = listOfNotNull(
                            e.serial.takeIf { it.isNotBlank() }?.let { "Serial $it" },
                            e.notes.takeIf { it.isNotBlank() },
                        )
                        if (bits.isNotEmpty()) Text(bits.joinToString(" · "), fontSize = 12.sp, color = TextGray)
                    }
                    StatusPill("Issued", GreenLight, GreenSuccess)
                }
            }
        }

        if (returned.isNotEmpty()) {
            Text("Returned", fontSize = 12.sp, color = TextGray, modifier = Modifier.padding(horizontal = Space.xs))
            returned.forEach { e ->
                Card {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(e.name, color = TextGray, fontSize = 13.5.sp, modifier = Modifier.weight(1f))
                        StatusPill("Returned", FieldFill, TextMuted)
                    }
                }
            }
        }
    }
}
