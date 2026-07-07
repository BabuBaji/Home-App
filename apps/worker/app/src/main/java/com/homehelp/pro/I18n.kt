package com.homehelp.pro

/**
 * Multi-language support was removed — the app is English-only.
 * `tr()` is kept as a passthrough so the shared components that call it keep compiling;
 * it simply returns the English text unchanged.
 */
fun tr(en: String): String = en
