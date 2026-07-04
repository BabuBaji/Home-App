# HomeHelp — Admin App (web + mobile)

A premium, responsive admin panel for the HomeHelp home-services platform. Works in
the browser **and** packages to an Android APK (Capacitor). It shares the existing
backend + SQLite database with the customer app, so it manages **real** customers,
bookings, payments, services and settings.

## Architecture

```
Home-App/
├─ customer-app/
│  └─ server/                 ← single shared backend (Express + node:sqlite + socket.io)
│     ├─ index.js             ← customer API  (admin router mounted at /api/admin)
│     ├─ admin.js             ← admin REST API  (NEW)
│     ├─ admin-db.js          ← admin tables: workers, admins, settings, complaints, audit (NEW)
│     ├─ db.js  catalog.js
│     └─ homehelp.db          ← one database for everything
└─ ADMIN/admin-app/           ← this app (React + Vite + TS + Capacitor)
```

## Running (web)

```bash
# 1) start the shared backend (from customer-app)
cd ../../customer-app
npm run server                 # http://localhost:4000

# 2) start the admin web app (from this folder)
cd ../ADMIN/admin-app
npm install
npm run dev                    # http://localhost:5174  (proxies /api → :4000)
```

**Login:** `admin@homehelp.in` / `admin123`  (also `ops@homehelp.in` / `ops12345`, manager role)

> Change these in production — passwords are scrypt-hashed in the `admins` table.

## Building the Android APK

```powershell
# backend must be reachable on your LAN; this auto-detects your Wi-Fi IP
.\build-apk.ps1
# → ../../HomeHelp-Admin-debug.apk   then: adb install -r ..\..\HomeHelp-Admin-debug.apk
```

The phone and PC must be on the **same Wi-Fi**, and the backend running (`npm run server`).

## Features

| Section | What it does |
|---|---|
| **Dashboard** | Live stats, 7-day booking/revenue charts, bookings-by-city, top services, recent activity |
| **Customers** | Search/filter, view detail, block/unblock, adjust wallet, see bookings & transactions |
| **Workers (Pros)** | CRUD, verify, status (active/pending/inactive/suspended), ratings, earnings |
| **Bookings** | Filter by state, assign a professional, change status (pushed live to the customer app via socket) |
| **Services** | CRUD the catalogue, prices and availability (syncs instantly to customer apps) |
| **Pricing** | Subscription plans + platform fee / tax / commission config |
| **Payments** | Transactions, revenue, method split |
| **Refunds** | Issue refunds (credits the customer wallet) |
| **Complaints / Tickets** | Triage and resolve |
| **Notifications** | Broadcast announcements/offers to all customer apps in real time |
| **Reports / Analytics** | 30-day trends, top workers, CSV export, admin audit log |
| **Settings** | Platform info, fees, operations toggles, and **Backend API Keys & Integrations** |
| **Admin Users** | Manage admin accounts with role-based access (super → admin → manager → support) |

## Backend API Keys

Settings → **API Keys & Integrations** stores Razorpay, Google Maps, MSG91 (SMS/OTP),
Firebase (push) and SMTP credentials. Secrets are masked once saved. Razorpay keys are
mirrored to `server/payment.config.json`, so entering live keys here switches the
customer app from mock to live payments on the next backend restart.

## Roles

`super` > `admin` > `manager` > `support`. Settings/API-keys and admin management need
`admin`+; deleting admins needs `super`; worker/service/booking edits need `manager`+.
