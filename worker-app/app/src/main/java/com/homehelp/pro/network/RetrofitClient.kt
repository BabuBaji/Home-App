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
 * BASE_URL = http://10.0.2.2:4000 works on the Android emulator (host loopback).
 * On a physical device connected over USB we run `adb reverse tcp:4000 tcp:4000`,
 * which makes the phone's own localhost forward to the PC — so 127.0.0.1 resolves
 * the same way. 10.0.2.2 is emulator-only, so we default to localhost which the
 * adb-reverse tunnel serves on real hardware.
 */
object RetrofitClient {
    // adb reverse maps device 127.0.0.1:4000 -> PC 127.0.0.1:4000 (shared backend port)
    const val BASE_URL = "http://127.0.0.1:4000/"

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
