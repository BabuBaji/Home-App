package com.homehelp.pro

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Language
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Small pill showing the current language (globe + native name); tap to change it. */
@Composable
fun LanguageChip(onClick: () -> Unit, modifier: Modifier = Modifier, onDark: Boolean = true) {
    val fg = if (onDark) Color.White else Purple
    Row(
        modifier.clip(RoundedCornerShape(50)).background(if (onDark) Color.White.copy(alpha = 0.16f) else PurpleLight)
            .clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Language, contentDescription = "Language", tint = fg, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(6.dp))
        Text(I18n.current.native, color = fg, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

/**
 * Every language in its own script (with the English name under it), so a worker who can't read
 * English can still find theirs. Choosing one applies instantly and is remembered.
 */
@Composable
fun LanguagePickerDialog(onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("भाषा / Language") },
        text = {
            Column(Modifier.heightIn(max = 460.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                I18n.LANGUAGES.forEach { l ->
                    val sel = I18n.lang == l.code
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                            .background(if (sel) PurpleLight else FieldFill)
                            .clickable { I18n.setLanguage(l.code); onDismiss() }
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(l.native, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = TextDark)
                            Text(l.name, fontSize = 12.sp, color = TextGray)
                        }
                        if (sel) Icon(Icons.Filled.Check, contentDescription = null, tint = Purple)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text(tr("Close")) } },
    )
}
