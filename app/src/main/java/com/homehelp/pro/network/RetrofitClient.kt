package com.homehelp.pro.network

import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Single Retrofit instance pointing at the HomeHelp backend.
 *
 * BASE_URL = http://10.0.2.2:8080 works on the Android emulator (host loopback).
 * On a physical device connected over USB we run `adb reverse tcp:8080 tcp:8080`,
 * which makes the phone's own localhost forward to the PC — so 127.0.0.1 resolves
 * the same way. 10.0.2.2 is emulator-only, so we default to localhost which the
 * adb-reverse tunnel serves on real hardware.
 */
object RetrofitClient {
    // adb reverse maps device 127.0.0.1:8080 -> PC 127.0.0.1:8080
    const val BASE_URL = "http://127.0.0.1:8080/"

    val api: ApiService by lazy {
        val logging = HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC }
        val client = OkHttpClient.Builder()
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
