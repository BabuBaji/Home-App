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
    private const val FALLBACK_URL = "http://192.168.0.114:8080/"
    private const val CONFIG_URL = "https://raw.githubusercontent.com/BabuBaji/Home-App/Baji/app-config.json"

    /** Current backend base URL — updated by [refreshBaseUrl]. */
    @Volatile var baseUrl: String = FALLBACK_URL

    /** Bearer token issued by /api/worker/auth/verify; attached to every later call. */
    @Volatile var token: String? = null

    @Volatile private var refreshed = false

    // Bare client used ONLY to fetch the config (not host-rewritten by the interceptor).
    private val bare = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
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
