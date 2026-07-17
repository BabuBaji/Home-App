package com.homehelp.pro.network

import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Single Retrofit instance for the shared HomeHelp backend (same server the customer
 * and admin apps use); the worker API lives under api/worker.
 *
 * The backend URL is resolved at runtime from a small public config file
 * (app-config.json on GitHub), so the app can be repointed at a new tunnel/host
 * WITHOUT rebuilding the APK. A request interceptor rewrites every call to the current
 * [baseUrl]; if the config can't be fetched we keep [FALLBACK_URL] (the PC's LAN IP for
 * same-Wi-Fi testing).
 */
object RetrofitClient {
    // Public tunnel testing: the PC gateway is exposed via a Cloudflare quick tunnel, so the
    // app works on any network (mobile data / different Wi-Fi) with no LAN dependency.
    // NOTE: quick-tunnel URLs are ephemeral — if the tunnel restarts, rebuild with the new URL.
    // Over USB: `adb reverse tcp:8080 tcp:8080` maps the phone's localhost:8080 to the PC's
    // gateway, so the app reaches the backend through the cable. Stable across sessions, unlike a
    // cloudflared quick tunnel whose URL changes every restart. Needs the cable (or a re-run of
    // adb reverse) — swap in a tunnel URL here when testing off-desk.
    private const val FALLBACK_URL = "http://localhost:8080/"
    private const val CONFIG_URL = "https://raw.githubusercontent.com/BabuBaji/Home-App/Baji/app-config.json"

    /** Current backend base URL — updated by [refreshBaseUrl]. */
    @Volatile var baseUrl: String = FALLBACK_URL

    /** Bearer token issued by /api/worker/auth/verify; attached to every later call. */
    @Volatile var token: String? = null

    @Volatile private var refreshed = false

    // Bare client used ONLY to fetch the config (not host-rewritten by the interceptor).
    private val bare = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(12, TimeUnit.SECONDS)
        .build()

    /** Pull the live backend URL from the public config. Blocking — call off the main thread. */
    fun refreshBaseUrl() {
        if (refreshed) return
        try {
            val req = Request.Builder().url(CONFIG_URL + "?t=" + System.currentTimeMillis()).build()
            bare.newCall(req).execute().use { resp ->
                val body = resp.body?.string()
                if (resp.isSuccessful && !body.isNullOrBlank()) {
                    val api = Regex("\"apiBase\"\\s*:\\s*\"([^\"]+)\"").find(body)?.groupValues?.get(1)
                    if (!api.isNullOrBlank()) {
                        baseUrl = if (api.endsWith("/")) api else "$api/"
                        refreshed = true
                    }
                }
            }
        } catch (_: Exception) { /* keep the fallback */ }
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
        // Generous timeouts: a cold Cloudflare quick-tunnel can take >8s for the first
        // round-trip, which previously surfaced as "could not reach the server" on login.
        val client = OkHttpClient.Builder()
            .addInterceptor(dynamic)
            .addInterceptor(logging)
            .connectTimeout(25, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .callTimeout(35, TimeUnit.SECONDS)
            .build()
        Retrofit.Builder()
            .baseUrl(FALLBACK_URL) // placeholder for path resolution; interceptor swaps the host
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }
}
