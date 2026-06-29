package com.homehelp.pro.network

import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Single Retrofit instance pointing at the shared HomeHelp backend (the same server
 * the customer and admin apps use). The worker API lives under the api/worker route.
 *
 * On a physical phone over Wi-Fi, point this at the PC's LAN IP (same network).
 * Update the IP if your PC's address changes (the customer/admin apps auto-detect
 * it at build time via build-apk.ps1; this native app is set here).
 *   - Wi-Fi (real phone):  http://<PC-LAN-IP>:4000/   e.g. http://192.168.0.109:4000/
 *   - Emulator:            http://10.0.2.2:4000/        (host loopback)
 *   - USB + adb reverse:   http://127.0.0.1:4000/       (run: adb reverse tcp:4000 tcp:4000)
 */
object RetrofitClient {
    // Shared HomeHelp backend on the PC's Wi-Fi LAN IP (phone must be on the same Wi-Fi).
    const val BASE_URL = "http://192.168.0.109:4000/"

    /** Bearer token issued by /api/worker/auth/verify; attached to every later call. */
    @Volatile
    var token: String? = null

    val api: ApiService by lazy {
        val logging = HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC }
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
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }
}
