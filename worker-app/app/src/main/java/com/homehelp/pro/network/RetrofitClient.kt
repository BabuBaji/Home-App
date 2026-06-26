package com.homehelp.pro.network

import android.content.Context
import android.content.SharedPreferences
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Retrofit client for the HomeHelp backend, with a runtime-configurable server address
 * so the app does not need rebuilding when the dev machine's IP changes.
 *
 * The address is the backend's base (host:port); the worker API lives under `/worker`.
 * Default is the dev PC's Wi-Fi LAN IP — override it from the in-app "Server settings"
 * on the login screen. Persisted in SharedPreferences.
 *
 * (USB alternative: set it to http://127.0.0.1:4000 and run `adb reverse tcp:4000 tcp:4000`.
 *  Emulator: http://10.0.2.2:4000.)
 */
object RetrofitClient {
    const val DEFAULT_SERVER = "http://192.168.0.112:4000"
    private const val PREFS = "homehelp_pro_prefs"
    private const val KEY_SERVER = "server_base"

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
        // tolerate someone pasting the full ".../worker" path
        if (u.endsWith("/worker")) u = u.removeSuffix("/worker")
        return u
    }

    val api: ApiService
        get() = cached ?: build().also { cached = it }

    private fun build(): ApiService {
        val logging = HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC }
        val client = OkHttpClient.Builder()
            .addInterceptor(logging)
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(8, TimeUnit.SECONDS)
            .build()
        return Retrofit.Builder()
            .baseUrl("$serverBase/worker/")
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }
}
