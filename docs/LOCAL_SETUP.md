# HomeHelp — Run It Locally (line by line)

Everything you need to get the backend, the customer app, the admin panel and the worker
Android app running on one machine. Commands are written for **Windows PowerShell** (the
machine this repo is developed on).

Read top to bottom the first time. After that, [Part 6](#part-6--the-daily-loop) is the only
part you need.

---

## What you are starting

```
 customer app (5173)   admin panel (5174)   worker app (Android)
          │                    │                     │
          └────────────────────┴─────────────────────┘
                               ▼
                     API Gateway  http://localhost:8080
                               │
   auth 4002 · catalog 4001 · booking 4006 · dispatch 4007 · payment 4008
   wallet 4009 · worker 4004 · notification 4003 · admin 4010
                               │
        9 Postgres databases  +  Redis (event bus)  +  MinIO (KYC files)
```

There is **no monolith**. The whole backend runs as one Docker Compose stack; the three
front-ends run outside Docker.

---

## Part 0 — Prerequisites

Install these once. Versions are what the project is built and tested against.

- **Docker Desktop** (with the Compose v2 CLI, i.e. `docker compose`, not `docker-compose`).
  Start it and wait for the whale icon to go steady before running anything.
- **Node.js 20 LTS or newer** — `node -v` must print `v20.x` or higher.
- **Git** — needed to clone, and Git Bash gives you the `sh` used by the seed scripts.
- *(Android apps only)* **JDK 17** — Eclipse Adoptium `jdk-17.x`, or the JDK bundled with
  Android Studio.
- *(Android apps only)* **Android SDK**, platform **API 34** + **build-tools 34**, plus
  **platform-tools** (that is where `adb.exe` lives). Android Studio installs all of it.

Verify:

```powershell
docker --version
docker compose version
node -v
npm -v
java -version          # only if you are building the Android apps
adb version            # only if you are building the Android apps
```

---

## Part 1 — Get the code

1. Clone the repo (skip if you already have it):

   ```powershell
   git clone https://github.com/BabuBaji/Home-App.git "D:\Smartgrow Projects\Home-App"
   ```

2. Enter it. Every path in this document is relative to this folder:

   ```powershell
   cd "D:\Smartgrow Projects\Home-App"
   ```

3. Check out the working branch:

   ```powershell
   git checkout Baji
   ```

---

## Part 2 — Configure the backend (`infra/.env`)

`infra/.env` is **gitignored** — a fresh clone does not have one, and the stack will not
start without it.

4. Copy the committed template:

   ```powershell
   Copy-Item infra\.env.example infra\.env
   ```

5. Generate a session-signing secret. Every service that reads a session **refuses to boot**
   with an empty `JWT_SECRET`:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

6. Open `infra/.env` and paste that value after `JWT_SECRET=`:

   ```
   JWT_SECRET=<the string you just generated>
   ```

7. Confirm the rest of the local-dev values. The defaults in the template are fine for a local
   machine — these are the ones that matter:

   | Key | Local value | What it does |
   |---|---|---|
   | `POSTGRES_USER` / `POSTGRES_PASSWORD` | `homehelp` / `change-me` | shared by all 9 databases |
   | `INTERNAL_KEY` | any long string | service-to-service `x-internal-key` header |
   | `FINANCE_ENC_KEY` | any long string | encrypts finance data in the payment service |
   | `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` | `admin@homehelp.in` / your choice | the admin login created on first boot |
   | `OPS_SEED_EMAIL` / `OPS_SEED_PASSWORD` | `ops@homehelp.in` / your choice | second seeded admin |
   | `DEV_OTP` | `4321` | fixed **customer** login OTP |
   | `WORKER_DEV_OTP` | `1234` | fixed **worker** login OTP |
   | `S3_*` | leave as-is | matches the bundled MinIO container |
   | `MSG91_*`, `RAZORPAY_*`, `GOOGLE_MAPS_KEY` | leave blank | optional integrations; blank = disabled / fallback |

   > **Leave `DEV_OTP` / `WORKER_DEV_OTP` unset in any reachable environment.** Locally they
   > are what lets you log in without an SMS provider; set on a public host they let anyone
   > sign in as any user.

8. If your machine already runs Postgres, Redis or MinIO, note that this stack deliberately
   avoids the default host ports (Postgres `5442`–`5443` and `5434`–`5440`, Redis `6380`,
   MinIO `9010`/`9011`), so a clash is unlikely. If one still occurs, change the **left**
   number of the `ports:` entry in `infra/docker-compose.yml` — never the right one.

---

## Part 3 — Start the backend

9. Bring up the whole stack (Redis + MinIO + 9 Postgres + 10 services). The first run builds
   ten images and takes several minutes:

   ```powershell
   docker compose -f infra/docker-compose.yml up --build
   ```

   From the repo root, `npm run up` is the same command.

   Leave this window open — it streams the logs of every service. To run detached instead, add
   `-d`.

10. In a **second** terminal, confirm the gateway and all its upstreams are healthy:

    ```powershell
    curl.exe http://localhost:8080/health
    ```

    You want a JSON body containing `"ok":true`.

11. Sanity-check one real route through the gateway:

    ```powershell
    curl.exe http://localhost:8080/api/services
    ```

    This returns the seeded service catalogue. Each service seeds its own demo data on first
    boot, so there is **no migration step to run** for a fresh install.

12. To stop the stack:

    ```powershell
    docker compose -f infra/docker-compose.yml down      # or: npm run down
    ```

    Add `-v` to also delete the database volumes and start from scratch next time.

### Where things listen

| Piece | URL / host port |
|---|---|
| API gateway (everything goes through here) | `http://localhost:8080` |
| Redis | `localhost:6380` |
| MinIO console (KYC / media storage) | `http://127.0.0.1:9011` — user `homehelp`, password from `S3_SECRET_KEY` |
| catalog-db / auth-db | `5442` / `5443` |
| notification-db / worker-db / booking-db | `5434` / `5435` / `5436` |
| dispatch-db / payment-db / wallet-db / admin-db | `5437` / `5438` / `5439` / `5440` |

---

## Part 4 — Run the customer app (web, dev server)

13. Install its dependencies:

    ```powershell
    cd apps\customer
    npm install
    ```

14. Start the dev server:

    ```powershell
    npm run dev
    ```

15. It opens `http://localhost:5173` automatically. Vite proxies `/api` and `/socket.io` to
    `http://localhost:8080`, so **the backend from Part 3 must be running**.

16. Log in with any 10-digit phone number, then the OTP from `DEV_OTP` (`4321` by default).

    > In dev the app deliberately keeps its API base **empty** and uses the Vite proxy. Do not
    > set `VITE_API_URL` for browser development — the `.env.production` holding a LAN IP is
    > written only by the APK build script.

---

## Part 5 — Run the admin panel (web, dev server)

17. In a new terminal:

    ```powershell
    cd apps\admin
    npm install
    npm run dev
    ```

18. It opens `http://localhost:5174`, proxying `/api` and `/socket.io` to `127.0.0.1:8080`.

19. Sign in with `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` from `infra/.env`
    (default `admin@homehelp.in`). Those credentials are seeded only on the **first** boot of
    an empty admin database — change them later in the panel, not in `.env`.

    > Admin access is permission-driven (RBAC): what you can see depends on the permissions on
    > your admin role, not on a hardcoded "is admin" flag.

20. *(Optional)* To serve the **built** panel on a single origin — required if you ever expose
    it through a tunnel, because the panel relies on a same-origin `/api` proxy:

    ```powershell
    npm run build
    node serve-admin.cjs        # http://localhost:8101, proxies /api -> 127.0.0.1:8080
    ```

---

## Part 6 — The daily loop

Once Parts 0–2 are done, starting the whole system is three terminals:

```powershell
# 1  backend
cd "D:\Smartgrow Projects\Home-App"; docker compose -f infra/docker-compose.yml up

# 2  customer app  -> http://localhost:5173
cd "D:\Smartgrow Projects\Home-App\apps\customer"; npm run dev

# 3  admin panel   -> http://localhost:5174
cd "D:\Smartgrow Projects\Home-App\apps\admin"; npm run dev
```

Test logins: customer OTP `4321`, worker OTP `1234`, admin `admin@homehelp.in` plus the
password in `infra/.env`.

---

## Part 7 — Run the worker app (native Android, Kotlin)

The worker app is `apps/worker` — native Kotlin / Jetpack Compose. (The `app/` folder at the
repo root is an older prototype of the same app; build `apps/worker`.)

21. Point Gradle at your Android SDK. Edit `apps/worker/local.properties`:

    ```
    sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk
    ```

22. Tell the app where your backend is. Open
    `apps/worker/app/src/main/java/com/homehelp/pro/network/RetrofitClient.kt` and look at
    `PINNED_BASE_URL`. It is currently hardcoded to one specific machine:

    ```kotlin
    private const val PINNED_BASE_URL = "http://192.168.0.109:8080/"
    ```

    Pick one:

    - **USB cable (simplest, most reliable):** set it to `""` (blank). The app then falls back
      to `http://localhost:8080/`, and step 25 forwards that to your PC.
    - **Same Wi-Fi:** set it to `http://<your-PC-LAN-IP>:8080/`. Find the IP with `ipconfig` —
      use the IPv4 address of your Wi-Fi adapter.
    - **Emulator:** set it to `http://10.0.2.2:8080/`.

    When `PINNED_BASE_URL` is blank the app instead resolves its backend at runtime from the
    published `app-config.json` (see Part 9). **Blank it before any release build.**

23. Build the debug APK:

    ```powershell
    cd apps\worker
    .\gradlew.bat assembleDebug
    ```

    Output: `apps/worker/app/build/outputs/apk/debug/app-debug.apk`.

24. Install it on a connected phone (USB debugging on) or an emulator:

    ```powershell
    adb install -r app\build\outputs\apk\debug\app-debug.apk
    ```

25. **If you chose the USB option in step 22**, map the phone's `localhost:8080` back to your
    PC. Re-run this after every reconnect:

    ```powershell
    adb reverse tcp:8080 tcp:8080
    ```

26. Log in with any 10-digit number and the OTP from `WORKER_DEV_OTP` (`1234` by default).

You can also just open `apps/worker` in Android Studio and press Run.

---

## Part 8 — Build the customer / admin APKs (optional)

Both web apps are wrapped with Capacitor. The build scripts auto-detect your Wi-Fi LAN IP,
bake it in as `VITE_API_URL`, and assemble the APK — so the phone reaches your PC over Wi-Fi
with no cable.

27. Customer APK (also installs it if a phone is connected):

    ```powershell
    cd apps\customer
    .\build-apk.ps1
    ```

28. Admin APK:

    ```powershell
    cd apps\admin
    .\build-apk.ps1
    ```

29. Both drop the APK at the repo root (`HomeHelp-*-debug.apk`). The phone and the PC must be
    on the **same Wi-Fi**, and Windows Firewall must allow inbound TCP `8080` — otherwise the
    app reaches nothing.

    > The admin script hardcodes `JAVA_HOME` / `ANDROID_HOME` to the original build machine's
    > paths near the top. Edit those two lines if your toolchain lives elsewhere. The customer
    > script auto-detects them.

30. *(Optional)* To hand the APKs out over a link, `apk-dist/serve-apk.cjs` is a download-only
    static server that does not touch the gateway:

    ```powershell
    node apk-dist\serve-apk.cjs        # http://localhost:8099
    ```

---

## Part 9 — Testing from any network (optional)

`app-config.json` at the repo root holds the backend URL the **installed** apps read at
startup, so a phone can be repointed without rebuilding:

```json
{ "apiBase": "http://192.168.0.109:8080" }
```

31. To expose your local stack publicly and publish the new URL in one command (requires
    `cloudflared` — `winget install Cloudflare.cloudflared`):

    ```powershell
    .\infra\scripts\go-live.ps1
    ```

    It starts the stack if needed, opens a Cloudflare tunnel to `:8080`, writes the tunnel URL
    into `app-config.json`, and pushes that to the `Baji` branch. Keep the window open; Ctrl+C
    stops the tunnel.

    > Caveats: quick-tunnel URLs change on every restart; GitHub's raw CDN can serve a stale
    > copy for a few minutes after the push; and the worker app ignores the published config
    > entirely while `PINNED_BASE_URL` is set (step 22).

---

## Part 10 — Seed extra demo data (optional)

Services seed their own baseline data on boot. These scripts add richer worker data by running
inside a container that already has `pg` installed. Run them from the repo root **with the
stack up**, in Git Bash (they are `sh` scripts):

```bash
npm run seed:earnings                  # 60 days of earnings for worker 1
npm run seed:earnings -- 4 --days=90   # worker 4, 90 days
npm run seed:documents -- --all        # KYC placeholder docs for every active worker
npm run seed:skills
npm run seed:availability
npm run seed:notes
```

> `npm run migrate` (`infra/migrate/index.js`) is a **one-time import** from the retired
> SQLite monolith. You do not need it for a fresh local install. Its hardcoded ports
> (`5432` / `5433` for catalog / auth) also predate the compose remap to `5442` / `5443`, so
> they would need updating before it could run today.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| A service exits immediately on `up` | `JWT_SECRET` is empty in `infra/.env` (steps 5–6). Services refuse to start without it. |
| `port is already allocated` | Another local Postgres / Redis / MinIO holds the port. Change the left-hand number in the `ports:` entry in `infra/docker-compose.yml`. |
| Gateway `/health` fails but containers are up | Give it a moment — the gateway waits on nine services. Then check `docker compose -f infra/docker-compose.yml logs gateway`. |
| Web app shows network errors in dev | The backend is not running, or you set `VITE_API_URL` — dev must use the empty base plus the Vite proxy. |
| Phone app says "could not reach the server" | Wrong base URL (step 22), phone on a different network, `adb reverse` not re-run after reconnect, or the firewall blocking inbound 8080. |
| Admin login rejected | The seed values only apply to a **fresh** admin DB. Reset with `docker compose -f infra/docker-compose.yml down -v` (this deletes all data). |
| Changed `.env` but nothing changed | Compose reads it at container creation. Recreate: `down` then `up` — a plain restart is not enough. |
| Seed script fails with a path error | Run it from Git Bash, not PowerShell — the runner is an `sh` script. |
| Stale or odd data after a schema change | `docker compose -f infra/docker-compose.yml down -v` wipes all nine databases; they re-seed on the next `up`. |

---

## Reference

- `docs/microservices-architecture.md` — services, ownership, events, realtime.
- `docs/payment-logic.md` — payment and settlement flow.
- `infra/DEPLOY.md` — deploying to a VM (not local).
