package com.homehelp.pro

import android.content.Context
import android.content.SharedPreferences

/**
 * Persists the worker's login across app restarts. Without this the auth token lived
 * only in memory, so Android killing the backgrounded process dropped the session and
 * the app fell back to the Login screen ("automatic logout"). Initialised once from
 * MainActivity with the application context.
 */
object Session {
    private var prefs: SharedPreferences? = null

    fun init(context: Context) {
        if (prefs == null) prefs = context.applicationContext.getSharedPreferences("homehelp_pro", Context.MODE_PRIVATE)
    }

    var token: String?
        get() = prefs?.getString("token", null)
        set(v) { prefs?.edit()?.apply { if (v.isNullOrBlank()) remove("token") else putString("token", v) }?.apply() }

    var phone: String?
        get() = prefs?.getString("phone", null)
        set(v) { prefs?.edit()?.apply { if (v.isNullOrBlank()) remove("phone") else putString("phone", v) }?.apply() }

    val isLoggedIn: Boolean get() = !token.isNullOrBlank()

    fun clear() { prefs?.edit()?.clear()?.apply() }
}
