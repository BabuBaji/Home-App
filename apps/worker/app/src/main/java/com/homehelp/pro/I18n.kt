package com.homehelp.pro

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * App-wide UI language (English / Hindi).
 *
 * The current language lives in a Compose-observable [mutableStateOf], so every composable that
 * calls [tr] re-reads it and recomposes immediately when the worker switches language in
 * Settings. The choice is persisted in [Session] ("homehelp_pro" prefs, key "lang").
 */
object I18n {
    const val EN = "en"
    const val HI = "hi"

    var lang by mutableStateOf(EN)
        private set

    /** Load the persisted language. Call after [Session.init]. */
    fun init() {
        // Session.language is the older display-name preference ("English"/"हिंदी"); honour it once.
        lang = if (Session.lang == HI || Session.language == "हिंदी") HI else EN
    }

    /** Switch language: applies instantly (recomposition) and persists across restarts. */
    fun setLanguage(code: String) {
        val c = if (code == HI) HI else EN
        Session.lang = c
        Session.language = if (c == HI) "हिंदी" else "English"
        lang = c
    }

    val isHindi: Boolean get() = lang == HI
}

/**
 * Translate an English UI string. Returns the Hindi entry from [HINDI] when the language is
 * Hindi; any string without an entry (names, addresses, server text…) falls back to English.
 */
fun tr(en: String): String = if (I18n.lang == I18n.HI) HINDI[en] ?: en else en
