# HomeHelp Pro — Worker App

Android app for house-help / cleaning professionals, built from the mock screens and the
`HOMEHELP_PRO_PLAN.md` / `HOMEHELP_PRO_ROADMAP_AND_WORKFLOWS.md` documents.

Native **Kotlin + Jetpack Compose**. All 12 screens and the full job-lifecycle workflow are
implemented with an in-memory state machine, and the app still runs fully offline on mock data
when no backend is reachable.

## Backend (unified with the customer + admin apps)

The worker app now talks to the **shared HomeHelp backend** (`services/api`, port 4000) —
the same Node/Express + SQLite server the customer and admin apps use — via the worker API under
`/api/worker/*`. This makes the three apps one system:

- A worker logs in and becomes a real row in the shared `workers` table (the admin panel manages them).
- "New job request" serves a **real customer booking** from the shared `bookings` table.
- Every lifecycle action (accept → on the way → arrived → start with the customer's OTP → end →
  settle) updates that same booking, so the **customer app sees it live** (socket.io) and it shows
  on the **admin dispatch board**. Settlement credits the worker's wallet/earnings (after the
  platform commission), all persisted in `homehelp.db`.

Run the shared backend:

```bash
cd ../../services/api && npm install && npm start   # http://localhost:4000
```

Connect a physical device over USB so its localhost forwards to the PC:

```bash
adb reverse tcp:4000 tcp:4000
```

The base URL lives in `app/src/main/java/com/homehelp/pro/network/RetrofitClient.kt`
(`http://127.0.0.1:4000/`; use `http://10.0.2.2:4000/` on the emulator).

> `backend/` is the original standalone prototype server, kept for offline/standalone use only.
> The app no longer targets it — it uses the shared backend above.

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

- Login: any 10-digit number, then any 4-digit OTP. Logging in with **9000012345** lands on the
  seeded demo worker (Rahul Kumar) on the shared backend.
- On Home, toggle **Go Online**, then tap **Simulate New Job Request** to start the flow.
- **Connected to the backend:** the job is a real pending customer booking and the service-start
  OTP is that booking's OTP (shown in the customer app / created via the customer flow).
- **Offline (no backend):** the app falls back to the built-in demo job pool, whose start OTP is **4721**.
