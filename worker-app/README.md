# HomeHelp Pro — Worker App

Android app for house-help / cleaning professionals, built from the mock screens and the
`HOMEHELP_PRO_PLAN.md` / `HOMEHELP_PRO_ROADMAP_AND_WORKFLOWS.md` documents.

Native **Kotlin + Jetpack Compose**. All 12 screens and the full job-lifecycle workflow are
implemented with an in-memory state machine and mock data (no backend required to run).

## Screens / Workflow

Login → Home (Go Online) → New Job Request (18s countdown) → Job Details → On The Way →
Start Service (OTP `4721`) → In Progress (live timer) → Job Completed (rating) → settle to
Earnings/Wallet. Plus Bookings, Earnings, Wallet, and Profile tabs.

State machine: `NONE → REQUESTED → ACCEPTED → ON_THE_WAY → ARRIVED → IN_PROGRESS → COMPLETED → (settle)`
(see `app/src/main/java/com/homehelp/pro/AppViewModel.kt`).

## Build

Prerequisites: JDK 17+ and the Android SDK (API 34, build-tools 34).

```bash
./gradlew assembleDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk`

## Install

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Or copy the APK to a phone and open it (enable "Install unknown apps").

## Demo notes

- Login: any 10-digit number, then any 4-digit OTP.
- On Home, toggle **Go Online**, then tap **Simulate New Job Request** to start the flow.
- Service start OTP is **4721**.
