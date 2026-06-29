package com.homehelp.pro.network

import android.content.Context
import android.content.SharedPreferences
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Retrofit client for the shared HomeHelp backend (the same server the customer and admin
 * apps use), with a runtime-configurable server address so the app does not need rebuilding
 * when the dev machine's IP changes.
 *
 * The worker API lives under `/api/worker` — those route prefixes are baked into the
 * endpoint paths in [ApiService], so the base URL here is just the backend root (host:port).
 * Default is the dev PC's Wi-Fi LAN IP — override it from the in-app "Server settings" on the
 * login screen. Persisted in SharedPreferences.
 *
 *   - Wi-Fi (real phone):  http://<PC-LAN-IP>:4000   e.g. http://192.168.0.112:4000
 *   - Emulator:            http://10.0.2.2:4000
 *   - USB + adb reverse:   http://127.0.0.1:4000      (run: adb reverse tcp:4000 tcp:4000)
 */
object RetrofitClient {
    const val DEFAULT_SERVER = "http://192.168.0.112:4000"
    private const val PREFS = "homehelp_pro_prefs"
    private const val KEY_SERVER = "server_base"

    /** Bearer token issued by /api/worker/auth/verify; attached to every later call. */
    @Volatile
    var token: String? = null

    @Volatile private var serverBase: String = DEFAULT_SERVER
    @Volatile private var cached: ApiService? = null
    private var prefs: SharedPreferences? = null

    /** Load any saved server address. Call once from MainActivity.onCreate. */
    fun init(context: Context) {
        val p = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs = p
        serverBase = p.getString(KEY_SERVER, DEFAULT_SERVER) ?: DEFAULT_SERVER
    }

    /** The current backend address (host:port, no trailing slash), e.g. http://192.168.0.112:4000 */
    fun serverUrl(): String = serverBase

    /** Update + persist the backend address; the next api call uses it. */
    fun setServerUrl(raw: String) {
        serverBase = normalize(raw)
        prefs?.edit()?.putString(KEY_SERVER, serverBase)?.apply()
        cached = null // force the api to rebuild against the new address
    }

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

    val api: ApiService
        get() = cached ?: build().also { cached = it }

    private fun build(): ApiService {
        val logging = HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC }
        // Attach the worker's bearer token (once logged in) to every request.
        val authHeader = okhttp3.Interceptor { chain ->
            val req = chain.request().newBuilder()
            token?.let { req.header("Authorization", "Bearer $it") }
            chain.proceed(req.build())
        }
        val client = OkHttpClient.Builder()
            .addInterceptor(authHeader)
            .addInterceptor(logging)
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(8, TimeUnit.SECONDS)
            .build()
        return Retrofit.Builder()
            // Backend root; the /api/worker prefix is part of each ApiService path.
            .baseUrl("$serverBase/")
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }
}
