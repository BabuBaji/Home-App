package com.homehelp.pro.network

import android.content.Context
import android.content.SharedPreferences
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Single Retrofit instance for the shared HomeHelp backend (the same server the customer
 * and admin apps use); the worker API lives under `/api/worker` — those prefixes are baked
 * into each [ApiService] path, so the base URL here is just the backend root (host:port).
 *
 * Backend URL resolution, highest priority first:
 *   1. A manual override saved via the login screen's "Server settings" (SharedPreferences).
 *   2. The live URL from a small public config file (app-config.json on GitHub), fetched by
 *      [refreshBaseUrl] — repoints every app at a new tunnel/host WITHOUT rebuilding the APK.
 *   3. [FALLBACK_URL] — the dev PC's LAN IP for same-Wi-Fi testing.
 *
 * A request interceptor rewrites every call's scheme/host/port to the current [baseUrl], so
 * the address can change at runtime without rebuilding Retrofit.
 *
 *   - Wi-Fi (real phone):  http://<PC-LAN-IP>:4000   e.g. http://192.168.0.112:4000
 *   - Emulator:            http://10.0.2.2:4000
 *   - USB + adb reverse:   http://127.0.0.1:4000      (run: adb reverse tcp:4000 tcp:4000)
 */
object RetrofitClient {
    const val DEFAULT_SERVER = "http://192.168.0.112:4000"
    private const val FALLBACK_URL = "$DEFAULT_SERVER/"
    private const val CONFIG_URL = "https://raw.githubusercontent.com/BabuBaji/Home-App/Baji/app-config.json"
    private const val PREFS = "homehelp_pro_prefs"
    private const val KEY_SERVER = "server_base"

    /** Current backend base URL (with trailing slash); updated by [refreshBaseUrl]/[setServerUrl]. */
    @Volatile var baseUrl: String = FALLBACK_URL

    /** Bearer token issued by /api/worker/auth/verify; attached to every later call. */
    @Volatile var token: String? = null

    @Volatile private var refreshed = false
    @Volatile private var manualOverride = false
    private var prefs: SharedPreferences? = null

    // Bare client used ONLY to fetch the config (not host-rewritten by the interceptor).
    private val bare = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .build()

    /** Load any saved (manual) server address. Call once from MainActivity.onCreate. */
    fun init(context: Context) {
        val p = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs = p
        val saved = p.getString(KEY_SERVER, null)
        if (!saved.isNullOrBlank()) {
            baseUrl = withSlash(normalize(saved))
            manualOverride = true
        }
    }

    /** The current backend address (host:port, no trailing slash), e.g. http://192.168.0.112:4000 */
    fun serverUrl(): String = baseUrl.trimEnd('/')

    /** Update + persist a manual backend address; wins over the config file. */
    fun setServerUrl(raw: String) {
        val norm = normalize(raw)
        baseUrl = withSlash(norm)
        manualOverride = true
        prefs?.edit()?.putString(KEY_SERVER, norm)?.apply()
    }

    /** Pull the live backend URL from the public config. Blocking — call off the main thread.
     *  A manual override wins, so we skip the fetch when one is set. */
    fun refreshBaseUrl() {
        if (refreshed || manualOverride) return
        try {
            val req = Request.Builder().url(CONFIG_URL + "?t=" + System.currentTimeMillis()).build()
            bare.newCall(req).execute().use { resp ->
                val body = resp.body?.string()
                if (resp.isSuccessful && !body.isNullOrBlank()) {
                    val api = Regex("\"apiBase\"\\s*:\\s*\"([^\"]+)\"").find(body)?.groupValues?.get(1)
                    if (!api.isNullOrBlank()) {
                        baseUrl = withSlash(api)
                        refreshed = true
                    }
                }
            }
        } catch (_: Exception) { /* keep the fallback */ }
    }

    private fun withSlash(u: String): String = if (u.endsWith("/")) u else "$u/"

    private fun normalize(raw: String): String {
        var u = raw.trim()
        if (u.isEmpty()) return DEFAULT_SERVER
        if (!u.startsWith("http://") && !u.startsWith("https://")) u = "http://$u"
        u = u.trimEnd('/')
        // tolerate someone pasting the full ".../api/worker" or ".../worker" path
        if (u.endsWith("/api/worker")) u = u.removeSuffix("/api/worker")
        if (u.endsWith("/worker")) u = u.removeSuffix("/worker")
        return u
    }

    val api: ApiService by lazy {
        val logging = HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC }
        // Rewrite each request's scheme/host/port to the current baseUrl, then attach the token.
        val dynamic = Interceptor { chain ->
            val orig = chain.request()
            val base = baseUrl.toHttpUrlOrNull()
            val url = if (base != null) orig.url.newBuilder()
                .scheme(base.scheme).host(base.host).port(base.port).build()
            else orig.url
            val req = orig.newBuilder().url(url)
            token?.let { req.header("Authorization", "Bearer $it") }
            chain.proceed(req.build())
        }
        val client = OkHttpClient.Builder()
            .addInterceptor(dynamic)
            .addInterceptor(logging)
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(8, TimeUnit.SECONDS)
            .build()
        Retrofit.Builder()
            .baseUrl(FALLBACK_URL) // placeholder for path resolution; interceptor swaps the host
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }
}
