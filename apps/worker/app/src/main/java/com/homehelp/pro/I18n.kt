package com.homehelp.pro

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/** A language the app is translated into. [rtl] = laid out right-to-left (Urdu). */
data class AppLanguage(val code: String, val name: String, val native: String, val rtl: Boolean = false)

/**
 * App-wide UI language: English plus the major Indian languages.
 *
 * Copy is written in English and wrapped in [tr]; for any other language the English text is
 * looked up in that language's dictionary (I18nHi.kt, I18nBn.kt, … — keyed by the exact English
 * string). Anything missing falls back to English, so an untranslated string never breaks a screen.
 * Each dictionary is built lazily the first time its language is used.
 *
 * The current language lives in a Compose-observable [mutableStateOf], so every composable that
 * calls [tr] recomposes immediately when the worker switches language in Settings. The choice is
 * persisted in [Session] ("homehelp_pro" prefs, key "lang").
 */
object I18n {
    const val EN = "en"
    const val HI = "hi"

    val LANGUAGES = listOf(
        AppLanguage("en", "English", "English"),
        AppLanguage("hi", "Hindi", "हिंदी"),
        AppLanguage("bn", "Bengali", "বাংলা"),
        AppLanguage("te", "Telugu", "తెలుగు"),
        AppLanguage("mr", "Marathi", "मराठी"),
        AppLanguage("ta", "Tamil", "தமிழ்"),
        AppLanguage("gu", "Gujarati", "ગુજરાતી"),
        AppLanguage("kn", "Kannada", "ಕನ್ನಡ"),
        AppLanguage("ml", "Malayalam", "മലയാളം"),
        AppLanguage("or", "Odia", "ଓଡ଼ିଆ"),
        AppLanguage("pa", "Punjabi", "ਪੰਜਾਬੀ"),
        AppLanguage("as", "Assamese", "অসমীয়া"),
        AppLanguage("ur", "Urdu", "اردو", rtl = true),
    )

    private val DICTS: Map<String, () -> Map<String, String>> = mapOf(
        "hi" to { HINDI }, "bn" to { BENGALI }, "te" to { TELUGU }, "mr" to { MARATHI }, "ta" to { TAMIL },
        "gu" to { GUJARATI }, "kn" to { KANNADA }, "ml" to { MALAYALAM }, "or" to { ODIA }, "pa" to { PUNJABI },
        "as" to { ASSAMESE }, "ur" to { URDU },
    )

    var lang by mutableStateOf(EN)
        private set

    private var dict: Map<String, String> = emptyMap()

    val current: AppLanguage get() = LANGUAGES.firstOrNull { it.code == lang } ?: LANGUAGES[0]
    val isRtl: Boolean get() = current.rtl
    val isHindi: Boolean get() = lang == HI

    /** Load the persisted language. Call after [Session.init]. */
    fun init() {
        // Session.language is the older display-name preference ("English"/"हिंदी"); honour it once.
        val saved = Session.lang.takeIf { c -> LANGUAGES.any { it.code == c } }
            ?: if (Session.language == "हिंदी") HI else EN
        apply(saved)
    }

    /** Switch language: applies instantly (recomposition) and persists across restarts. */
    fun setLanguage(code: String) {
        val c = if (LANGUAGES.any { it.code == code }) code else EN
        Session.lang = c
        Session.language = LANGUAGES.first { it.code == c }.native
        apply(c)
    }

    private fun apply(code: String) {
        dict = DICTS[code]?.invoke() ?: emptyMap()
        lang = code
    }

    internal fun lookup(en: String): String = dict[en] ?: en
}

/**
 * Translate an English UI string into the chosen language; any string without an entry (names,
 * addresses, server text…) falls back to English. Reading [I18n.lang] keeps callers recomposing.
 */
fun tr(en: String): String = if (I18n.lang == I18n.EN) en else I18n.lookup(en)
