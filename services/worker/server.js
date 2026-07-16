// HomeHelp Worker Service
// -----------------------
// Owns worker identity/profile + a balance snapshot (account-of-record) on its own Postgres.
// Serves worker-app auth/bootstrap/profile/documents and the admin worker panel. The dispatch
// service reads worker availability/services/location from here to match jobs; the wallet
// service owns the earnings LEDGER and adjusts the balance snapshot here via /internal.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import crypto from 'node:crypto'
import express from 'express'
import multer from 'multer'
import {
  makePool, migrate, makeAdminAuth, requirePerm, inScope, internalOnly, tryGet, publishEvent, subscribeEvents, publishRealtime, invalidateSettings,
  getSetting, getSettingInt, smsConfigured, sendOtpSms, sendTemplateSms,
} from '@homehelp/shared'
// Imported directly, not via the shared index: these carry dependencies (AWS SDK, jsonwebtoken)
// that only the services actually using them install.
import { ensureBucket, ensurePublicBucket, storageConfigured, sniffType, checksum, storageKey, putObject, putPublicObject, publicUrl, signedGetUrl, deleteObject } from '@homehelp/shared/storage.js'
import { signToken, tokenSubject, assertJwtSecret } from '@homehelp/shared/jwt.js'

assertJwtSecret('worker') // refuse to boot without a signing secret rather than issue forgeable sessions

const PORT = Number(process.env.PORT || 4004)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5435/worker'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const ADMIN_URL = (process.env.ADMIN_URL || 'http://localhost:4010').replace(/\/$/, '')
const BOOKING_URL = (process.env.BOOKING_URL || 'http://localhost:4006').replace(/\/$/, '')
const CATALOG_URL = (process.env.CATALOG_URL || 'http://localhost:4001').replace(/\/$/, '') // the service list a worker picks skills from
const AUTH_URL = (process.env.AUTH_URL || 'http://localhost:4002').replace(/\/$/, '')
const WALLET_URL = (process.env.WALLET_URL || 'http://localhost:4009').replace(/\/$/, '')
const NOTIFICATION_URL = (process.env.NOTIFICATION_URL || 'http://localhost:4003').replace(/\/$/, '')

process.on('unhandledRejection', (e) => console.error('[worker] unhandledRejection:', e?.message || e))

const pool = makePool(DATABASE_URL)
const adminAuth = makeAdminAuth(ADMIN_URL)

// Data scope for a single worker: any /api/admin/workers/:id* route runs this after adminAuth, so a
// scoped admin can't read or mutate a worker outside their city/zone — even by direct API call. 404
// (not 403) for both missing and out-of-scope, so ids can't be probed. The loaded row is cached on
// req._worker for handlers that want to reuse it.
async function scopeWorker(req, res, next) {
  const w = await getWorker(Number(req.params.id))
  if (!w) return res.status(404).json({ error: 'Not found' })
  if (!inScope(req.admin?.scope, { zoneId: w.zone_id, city: w.city })) return res.status(404).json({ error: 'Not found' })
  req._worker = w
  next()
}

async function init() {
  await migrate(pool, [
    `CREATE TABLE IF NOT EXISTS workers (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT, city TEXT,
      services JSONB NOT NULL DEFAULT '[]', avatar TEXT,
      status TEXT NOT NULL DEFAULT 'active', verified BOOLEAN NOT NULL DEFAULT false,
      rating REAL NOT NULL DEFAULT 4.7, jobs INTEGER NOT NULL DEFAULT 0, earnings INTEGER NOT NULL DEFAULT 0,
      balance INTEGER NOT NULL DEFAULT 0, pending INTEGER NOT NULL DEFAULT 0, hold INTEGER NOT NULL DEFAULT 0,
      withdrawn INTEGER NOT NULL DEFAULT 0, advance_outstanding INTEGER NOT NULL DEFAULT 0,
      available BOOLEAN NOT NULL DEFAULT true, last_lat REAL, last_lng REAL,
      offered_booking INTEGER, bank_status TEXT DEFAULT 'Pending',
      profile JSONB NOT NULL DEFAULT '{}', joined TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS worker_documents (id SERIAL PRIMARY KEY, worker_id INTEGER, name TEXT, file_name TEXT, status TEXT DEFAULT 'Pending', created TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS worker_notes (id SERIAL PRIMARY KEY, worker_id INTEGER, note TEXT, author TEXT, created TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS worker_metric_snapshots (id SERIAL PRIMARY KEY, worker_id INTEGER, snap_date DATE, week_jobs INTEGER, month_jobs INTEGER, completion_pct INTEGER, cancellation_pct INTEGER, rating REAL, earnings INTEGER)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_worker_snap ON worker_metric_snapshots(worker_id, snap_date)`,
    // Columns added on top of the earlier worker schema (idempotent).
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS offered_booking INTEGER`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}'`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS bank_status TEXT DEFAULT 'Pending'`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS zone_id INTEGER`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS designation TEXT`,   // Zone Manager / Team Leader / Worker — drives zone Assign-Team role lookups
    // Shifts (WFM roster): a worker is "on shift" in a zone during weekly time windows.
    // weekday 0=Sun..6=Sat; start_min/end_min = minutes from midnight (IST).
    `CREATE TABLE IF NOT EXISTS shifts (
      id SERIAL PRIMARY KEY, worker_id INTEGER NOT NULL, zone_id INTEGER,
      weekday INTEGER NOT NULL, start_min INTEGER NOT NULL, end_min INTEGER NOT NULL,
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS ix_shift_worker ON shifts(worker_id)`,
    // Job offer log — one row per booking offered to a worker, with how they responded.
    // This is the ONLY record of offers-vs-declines, so it's what the acceptance rate is
    // computed from (workers.offered_booking holds just the current offer and is overwritten).
    `CREATE TABLE IF NOT EXISTS job_offers (
      id SERIAL PRIMARY KEY, worker_id INTEGER NOT NULL, booking_id INTEGER NOT NULL,
      offered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      outcome TEXT NOT NULL DEFAULT 'offered',
      responded_at TIMESTAMPTZ,
      UNIQUE(worker_id, booking_id)
    )`,
    `CREATE INDEX IF NOT EXISTS ix_job_offers_worker ON job_offers(worker_id, offered_at)`,
    // Daily attendance: one row per worker per day with check-in/out times + GPS.
    `CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY, worker_id INTEGER NOT NULL, day DATE NOT NULL,
      check_in TIMESTAMPTZ, check_out TIMESTAMPTZ,
      in_lat REAL, in_lng REAL, out_lat REAL, out_lng REAL,
      UNIQUE(worker_id, day)
    )`,
    // Shift PLANS (min-guarantee model): the named shifts a worker signs up for. A worker picks
    // one; attendance/check-in is judged against its start_min (+ grace_min); late → penalty; and
    // the day is topped up to min_g_* if job earnings fall short. Admin-editable.
    `CREATE TABLE IF NOT EXISTS shift_defs (
      id SERIAL PRIMARY KEY, code TEXT UNIQUE, name TEXT NOT NULL,
      start_min INTEGER NOT NULL, end_min INTEGER NOT NULL,
      grace_min INTEGER NOT NULL DEFAULT 15, penalty INTEGER NOT NULL DEFAULT 50,
      min_g_weekday INTEGER NOT NULL DEFAULT 850, min_g_weekend INTEGER NOT NULL DEFAULT 950,
      active BOOLEAN NOT NULL DEFAULT true, sort INTEGER NOT NULL DEFAULT 0
    )`,
    // Business rule: check-in later than 15 min after shift start ⇒ ₹50 penalty. Normalize any
    // rows still on the old 10-min default to 15 (leaves admin-customized values untouched).
    `UPDATE shift_defs SET grace_min = 15 WHERE grace_min = 10`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS shift_def_id INTEGER`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS shift_def_id INTEGER`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS late_minutes INTEGER`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS on_time BOOLEAN`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS penalty INTEGER DEFAULT 0`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS min_g INTEGER DEFAULT 0`,
    // Assigned APARTMENTS/sites (geofence): a worker is assigned an apartment for the day; the
    // app alerts if they wander beyond `radius` metres of it. Admin-managed.
    `CREATE TABLE IF NOT EXISTS worker_sites (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, address TEXT,
      lat REAL NOT NULL, lng REAL NOT NULL, radius INTEGER NOT NULL DEFAULT 300,
      active BOOLEAN NOT NULL DEFAULT true, created TIMESTAMPTZ DEFAULT now()
    )`,
    /* ---- Phase 1: admin creates worker ----
     * employee_id is the human-facing badge number (WKR1001…), derived from the row id so it's
     * stable and never collides. `name` stays the canonical display field used by bookings,
     * dispatch and both apps — first/last are captured alongside and `name` is kept in sync,
     * rather than splitting a column half the stack reads.
     */
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS employee_id TEXT`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS first_name TEXT`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS last_name TEXT`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS alternate_mobile TEXT`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS worker_category TEXT`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS employment_type TEXT`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS joining_date DATE`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS recruiter TEXT`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS referral_source TEXT`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_workers_employee_id ON workers(employee_id)`,
    // Backfill: every existing worker gets a badge number, so the column is never half-empty.
    `UPDATE workers SET employee_id = 'WKR' || (1000 + id) WHERE employee_id IS NULL`,
    // KYC document storage. `file_name` stays the worker's display label; `storage_key` is the
    // real object in S3/MinIO. Review columns give the admin an actual approve/reject trail —
    // before this, `status` was written only by its DEFAULT and could never leave 'Pending'.
    `ALTER TABLE worker_documents ADD COLUMN IF NOT EXISTS storage_key TEXT`,
    `ALTER TABLE worker_documents ADD COLUMN IF NOT EXISTS mime TEXT`,
    `ALTER TABLE worker_documents ADD COLUMN IF NOT EXISTS size_bytes INTEGER`,
    `ALTER TABLE worker_documents ADD COLUMN IF NOT EXISTS checksum TEXT`,
    `ALTER TABLE worker_documents ADD COLUMN IF NOT EXISTS reviewed_by TEXT`,
    `ALTER TABLE worker_documents ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`,
    `ALTER TABLE worker_documents ADD COLUMN IF NOT EXISTS reject_reason TEXT`,
    /* ---- Phase 9: equipment allocation ----
     * `required` drives Phase 12's "Equipment Issued" check and defaults to FALSE for everything:
     * which kit a worker must hold before going live is the company's call, not ours. The admin
     * panel says so, rather than letting the check pass silently for a reason nobody chose.
     */
    `CREATE TABLE IF NOT EXISTS equipment_types (
      id SERIAL PRIMARY KEY, key TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      required BOOLEAN NOT NULL DEFAULT false, active BOOLEAN NOT NULL DEFAULT true,
      sort INTEGER NOT NULL DEFAULT 0, created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS worker_equipment (
      id SERIAL PRIMARY KEY, worker_id INTEGER NOT NULL,
      type_id INTEGER NOT NULL REFERENCES equipment_types(id) ON DELETE CASCADE,
      serial TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'issued',
      issued_at TIMESTAMPTZ NOT NULL DEFAULT now(), issued_by TEXT NOT NULL DEFAULT '',
      returned_at TIMESTAMPTZ, returned_by TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE INDEX IF NOT EXISTS ix_worker_equipment_worker ON worker_equipment(worker_id, status)`,

    /* ---- Phase 10: per-worker pay ----
     * commission_percent is NULL by default, meaning "use the platform-wide commission_percent
     * setting" — the behaviour every existing worker already has. Only an explicit per-worker
     * number overrides it, and the wallet reads this when it settles a job, so it moves real money.
     * wallet_enabled defaults TRUE: today every worker's wallet works, and a schema change must not
     * quietly stop people being paid.
     */
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS commission_percent INTEGER`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS wallet_enabled BOOLEAN NOT NULL DEFAULT true`,
    // Proven by a successful OTP login — the code was texted to that number and came back.
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ`,

    /* ---- Salary plans ----
     * A named rate an admin defines once and assigns, instead of typing a percentage per worker.
     *
     * NOT seeded: "Worker Level 1 = 20%" is this company's payroll, and inventing it here would put
     * a rate nobody chose in front of every new hire. An admin writes the plans; until then the
     * wizard says so and workers fall back to the platform commission.
     *
     * salary_type is per_job only. Fixed and Hybrid need a monthly payroll run — offering them
     * without one would silently pay a per-job worker nothing.
     */
    `CREATE TABLE IF NOT EXISTS salary_plans (
      id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL,
      salary_type TEXT NOT NULL DEFAULT 'per_job',
      commission_percent INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '', active BOOLEAN NOT NULL DEFAULT true,
      sort INTEGER NOT NULL DEFAULT 0, created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    /* A worker has EITHER a plan OR a manual commission_percent — never both. Two ways to set one
     * number is two sources of truth, and the one people read is whichever the UI happens to show.
     * Assigning a plan clears the manual rate and vice versa; see resolveCommission(). */
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS salary_plan_id INTEGER REFERENCES salary_plans(id) ON DELETE SET NULL`,

    /* Fixed / Hybrid salary. The plan carries the AMOUNTS — the worker screen displays them rather
     * than letting anyone re-type a rate per person, which is how two workers on "Level 1" end up
     * on different money. */
    `ALTER TABLE salary_plans ADD COLUMN IF NOT EXISTS monthly_basic INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE salary_plans ADD COLUMN IF NOT EXISTS other_allowance INTEGER NOT NULL DEFAULT 0`,
    // A GUARANTEED monthly attendance allowance, part of fixed pay (distinct from the incentive
    // plan's CONDITIONAL attendance bonus, which only pays above a threshold). Total fixed pay =
    // basic + attendance + allowance.
    `ALTER TABLE salary_plans ADD COLUMN IF NOT EXISTS attendance_allowance INTEGER NOT NULL DEFAULT 0`,

    /* Incentive plans. Each component is a RULE with a threshold the admin sets — not a named
     * policy that does nothing. Amount 0 = that component is off for this plan.
     * Only these three exist: Referral, Peak Hour and Festival bonuses would each need a trigger
     * (a referral graph, peak windows, a festival calendar) that doesn't, so they aren't offered.
     */
    `CREATE TABLE IF NOT EXISTS incentive_plans (
      id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, notes TEXT NOT NULL DEFAULT '',
      per_job_amount INTEGER NOT NULL DEFAULT 0,
      attendance_bonus_amount INTEGER NOT NULL DEFAULT 0,
      attendance_min_pct INTEGER NOT NULL DEFAULT 95,
      quality_bonus_amount INTEGER NOT NULL DEFAULT 0,
      quality_min_rating REAL NOT NULL DEFAULT 4.5,
      active BOOLEAN NOT NULL DEFAULT true, sort INTEGER NOT NULL DEFAULT 0,
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    /* The three components without an automated trigger. They're recorded on the plan as amounts and
     * the admin pays them with the existing manual-bonus action (peak-hour windows, a referral graph
     * and a festival calendar don't exist to fire them automatically). Marked 'manual' in the DTO so
     * the panel shows WHICH pay by themselves and which the admin must action. */
    `ALTER TABLE incentive_plans ADD COLUMN IF NOT EXISTS peak_hour_amount INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE incentive_plans ADD COLUMN IF NOT EXISTS referral_amount INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE incentive_plans ADD COLUMN IF NOT EXISTS festival_amount INTEGER NOT NULL DEFAULT 0`,
    /* The admin's own estimate of typical monthly incentives, shown as the "Average Incentive (Est.)"
     * range. Admin-set, not computed by us — a new worker has no history to average, so any number
     * WE produced would be invented. Blank hides the estimate lines. */
    `ALTER TABLE incentive_plans ADD COLUMN IF NOT EXISTS est_incentive_min INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE incentive_plans ADD COLUMN IF NOT EXISTS est_incentive_max INTEGER NOT NULL DEFAULT 0`,
    /* The Sitara/Shakti tier bonus, folded in from the standalone monthly scheduler. A tiered
     * ATTENDANCE reward — the worker earns the highest tier they reach that month by working days
     * (Gold also wants Sundays), gated by tier_min_rating. Paid by the payroll run, not a separate
     * cron. Each tier: { label, days, sundays, amount }. Empty = no tier bonus on this plan.
     * This replaces the old flat attendance_bonus_amount / attendance_min_pct (now unused). */
    `ALTER TABLE incentive_plans ADD COLUMN IF NOT EXISTS attendance_tiers JSONB NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE incentive_plans ADD COLUMN IF NOT EXISTS tier_min_rating REAL NOT NULL DEFAULT 4.5`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS incentive_plan_id INTEGER REFERENCES incentive_plans(id) ON DELETE SET NULL`,
    // When this salary arrangement starts. A payroll run skips a worker whose salary starts after
    // the month it's paying for, so back-dating a hire doesn't silently pay them for months they
    // hadn't joined.
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS salary_effective_from DATE`,

    /* Per-worker salary amounts. The plan is a TEMPLATE that pre-fills these; an admin can override
     * them for one worker (the Salary Details fields on the wizard). NULL = use the plan's value, so
     * a worker left untouched follows their plan and can't silently drift. Payroll reads the
     * override if present, else the plan. */
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS salary_basic INTEGER`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS salary_attendance INTEGER`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS salary_allowance INTEGER`,

    /* Statutory deductions are per-WORKER applicability (it depends on their wage and their opt-in),
     * while the RATES are platform settings an admin enters. We apply their numbers; we don't
     * invent the law. */
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS pf_applicable BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS esi_applicable BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS tds_applicable BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS salary_payment_mode TEXT NOT NULL DEFAULT 'bank'`,

    /* ================= Compensation Rule Engine =================
     * Config-driven incentives: Operations authors a rule (scope + eligibility conditions +
     * calculation) and the engine pays it — no code per bonus. Rules are VERSIONED and immutable:
     * editing a rule creates a new version; the old one is retained, and every payout pins the
     * exact version that paid it, so historical payouts never change under a later edit.
     *
     * Two triggers in this first slice:
     *  - job_completed : evaluated per completed booking, credited to the wallet immediately.
     *  - monthly_close : evaluated in the payroll run, paid on approval.
     *
     * Eligibility is a whitelist of [field, op, value] conditions (no free-text formulas), so there
     * is no arbitrary code deciding real money. Only fields with a real data source exist.
     */
    `CREATE TABLE IF NOT EXISTS incentive_rules (
      id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'Other',
      priority INTEGER NOT NULL DEFAULT 100, active BOOLEAN NOT NULL DEFAULT true,
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    // Immutable versions. is_current marks the one new evaluations use; a payout references its
    // exact version_id forever.
    `CREATE TABLE IF NOT EXISTS incentive_rule_versions (
      id SERIAL PRIMARY KEY, rule_id INTEGER NOT NULL REFERENCES incentive_rules(id) ON DELETE CASCADE,
      version INTEGER NOT NULL, is_current BOOLEAN NOT NULL DEFAULT true,
      trigger TEXT NOT NULL,
      effective_from DATE, effective_to DATE,
      scope_type TEXT NOT NULL DEFAULT 'company', scope_values JSONB NOT NULL DEFAULT '[]'::jsonb,
      match_mode TEXT NOT NULL DEFAULT 'all',           -- 'all' | 'any'
      conditions JSONB NOT NULL DEFAULT '[]'::jsonb,     -- [{ field, op, value }]
      calc_type TEXT NOT NULL DEFAULT 'fixed',           -- fixed | per_job | slab | percentage
      calc JSONB NOT NULL DEFAULT '{}'::jsonb,           -- { amount, perUnit, maxUnits, percent, base, slabMetric, slabs:[{from,to,amount}] }
      -- Stacking: rules sharing a stack_group are resolved together by the stack mode when they match
      -- the same event. Empty group = always stacks independently. allow | highest_wins | lowest_wins
      -- | exclusive (exclusive keeps the highest-priority rule; the others keep the winning amount).
      stack TEXT NOT NULL DEFAULT 'allow',
      stack_group TEXT NOT NULL DEFAULT '',
      budget_month INTEGER NOT NULL DEFAULT 0,           -- 0 = uncapped; else a hard ₹ ceiling per calendar month
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT '', created TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (rule_id, version)
    )`,
    // The engine's own ledger: one row per payout it decided. Idempotent on (version, worker, ref)
    // — ref is the booking id for a job payout, or the YYYY-MM for a monthly one. This is also the
    // budget ledger (SUM per rule per month) and the audit trail. The MONEY lands in the wallet via
    // an event (job) or a payroll line (monthly); this records that it was decided.
    `CREATE TABLE IF NOT EXISTS incentive_payouts (
      id SERIAL PRIMARY KEY,
      rule_id INTEGER NOT NULL, version_id INTEGER NOT NULL, worker_id INTEGER NOT NULL,
      trigger TEXT NOT NULL, month TEXT NOT NULL DEFAULT '', ref TEXT NOT NULL,
      amount INTEGER NOT NULL, detail TEXT NOT NULL DEFAULT '',
      created TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (version_id, worker_id, ref)
    )`,
    `CREATE INDEX IF NOT EXISTS ix_incpayout_budget ON incentive_payouts(rule_id, month)`,
    // Audit: every rule/version change, who and when.
    `CREATE TABLE IF NOT EXISTS incentive_rule_audit (
      id SERIAL PRIMARY KEY, rule_id INTEGER NOT NULL, action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '', changed_by TEXT NOT NULL DEFAULT '', created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    // Stacking (added after the versions table shipped) — resolves overlapping rules per group.
    `ALTER TABLE incentive_rule_versions ADD COLUMN IF NOT EXISTS stack_group TEXT NOT NULL DEFAULT ''`,

    /* ---- Payroll runs ----
     * A run is a DRAFT until an admin approves it. Nothing reaches a wallet before that: this
     * credits real money to real people every month, and a wrong rate is far cheaper to catch in a
     * draft than to claw back afterwards.
     */
    `CREATE TABLE IF NOT EXISTS payroll_runs (
      id SERIAL PRIMARY KEY, month TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft',
      created_by TEXT NOT NULL DEFAULT '', approved_by TEXT NOT NULL DEFAULT '',
      created TIMESTAMPTZ NOT NULL DEFAULT now(), approved_at TIMESTAMPTZ
    )`,
    `CREATE TABLE IF NOT EXISTS payroll_lines (
      id SERIAL PRIMARY KEY,
      run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
      worker_id INTEGER NOT NULL,
      basic INTEGER NOT NULL DEFAULT 0, allowance INTEGER NOT NULL DEFAULT 0,
      incentives JSONB NOT NULL DEFAULT '[]'::jsonb,
      deductions JSONB NOT NULL DEFAULT '[]'::jsonb,
      gross INTEGER NOT NULL DEFAULT 0, total_deductions INTEGER NOT NULL DEFAULT 0,
      net INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      UNIQUE (run_id, worker_id)
    )`,

    /* Organisational assignment. Recorded facts an admin asserts — dispatch does NOT read these
     * (it matches on zone), so they inform people, not routing. */
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS cluster_id INTEGER`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS store_id INTEGER`,
    // The admin they report to. Stored as the admin's id; the panel resolves the name from its own
    // admin list rather than this service keeping a copy that goes stale on a rename.
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS reporting_manager_id INTEGER`,

    /* Job radius & coverage. UNLIKE cluster/store/manager, these two DO change what dispatch offers.
     *
     * allow_outside_radius defaults TRUE, which is today's behaviour: zone is a soft preference and
     * out-of-zone work is still offered when a worker's own zone is quiet, so nobody starves. Set it
     * false and the assignment becomes a real restriction — own zone only, and within job_radius_km
     * of their store. Defaulting it false instead would have silently cut every existing worker off
     * from work the moment this shipped.
     */
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS job_radius_km INTEGER`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS allow_outside_radius BOOLEAN NOT NULL DEFAULT true`,

    /* ---- Phase 8: background verification ----
     * ONLY the two checks that have nowhere else to live. Aadhaar, PAN, Police, Medical and Address
     * are already Phase 4 documents an admin reviews, so Phase 8 READS those rather than storing a
     * second tick — two sources of truth for "Aadhaar verified" would drift, and the copy would be
     * the one people trust.
     */
    `CREATE TABLE IF NOT EXISTS background_checks (
      worker_id INTEGER NOT NULL, key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', reference TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '', checked_by TEXT NOT NULL DEFAULT '',
      checked_at TIMESTAMPTZ, created TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (worker_id, key)
    )`,

    /* ---- Phase 12: final approval ----
     * One row per go-live decision. An override records WHO waived WHAT and why: a real onboarding
     * always has a legitimate exception, and an unrecorded one is the actual problem.
     */
    `CREATE TABLE IF NOT EXISTS worker_approvals (
      id SERIAL PRIMARY KEY, worker_id INTEGER NOT NULL, admin TEXT NOT NULL DEFAULT '',
      overridden JSONB NOT NULL DEFAULT '[]'::jsonb, reason TEXT NOT NULL DEFAULT '',
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    /* ---- Phase 7: training + assessment ----
     * Content is AUTHORED BY THE ADMIN, not seeded with invented policy. The 9 modules below are
     * created as empty, UNPUBLISHED drafts: titles only. A module is invisible to workers until
     * someone writes it and publishes it — quizzing a worker on rules we made up, and gating their
     * activation on the score, would be worse than having no training at all.
     */
    `CREATE TABLE IF NOT EXISTS training_modules (
      id SERIAL PRIMARY KEY, key TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0,
      published BOOLEAN NOT NULL DEFAULT false,
      created TIMESTAMPTZ NOT NULL DEFAULT now(), updated TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    // correct_index NEVER leaves the server: the worker's paper is served without answers and
    // scored here, so the quiz can't be passed by reading the response.
    `CREATE TABLE IF NOT EXISTS training_questions (
      id SERIAL PRIMARY KEY, module_id INTEGER REFERENCES training_modules(id) ON DELETE CASCADE,
      question TEXT NOT NULL, options JSONB NOT NULL DEFAULT '[]'::jsonb,
      correct_index INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT true,
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS worker_training (
      worker_id INTEGER NOT NULL, module_id INTEGER NOT NULL, completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (worker_id, module_id)
    )`,
    `CREATE TABLE IF NOT EXISTS quiz_attempts (
      id SERIAL PRIMARY KEY, worker_id INTEGER NOT NULL, score INTEGER NOT NULL, total INTEGER NOT NULL,
      passed BOOLEAN NOT NULL DEFAULT false, created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS ix_quiz_attempts_worker ON quiz_attempts(worker_id, created DESC)`,
    // Login OTPs. Stored HASHED with an expiry and an attempt counter — the code itself never
    // rests in the database, and one row per phone means a new request invalidates the previous
    // code. Rows are disposable: deleted on success, and expired ones are swept on each request.
    `CREATE TABLE IF NOT EXISTS worker_login_otps (
      phone TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, sent_count INTEGER NOT NULL DEFAULT 1,
      window_started TIMESTAMPTZ NOT NULL DEFAULT now(), created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `ALTER TABLE workers ADD COLUMN IF NOT EXISTS site_id INTEGER`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS site_id INTEGER`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS site_name TEXT`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS site_lat REAL`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS site_lng REAL`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS geofence_m INTEGER`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS geo_outside BOOLEAN DEFAULT false`,
    `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS geo_breaches INTEGER DEFAULT 0`,
    // Leave requests (worker submits; admin/ops approves — status Pending|Approved|Rejected).
    `CREATE TABLE IF NOT EXISTS leave_requests (
      id SERIAL PRIMARY KEY, worker_id INTEGER NOT NULL,
      from_date DATE, to_date DATE, reason TEXT,
      status TEXT NOT NULL DEFAULT 'Pending', created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    // Support tickets raised by the worker (ops resolves — status Open|Resolved).
    `CREATE TABLE IF NOT EXISTS support_tickets (
      id SERIAL PRIMARY KEY, worker_id INTEGER NOT NULL, subject TEXT, message TEXT,
      status TEXT NOT NULL DEFAULT 'Open', created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    // (Demo/QA worker seed disabled — real workers are managed in Admin → Workers.)
  ])

  /* Phase 7 module list. TITLES ONLY, unpublished, with an empty body — these are the company's own
   * policies (grooming standards, the cleaning SOP, incentive rules), and inventing them here would
   * put words in the company's mouth and then quiz workers on them. An admin writes each one and
   * publishes it; until then workers see nothing. ON CONFLICT DO NOTHING so re-running never
   * overwrites content someone has since authored. */
  for (const [i, title] of [
    'Company Introduction', 'Cleaning SOP', 'Customer Behaviour', 'Grooming', 'Safety',
    'Equipment Usage', 'Mobile App Usage', 'Attendance Policy', 'Incentive Rules',
  ].entries()) {
    await pool.query(
      `INSERT INTO training_modules (key, title, sort) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING`,
      [title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title, i + 1],
    )
  }

  /* Phase 9 kit list, straight from the spec. Unlike the training modules these are just item
   * names, not policy — nothing is asserted by seeding "Mop". What IS policy is which of them a
   * worker must hold before going live, so every one seeds required=false for an admin to decide. */
  for (const [i, name] of [
    'Uniform', 'ID Card', 'Vacuum', 'Bucket', 'Mop', 'Shoes', 'Gloves', 'Mask', 'Cleaning Kit', 'Mobile Device',
  ].entries()) {
    await pool.query(
      `INSERT INTO equipment_types (key, name, sort) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING`,
      [name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, i + 1],
    )
  }

  const seeded = (await pool.query('SELECT COUNT(*)::int n FROM workers')).rows[0].n
  if (!seeded) {
    // Every ACTIVE pro is qualified for the full Cleaning catalogue so any booked service matches
    // and can be push auto-assigned out of the box. These MUST equal the catalog `name`s exactly,
    // because dispatch matches (booking item name === worker service name), case-insensitively.
    const ALL_SERVICES = [
      'Sweeping & Mopping', 'Dusting Furniture', 'Dishwashing', 'Bathroom Cleaning', 'Kitchen Cleaning',
      'Laundry Washing & Folding', 'Window Cleaning', 'Fan Cleaning', 'Bed Making', 'Garbage Disposal',
      'Basic Home Organization', 'Ironing', 'Deep Cleaning', 'Refrigerator Cleaning', 'Home Sanitization',
    ]
    const W = [
      ['Rakesh Kumar', 'Cleaning,Bathroom', 'Mumbai', 'active', true, 4.9, 312, 84200],
      ['Pooja Mehta', 'Beauty,Salon', 'Delhi', 'active', true, 4.8, 221, 61500],
      ['Suresh Yadav', 'Plumbing,Electrical', 'Pune', 'active', true, 4.7, 540, 132000],
      ['Neha Gupta', 'Cleaning,Kitchen', 'Bengaluru', 'active', true, 4.9, 188, 49800],
      ['Imran Shaikh', 'AC,Appliance', 'Hyderabad', 'active', true, 4.6, 402, 158000],
      ['Vikash Pandey', 'Carpentry,Painting', 'Chennai', 'pending', false, 4.5, 12, 3200],
      ['Kavita Joshi', 'Laundry,Cleaning', 'Ahmedabad', 'active', true, 4.8, 95, 21400],
      ['Anil Verma', 'Pest Control,Gardening', 'Kolkata', 'inactive', true, 4.4, 76, 18900],
      ['Sunita Devi', 'Care,Cooking', 'Jaipur', 'active', true, 4.9, 154, 38600],
      ['Manish Tiwari', 'Plumbing,Carpentry', 'Lucknow', 'pending', false, 4.3, 5, 1100],
    ]
    const activeIds = []
    for (let i = 0; i < W.length; i++) {
      const [name, services, city, status, verified, rating, jobs, earnings] = W[i]
      const slug = name.toLowerCase().replace(/\s+/g, '.')
      // Active pros get the full catalogue; pending/inactive keep their original tags (they can't
      // take jobs anyway, so their services never need to match).
      const svc = status === 'active' ? ALL_SERVICES : services.split(',')
      const { rows } = await pool.query(
        `INSERT INTO workers (name,phone,email,city,services,status,verified,rating,jobs,earnings,balance)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [name, `+91 9${String(800000000 + i * 11111).slice(0, 9)}`, `${slug}@pros.homehelp.in`, city,
          JSON.stringify(svc), status, verified, rating, jobs, earnings, Math.round(earnings * 0.1)])
      if (status === 'active') activeIds.push(rows[0].id)
    }
    // Roster every active pro on an all-day, every-day, zone-less shift (zone_id NULL matches any
    // live zone), so push auto-assign has on-shift, online (available defaults true) supply on a
    // fresh DB. Admins can refine the roster later via /api/admin/shifts.
    for (const id of activeIds) {
      for (let d = 0; d < 7; d++) {
        await pool.query('INSERT INTO shifts (worker_id,zone_id,weekday,start_min,end_min) VALUES ($1,NULL,$2,0,1439)', [id, d])
      }
    }
    console.log(`[worker] seeded ${W.length} workers + all-day shifts for ${activeIds.length} active pros`)
  }
  // Seed the 3 selectable shift PLANS once (8h each, spanning 05:00–22:00). Admin can edit these.
  if (!(await pool.query('SELECT COUNT(*)::int n FROM shift_defs')).rows[0].n) {
    const S = [
      ['morning', 'Morning', 300, 780, 1],    // 05:00 – 13:00
      ['afternoon', 'Afternoon', 720, 1200, 2], // 12:00 – 20:00
      ['evening', 'Evening', 840, 1320, 3],    // 14:00 – 22:00
    ]
    for (const [code, name, sm, em, sort] of S)
      await pool.query('INSERT INTO shift_defs (code,name,start_min,end_min,sort) VALUES ($1,$2,$3,$4,$5)', [code, name, sm, em, sort])
    console.log('[worker] seeded 3 shift plans (Morning/Afternoon/Evening)')
  }
  // Seed a couple of sample apartments (geofence sites, 300 m) — admin can add/edit more.
  if (!(await pool.query('SELECT COUNT(*)::int n FROM worker_sites')).rows[0].n) {
    const A = [
      ['Brigade Citadel', 'Moosapet, Hyderabad', 17.4517, 78.4308, 300],
      ['My Home Avatar', 'Narsingi, Hyderabad', 17.3936, 78.3711, 300],
      ['Aparna Sarovar', 'Nallagandla, Hyderabad', 17.4720, 78.3050, 300],
    ]
    for (const [name, addr, lat, lng, r] of A)
      await pool.query('INSERT INTO worker_sites (name,address,lat,lng,radius) VALUES ($1,$2,$3,$4,$5)', [name, addr, lat, lng, r])
    console.log('[worker] seeded 3 sample apartments (geofence sites)')
  }
  // Role designations (Zone Manager / Team Leader / Worker) — backfilled once (idempotent: fills
  // only untagged rows, so admin edits are never overwritten). Drives the zone Assign-Team lookups.
  await pool.query(`UPDATE workers SET designation='Zone Manager' WHERE designation IS NULL AND name IN ('Rakesh Kumar','Imran Shaikh')`)
  await pool.query(`UPDATE workers SET designation='Team Leader' WHERE designation IS NULL AND name IN ('Neha Gupta','Kavita Joshi','Sunita Devi')`)
  await pool.query(`UPDATE workers SET designation='Worker' WHERE designation IS NULL`)
  console.log('[worker] Postgres ready (workers, worker_documents)')
}

/* ---------- helpers ---------- */
const rowToWorker = (w) => w && ({ ...w, verified: !!w.verified, available: !!w.available })
// Worker app's bank_status vocabulary differs from the DB's — map it so the app shows the
// right pill and unlocks withdrawals on a verified account.
const APP_BANK_STATUS = { Verified: 'Approved', Pending: 'Pending Verification', Rejected: 'Rejected' }
const workerDto = (w) => {
  if (!w) return w
  const p = w.profile || {}
  const bank = p.bank || {}
  const bv = p.bankVerification || {}
  const hasBank = !!(bank.bankAccount || bank.bankUpi)
  return {
    id: w.id, name: w.name, phone: w.phone, email: w.email, city: w.city, services: w.services,
    avatar: w.avatar, status: w.status, verified: !!w.verified, rating: w.rating, jobs: w.jobs,
    available: !!w.available,
    ...p,
    // Flatten bank.* to the top-level fields the worker app's WorkerDto reads, and expose the
    // verification result (registered name / rejection reason).
    bankHolder: bank.bankHolder || '', bankName: bank.bankName || '', bankAccount: bank.bankAccount || '',
    bankIfsc: bank.bankIfsc || '', bankUpi: bank.bankUpi || '', chequePhoto: bank.chequePhoto || '',
    bankAccountType: bank.bankAccountType || '', // 'savings' | 'current' — passed to RazorpayX on payout
    // Phase 2/3. `...p` above already spreads profile.* (including `personal` as an object), but the
    // app's WorkerDto is flat — these are the fields it actually binds to. Empty string, never null:
    // Gson would keep a null and the Compose fields expect non-null strings.
    gender: (p.personal || {}).gender || '', dob: (p.personal || {}).dob || '',
    bloodGroup: (p.personal || {}).bloodGroup || '', maritalStatus: (p.personal || {}).maritalStatus || '',
    fatherName: (p.personal || {}).fatherName || '', motherName: (p.personal || {}).motherName || '',
    emergencyName: (p.personal || {}).emergencyName || '', emergencyPhone: (p.personal || {}).emergencyPhone || '',
    address: (p.personal || {}).address || '', permanentAddress: (p.personal || {}).permanentAddress || '',
    languages: (p.personal || {}).languages || '',
    qualification: (p.personal || {}).qualification || '', experienceYears: (p.personal || {}).experienceYears || '',
    previousCompany: (p.personal || {}).previousCompany || '',
    bankRemarks: bv.reason || '',
    bankRegisteredName: bv.registeredName || '',
    bankNameMatch: (bv.nameMatch === undefined || bv.nameMatch === null) ? null : !!bv.nameMatch,
    bankStatus: hasBank ? (APP_BANK_STATUS[w.bank_status] || w.bank_status || 'Pending Verification') : 'Not Added',
  }
}
const walletDto = (w) => ({ balance: w.balance, pending: w.pending, hold: w.hold, withdrawn: w.withdrawn, advanceOutstanding: w.advance_outstanding, earnings: w.earnings })
const walletSummary = (w) => ({ available: w.balance, pending: w.pending, onHold: w.hold, totalEarned: w.earnings, withdrawn: w.withdrawn, advanceOutstanding: w.advance_outstanding })
// Real period earnings for the wallet/earnings dashboard: the worker's 80% share of jobs
// COMPLETED today / in the last 7 days / this calendar month, in IST. Field names match the
// worker app's WalletSummaryDto (todayEarnings/weekEarnings/monthEarnings) so they render live.
function periodEarnings(bookings) {
  const shareOf = (b) => Math.round((b.total || 0) * 0.8)
  const istDay = (d) => { try { return new Date(new Date(d).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10) } catch { return '' } }
  const nowIstMs = Date.now() + 5.5 * 3600 * 1000
  const todayStr = new Date(nowIstMs).toISOString().slice(0, 10)
  const monthStr = todayStr.slice(0, 7)
  const weekAgoStr = new Date(nowIstMs - 6 * 86400 * 1000).toISOString().slice(0, 10)
  let todayEarnings = 0, weekEarnings = 0, monthEarnings = 0, todayCompleted = 0, todayJobs = 0
  let todayCancelled = 0, lifetimeTotal = 0, lifetimeCompleted = 0, lifetimeCancelled = 0
  for (const b of bookings || []) {
    lifetimeTotal++
    if (b.status === 'completed') lifetimeCompleted++
    if (b.status === 'cancelled') lifetimeCancelled++
    // Today's job count = everything scheduled/created today that wasn't cancelled.
    const scheduledToday = istDay(b.date || b.created) === todayStr
    if (scheduledToday && b.status !== 'cancelled') todayJobs++
    if (scheduledToday && b.status === 'cancelled') todayCancelled++
    if (b.status !== 'completed') continue
    const day = istDay(b.completed_at || b.created)
    if (!day) continue
    const amt = shareOf(b)
    if (day === todayStr) { todayEarnings += amt; todayCompleted++ }
    if (day >= weekAgoStr) weekEarnings += amt
    if (day.startsWith(monthStr)) monthEarnings += amt
  }
  return {
    todayEarnings, weekEarnings, monthEarnings, todayCompleted, todayJobs, todayCancelled,
    // Lifetime rates for the Home "Performance Overview". Null (not 0) when the worker has no
    // jobs yet, so the app renders "—" instead of a misleading 0%.
    completionPct: lifetimeTotal ? Math.round((lifetimeCompleted / lifetimeTotal) * 100) : null,
    cancellationPct: lifetimeTotal ? Math.round((lifetimeCancelled / lifetimeTotal) * 100) : null,
  }
}

/**
 * Acceptance % over the worker's last 30 days of job offers: accepted / (accepted + declined).
 * Offers still sitting at 'offered' (never answered) are excluded — they're pending, not refusals.
 * Returns null when the worker has answered no offers yet (the app renders "—").
 */
async function acceptancePct(workerId) {
  try {
    const r = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE outcome='accepted')::int AS accepted,
              COUNT(*) FILTER (WHERE outcome IN ('accepted','declined'))::int AS answered
         FROM job_offers
        WHERE worker_id = $1 AND offered_at >= now() - INTERVAL '30 days'`,
      [workerId],
    )
    const row = r.rows[0]
    if (!row || !row.answered) return null
    return Math.round((row.accepted / row.answered) * 100)
  } catch (e) {
    console.error('[worker] acceptancePct:', e?.message || e)
    return null
  }
}

// Great-circle distance in km between two lat/lng points.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
// Rough city-traffic travel speed used to turn straight-line distance into an ETA. This is an
// ESTIMATE, not a routed time — there's no routing engine here.
const CITY_SPEED_KMH = 22

/**
 * Punctuality % over the worker's last 30 attendance days: on-time check-ins / days attended.
 * Returns null when the worker has no attendance history yet (the app renders "—").
 */
async function punctualityPct(workerId) {
  try {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS days, COUNT(*) FILTER (WHERE on_time IS TRUE)::int AS ontime
         FROM attendance
        WHERE worker_id = $1 AND check_in IS NOT NULL AND day >= (CURRENT_DATE - INTERVAL '30 days')`,
      [workerId],
    )
    const row = r.rows[0]
    if (!row || !row.days) return null
    return Math.round((row.ontime / row.days) * 100)
  } catch (e) {
    console.error('[worker] punctualityPct:', e?.message || e)
    return null
  }
}
// IST calendar date (YYYY-MM-DD) and 12-hour clock label for a timestamp — used by Today's Schedule.
const istDateStr = (d) => { try { return new Date(new Date(d).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10) } catch { return '' } }
const istClock = (d) => { try { const t = new Date(new Date(d).getTime() + 5.5 * 3600 * 1000); let h = t.getUTCHours(); const m = String(t.getUTCMinutes()).padStart(2, '0'); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${m} ${ap}` } catch { return '' } }
// Build Today's Schedule timeline from the worker's non-cancelled jobs dated today, in order.
// The worker's cut of a booking — the same commission split dispatch applies when it offers a
// job. The Jobs list must show what the worker earns, not what the customer pays.
async function workerShareOf(total) {
  const pct = await getSettingInt(ADMIN_URL, 'commission_percent', 20)
  return Math.max(0, Math.round((Number(total || 0) * (100 - pct)) / 100))
}

async function todaySchedule(bookings, custNames, worker) {
  const today = istDateStr(Date.now())
  const inProgress = ['worker_assigned', 'on_the_way', 'arrived', 'in_progress']
  // The worker's last known position (reported by the app's device heartbeat). Without it we
  // can't measure distance, so distanceKm/etaMins stay null and the app renders "—".
  const wLat = worker && worker.last_lat != null ? Number(worker.last_lat) : null
  const wLng = worker && worker.last_lng != null ? Number(worker.last_lng) : null
  const rows = (bookings || [])
    .filter((b) => b.status !== 'cancelled' && istDateStr(b.date || b.created) === today)
    .sort((a, b) => new Date(a.created) - new Date(b.created))
  return await Promise.all(rows.map(async (b) => {
      const canGeo = wLat != null && wLng != null && b.cust_lat != null && b.cust_lng != null
      const km = canGeo ? haversineKm(wLat, wLng, Number(b.cust_lat), Number(b.cust_lng)) : null
      return {
        time: b.time || istClock(b.created),
        service: (b.items || []).map((i) => i.name).join(', ') || 'Service',
        location: b.address || '—',
        durationMins: bookingDurationMinutes(b),
        customerName: (custNames && custNames[b.user_id]) || 'Customer',
        paymentStatus: b.payment_status === 'paid' ? 'Paid' : (String(b.payment || '').toLowerCase() === 'cash' ? 'Cash' : 'Pending'),
        status: b.status === 'completed' ? 'Completed' : (inProgress.includes(b.status) ? 'In progress' : 'Upcoming'),
        // Straight-line distance + a speed-based ETA estimate (no routing engine here).
        distanceKm: km == null ? null : Math.round(km * 10) / 10,
        etaMins: km == null ? null : Math.max(1, Math.round((km / CITY_SPEED_KMH) * 60)),
        ref: b.ref,
        earnings: await workerShareOf(b.total),
      }
    }))
}
async function getWorker(id) { if (!Number.isFinite(id)) return null; const { rows } = await pool.query('SELECT * FROM workers WHERE id=$1', [id]); return rows[0] || null }
// If the same phone maps to more than one worker (e.g. a stray pending placeholder alongside a
// real onboarded pro), prefer the active + verified account so login isn't shadowed by the dupe.
// Match by the last 10 digits, ignoring formatting (+91, spaces, dashes) on BOTH sides, so a
// bare 10-digit app login lines up with a stored "+91 98xxxxxxxx". Prefer active + verified.
async function getByPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10)
  if (digits.length < 10) return null
  const { rows } = await pool.query(
    "SELECT * FROM workers WHERE right(regexp_replace(coalesce(phone,''), '\\D', '', 'g'), 10)=$1 ORDER BY (status='active') DESC, verified DESC, id DESC",
    [digits])
  return rows[0] || null
}
const serviceSet = (w) => new Set((w.services || []).map((s) => String(s).toLowerCase().trim()))

/* ---------- shifts / roster (WFM) ---------- */
// Current IST weekday + minutes-from-midnight (the settings timezone is GMT+5:30).
function istNow() { const d = new Date(Date.now() + 5.5 * 3600 * 1000); return { weekday: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() } }
const onShiftNow = (rows) => { const { weekday, minutes } = istNow(); return rows.some((s) => s.weekday === weekday && s.start_min <= minutes && minutes < s.end_min) }
const toMin = (t) => { const [h, m] = String(t || '').split(':').map(Number); return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0) }
const toHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

// ---- shift plans (min-guarantee) ----
const isWeekend = (weekday) => weekday === 0 || weekday === 6
// App DTO for a shift plan; minGuarantee resolves to weekday/weekend rate for the given day.
const shiftDefDto = (s, weekday) => ({
  id: s.id, code: s.code, name: s.name,
  start: toHHMM(s.start_min), end: toHHMM(s.end_min),
  hours: Math.round((s.end_min - s.start_min) / 60),
  graceMin: s.grace_min, penalty: s.penalty,
  minGuarantee: isWeekend(weekday) ? s.min_g_weekend : s.min_g_weekday,
})
const getShiftDef = async (id) => (id ? (await pool.query('SELECT * FROM shift_defs WHERE id=$1', [id])).rows[0] || null : null)

// ---- geofence (assigned apartment) ----
const getSite = async (id) => (id ? (await pool.query('SELECT * FROM worker_sites WHERE id=$1', [id])).rows[0] || null : null)
// Great-circle distance in METRES between two lat/lng points (Haversine).
function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}
async function shiftsByWorker() {
  const rows = (await pool.query('SELECT worker_id, weekday, start_min, end_min FROM shifts')).rows
  const by = {}; for (const s of rows) (by[s.worker_id] ||= []).push(s); return by
}

async function listWorkers({ status, city, q } = {}, scope = null) {
  let rows = (await pool.query('SELECT * FROM workers ORDER BY id DESC')).rows.map(rowToWorker)
  const by = await shiftsByWorker()
  rows = rows.map((w) => ({ ...w, on_shift: onShiftNow(by[w.id] || []) }))
  rows = rows.filter((w) => inScope(scope, { zoneId: w.zone_id, city: w.city })) // data scope
  if (status && status !== 'all') rows = rows.filter((w) => w.status === status)
  if (city && city !== 'all') rows = rows.filter((w) => w.city === city)
  if (q) { const s = q.toLowerCase(); rows = rows.filter((w) => w.name.toLowerCase().includes(s) || (w.phone || '').includes(s) || (w.email || '').toLowerCase().includes(s)) }
  return rows
}
async function workerStats(scope = null) {
  const all = (await pool.query('SELECT status, zone_id, city FROM workers')).rows.filter((w) => inScope(scope, { zoneId: w.zone_id, city: w.city }))
  const n = (...s) => all.filter((w) => s.includes(w.status)).length
  // Every status lands in exactly one bucket, so the cards always sum to total. 'onboarding'
  // (invited, completing their profile) is its own bucket — folding it into pending or active
  // would either hide it or imply they're dispatchable.
  return { total: all.length, active: n('active'), onboarding: n('onboarding'), pending: n('pending'), inactive: n('inactive', 'suspended') }
}
async function documents(wid) { return (await pool.query('SELECT * FROM worker_documents WHERE worker_id=$1 ORDER BY id DESC', [wid])).rows }
async function mergeProfile(wid, patch) {
  const w = await getWorker(wid)
  const profile = { ...(w.profile || {}), ...patch }
  await pool.query('UPDATE workers SET profile=$1::jsonb WHERE id=$2', [JSON.stringify(profile), wid])
  return getWorker(wid)
}

// Booked service length in minutes — mirrors the dispatch service so the restored (post-relaunch)
// timer matches the live one. Prefer the item's durationId, else parse the label.
const DUR_MIN = { '60m': 60, '90m': 90, '2h': 120, '2h30': 150, '3h': 180, '3h30': 210, '4h': 240 }
function bookingDurationMinutes(b) {
  const id = b?.items?.[0]?.durationId
  if (id && DUR_MIN[id]) return DUR_MIN[id]
  const s = String(b?.duration || '')
  const n = parseInt(s, 10)
  if (!n) return 60
  return /h/i.test(s) && !/min/i.test(s) ? n * 60 : n
}

// Worker-app bootstrap aggregates identity (local) + jobs/history (booking svc) + wallet (local snapshot).
async function bootstrap(wid) {
  const w = await getWorker(wid)
  const mine = await tryGet(BOOKING_URL, `/api/internal/bookings?worker_id=${wid}`, [])
  const active = mine.find((b) => ['worker_assigned', 'on_the_way', 'arrived', 'in_progress'].includes(b.status)) || null
  const STATUS_TO_ENUM = { worker_assigned: 'ACCEPTED', on_the_way: 'ON_THE_WAY', arrived: 'ARRIVED', in_progress: 'IN_PROGRESS', completed: 'COMPLETED' }
  // Resolve customer names once per unique user (the worker app's Booking card shows them).
  const uids = [...new Set(mine.map((b) => b.user_id).filter(Boolean))]
  const custNames = {}, custPhones = {}
  await Promise.all(uids.map(async (id) => {
    const u = await tryGet(AUTH_URL, `/api/internal/users/${id}`, null)
    if (u?.user?.name) custNames[id] = u.user.name
    if (u?.user?.phone) custPhones[id] = u.user.phone
  }))
  // Every field the worker app's Booking model requires is non-null here — the Compose UI treats
  // them as non-null String, and a missing key would deserialize to null and crash the Bookings tab.
  const bookingDto = (b) => ({
    ref: b.ref,
    service: (b.items || []).map((i) => i.name).join(', ') || 'Service',
    customerName: custNames[b.user_id] || 'Customer',
    address: b.address || '—',
    timeInfo: [b.date, b.time].filter(Boolean).join(' • ') || (b.created ? new Date(b.created).toLocaleDateString('en-IN') : ''),
    amount: Math.round((b.total || 0) * 0.8),
    status: b.status === 'completed' ? 'Completed' : b.status === 'cancelled' ? 'Cancelled' : 'Upcoming',
  })
  // Prefer the wallet service's real ledger summary (balance from actual completed services);
  // fall back to the local snapshot only if the wallet service is unreachable.
  const wsum = await tryGet(WALLET_URL, `/internal/summary/${wid}`, null)
  const pe = periodEarnings(mine)
  // The wallet service owns the money figures; the booking-derived counts + rates are always
  // ours, so they survive the wallet path too (Home's Progress + Performance cards read them).
  const bookingStats = {
    todayJobs: pe.todayJobs,
    todayCompleted: pe.todayCompleted,
    todayCancelled: pe.todayCancelled,
    completionPct: pe.completionPct,
    cancellationPct: pe.cancellationPct,
    punctualityPct: await punctualityPct(wid),
    acceptancePct: await acceptancePct(wid),
  }
  const walletSummaryOut = wsum ? { ...wsum, ...bookingStats } : { ...walletSummary(w), ...pe, ...bookingStats }
  return {
    worker: workerDto(w), wallet: walletDto(w), walletSummary: walletSummaryOut,
    jobStatus: active ? (STATUS_TO_ENUM[active.status] || 'NONE') : 'NONE',
    // Full activeJob so the worker app's (non-null) Job model never deserializes a null field —
    // a missing key here NPE-crashes the In-Progress / Job screens.
    activeJob: active ? (() => {
      const nm = custNames[active.user_id] || 'Customer'
      const initials = (nm.split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('') || 'C').toUpperCase()
      const addr = active.address || '—'
      return {
        id: active.ref || `#${active.id}`, bookingId: active.id,
        customerName: nm, initials, customerPhone: custPhones[active.user_id] || '',
        customerRating: 5.0,
        services: (active.items || []).map((i) => i.name),
        dateTime: [active.date, active.time].filter(Boolean).join(', ') || istClock(active.created),
        durationHours: Math.max(1, Math.round(bookingDurationMinutes(active) / 60)),
        durationMinutes: bookingDurationMinutes(active),
        address: addr, area: addr, distanceKm: 0,
        earnings: Math.round((active.total || 0) * 0.8),
        otp: active.service_otp || '',
        lat: active.cust_lat || 0, lng: active.cust_lng || 0,
        startedAt: active.started_at, completedAt: active.completed_at,
      }
    })() : null,
    bookings: mine.map(bookingDto),
    schedule: await todaySchedule(mine, custNames, w),
    attendance: await attendanceToday(wid),
    shift: await shiftPlans(wid),
    leaves: await leaveList(wid),
    tickets: await ticketList(wid),
    documents: await documents(wid),
  }
}

// Today's attendance snapshot for a worker (check-in/out times + derived status + shift plan).
async function attendanceToday(wid) {
  const day = istDateStr(Date.now())
  const { rows } = await pool.query('SELECT * FROM attendance WHERE worker_id=$1 AND day=$2', [wid, day])
  const r = rows[0]
  const checkedIn = !!(r && r.check_in)
  const checkedOut = !!(r && r.check_out)
  const w = await getWorker(wid)
  const sd = await getShiftDef(w?.shift_def_id)
  const { weekday } = istNow()
  // How many days the worker has attended (checked in) this IST calendar month.
  const attendedThisMonth = (await pool.query(
    "SELECT COUNT(*)::int n FROM attendance WHERE worker_id=$1 AND check_in IS NOT NULL AND day >= date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')::date)",
    [wid])).rows[0].n
  // Assigned apartment (geofence): while checked in use the day's snapshot; otherwise show the
  // admin-assigned site so the worker knows where they'll be posted.
  const assigned = await getSite(w?.site_id)
  const geoActive = checkedIn && r && r.site_lat != null
  return {
    checkedIn, checkedOut,
    attendedThisMonth,
    // Assigned apartment + geofence.
    siteName: (r && r.site_name) || assigned?.name || '',
    siteAddress: assigned?.address || '',
    siteLat: (r && r.site_lat != null ? r.site_lat : assigned?.lat) ?? null,
    siteLng: (r && r.site_lng != null ? r.site_lng : assigned?.lng) ?? null,
    geofenceM: (r && r.geofence_m) || assigned?.radius || 300,
    geoActive: !!geoActive,
    geoOutside: !!(r && r.geo_outside),
    geoBreaches: (r && r.geo_breaches) || 0,
    checkInAt: r && r.check_in ? istClock(r.check_in) : '',
    checkOutAt: r && r.check_out ? istClock(r.check_out) : '',
    status: checkedOut ? 'Checked out' : (checkedIn ? 'Checked in' : 'Not checked in'),
    // Shift plan the worker signed up for + today's on-time / penalty / guarantee status.
    shiftId: sd ? sd.id : null,
    shiftName: sd ? sd.name : '',
    shiftStart: sd ? toHHMM(sd.start_min) : '',
    shiftEnd: sd ? toHHMM(sd.end_min) : '',
    graceMin: sd ? sd.grace_min : 0,
    onTime: r && r.on_time != null ? !!r.on_time : true,
    lateMinutes: r && r.late_minutes ? r.late_minutes : 0,
    penalty: r && r.penalty ? r.penalty : 0,
    minGuarantee: sd ? (isWeekend(weekday) ? sd.min_g_weekend : sd.min_g_weekday) : 0,
  }
}

// The selectable shift plans + which one this worker picked (for the app's shift picker).
async function shiftPlans(wid) {
  const { weekday } = istNow()
  const { rows } = await pool.query('SELECT * FROM shift_defs WHERE active=true ORDER BY sort, start_min')
  const w = await getWorker(wid)
  // selectedId is the ADMIN'S assignment; requestedId is what the worker asked for. Both, because
  // showing only the assignment would make a pending request look like it never registered.
  return {
    selectedId: w?.shift_def_id || null,
    requestedId: w?.profile?.availability?.preferredShiftId ?? null,
    shiftStatus: w?.profile?.availability?.status || 'Pending',
    shifts: rows.map((s) => shiftDefDto(s, weekday)),
  }
}

// A worker's support tickets, newest first.
async function ticketList(wid) {
  const { rows } = await pool.query('SELECT id, subject, message, status, created FROM support_tickets WHERE worker_id=$1 ORDER BY id DESC', [wid])
  return rows.map((r) => ({ id: r.id, subject: r.subject || '', message: r.message || '', status: r.status, created: r.created ? new Date(r.created).toISOString().slice(0, 10) : '' }))
}

// A worker's leave requests, newest first.
async function leaveList(wid) {
  const { rows } = await pool.query('SELECT id, from_date, to_date, reason, status FROM leave_requests WHERE worker_id=$1 ORDER BY id DESC', [wid])
  const d = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '')
  return rows.map((r) => ({ id: r.id, fromDate: d(r.from_date), toDate: d(r.to_date), reason: r.reason || '', status: r.status }))
}

const app = express()
app.use(express.json({ limit: '6mb' }))
app.get('/health', (_q, res) => res.json({ service: 'worker', ok: true }))

/* ---------- worker-app auth ---------- */
// Verifies a SIGNED token. Previously this parsed the id out of the string, so `Bearer worker-6`
// was a full session for worker 6 — which meant the login OTP protected nothing at all.
function auth(req, res, next) {
  const id = tokenSubject(req.headers.authorization, 'worker')
  if (!Number.isFinite(id)) return res.status(401).json({ ok: false, error: 'Not authenticated' })
  getWorker(id).then((w) => { if (!w) return res.status(401).json({ ok: false, error: 'Not authenticated' }); req.worker = w; next() })
}

/* ---------- login OTP ----------
 * WORKER_DEV_OTP pins the code to a known value AND returns it in the response, so demos and QA
 * can sign in with no SMS provider wired up. It is the ONLY way a code is ever disclosed, it must
 * be set explicitly, and the code is still stored, expired, rate-limited and compared exactly like
 * a real one — an unset variable means a random code that is never disclosed. Leave it UNSET in
 * production; once an SMS provider exists, delivery replaces disclosure.
 */
const WORKER_DEV_OTP = process.env.WORKER_DEV_OTP || ''
const OTP_TTL_MIN = 5
const OTP_MAX_ATTEMPTS = 5   // per issued code, then it's burned
const OTP_MAX_PER_HOUR = 5   // per phone
const OTP_RESEND_WAIT_S = 30 // between sends, per phone

// Peppered so a leaked database still doesn't let anyone precompute the 10,000 possible codes.
// Falls back to a per-process random value: without a configured pepper, codes simply don't
// survive a restart — which is safer than hashing them with a known constant.
const OTP_PEPPER = process.env.INTERNAL_KEY || crypto.randomBytes(32).toString('hex')
const hashOtp = (phone, code) => crypto.createHash('sha256').update(`${phone}:${code}:${OTP_PEPPER}`).digest('hex')
const newOtp = () => WORKER_DEV_OTP || String(crypto.randomInt(1000, 10000)) // 4 digits — the app's field is 4 wide

app.post('/api/worker/auth/request-otp', async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  if (!phone) return res.status(400).json({ ok: false, error: 'Enter your mobile number' })
  await pool.query('DELETE FROM worker_login_otps WHERE expires < now() - interval \'1 hour\'')

  // Rate limit per phone regardless of whether the number is registered, so this can't be used to
  // hammer the endpoint or enumerate numbers by timing.
  const prev = (await pool.query('SELECT * FROM worker_login_otps WHERE phone=$1', [phone])).rows[0]
  if (prev) {
    const sinceSent = (Date.now() - new Date(prev.created).getTime()) / 1000
    if (sinceSent < OTP_RESEND_WAIT_S) {
      return res.status(429).json({ ok: false, error: `Please wait ${Math.ceil(OTP_RESEND_WAIT_S - sinceSent)}s before requesting another code.` })
    }
    const windowAgeMin = (Date.now() - new Date(prev.window_started).getTime()) / 60000
    if (windowAgeMin < 60 && prev.sent_count >= OTP_MAX_PER_HOUR) {
      return res.status(429).json({ ok: false, error: 'Too many codes requested. Try again in an hour.' })
    }
  }
  const windowFresh = !prev || (Date.now() - new Date(prev.window_started).getTime()) / 60000 >= 60
  const code = newOtp()
  await pool.query(
    `INSERT INTO worker_login_otps (phone, code_hash, expires, attempts, sent_count, window_started, created)
     VALUES ($1,$2, now() + make_interval(mins => $3), 0, 1, now(), now())
     ON CONFLICT (phone) DO UPDATE SET code_hash=EXCLUDED.code_hash, expires=EXCLUDED.expires, attempts=0,
       sent_count = CASE WHEN $4 THEN 1 ELSE worker_login_otps.sent_count + 1 END,
       window_started = CASE WHEN $4 THEN now() ELSE worker_login_otps.window_started END,
       created = now()`,
    [phone, hashOtp(phone, code), OTP_TTL_MIN, windowFresh])

  // Deliver it. Disclosure in the response is the fallback for when no provider is configured —
  // never both: if the SMS goes out, the code must not also come back over HTTP.
  if (await smsConfigured(ADMIN_URL)) {
    const sent = await sendOtpSms(ADMIN_URL, phone, code)
    if (!sent.ok) {
      console.error(`[worker] OTP SMS failed for ${phone}: ${sent.error}`)
      // Don't leave the worker staring at a code that never arrives.
      return res.status(502).json({ ok: false, error: 'Could not send the code right now. Please try again.' })
    }
    return res.json({ ok: true, message: `OTP sent to ${phone}` })
  }
  const exposed = !!WORKER_DEV_OTP
  if (!exposed) console.log(`[worker] OTP issued for ${phone} — no SMS provider configured, so it cannot be delivered.`)
  res.json({
    ok: true,
    message: exposed ? `Demo mode — use ${code}` : `OTP sent to ${phone}`,
    ...(exposed ? { devOtp: code } : {}),
  })
})

app.post('/api/worker/auth/verify', async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  const otp = String(req.body?.otp || '').trim()
  if (!/^\d{4}$/.test(otp)) return res.status(400).json({ ok: false, error: 'Enter the 4-digit code' })

  const row = (await pool.query('SELECT * FROM worker_login_otps WHERE phone=$1', [phone])).rows[0]
  if (!row) return res.status(400).json({ ok: false, error: 'Request a code first' })
  if (new Date(row.expires).getTime() < Date.now()) {
    await pool.query('DELETE FROM worker_login_otps WHERE phone=$1', [phone])
    return res.status(400).json({ ok: false, error: 'That code has expired. Request a new one.' })
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    await pool.query('DELETE FROM worker_login_otps WHERE phone=$1', [phone])
    return res.status(429).json({ ok: false, error: 'Too many wrong attempts. Request a new code.' })
  }
  // timingSafeEqual over the hashes — both are fixed-length hex, so lengths always match.
  const ok = crypto.timingSafeEqual(Buffer.from(hashOtp(phone, otp), 'hex'), Buffer.from(row.code_hash, 'hex'))
  if (!ok) {
    await pool.query('UPDATE worker_login_otps SET attempts = attempts + 1 WHERE phone=$1', [phone])
    return res.status(400).json({ ok: false, error: 'Incorrect code' })
  }

  const w = await getByPhone(phone)
  if (!w) return res.status(403).json({ ok: false, error: 'This number is not registered. Please contact the admin to onboard you.' })
  // 'onboarding' (invited) can sign in to complete their own profile/documents/bank; dispatch
  // still refuses them work until an admin approves them to 'active'. 'pending' means not yet
  // invited, so there is nothing for them to do in the app.
  if (!['active', 'onboarding'].includes(w.status)) {
    return res.status(403).json({ ok: false, error: w.status === 'pending' ? 'Your account is not activated yet. Please ask the admin to send your invite.' : `Your account is ${w.status}. Please contact the admin.` })
  }
  await pool.query('DELETE FROM worker_login_otps WHERE phone=$1', [phone]) // single use
  // This is the moment the number is PROVEN: a code we texted to it came back. Phase 12's
  // "Mobile Verified" reads this, so it can never be ticked by anything but a real login.
  // COALESCE keeps the first verification date rather than moving it on every sign-in.
  await pool.query('UPDATE workers SET phone_verified_at = COALESCE(phone_verified_at, now()) WHERE id=$1', [w.id])
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: w.id, actorName: w.name, action: 'worker.login', entityType: 'worker', entityId: w.id, detail: `Worker signed in (${phone || ''})` })
  res.json({ ok: true, token: signToken('worker', w.id), ...(await bootstrap(w.id)) })
})
app.get('/api/worker/bootstrap', auth, async (req, res) => res.json(await bootstrap(req.worker.id)))

// Device heartbeat — the worker app reports battery %, network type and GPS so the admin
// Worker Details status strip (Battery / Network / Idle Time / Last GPS) shows live values.
app.post('/api/worker/heartbeat', auth, async (req, res) => {
  const b = req.body || {}
  const device = { at: new Date().toISOString() }
  if (b.battery != null) device.battery = Math.max(0, Math.min(100, Math.round(Number(b.battery))))
  if (b.network) device.network = String(b.network).slice(0, 12)
  await mergeProfile(req.worker.id, { device })
  if (b.lat != null && b.lng != null) await pool.query('UPDATE workers SET last_lat=$1, last_lng=$2 WHERE id=$3', [Number(b.lat), Number(b.lng), req.worker.id])
  res.json({ ok: true })
})

// IFSC lookup — resolves the bank + branch from the code (Razorpay's free public IFSC directory)
// so the app can confirm the IFSC is real and AUTO-FILL the bank name instead of trusting free text.
// The account-number/holder correctness is a separate step (the penny-drop on save).
app.get('/api/worker/ifsc/:code', auth, async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase()
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)) return res.json({ valid: false, error: 'Invalid IFSC format' })
  try {
    const r = await fetch('https://ifsc.razorpay.com/' + code)
    if (!r.ok) return res.json({ valid: false, error: 'IFSC not found' })
    const d = await r.json()
    res.json({ valid: true, ifsc: code, bank: d.BANK || '', branch: d.BRANCH || '', city: d.CITY || d.CENTRE || '', state: d.STATE || '' })
  } catch { res.json({ valid: false, error: 'Could not verify IFSC right now' }) }
})

/* ---------- profile / documents ---------- */
/* ---------- Phase 4: the KYC document set ----------
 * The server owns this list so it is ONE source of truth: it validates uploads against it, the
 * worker app renders its checklist from it, and the admin panel uses it to show what's missing.
 * Hardcoding it in three places would let them drift.
 *
 * The spec also lists "Profile Photo" here; that's the avatar captured in Phase 2 (public bucket,
 * shown to customers), so it isn't duplicated as a KYC document.
 */
const DOC_TYPES = [
  { name: 'Aadhaar Front', required: true, hint: 'Photo side showing your name and number' },
  { name: 'Aadhaar Back', required: true, hint: 'Address side' },
  { name: 'PAN Card', required: true, hint: 'Clear photo of the front' },
  { name: 'Police Verification', required: true, hint: 'Certificate from your local station' },
  { name: 'Address Proof', required: true, hint: 'Rent agreement, utility bill or ration card' },
  { name: 'Medical Certificate', required: true, hint: 'Fitness certificate from a doctor' },
  { name: 'Driving License', required: false, hint: 'Only if you drive to jobs' },
  { name: 'Passport', required: false, hint: 'Optional' },
]
const DOC_NAMES = new Set(DOC_TYPES.map((d) => d.name))

/* Uploads (KYC documents + profile photos). Declared HERE, above the first route that uses it —
 * `const` is hoisted into a temporal dead zone, so defining it further down crashed the service
 * at import with "Cannot access 'upload' before initialization". 8 MB, in memory, one file. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } })

/* Phase 2/3: the worker fills in their own profile.
 *
 * This used to accept name/email/city/avatar ONLY, so everything below was admin-entered and the
 * app could neither read nor write it. Allow-listed rather than merged wholesale: `personal` is a
 * JSONB blob, and letting a client post arbitrary keys into it invites junk that no reader expects.
 */
const PERSONAL_FIELDS = [
  'gender', 'dob', 'bloodGroup', 'maritalStatus',                       // Phase 2
  'fatherName', 'motherName', 'emergencyName', 'emergencyPhone',        // Phase 3
  'address', 'permanentAddress', 'languages',                           // `address` = current address
  'qualification', 'experienceYears', 'previousCompany',
  'aadhaar', 'pan', 'whatsapp',                                         // pre-existing admin-entered keys
]
app.put('/api/worker/profile', auth, async (req, res) => {
  const b = req.body || {}
  await pool.query('UPDATE workers SET name=COALESCE($1,name), email=COALESCE($2,email), city=COALESCE($3,city), avatar=COALESCE($4,avatar) WHERE id=$5',
    [b.name ?? null, b.email ?? null, b.city ?? null, b.avatar ?? null, req.worker.id])
  const patch = {}
  for (const k of PERSONAL_FIELDS) if (b[k] !== undefined) patch[k] = b[k]
  // Merge, don't replace: the admin may have filled some of these in, and a worker editing one
  // screen must not blank the rest.
  if (Object.keys(patch).length) {
    const cur = (await getWorker(req.worker.id))?.profile?.personal || {}
    await mergeProfile(req.worker.id, { personal: { ...cur, ...patch } })
  }
  res.json(workerDto(await getWorker(req.worker.id)))
})

/* Profile photo. Public bucket, stable URL — customers see this on their job screen, so it can't
 * be a signed URL that expires. Same magic-byte check as KYC: a declared mime is not evidence. */
app.post('/api/worker/profile/photo', auth, upload.single('file'), async (req, res) => {
  if (!storageConfigured()) return res.status(503).json({ ok: false, error: 'Photo storage is not configured' })
  if (!req.file?.buffer?.length) return res.status(400).json({ ok: false, error: 'Attach a photo' })
  const kind = sniffType(req.file.buffer)
  if (!kind || kind.mime === 'application/pdf') return res.status(415).json({ ok: false, error: 'Profile photo must be a JPG, PNG or WebP image' })
  const key = storageKey(`workers/${req.worker.id}/avatar`, kind.ext)
  try { await putPublicObject(key, req.file.buffer, kind.mime) }
  catch (e) { console.error('[worker] avatar upload failed:', e.message); return res.status(502).json({ ok: false, error: 'Could not store the photo. Please try again.' }) }
  await pool.query('UPDATE workers SET avatar=$1 WHERE id=$2', [publicUrl(key), req.worker.id])
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'profile.photo', entityType: 'worker', entityId: req.worker.id, detail: 'Updated profile photo' })
  res.json(workerDto(await getWorker(req.worker.id)))
})
app.put('/api/worker/bank', auth, async (req, res) => { await mergeProfile(req.worker.id, { bank: req.body || {} }); await pool.query("UPDATE workers SET bank_status='Pending' WHERE id=$1", [req.worker.id]); publishEvent(REDIS_URL, 'bank.verify.requested', { workerId: req.worker.id, bank: req.body || {}, name: req.worker.name }); publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'kyc.bank', entityType: 'worker', entityId: req.worker.id, detail: 'Updated bank / payout details (verifying)' }); res.json(workerDto(await getWorker(req.worker.id))) })
/* ---------- Phase 11: availability ----------
 * A PREFERENCE, not an assignment — the same line as Phase 6's skills. What a worker would like
 * (shift, days off, hours, area) lives in profile.availability; what actually governs their work
 * is workers.shift_def_id and workers.zone_id, which only an admin writes. An admin reads the
 * preference and either adopts it or assigns something else.
 *
 * Weekly off is DERIVED from availableDays rather than stored separately: a day is an off day
 * precisely when it isn't an available one, and two representations of one fact drift.
 *
 * Of these, only maxWeeklyHours enforces anything (see /internal/workers/:id/service-set). Jobs
 * are pull-based — refusing a worker who is actively asking for work because they'd said they were
 * off would be absurd. A stated hours cap is different: it's a boundary worth holding even when
 * the tired worker asking is the one who set it.
 */
const DAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * Hours actually worked since Monday, from real check-in/check-out pairs.
 * A day still open (checked in, not out) counts up to now — otherwise a worker on an 11th
 * straight hour would read as 0 for today and sail past their own cap.
 */
async function hoursThisWeek(workerId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(check_out, now()) - check_in))), 0) secs
     FROM attendance
     WHERE worker_id = $1 AND check_in IS NOT NULL
       AND day >= date_trunc('week', (now() AT TIME ZONE 'Asia/Kolkata')::date)`,
    [workerId])
  return Math.round((Number(rows[0].secs) / 3600) * 10) / 10
}

/** The stated cap and where they are against it. maxWeeklyHours null = no cap. */
async function workLimit(w) {
  const max = w?.profile?.availability?.maxWeeklyHours ?? null
  if (!max) return { maxWeeklyHours: null, hoursThisWeek: null, capped: false }
  const hours = await hoursThisWeek(w.id)
  return { maxWeeklyHours: max, hoursThisWeek: hours, capped: hours >= max }
}

/** Whatever the admin last decided about this worker's stated preference. */
const availabilityDto = (w) => {
  const a = w?.profile?.availability || {}
  const days = a.availableDays && typeof a.availableDays === 'object' ? a.availableDays : {}
  return {
    availableDays: days,
    weeklyOff: DAY_KEYS.filter((d) => days[d] === false), // derived — never stored
    shiftStart: a.shiftStart || '',
    shiftEnd: a.shiftEnd || '',
    preferredShiftId: a.preferredShiftId ?? null,
    maxWeeklyHours: a.maxWeeklyHours ?? null,
    preferredZoneId: a.preferredZoneId ?? null,
    status: a.status || 'Pending',
    reason: a.reason || '',
    reviewedBy: a.reviewedBy || '',
    reviewedAt: a.reviewedAt || null,
  }
}

app.put('/api/worker/availability', auth, async (req, res) => {
  const b = req.body || {}
  // The online/offline toggle is a live state, not a preference — it stays a direct write.
  if (b.available !== undefined) await pool.query('UPDATE workers SET available=$1 WHERE id=$2', [!!b.available, req.worker.id])

  const cur = (await getWorker(req.worker.id))?.profile?.availability || {}
  const next = { ...cur }

  if (b.availableDays !== undefined) {
    if (typeof b.availableDays !== 'object' || b.availableDays === null) return res.status(400).json({ ok: false, error: 'availableDays must be an object' })
    const days = {}
    for (const d of DAY_KEYS) days[d] = b.availableDays[d] !== false
    if (DAY_KEYS.every((d) => !days[d])) return res.status(400).json({ ok: false, error: 'Pick at least one day you can work' })
    next.availableDays = days
  }
  for (const [k, label] of [['shiftStart', 'start time'], ['shiftEnd', 'end time']]) {
    if (b[k] !== undefined) {
      const v = String(b[k] || '')
      if (v && !HHMM.test(v)) return res.status(400).json({ ok: false, error: `Enter a valid ${label} (HH:MM)` })
      next[k] = v
    }
  }
  if (b.preferredShiftId !== undefined) {
    const id = b.preferredShiftId === null || b.preferredShiftId === '' ? null : Number(b.preferredShiftId)
    if (id !== null && !(await getShiftDef(id))) return res.status(400).json({ ok: false, error: 'Unknown shift' })
    next.preferredShiftId = id
  }
  if (b.maxWeeklyHours !== undefined) {
    const h = b.maxWeeklyHours === null || b.maxWeeklyHours === '' ? null : Number(b.maxWeeklyHours)
    // 1..90: a cap of 0 would silently stop all work, and 100+ isn't a cap at all.
    if (h !== null && (!Number.isInteger(h) || h < 1 || h > 90)) return res.status(400).json({ ok: false, error: 'Maximum hours must be between 1 and 90 (leave blank for no limit)' })
    next.maxWeeklyHours = h
  }
  if (b.preferredZoneId !== undefined) {
    next.preferredZoneId = b.preferredZoneId === null || b.preferredZoneId === '' ? null : Number(b.preferredZoneId)
  }

  // Any change to what they're asking for goes back for review — an approved preference the worker
  // then edits is no longer the thing the admin approved.
  const material = ['availableDays', 'shiftStart', 'shiftEnd', 'preferredShiftId', 'maxWeeklyHours', 'preferredZoneId']
  const changed = material.some((k) => b[k] !== undefined && JSON.stringify(next[k]) !== JSON.stringify(cur[k]))
  if (changed) { next.status = 'Pending'; next.reason = ''; next.reviewedBy = ''; next.reviewedAt = null }

  await mergeProfile(req.worker.id, { availability: next })
  const w = await getWorker(req.worker.id)
  if (changed) publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: w.name, action: 'availability.request', entityType: 'worker', entityId: req.worker.id, detail: 'Updated their availability preferences' })
  res.json({ ...workerDto(w), availability: availabilityDto(w) })
})

app.get('/api/worker/availability', auth, async (req, res) => {
  const w = await getWorker(req.worker.id)
  const shifts = (await pool.query('SELECT * FROM shift_defs WHERE active=true ORDER BY sort, start_min')).rows
  const { weekday } = istNow()
  res.json({
    ok: true,
    availability: availabilityDto(w),
    shifts: shifts.map((s) => shiftDefDto(s, weekday)),
    // What the admin actually assigned — shown beside the preference so the difference is visible
    // rather than the worker assuming their pick took effect.
    assigned: { shiftDefId: w?.shift_def_id || null, zoneId: w?.zone_id ?? null },
    hoursThisWeek: await hoursThisWeek(req.worker.id),
  })
})

/* ---------- shift plans (min-guarantee) ---------- */
app.get('/api/worker/shifts', auth, async (req, res) => {
  const { weekday } = istNow()
  const { rows } = await pool.query('SELECT * FROM shift_defs WHERE active=true ORDER BY sort, start_min')
  const w = await getWorker(req.worker.id)
  res.json({
    selectedId: w?.shift_def_id || null,
    requestedId: w?.profile?.availability?.preferredShiftId ?? null,
    shiftStatus: w?.profile?.availability?.status || 'Pending',
    shifts: rows.map((s) => shiftDefDto(s, weekday)),
  })
})
/**
 * Phase 11: the worker asks for a shift — this REQUESTS one, it doesn't take it.
 *
 * This used to write workers.shift_def_id directly, which meant a worker could self-grant the
 * shift's minimum-earnings guarantee and tick Phase 12's "Shift Assigned" check without any admin
 * involved. shift_def_id is now admin-only; this records the preference and sends it for review.
 */
app.post('/api/worker/shift', auth, async (req, res) => {
  const id = Number(req.body?.shiftId) || null
  if (id !== null && !(await getShiftDef(id))) return res.status(400).json({ ok: false, error: 'Unknown shift' })
  const w = await getWorker(req.worker.id)
  const cur = w?.profile?.availability || {}
  await mergeProfile(req.worker.id, {
    availability: { ...cur, preferredShiftId: id, status: 'Pending', reason: '', reviewedBy: '', reviewedAt: null },
  })
  const sd = await getShiftDef(id)
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: w?.name, action: 'shift.request', entityType: 'worker', entityId: req.worker.id, detail: `Requested ${sd ? sd.name + ' shift' : 'no shift'} — awaiting admin approval` })
  res.json({ ...(await attendanceToday(req.worker.id)), availability: availabilityDto(await getWorker(req.worker.id)) })
})

/* ---------- attendance (check-in / check-out) ---------- */
app.post('/api/worker/attendance/checkin', auth, async (req, res) => {
  const b = req.body || {}, day = istDateStr(Date.now())
  // Judge the check-in against the worker's chosen shift: on-time within grace, else a penalty.
  const w = await getWorker(req.worker.id)
  const sd = await getShiftDef(w?.shift_def_id)
  const { weekday, minutes } = istNow()
  const minG = sd ? (isWeekend(weekday) ? sd.min_g_weekend : sd.min_g_weekday) : 0
  let lateMin = 0, onTime = true, penalty = 0
  if (sd) {
    lateMin = Math.max(0, minutes - sd.start_min)
    if (minutes - sd.start_min > sd.grace_min) { onTime = false; penalty = sd.penalty }
  }
  // Assign the day's APARTMENT/geofence: the worker's admin-assigned site if set, else the
  // check-in location becomes the centre. The worker must stay within `geofence_m` metres.
  const site = await getSite(w?.site_id)
  const siteLat = site ? site.lat : (b.lat ?? null)
  const siteLng = site ? site.lng : (b.lng ?? null)
  const geofenceM = site ? site.radius : 300
  const siteName = site ? site.name : (b.lat != null ? 'Check-in area' : '')
  // Apply shift rules only on the FIRST check-in of the day (never re-penalize a re-tap).
  const existing = (await pool.query('SELECT check_in FROM attendance WHERE worker_id=$1 AND day=$2', [req.worker.id, day])).rows[0]
  const firstCheckin = !existing?.check_in
  await pool.query(
    `INSERT INTO attendance (worker_id, day, check_in, in_lat, in_lng, shift_def_id, late_minutes, on_time, penalty, min_g,
       site_id, site_name, site_lat, site_lng, geofence_m, geo_outside, geo_breaches)
     VALUES ($1,$2,now(),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,false,0)
     ON CONFLICT (worker_id, day) DO UPDATE SET check_in = COALESCE(attendance.check_in, now()),
       in_lat = COALESCE(attendance.in_lat, $3), in_lng = COALESCE(attendance.in_lng, $4)`,
    [req.worker.id, day, b.lat ?? null, b.lng ?? null, sd?.id ?? null, lateMin, onTime, firstCheckin ? penalty : 0, minG,
      site?.id ?? null, siteName, siteLat, siteLng, geofenceM])
  if (firstCheckin && penalty > 0) {
    // Wallet service owns the ledger — it deducts the penalty on this event.
    publishEvent(REDIS_URL, 'shift.late', { workerId: req.worker.id, amount: penalty, shiftName: sd.name, lateMinutes: lateMin })
  }
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, action: 'attendance.checkin', entityType: 'worker', entityId: req.worker.id, detail: onTime ? 'Checked in (on time)' : `Checked in ${lateMin} min late — ₹${penalty} penalty` })
  res.json(await attendanceToday(req.worker.id))
})
app.post('/api/worker/attendance/checkout', auth, async (req, res) => {
  const b = req.body || {}, day = istDateStr(Date.now())
  await pool.query('UPDATE attendance SET check_out=now(), out_lat=$2, out_lng=$3 WHERE worker_id=$1 AND day=$4',
    [req.worker.id, b.lat ?? null, b.lng ?? null, day])
  // On checkout, settle the shift's minimum guarantee (wallet tops up if the day fell short).
  const att = (await pool.query('SELECT min_g FROM attendance WHERE worker_id=$1 AND day=$2', [req.worker.id, day])).rows[0]
  if (att?.min_g > 0) publishEvent(REDIS_URL, 'shift.settle', { workerId: req.worker.id, minG: att.min_g, day })
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, action: 'attendance.checkout', entityType: 'worker', entityId: req.worker.id, detail: 'Checked out' })
  res.json(await attendanceToday(req.worker.id))
})

/* ---------- geofence (assigned-apartment radius) ---------- */
// The app reports the worker's live location; we return whether they're inside their assigned
// apartment's radius. Edge-triggered: the FIRST time they leave, fire an alert (notification +
// activity); returning inside re-arms it. Only active once checked in with a site.
app.post('/api/worker/geofence/report', auth, async (req, res) => {
  const { lat, lng } = req.body || {}
  const day = istDateStr(Date.now())
  const a = (await pool.query('SELECT * FROM attendance WHERE worker_id=$1 AND day=$2', [req.worker.id, day])).rows[0]
  if (!a || !a.check_in || a.site_lat == null || a.site_lng == null || lat == null || lng == null) {
    return res.json({ active: false, inside: true, distance: 0, radius: a?.geofence_m || 0, siteName: a?.site_name || '', breaches: a?.geo_breaches || 0 })
  }
  const radius = a.geofence_m || 300
  const distance = Math.round(distanceM(a.site_lat, a.site_lng, lat, lng))
  const inside = distance <= radius
  let breached = false
  if (!inside && !a.geo_outside) {
    // Rising edge: worker just left the assigned area → alert.
    breached = true
    await pool.query('UPDATE attendance SET geo_outside=true, geo_breaches=geo_breaches+1 WHERE id=$1', [a.id])
    publishEvent(REDIS_URL, 'geofence.breach', { workerId: req.worker.id, siteName: a.site_name || 'your assigned area', distance, radius })
    publishEvent(REDIS_URL, 'activity', { actorType: 'system', actorName: 'Geofence', action: 'geofence.breach', entityType: 'worker', entityId: req.worker.id, detail: `Left ${a.site_name || 'assigned area'} — ${distance} m away (limit ${radius} m)` })
  } else if (inside && a.geo_outside) {
    await pool.query('UPDATE attendance SET geo_outside=false WHERE id=$1', [a.id])
  }
  res.json({ active: true, inside, distance, radius, siteName: a.site_name || '', breaches: (a.geo_breaches || 0) + (breached ? 1 : 0), justBreached: breached })
})

/* ---------- availability state (Available | Busy | Break | Offline | Leave) ---------- */
// Only 'Available' workers are online for job matching (available=true drives auto-assign/pull).
app.post('/api/worker/status', auth, async (req, res) => {
  const state = String(req.body?.state || 'Offline')
  await pool.query('UPDATE workers SET available=$1 WHERE id=$2', [state === 'Available', req.worker.id])
  await mergeProfile(req.worker.id, { availabilityState: state })
  res.json(workerDto(await getWorker(req.worker.id)))
})

/* ---------- leave requests ---------- */
app.get('/api/worker/leave', auth, async (req, res) => res.json(await leaveList(req.worker.id)))
app.post('/api/worker/leave', auth, async (req, res) => {
  const b = req.body || {}
  await pool.query('INSERT INTO leave_requests (worker_id, from_date, to_date, reason) VALUES ($1,$2,$3,$4)',
    [req.worker.id, b.fromDate || null, b.toDate || b.fromDate || null, b.reason || ''])
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, action: 'leave.request', entityType: 'worker', entityId: req.worker.id, detail: `Requested leave ${b.fromDate || ''}` })
  res.json(await leaveList(req.worker.id))
})

/* ---------- support tickets + SOS ---------- */
app.get('/api/worker/support', auth, async (req, res) => res.json(await ticketList(req.worker.id)))
app.post('/api/worker/support', auth, async (req, res) => {
  const b = req.body || {}
  await pool.query('INSERT INTO support_tickets (worker_id, subject, message) VALUES ($1,$2,$3)', [req.worker.id, b.subject || 'Support request', b.message || ''])
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, action: 'support.ticket', entityType: 'worker', entityId: req.worker.id, detail: `Raised a ticket: ${b.subject || ''}` })
  res.json(await ticketList(req.worker.id))
})
// SOS — emergency alert. Broadcasts to ops (activity monitor) with the worker's live location.
app.post('/api/worker/sos', auth, async (req, res) => {
  const b = req.body || {}
  const w = await getWorker(req.worker.id)
  const loc = (b.lat != null && b.lng != null) ? ` @ ${b.lat},${b.lng}` : ''
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: w?.name, action: 'sos', entityType: 'worker', entityId: req.worker.id, detail: `🆘 SOS raised${loc}`, meta: { lat: b.lat ?? null, lng: b.lng ?? null } })
  // Real-time push to the admin control tower (siren + alert modal in the admin panel).
  publishRealtime(REDIS_URL, 'admin', 'sos', {
    workerId: req.worker.id, workerName: w?.name || `Worker #${req.worker.id}`, phone: w?.phone || '',
    lat: b.lat ?? null, lng: b.lng ?? null, at: new Date().toISOString(),
  })
  res.json({ ok: true, message: 'Help is on the way. Our team has been alerted.' })
})

/* ---------- Refer & Earn ---------- */
const REFERRAL_BONUS = Number(process.env.REFERRAL_BONUS || 1500)
const referralCode = (w) => `HHP${String(1000 + Number(w.id))}`
app.get('/api/worker/referral', auth, async (req, res) => {
  const w = req.worker
  const code = referralCode(w)
  // Referrals credited as wallet income of category 'Referral' (kept in the wallet ledger).
  const lifetime = await tryGet(WALLET_URL, `/internal/referral-total/${w.id}`, { total: 0, items: [] })
  res.json({
    code,
    bonus: REFERRAL_BONUS,
    lifetimeEarnings: lifetime.total || 0,
    referrals: lifetime.items || [],
    shareMessage: `Join me as a HomeHelp Pro! Use my referral code ${code} when you sign up and we both earn ₹${REFERRAL_BONUS}. Download: https://homehelp.in/pro`,
  })
})

/* ---------- Claim Insurance / Health Card ---------- */
app.get('/api/worker/insurance', auth, async (req, res) => {
  const w = req.worker
  const activated = !!(w.profile && w.profile.insurance_activated)
  res.json({
    activated,
    coverage: '₹2,00,000 accidental cover + ₹50,000 hospitalisation',
    policyNo: activated ? `HH-INS-${1000 + Number(w.id)}` : '',
    helpline: '1800-123-4567',
  })
})
app.post('/api/worker/insurance/claim', auth, async (req, res) => {
  const b = req.body || {}
  await pool.query('INSERT INTO support_tickets (worker_id, subject, message) VALUES ($1,$2,$3)', [req.worker.id, 'Insurance claim', b.reason || b.message || 'Insurance claim request'])
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'insurance.claim', entityType: 'worker', entityId: req.worker.id, detail: `Raised an insurance claim: ${b.reason || ''}` })
  res.json({ ok: true, message: 'Claim submitted. Our team will contact you within 24 hours.' })
})

/* ---------- Merch Store ---------- */
const MERCH = [
  { id: 'tshirt', name: 'Branded T-Shirt', emoji: '👕', price: 299, desc: 'Official HomeHelp Pro tee' },
  { id: 'cap', name: 'Cap', emoji: '🧢', price: 149, desc: 'Sun-protection cap' },
  { id: 'bag', name: 'Kit Bag', emoji: '🎒', price: 499, desc: 'Carry your supplies' },
  { id: 'apron', name: 'Work Apron', emoji: '🦺', price: 249, desc: 'Durable service apron' },
  { id: 'shoes', name: 'Safety Shoes', emoji: '👟', price: 899, desc: 'Anti-slip work shoes' },
  { id: 'bottle', name: 'Water Bottle', emoji: '🧴', price: 199, desc: 'Insulated 1L bottle' },
]
app.get('/api/worker/merch', auth, (_req, res) => res.json({ products: MERCH }))
app.post('/api/worker/merch/order', auth, async (req, res) => {
  const p = MERCH.find((m) => m.id === (req.body || {}).productId)
  if (!p) return res.json({ ok: false, error: 'Product not found' })
  await pool.query('INSERT INTO support_tickets (worker_id, subject, message) VALUES ($1,$2,$3)', [req.worker.id, 'Merch order', `Ordered ${p.name} (₹${p.price})`])
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'merch.order', entityType: 'worker', entityId: req.worker.id, detail: `Ordered merch: ${p.name} (₹${p.price})`, meta: { amount: p.price } })
  res.json({ ok: true, message: `Order placed for ${p.name}. Cost is deducted from your next payout.` })
})

/* ---------- Shakti Bonus (monthly performance bonus, mapped to our per-job model) ---------- */
// "Sitara Bonus" — monthly bonus based on WORKING DAYS + rating (Gold also needs Sundays worked).
// Bronze 25 days · Silver 27 days · Gold 28 days incl. 4 Sundays. All require ≥ rating gate.
/* The Sitara/Shakti tier bonus now lives on the worker's incentive plan and is paid by the monthly
 * payroll run (see payrollLine). This endpoint drives the worker app's Sitara screen — the tier
 * table, this month's working days, and progress to the next tier — read live from their plan.
 * The old standalone SHAKTI constants and month-end scheduler are gone; payroll is the one place
 * the money is decided. */
app.get('/api/worker/shakti-bonus', auth, async (req, res) => {
  const w = await getWorker(req.worker.id)
  const inc = await incentivePlanFor(w)
  const tiers = tierRows(inc)
  const minRating = inc?.tier_min_rating ?? 4.5
  const rating = Number(w?.rating || 0)
  const month = monthKey(new Date())
  const worked = tiers.length ? await workedDaysInMonth(w.id, month) : { days: 0, sundays: 0 }

  // tiers are ascending by amount; the highest one whose gates are all met is the current tier.
  let idx = -1
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]
    if (worked.days >= t.days && worked.sundays >= (t.sundays || 0) && rating >= minRating) idx = i
  }
  const next = idx + 1 < tiers.length ? tiers[idx + 1] : null

  res.json({
    // `name` for the app's DTO; the plan stores it as `label`.
    tiers: tiers.map((t) => ({ name: t.label, amount: t.amount, days: t.days, sundays: t.sundays })),
    workingDays: worked.days,
    sundays: worked.sundays,
    rating,
    ratingTarget: minRating,
    ratingMet: rating >= minRating,
    currentTier: idx >= 0 ? tiers[idx].label : '',
    nextTier: next ? next.label : '',
    daysToNext: next ? Math.max(0, next.days - worked.days) : 0,
    sundaysToNext: next ? Math.max(0, next.sundays - worked.sundays) : 0,
    lastUpdated: new Date().toISOString().slice(0, 10),
  })
})

app.put('/api/worker/preferences', auth, async (req, res) => res.json(workerDto(await mergeProfile(req.worker.id, { preferences: req.body || {} }))))
app.put('/api/worker/notifications', auth, async (req, res) => res.json(workerDto(await mergeProfile(req.worker.id, { notifications: req.body || {} }))))
/* The worker app's view of one document. This used to return raw DB rows, so the app received
 * `file_name`/`reject_reason` while its DTO reads `fileName`/`rejectReason` — both were always
 * empty, which made every uploaded document render as "Not uploaded yet" and hid the admin's
 * rejection reason entirely. */
const docDto = (d) => ({
  id: d.id, name: d.name, fileName: d.file_name || '', status: d.status || 'Pending',
  hasFile: !!d.storage_key, rejectReason: d.reject_reason || '',
  reviewedAt: d.reviewed_at || null, created: d.created,
})
app.get('/api/worker/documents', auth, async (req, res) => res.json((await documents(req.worker.id)).map(docDto)))

/* ---------- KYC documents ----------
 * Real multipart upload into private object storage. Previously this endpoint took {name, fileName}
 * as JSON and stored two strings — the app never read a byte of the file, and the admin "reviewed"
 * documents that did not exist.
 *
 * Documents are NOT served statically and NOT inlined as data URIs (the pattern the job-photo
 * endpoints use): an identity document must not be readable by anyone who can fetch the JSON.
 * Reads go through a short-lived signed URL, issued only after checking who is asking.
 */

// Re-uploading a document supersedes the previous one: a rejected Aadhaar must be replaceable, and
// keeping both would leave the admin guessing which is current.
async function replaceDocument(wid, name, { key, mime, size, sum, fileName }) {
  const old = (await pool.query('SELECT storage_key FROM worker_documents WHERE worker_id=$1 AND name=$2', [wid, name])).rows
  await pool.query('DELETE FROM worker_documents WHERE worker_id=$1 AND name=$2', [wid, name])
  await pool.query(
    `INSERT INTO worker_documents (worker_id,name,file_name,status,storage_key,mime,size_bytes,checksum)
     VALUES ($1,$2,$3,'Pending',$4,$5,$6,$7)`,
    [wid, name, fileName, key, mime, size, sum])
  // Best-effort: a leftover object is waste, not a correctness problem, so never fail the upload on it.
  for (const o of old) if (o.storage_key) await deleteObject(o.storage_key).catch(() => {})
}

/* ---------- Phase 6: service skills ----------
 * The worker CLAIMS a skill (service + level + years + optional certificate). That claim is NOT
 * the same thing as being able to do the work:
 *
 *   profile.skills   what the worker says they can do, each with a review status
 *   workers.services what DISPATCH matches jobs against
 *
 * They are kept apart on purpose. `services` is the live capability set — dispatch reads it via
 * /internal/workers/:id/service-set — so if a self-selected skill landed there, a worker could tick
 * "Deep Cleaning" and start being sent deep-cleaning jobs before anyone verified they can do one.
 * Only an admin approval promotes a claimed skill into `services`.
 */
const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert']

/** Catalog answers { categories, services: [...] } — not a bare array. */
async function catalogServiceNames() {
  const r = await tryGet(CATALOG_URL, '/api/services', null)
  const list = Array.isArray(r) ? r : (r?.services || [])
  return [...new Set(list.map((s) => String(s?.name || '').trim()).filter(Boolean))]
}

/** The catalogue a worker picks from. Proxied so the app needs one backend, not two. */
app.get('/api/worker/services', auth, async (_q, res) => {
  res.json({ ok: true, services: await catalogServiceNames(), levels: SKILL_LEVELS })
})

app.get('/api/worker/skills', auth, async (req, res) => {
  const w = await getWorker(req.worker.id)
  res.json({ ok: true, skills: w?.profile?.skills || {}, levels: SKILL_LEVELS, approved: w?.services || [] })
})

/**
 * Claim/update skills. Body: { skills: { "Kitchen Cleaning": { level, years } } }
 * Re-claiming an already-approved skill at a DIFFERENT level sends it back for review — otherwise
 * a worker could self-promote from Beginner to Expert after approval.
 */
app.put('/api/worker/skills', auth, async (req, res) => {
  const incoming = req.body?.skills
  if (!incoming || typeof incoming !== 'object') return res.status(400).json({ ok: false, error: 'No skills supplied' })
  const w = await getWorker(req.worker.id)
  const cur = w?.profile?.skills || {}
  const known = new Set(await catalogServiceNames())
  // If the catalogue is unreachable, reject rather than silently accept unvalidated skills.
  if (!known.size) return res.status(502).json({ ok: false, error: 'Service list unavailable — please try again' })

  const next = {}
  for (const [service, v] of Object.entries(incoming)) {
    if (!known.has(service)) return res.status(400).json({ ok: false, error: `Unknown service: ${service}` })
    const level = String(v?.level || '')
    if (!SKILL_LEVELS.includes(level)) return res.status(400).json({ ok: false, error: `Invalid level for ${service}` })
    const years = String(v?.years ?? '').replace(/\D/g, '').slice(0, 2)
    const prev = cur[service]
    // Keep an approval only when nothing material changed; any edit needs re-review.
    const unchanged = prev && prev.status === 'Approved' && prev.level === level && String(prev.years ?? '') === years
    next[service] = {
      level, years,
      status: unchanged ? 'Approved' : 'Pending',
      reason: unchanged ? (prev.reason || '') : '',
      certificate: prev?.certificate || null,
      claimedAt: new Date().toISOString(),
    }
  }
  // Dropping a claim must also withdraw the live capability, or dispatch keeps sending that work.
  const dropped = Object.keys(cur).filter((s) => !next[s])
  if (dropped.length) {
    const keep = (w.services || []).filter((s) => !dropped.includes(s))
    await pool.query('UPDATE workers SET services=$1::jsonb WHERE id=$2', [JSON.stringify(keep), req.worker.id])
  }
  await mergeProfile(req.worker.id, { skills: next })
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'skills.claim', entityType: 'worker', entityId: req.worker.id, detail: `Updated skills (${Object.keys(next).length})` })
  const after = await getWorker(req.worker.id)
  res.json({ ok: true, skills: after?.profile?.skills || {}, approved: after?.services || [] })
})

/** Certificate for one skill. Private bucket — it's a personal document, like KYC. */
app.post('/api/worker/skills/certificate', auth, upload.single('file'), async (req, res) => {
  const service = String(req.body?.service || '').trim()
  if (!service) return res.status(400).json({ ok: false, error: 'Service required' })
  if (!storageConfigured()) return res.status(503).json({ ok: false, error: 'Storage is not configured' })
  if (!req.file?.buffer?.length) return res.status(400).json({ ok: false, error: 'Attach the certificate' })
  const w = await getWorker(req.worker.id)
  const skills = w?.profile?.skills || {}
  if (!skills[service]) return res.status(400).json({ ok: false, error: 'Claim this skill before adding a certificate' })
  const kind = sniffType(req.file.buffer)
  if (!kind) return res.status(415).json({ ok: false, error: 'Only JPG, PNG, WebP or PDF files are accepted' })
  const key = storageKey(`workers/${req.worker.id}/certs`, kind.ext)
  try { await putObject(key, req.file.buffer, kind.mime) }
  catch (e) { console.error('[worker] certificate upload failed:', e.message); return res.status(502).json({ ok: false, error: 'Could not store the certificate' }) }
  const old = skills[service].certificate?.key
  // A new certificate is new evidence, so the claim goes back for review.
  skills[service] = { ...skills[service], certificate: { key, fileName: req.file.originalname || `certificate.${kind.ext}` }, status: 'Pending', reason: '' }
  await mergeProfile(req.worker.id, { skills })
  if (old) await deleteObject(old).catch(() => {})
  res.json({ ok: true, skills })
})

/* ---------- Phase 7: training & assessment ----------
 * Modules are admin-authored; a worker only ever sees published ones. The quiz draws a random
 * paper from the bank so a retake isn't the same paper, and is scored HERE — the paper is served
 * without correct_index, so it can't be passed by reading the response.
 *
 * Passing gates nothing on its own. It's recorded and surfaced on the admin's checklist, and
 * Phase 12's final approval is the single place activation is decided.
 */
const QUIZ_SIZE = Number(process.env.QUIZ_SIZE || 20)
const QUIZ_PASS_PCT = Number(process.env.QUIZ_PASS_PCT || 80)
const QUIZ_COOLDOWN_MIN = Number(process.env.QUIZ_COOLDOWN_MIN || 30)

/** Askable = active, and either general or belonging to a published module. */
const BANK_WHERE = `q.active AND (q.module_id IS NULL OR m.published)`

async function trainingState(workerId) {
  const [mods, done, attempts, bank] = await Promise.all([
    pool.query('SELECT id, key, title, body, sort FROM training_modules WHERE published = true ORDER BY sort, id'),
    pool.query('SELECT module_id, completed_at FROM worker_training WHERE worker_id = $1', [workerId]),
    pool.query('SELECT id, score, total, passed, created FROM quiz_attempts WHERE worker_id = $1 ORDER BY created DESC LIMIT 20', [workerId]),
    pool.query(`SELECT COUNT(*)::int n FROM training_questions q LEFT JOIN training_modules m ON m.id = q.module_id WHERE ${BANK_WHERE}`),
  ])
  const doneAt = new Map(done.rows.map((r) => [r.module_id, r.completed_at]))
  const modules = mods.rows.map((m) => ({
    id: m.id, key: m.key, title: m.title, body: m.body, sort: m.sort,
    completed: doneAt.has(m.id), completedAt: doneAt.get(m.id) || null,
  }))
  const completed = modules.filter((m) => m.completed).length
  const passedRow = attempts.rows.find((a) => a.passed)
  const lastFail = attempts.rows.find((a) => !a.passed)
  const cooldownUntil = !passedRow && lastFail
    ? new Date(new Date(lastFail.created).getTime() + QUIZ_COOLDOWN_MIN * 60_000)
    : null
  const onCooldown = !!cooldownUntil && cooldownUntil > new Date()
  const best = attempts.rows.reduce((m, a) => Math.max(m, a.total ? Math.round((a.score / a.total) * 100) : 0), 0)
  return {
    modules,
    progress: { completed, total: modules.length },
    quiz: {
      size: QUIZ_SIZE, passPct: QUIZ_PASS_PCT, bank: bank.rows[0].n,
      passed: !!passedRow, passedAt: passedRow?.created || null,
      bestPct: attempts.rows.length ? best : null,
      attempts: attempts.rows.length,
      // Every reason the quiz can't be taken right now, so the app explains rather than greys out.
      modulesDone: modules.length > 0 && completed === modules.length,
      ready: bank.rows[0].n >= QUIZ_SIZE,
      onCooldown, cooldownUntil: onCooldown ? cooldownUntil.toISOString() : null,
      history: attempts.rows.slice(0, 5).map((a) => ({
        id: a.id, score: a.score, total: a.total,
        pct: a.total ? Math.round((a.score / a.total) * 100) : 0,
        passed: a.passed, created: a.created,
      })),
    },
  }
}

app.get('/api/worker/training', auth, async (req, res) => {
  res.json({ ok: true, ...(await trainingState(req.worker.id)) })
})

app.post('/api/worker/training/:id/complete', auth, async (req, res) => {
  const id = Number(req.params.id)
  // Only published modules count — otherwise a draft id could be marked done and inflate progress.
  const m = (await pool.query('SELECT id FROM training_modules WHERE id = $1 AND published = true', [id])).rows[0]
  if (!m) return res.status(404).json({ ok: false, error: 'Module not found' })
  await pool.query('INSERT INTO worker_training (worker_id, module_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.worker.id, id])
  res.json({ ok: true, ...(await trainingState(req.worker.id)) })
})

/** The paper: a random QUIZ_SIZE from the bank, WITHOUT the answers. */
app.get('/api/worker/training/quiz', auth, async (req, res) => {
  const st = await trainingState(req.worker.id)
  if (!st.quiz.ready) return res.status(503).json({ ok: false, error: 'The assessment is not ready yet — ask the admin to finish setting it up' })
  if (!st.quiz.modulesDone) return res.status(400).json({ ok: false, error: 'Finish all the training modules first' })
  if (st.quiz.onCooldown) return res.status(429).json({ ok: false, error: `Please wait until ${new Date(st.quiz.cooldownUntil).toLocaleTimeString()} before trying again`, cooldownUntil: st.quiz.cooldownUntil })

  const q = await pool.query(
    `SELECT q.id, q.question, q.options FROM training_questions q
     LEFT JOIN training_modules m ON m.id = q.module_id
     WHERE ${BANK_WHERE} ORDER BY random() LIMIT $1`, [QUIZ_SIZE])
  res.json({
    ok: true, passPct: QUIZ_PASS_PCT,
    questions: q.rows.map((r) => ({ id: r.id, question: r.question, options: r.options || [] })),
  })
})

/**
 * Submit. Body: { answers: { "<questionId>": <optionIndex> } }
 * Always scored out of QUIZ_SIZE, never out of what was answered — otherwise a worker could send
 * only the three they're sure of and score 100%.
 */
app.post('/api/worker/training/quiz', auth, async (req, res) => {
  const answers = req.body?.answers
  if (!answers || typeof answers !== 'object') return res.status(400).json({ ok: false, error: 'No answers supplied' })
  const st = await trainingState(req.worker.id)
  if (!st.quiz.ready) return res.status(503).json({ ok: false, error: 'The assessment is not ready yet' })
  if (!st.quiz.modulesDone) return res.status(400).json({ ok: false, error: 'Finish all the training modules first' })
  if (st.quiz.onCooldown) return res.status(429).json({ ok: false, error: 'Too soon — this attempt is on cooldown', cooldownUntil: st.quiz.cooldownUntil })

  const ids = [...new Set(Object.keys(answers).map(Number).filter(Number.isInteger))].slice(0, QUIZ_SIZE)
  const rows = ids.length
    ? (await pool.query(
        `SELECT q.id, q.correct_index FROM training_questions q
         LEFT JOIN training_modules m ON m.id = q.module_id
         WHERE ${BANK_WHERE} AND q.id = ANY($1::int[])`, [ids])).rows
    : []
  const score = rows.filter((r) => Number(answers[r.id]) === r.correct_index).length
  const pct = Math.round((score / QUIZ_SIZE) * 100)
  const passed = pct >= QUIZ_PASS_PCT

  await pool.query('INSERT INTO quiz_attempts (worker_id, score, total, passed) VALUES ($1, $2, $3, $4)', [req.worker.id, score, QUIZ_SIZE, passed])
  publishEvent(REDIS_URL, 'activity', {
    actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'training.quiz',
    entityType: 'worker', entityId: req.worker.id,
    detail: `${passed ? 'Passed' : 'Failed'} the assessment — ${score}/${QUIZ_SIZE} (${pct}%)`,
  })
  // Only the result, never which ones were wrong: the bank is small and a wrong-answer key would
  // let a worker map it out over a few deliberate failures.
  res.json({ ok: true, score, total: QUIZ_SIZE, pct, passed, passPct: QUIZ_PASS_PCT, ...(await trainingState(req.worker.id)) })
})

/* ---------- Phase 9: equipment allocation ---------- */
const eqTypeDto = (t) => ({ id: t.id, key: t.key, name: t.name, required: t.required, active: t.active, sort: t.sort, issued: t.issued ?? undefined })
const eqDto = (e) => ({
  id: e.id, typeId: e.type_id, name: e.name, serial: e.serial || '', notes: e.notes || '',
  status: e.status, issuedAt: e.issued_at, issuedBy: e.issued_by || '',
  returnedAt: e.returned_at || null, returnedBy: e.returned_by || '',
})

async function workerEquipment(workerId) {
  const { rows } = await pool.query(
    `SELECT e.*, t.name FROM worker_equipment e JOIN equipment_types t ON t.id = e.type_id
     WHERE e.worker_id = $1 ORDER BY e.issued_at DESC`, [workerId])
  return rows.map(eqDto)
}

app.get('/api/admin/equipment', adminAuth, async (_q, res) => {
  const { rows } = await pool.query(
    `SELECT t.*, (SELECT COUNT(*)::int FROM worker_equipment e WHERE e.type_id = t.id AND e.status = 'issued') issued
     FROM equipment_types t ORDER BY t.sort, t.id`)
  res.json({ ok: true, types: rows.map(eqTypeDto) })
})

app.post('/api/admin/equipment', adminAuth, async (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Name required' })
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)
  const sort = (await pool.query('SELECT COALESCE(MAX(sort), 0) + 1 n FROM equipment_types')).rows[0].n
  try {
    const r = await pool.query('INSERT INTO equipment_types (key, name, required, sort) VALUES ($1, $2, $3, $4) RETURNING *', [key, name, !!req.body?.required, sort])
    res.json({ ok: true, type: eqTypeDto(r.rows[0]) })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That item already exists' })
    throw e
  }
})

app.patch('/api/admin/equipment/:id', adminAuth, async (req, res) => {
  const id = Number(req.params.id)
  const cur = (await pool.query('SELECT * FROM equipment_types WHERE id=$1', [id])).rows[0]
  if (!cur) return res.status(404).json({ error: 'Item not found' })
  const b = req.body || {}
  const name = b.name !== undefined ? String(b.name).trim() : cur.name
  if (!name) return res.status(400).json({ error: 'Name required' })
  const r = await pool.query('UPDATE equipment_types SET name=$1, required=$2, active=$3 WHERE id=$4 RETURNING *',
    [name, b.required !== undefined ? !!b.required : cur.required, b.active !== undefined ? !!b.active : cur.active, id])
  res.json({ ok: true, type: eqTypeDto(r.rows[0]) })
})

app.delete('/api/admin/equipment/:id', adminAuth, async (req, res) => {
  const id = Number(req.params.id)
  // Deleting the type would cascade away the record of what a worker is holding. Retire instead —
  // an item you no longer issue is not an item nobody was ever given.
  const held = (await pool.query("SELECT COUNT(*)::int n FROM worker_equipment WHERE type_id=$1", [id])).rows[0].n
  if (held) return res.status(409).json({ error: 'This has been issued before — retire it instead of deleting, so the history survives' })
  await pool.query('DELETE FROM equipment_types WHERE id=$1', [id])
  res.json({ ok: true })
})

app.get('/api/admin/workers/:id/equipment', adminAuth, scopeWorker, async (req, res) => {
  const workerId = Number(req.params.id)
  const types = (await pool.query('SELECT * FROM equipment_types WHERE active = true ORDER BY sort, id')).rows.map(eqTypeDto)
  res.json({ ok: true, types, issued: await workerEquipment(workerId) })
})

app.post('/api/admin/workers/:id/equipment', adminAuth, requirePerm('equipment.manage'), scopeWorker, async (req, res) => {
  const workerId = Number(req.params.id)
  const typeId = Number(req.body?.typeId)
  const w = await getWorker(workerId)
  if (!w) return res.status(404).json({ error: 'Worker not found' })
  const t = (await pool.query('SELECT * FROM equipment_types WHERE id=$1 AND active=true', [typeId])).rows[0]
  if (!t) return res.status(404).json({ error: 'Equipment item not found' })
  // Two live "Uniform" rows would make "returned" ambiguous — which one came back?
  const dup = (await pool.query("SELECT id FROM worker_equipment WHERE worker_id=$1 AND type_id=$2 AND status='issued'", [workerId, typeId])).rows[0]
  if (dup) return res.status(409).json({ error: `${t.name} is already issued to ${w.name}. Mark it returned first.` })

  const who = req.admin?.name || req.admin?.email || 'Admin'
  await pool.query(
    'INSERT INTO worker_equipment (worker_id, type_id, serial, notes, issued_by) VALUES ($1, $2, $3, $4, $5)',
    [workerId, typeId, String(req.body?.serial || '').trim().slice(0, 60), String(req.body?.notes || '').trim().slice(0, 200), who])
  publishEvent(REDIS_URL, 'worker.notify', { workerId, title: 'Equipment issued', body: `${t.name} has been issued to you.` })
  publishEvent(REDIS_URL, 'activity', { actorType: 'admin', actorName: who, action: 'equipment.issue', entityType: 'worker', entityId: workerId, detail: `Issued ${t.name} to ${w.name}` })
  res.json({ ok: true, issued: await workerEquipment(workerId) })
})

app.post('/api/admin/workers/:id/equipment/:eid/return', adminAuth, requirePerm('equipment.manage'), scopeWorker, async (req, res) => {
  const workerId = Number(req.params.id)
  const row = (await pool.query(
    `SELECT e.*, t.name FROM worker_equipment e JOIN equipment_types t ON t.id = e.type_id
     WHERE e.id=$1 AND e.worker_id=$2`, [Number(req.params.eid), workerId])).rows[0]
  if (!row) return res.status(404).json({ error: 'Not found' })
  if (row.status === 'returned') return res.status(409).json({ error: 'Already marked returned' })
  const who = req.admin?.name || req.admin?.email || 'Admin'
  await pool.query("UPDATE worker_equipment SET status='returned', returned_at=now(), returned_by=$1 WHERE id=$2", [who, row.id])
  const w = await getWorker(workerId)
  publishEvent(REDIS_URL, 'activity', { actorType: 'admin', actorName: who, action: 'equipment.return', entityType: 'worker', entityId: workerId, detail: `${row.name} returned by ${w?.name || `worker ${workerId}`}` })
  res.json({ ok: true, issued: await workerEquipment(workerId) })
})

/** What the worker is holding — read-only; issuing is the admin's job. */
app.get('/api/worker/equipment', auth, async (req, res) => {
  res.json({ ok: true, issued: await workerEquipment(req.worker.id) })
})

/* ---------- Phase 10: per-worker pay ----------
 * Only what genuinely moves money. `commissionPercent` is read by the wallet when it settles a
 * job (see /api/internal/workers/:id/pay-config), so a number set here changes what the worker is
 * actually paid. NULL means "use the platform-wide setting" — every existing worker's behaviour.
 *
 * Deliberately NOT here: Fixed/Hybrid salary (needs a monthly payroll run — offering it without
 * one would silently pay a worker nothing per job), the named bonuses (each needs a real trigger),
 * and TDS/ESI/PF (statutory rates aren't ours to invent). Better absent than decorative.
 */
/**
 * The ONE place a worker's commission is decided: plan → manual override → platform default.
 * The wallet reads this (via /internal/workers/:id/pay-config) and so does the admin panel, so
 * neither can show a rate the other wouldn't pay.
 */
async function resolveCommission(w) {
  const platform = await getSettingInt(ADMIN_URL, 'commission_percent', 20)
  if (w?.salary_plan_id) {
    const plan = (await pool.query('SELECT * FROM salary_plans WHERE id=$1', [w.salary_plan_id])).rows[0]
    // A retired plan keeps paying whoever is on it — silently reverting them to the platform rate
    // because someone archived a plan would change real pay without anyone deciding to.
    if (plan) {
      return {
        // A FIXED worker gets no per-job share at all — payroll pays them. Falling through to a
        // commission here would pay them twice for the same work.
        pct: plan.commission_percent,
        perJob: paysPerJob(plan.salary_type),
        source: 'plan', plan, platform,
      }
    }
  }
  if (Number.isInteger(w?.commission_percent)) return { pct: w.commission_percent, perJob: true, source: 'manual', plan: null, platform }
  return { pct: platform, perJob: true, source: 'platform', plan: null, platform }
}

/** The incentive plan a worker is on, if any. */
async function incentivePlanFor(w) {
  if (!w?.incentive_plan_id) return null
  return (await pool.query('SELECT * FROM incentive_plans WHERE id=$1', [w.incentive_plan_id])).rows[0] || null
}

/**
 * The worker's effective monthly salary amounts: a per-worker override wins, else the plan's value.
 * `overridden` is true when any amount was set by hand — the panel shows that so an admin knows
 * this worker isn't simply following the template.
 */
function salaryAmounts(w, plan) {
  const pick = (own, planVal) => (Number.isInteger(own) ? own : (planVal || 0))
  const basic = pick(w?.salary_basic, plan?.monthly_basic)
  const attendance = pick(w?.salary_attendance, plan?.attendance_allowance)
  const allowance = pick(w?.salary_allowance, plan?.other_allowance)
  const overridden = [w?.salary_basic, w?.salary_attendance, w?.salary_allowance].some(Number.isInteger)
  return { basic, attendance, allowance, total: basic + attendance + allowance, overridden }
}

/* Salary types.
 *  per_job — commission only; nothing monthly. The original model.
 *  fixed   — a monthly salary, paid whatever the job count. NO per-job share: that's what "paid
 *            irrespective of job count" means, and also paying commission would double-pay.
 *  hybrid  — both: a monthly salary AND a per-job share, usually at a higher commission.
 * Fixed and hybrid only became offerable once the payroll run below existed to actually pay them.
 */
const SALARY_TYPES = ['per_job', 'fixed', 'hybrid']
const MONTHLY_TYPES = ['fixed', 'hybrid'] // types that a payroll run pays
const paysPerJob = (t) => t !== 'fixed'

const planDto = (p) => p && ({
  id: p.id, name: p.name, salaryType: p.salary_type,
  commissionPercent: p.commission_percent,
  monthlyBasic: p.monthly_basic || 0,
  attendanceAllowance: p.attendance_allowance || 0,
  otherAllowance: p.other_allowance || 0,
  totalFixedPay: (p.monthly_basic || 0) + (p.attendance_allowance || 0) + (p.other_allowance || 0),
  notes: p.notes || '', active: p.active, sort: p.sort,
  // Meaningless on a fixed plan — the worker keeps no share because there is no share.
  workerKeeps: paysPerJob(p.salary_type) ? 100 - p.commission_percent : null,
  paysPerJob: paysPerJob(p.salary_type),
  paysMonthly: MONTHLY_TYPES.includes(p.salary_type),
})

const tierRows = (p) => Array.isArray(p?.attendance_tiers) ? p.attendance_tiers : []
const tierSummary = (tiers) => tiers.length
  ? tiers.map((t) => `${t.label} ₹${t.amount} (${t.days}d${t.sundays ? `, ${t.sundays} Sun` : ''})`).join(', ')
  : ''

const incentiveDto = (p) => {
  if (!p) return p
  const tiers = tierRows(p)
  return {
    id: p.id, name: p.name, notes: p.notes || '', active: p.active, sort: p.sort,
    perJobAmount: p.per_job_amount || 0,
    qualityBonusAmount: p.quality_bonus_amount || 0,
    qualityMinRating: p.quality_min_rating,
    // Sitara/Shakti attendance tiers.
    attendanceTiers: tiers,
    tierMinRating: p.tier_min_rating ?? 4.5,
    peakHourAmount: p.peak_hour_amount || 0,
    referralAmount: p.referral_amount || 0,
    festivalAmount: p.festival_amount || 0,
    estIncentiveMin: p.est_incentive_min || 0,
    estIncentiveMax: p.est_incentive_max || 0,
    // `auto` = paid by the system (per-job on completion, tiers & quality by payroll); the rest the
    // admin pays with the manual-bonus action. `on` = this plan funds it.
    components: [
      { key: 'per_job', label: 'Per Job Incentive', auto: true, on: p.per_job_amount > 0, detail: `₹${p.per_job_amount} per completed job` },
      { key: 'tiers', label: 'Attendance Bonus', auto: true, on: tiers.length > 0, detail: tiers.length ? `Tiered — ${tierSummary(tiers)}, rating ${p.tier_min_rating ?? 4.5}★+` : 'No tiers set' },
      { key: 'quality', label: 'Quality Bonus', auto: true, on: p.quality_bonus_amount > 0, detail: `₹${p.quality_bonus_amount}/month at ${p.quality_min_rating}★+ with a completed job` },
      { key: 'peak_hour', label: 'Peak Hour Incentive', auto: false, on: p.peak_hour_amount > 0, detail: `₹${p.peak_hour_amount} — paid manually` },
      { key: 'referral', label: 'Referral Bonus', auto: false, on: p.referral_amount > 0, detail: `₹${p.referral_amount} — paid manually` },
      { key: 'festival', label: 'Festival Bonus', auto: false, on: p.festival_amount > 0, detail: `₹${p.festival_amount} — paid manually` },
    ],
    workers: p.workers ?? undefined,
  }
}

app.get('/api/admin/salary-plans', adminAuth, async (_q, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, (SELECT COUNT(*)::int FROM workers w WHERE w.salary_plan_id = p.id) workers
     FROM salary_plans p ORDER BY p.sort, p.id`)
  const platform = await getSettingInt(ADMIN_URL, 'commission_percent', 20)
  res.json({ ok: true, platformCommissionPercent: platform, plans: rows.map((p) => ({ ...planDto(p), workers: p.workers })) })
})

function readPlan(b) {
  const name = String(b?.name || '').trim()
  if (!name) return { error: 'Name required' }
  const salaryType = String(b?.salaryType || 'per_job')
  if (!SALARY_TYPES.includes(salaryType)) return { error: `Salary type must be one of: ${SALARY_TYPES.join(', ')}` }

  const money = (v) => (v === '' || v === null || v === undefined ? 0 : Number(v))
  const monthlyBasic = money(b?.monthlyBasic)
  const attendanceAllowance = money(b?.attendanceAllowance)
  const otherAllowance = money(b?.otherAllowance)
  for (const [v, label] of [[monthlyBasic, 'Monthly basic salary'], [attendanceAllowance, 'Attendance bonus'], [otherAllowance, 'Other allowance']]) {
    if (!Number.isInteger(v) || v < 0 || v > 10_000_000) return { error: `${label} must be a whole rupee amount` }
  }
  // A fixed/hybrid plan with no salary would quietly pay nothing every month.
  if (MONTHLY_TYPES.includes(salaryType) && monthlyBasic <= 0) {
    return { error: 'A fixed or hybrid plan needs a monthly basic salary — otherwise payroll would pay nothing' }
  }

  let pct = Number(b?.commissionPercent)
  if (!paysPerJob(salaryType)) {
    // A commission on a fixed plan is a number nobody would ever apply — store 0 rather than keep a
    // value the UI might show and the wallet would never use.
    pct = 0
  } else if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
    return { error: 'Commission must be a whole number between 0 and 100' }
  }
  return { name, commissionPercent: pct, salaryType, monthlyBasic, attendanceAllowance, otherAllowance, notes: String(b?.notes || '').trim().slice(0, 200) }
}

app.post('/api/admin/salary-plans', adminAuth, requirePerm('salary_plans.edit'), async (req, res) => {
  const v = readPlan(req.body)
  if (v.error) return res.status(400).json({ error: v.error })
  const sort = (await pool.query('SELECT COALESCE(MAX(sort), 0) + 1 n FROM salary_plans')).rows[0].n
  try {
    const r = await pool.query(
      `INSERT INTO salary_plans (name, salary_type, commission_percent, monthly_basic, attendance_allowance, other_allowance, notes, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [v.name, v.salaryType, v.commissionPercent, v.monthlyBasic, v.attendanceAllowance, v.otherAllowance, v.notes, sort])
    const who = req.admin?.name || req.admin?.email || 'Admin'
    publishEvent(REDIS_URL, 'activity', { actorType: 'admin', actorName: who, action: 'salaryplan.create', entityType: 'salary_plan', entityId: r.rows[0].id, detail: `Created salary plan ${v.name} (${v.commissionPercent}% commission)` })
    res.status(201).json({ ok: true, plan: planDto(r.rows[0]) })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'A plan with that name already exists' })
    throw e
  }
})

app.patch('/api/admin/salary-plans/:id', adminAuth, requirePerm('salary_plans.edit'), async (req, res) => {
  const id = Number(req.params.id)
  const cur = (await pool.query('SELECT * FROM salary_plans WHERE id=$1', [id])).rows[0]
  if (!cur) return res.status(404).json({ error: 'Plan not found' })
  if (req.body?.active !== undefined && Object.keys(req.body).length === 1) {
    const r = await pool.query('UPDATE salary_plans SET active=$1 WHERE id=$2 RETURNING *', [!!req.body.active, id])
    return res.json({ ok: true, plan: planDto(r.rows[0]) })
  }
  const v = readPlan({
    name: req.body?.name ?? cur.name,
    commissionPercent: req.body?.commissionPercent ?? cur.commission_percent,
    salaryType: req.body?.salaryType ?? cur.salary_type,
    monthlyBasic: req.body?.monthlyBasic ?? cur.monthly_basic,
    attendanceAllowance: req.body?.attendanceAllowance ?? cur.attendance_allowance,
    otherAllowance: req.body?.otherAllowance ?? cur.other_allowance,
    notes: req.body?.notes ?? cur.notes,
  })
  if (v.error) return res.status(400).json({ error: v.error })
  const r = await pool.query(
    `UPDATE salary_plans SET name=$1, salary_type=$2, commission_percent=$3, monthly_basic=$4, attendance_allowance=$5, other_allowance=$6, notes=$7, active=$8
     WHERE id=$9 RETURNING *`,
    [v.name, v.salaryType, v.commissionPercent, v.monthlyBasic, v.attendanceAllowance, v.otherAllowance, v.notes,
      req.body?.active !== undefined ? !!req.body.active : cur.active, id])

  // Changing a plan's rate changes what everyone on it takes home. Say so out loud, and tell them.
  const rateChanged = v.commissionPercent !== cur.commission_percent
  const payChanged = v.monthlyBasic !== cur.monthly_basic || v.otherAllowance !== cur.other_allowance
  if (rateChanged || payChanged) {
    const on = (await pool.query('SELECT id FROM workers WHERE salary_plan_id=$1', [id])).rows
    const who = req.admin?.name || req.admin?.email || 'Admin'
    const what = [
      rateChanged && `commission ${cur.commission_percent}% → ${v.commissionPercent}%`,
      payChanged && `monthly pay ₹${cur.monthly_basic + cur.other_allowance} → ₹${v.monthlyBasic + v.otherAllowance}`,
    ].filter(Boolean).join(', ')
    publishEvent(REDIS_URL, 'activity', { actorType: 'admin', actorName: who, action: 'salaryplan.rate', entityType: 'salary_plan', entityId: id, detail: `${v.name}: ${what} — affects ${on.length} worker(s)` })
    for (const w of on) {
      publishEvent(REDIS_URL, 'worker.notify', {
        workerId: w.id, title: 'Your pay changed',
        body: paysPerJob(v.salaryType)
          ? `You now keep ${100 - v.commissionPercent}% of each job${v.monthlyBasic ? ` plus ₹${v.monthlyBasic + v.otherAllowance} a month` : ''}.`
          : `Your monthly pay is now ₹${v.monthlyBasic + v.otherAllowance}.`,
      })
    }
  }
  res.json({ ok: true, plan: planDto(r.rows[0]) })
})

app.delete('/api/admin/salary-plans/:id', adminAuth, requirePerm('salary_plans.edit'), async (req, res) => {
  const id = Number(req.params.id)
  const n = (await pool.query('SELECT COUNT(*)::int n FROM workers WHERE salary_plan_id=$1', [id])).rows[0].n
  // Deleting would drop those workers to the platform rate without anyone deciding to.
  if (n) return res.status(409).json({ error: `${n} worker(s) are on this plan — move them off it first, or retire it instead` })
  await pool.query('DELETE FROM salary_plans WHERE id=$1', [id])
  res.json({ ok: true })
})

/* ---------- Incentive plans ----------
 * Three components, each a rule with a threshold the admin sets. Nothing here is a named policy
 * with no behaviour: per-job fires on the booking that already credits earnings, attendance and
 * quality are computed by the payroll run from real attendance and real ratings.
 *
 * Referral, Peak Hour and Festival bonuses are deliberately absent — each needs a trigger that
 * doesn't exist (a referral graph, peak windows, a festival calendar), and a component that never
 * fires is worse than one that isn't offered.
 */
app.get('/api/admin/incentive-plans', adminAuth, async (_q, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, (SELECT COUNT(*)::int FROM workers w WHERE w.incentive_plan_id = p.id) workers
     FROM incentive_plans p ORDER BY p.sort, p.id`)
  res.json({ ok: true, plans: rows.map(incentiveDto) })
})

function readIncentive(b) {
  const name = String(b?.name || '').trim()
  if (!name) return { error: 'Name required' }
  const n = (v, d = 0) => (v === '' || v === null || v === undefined ? d : Number(v))
  const perJob = n(b?.perJobAmount)
  const qualAmt = n(b?.qualityBonusAmount)
  const qualMin = n(b?.qualityMinRating, 4.5)
  const tierMin = n(b?.tierMinRating, 4.5)
  const peak = n(b?.peakHourAmount)
  const referral = n(b?.referralAmount)
  const festival = n(b?.festivalAmount)
  const estMin = n(b?.estIncentiveMin)
  const estMax = n(b?.estIncentiveMax)
  for (const [v, label] of [[perJob, 'Per job incentive'], [qualAmt, 'Quality bonus'],
    [peak, 'Peak hour incentive'], [referral, 'Referral bonus'], [festival, 'Festival bonus'], [estMin, 'Estimate (min)'], [estMax, 'Estimate (max)']]) {
    if (!Number.isInteger(v) || v < 0 || v > 1_000_000) return { error: `${label} must be a whole rupee amount (0 to switch it off)` }
  }
  if (!(qualMin >= 1 && qualMin <= 5)) return { error: 'Quality threshold must be a rating between 1 and 5' }
  if (!(tierMin >= 1 && tierMin <= 5)) return { error: 'Tier rating threshold must be between 1 and 5' }
  if (estMax > 0 && estMax < estMin) return { error: 'The estimate maximum cannot be below the minimum' }

  // Attendance tiers. Each { label, days, sundays, amount }. Ordered by the amount they pay so the
  // "highest tier reached" is unambiguous — a worker who clears several gets the best one.
  const rawTiers = Array.isArray(b?.attendanceTiers) ? b.attendanceTiers : []
  const tiers = []
  for (const t of rawTiers) {
    const label = String(t?.label || '').trim().slice(0, 30)
    const days = n(t?.days)
    const sundays = n(t?.sundays)
    const amount = n(t?.amount)
    if (!label) return { error: 'Each attendance tier needs a name' }
    if (!Number.isInteger(days) || days < 1 || days > 31) return { error: `${label}: days must be between 1 and 31` }
    if (!Number.isInteger(sundays) || sundays < 0 || sundays > 5) return { error: `${label}: Sundays must be between 0 and 5` }
    if (!Number.isInteger(amount) || amount < 1 || amount > 1_000_000) return { error: `${label}: amount must be a whole rupee value` }
    tiers.push({ label, days, sundays, amount })
  }
  tiers.sort((a, c) => a.amount - c.amount)

  // A plan with nothing switched on pays nothing — assigning it would look like a decision and do
  // nothing at all.
  if (perJob === 0 && qualAmt === 0 && peak === 0 && referral === 0 && festival === 0 && tiers.length === 0) {
    return { error: 'Set at least one component — a plan with nothing switched on pays nothing' }
  }
  return { name, perJob, qualAmt, qualMin, tiers, tierMin, peak, referral, festival, estMin, estMax, notes: String(b?.notes || '').trim().slice(0, 200) }
}

app.post('/api/admin/incentive-plans', adminAuth, requirePerm('incentive_plans.edit'), async (req, res) => {
  const v = readIncentive(req.body)
  if (v.error) return res.status(400).json({ error: v.error })
  const sort = (await pool.query('SELECT COALESCE(MAX(sort), 0) + 1 n FROM incentive_plans')).rows[0].n
  try {
    const r = await pool.query(
      `INSERT INTO incentive_plans (name, per_job_amount, quality_bonus_amount, quality_min_rating,
                                    attendance_tiers, tier_min_rating,
                                    peak_hour_amount, referral_amount, festival_amount, est_incentive_min, est_incentive_max, notes, sort)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [v.name, v.perJob, v.qualAmt, v.qualMin, JSON.stringify(v.tiers), v.tierMin, v.peak, v.referral, v.festival, v.estMin, v.estMax, v.notes, sort])
    const who = req.admin?.name || req.admin?.email || 'Admin'
    publishEvent(REDIS_URL, 'activity', { actorType: 'admin', actorName: who, action: 'incentiveplan.create', entityType: 'incentive_plan', entityId: r.rows[0].id, detail: `Created incentive plan ${v.name}` })
    res.status(201).json({ ok: true, plan: incentiveDto(r.rows[0]) })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'A plan with that name already exists' })
    throw e
  }
})

app.patch('/api/admin/incentive-plans/:id', adminAuth, requirePerm('incentive_plans.edit'), async (req, res) => {
  const id = Number(req.params.id)
  const cur = (await pool.query('SELECT * FROM incentive_plans WHERE id=$1', [id])).rows[0]
  if (!cur) return res.status(404).json({ error: 'Plan not found' })
  if (req.body?.active !== undefined && Object.keys(req.body).length === 1) {
    const r = await pool.query('UPDATE incentive_plans SET active=$1 WHERE id=$2 RETURNING *', [!!req.body.active, id])
    return res.json({ ok: true, plan: incentiveDto(r.rows[0]) })
  }
  const v = readIncentive({
    name: req.body?.name ?? cur.name,
    perJobAmount: req.body?.perJobAmount ?? cur.per_job_amount,
    qualityBonusAmount: req.body?.qualityBonusAmount ?? cur.quality_bonus_amount,
    qualityMinRating: req.body?.qualityMinRating ?? cur.quality_min_rating,
    attendanceTiers: req.body?.attendanceTiers ?? cur.attendance_tiers,
    tierMinRating: req.body?.tierMinRating ?? cur.tier_min_rating,
    peakHourAmount: req.body?.peakHourAmount ?? cur.peak_hour_amount,
    referralAmount: req.body?.referralAmount ?? cur.referral_amount,
    festivalAmount: req.body?.festivalAmount ?? cur.festival_amount,
    estIncentiveMin: req.body?.estIncentiveMin ?? cur.est_incentive_min,
    estIncentiveMax: req.body?.estIncentiveMax ?? cur.est_incentive_max,
    notes: req.body?.notes ?? cur.notes,
  })
  if (v.error) return res.status(400).json({ error: v.error })
  const r = await pool.query(
    `UPDATE incentive_plans SET name=$1, per_job_amount=$2, quality_bonus_amount=$3, quality_min_rating=$4,
       attendance_tiers=$5::jsonb, tier_min_rating=$6, peak_hour_amount=$7, referral_amount=$8, festival_amount=$9,
       est_incentive_min=$10, est_incentive_max=$11, notes=$12, active=$13 WHERE id=$14 RETURNING *`,
    [v.name, v.perJob, v.qualAmt, v.qualMin, JSON.stringify(v.tiers), v.tierMin, v.peak, v.referral, v.festival, v.estMin, v.estMax, v.notes,
      req.body?.active !== undefined ? !!req.body.active : cur.active, id])
  res.json({ ok: true, plan: incentiveDto(r.rows[0]) })
})

app.delete('/api/admin/incentive-plans/:id', adminAuth, requirePerm('incentive_plans.edit'), async (req, res) => {
  const id = Number(req.params.id)
  const n = (await pool.query('SELECT COUNT(*)::int n FROM workers WHERE incentive_plan_id=$1', [id])).rows[0].n
  if (n) return res.status(409).json({ error: `${n} worker(s) are on this plan — move them off it first, or retire it instead` })
  await pool.query('DELETE FROM incentive_plans WHERE id=$1', [id])
  res.json({ ok: true })
})

/* ---------- Payroll ----------
 * Builds a DRAFT for a month, which an admin reviews and approves. Only approval moves money.
 *
 * Statutory deductions use rates an admin enters in Settings — we apply their numbers rather than
 * invent tax law. TDS here is a FLAT configured percentage, NOT the progressive slab computation a
 * real payroll product does; the panel says so, because quietly calling a flat rate "as per slabs"
 * would be a lie with legal consequences.
 */
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** Days the worker was scheduled vs days they actually checked in, for that month. */
async function attendanceForMonth(w, month) {
  const days = w.profile?.availability?.availableDays || {}
  const worksDay = (jsDay) => days[DAY_KEYS[(jsDay + 6) % 7]] !== false // Sun=0 → index 6
  const [y, m] = month.split('-').map(Number)
  const total = new Date(y, m, 0).getDate()
  let scheduled = 0
  for (let d = 1; d <= total; d++) if (worksDay(new Date(y, m - 1, d).getDay())) scheduled++
  const present = (await pool.query(
    `SELECT COUNT(*)::int n FROM attendance WHERE worker_id=$1 AND check_in IS NOT NULL AND to_char(day,'YYYY-MM')=$2`,
    [w.id, month])).rows[0].n
  return { scheduled, present, pct: scheduled ? Math.round((present / scheduled) * 100) : 0 }
}

/**
 * Working (checked-in) days and Sundays worked in a month, for the attendance-tier bonus.
 * Absolute counts — a tier is "≥ N days", the Shakti model folded in from the old scheduler.
 */
async function workedDaysInMonth(workerId, month) {
  const days = (await pool.query(
    `SELECT COUNT(*)::int n FROM attendance WHERE worker_id=$1 AND check_in IS NOT NULL AND to_char(day,'YYYY-MM')=$2`,
    [workerId, month])).rows[0].n
  const sundays = (await pool.query(
    `SELECT COUNT(*)::int n FROM attendance WHERE worker_id=$1 AND check_in IS NOT NULL AND to_char(day,'YYYY-MM')=$2 AND EXTRACT(DOW FROM day)=0`,
    [workerId, month])).rows[0].n
  return { days, sundays }
}

/**
 * The highest attendance tier a worker reached this month, or null.
 * tiers are pre-sorted ascending by amount; a tier is reached when the worker has enough working
 * days AND enough Sundays AND their rating clears the gate.
 */
function reachedTier(tiers, minRating, worked, rating) {
  let best = null
  for (const t of tiers) {
    if (worked.days >= t.days && worked.sundays >= (t.sundays || 0) && rating >= minRating) best = t
  }
  return best
}

/** Jobs this worker actually completed in a month — used to gate the quality bonus on activity. */
async function completedJobsInMonth(workerId, month) {
  const bookings = await tryGet(BOOKING_URL, `/api/internal/bookings?worker_id=${workerId}&status=completed`, [])
  return (bookings || []).filter((b) => b.completed_at && String(b.completed_at).slice(0, 7) === month).length
}

/**
 * One worker's line for a month. Returns null only when there's nothing to pay.
 *
 * Two independent parts:
 *  - SALARY (basic + allowances) — only fixed/hybrid workers have one, and only once their salary
 *    has started (effective-from).
 *  - Monthly BONUSES (attendance, quality) — ANY worker on an incentive plan earns these, per-job
 *    included. That's the point: a per-job worker who shows up and keeps their rating high should
 *    get the bonus their plan promises, not miss it because they have no monthly salary.
 */
async function payrollLine(w, month, extraIncentives = []) {
  const { plan } = await resolveCommission(w)
  const isMonthly = plan && MONTHLY_TYPES.includes(plan.salary_type)

  // Salary — fixed/hybrid only. Someone whose salary starts after this month hasn't earned it;
  // back-dating a hire must not silently pay them for months they hadn't joined. Bonuses below are
  // still evaluated, because a worker can earn a bonus for a month their salary doesn't yet cover.
  let basic = 0, allowance = 0
  const salaryStarted = !(w.salary_effective_from && monthKey(new Date(w.salary_effective_from)) > month)
  if (isMonthly && salaryStarted) {
    const amt = salaryAmounts(w, plan)
    basic = amt.basic
    // The guaranteed monthly attendance allowance rides with the allowance line on the payslip.
    allowance = amt.allowance + amt.attendance
  }
  const incentives = []

  const inc = await incentivePlanFor(w)
  // Attendance tier bonus (Sitara/Shakti, folded in). The worker earns the single highest tier they
  // reach — tiers don't stack.
  const tiers = tierRows(inc)
  if (tiers.length > 0) {
    const worked = await workedDaysInMonth(w.id, month)
    const tier = reachedTier(tiers, inc.tier_min_rating ?? 4.5, worked, w.rating || 0)
    if (tier) incentives.push({ label: `${tier.label} Attendance Bonus (${worked.days} days)`, amount: tier.amount })
  }
  // Quality bonus: a high rating AND at least one job completed this month. The rating alone is a
  // lifetime figure, so without the activity gate a worker would collect it every month — even one
  // they never worked. Requiring a completed job ties it to the month being paid for.
  if (inc?.quality_bonus_amount > 0 && (w.rating || 0) >= inc.quality_min_rating) {
    const completed = await completedJobsInMonth(w.id, month)
    if (completed > 0) {
      incentives.push({ label: `Quality Bonus (${w.rating}★, ${completed} job${completed === 1 ? '' : 's'})`, amount: inc.quality_bonus_amount })
    }
  }

  // Engine rules (Compensation Rule Engine, monthly_close). Tagged with ruleId/versionId so the
  // approval step can write the engine ledger row; the payslip just shows label + amount.
  for (const ei of extraIncentives) incentives.push(ei)

  const gross = basic + allowance + incentives.reduce((n, i) => n + i.amount, 0)
  // Nothing to pay this month — no salary and no bonus earned. Keeps per-job workers who earned no
  // bonus out of the run entirely, rather than adding empty ₹0 lines.
  if (gross <= 0) return null

  // Rates come from Settings — the admin's numbers, applied to their own policy.
  const deductions = []
  const pct = async (key, dflt) => await getSettingInt(ADMIN_URL, key, dflt)
  if (w.pf_applicable) {
    const rate = await pct('pf_percent', 0)
    const ceiling = await pct('pf_wage_ceiling', 0)
    const base = ceiling > 0 ? Math.min(basic, ceiling) : basic
    if (rate > 0) deductions.push({ label: `PF (${rate}% of basic)`, amount: Math.round((base * rate) / 100) })
  }
  if (w.esi_applicable) {
    const rate = await pct('esi_percent', 0)
    const ceiling = await pct('esi_wage_ceiling', 0)
    // ESI applies only under the wage ceiling — above it nothing is deducted.
    if (rate > 0 && (ceiling === 0 || gross <= ceiling)) deductions.push({ label: `ESI (${rate}%)`, amount: Math.round((gross * rate) / 100) })
  }
  if (w.tds_applicable) {
    const rate = await pct('tds_percent', 0)
    if (rate > 0) deductions.push({ label: `TDS (${rate}% flat)`, amount: Math.round((gross * rate) / 100) })
  }
  const totalDeductions = deductions.reduce((n, d) => n + d.amount, 0)

  return {
    workerId: w.id, name: w.name,
    planName: plan?.name || '',
    salaryType: plan?.salary_type || 'per_job',
    // A bonus-only line has no salary — the payslip and credit label say "Bonuses", not "Salary".
    kind: basic > 0 ? 'salary' : 'bonus',
    basic, allowance, incentives, deductions,
    gross, totalDeductions, net: Math.max(0, gross - totalDeductions),
    // Flagged, not silently dropped: a rate switched on with no percentage set deducts nothing.
    note: [
      w.pf_applicable && !(await pct('pf_percent', 0)) && 'PF is marked applicable but no PF rate is set',
      w.esi_applicable && !(await pct('esi_percent', 0)) && 'ESI is marked applicable but no ESI rate is set',
      w.tds_applicable && !(await pct('tds_percent', 0)) && 'TDS is marked applicable but no TDS rate is set',
    ].filter(Boolean).join('; '),
  }
}

const runDto = (r, lines = []) => ({
  id: r.id, month: r.month, status: r.status,
  createdBy: r.created_by, approvedBy: r.approved_by, created: r.created, approvedAt: r.approved_at,
  lines,
  totals: {
    workers: lines.length,
    gross: lines.reduce((n, l) => n + l.gross, 0),
    deductions: lines.reduce((n, l) => n + l.totalDeductions, 0),
    net: lines.reduce((n, l) => n + l.net, 0),
  },
})

const lineDto = (l) => ({
  workerId: l.worker_id, name: l.name, basic: l.basic, allowance: l.allowance,
  incentives: l.incentives || [], deductions: l.deductions || [],
  gross: l.gross, totalDeductions: l.total_deductions, net: l.net, note: l.note || '',
})

/* ================= Compensation Rule Engine — evaluator =================
 * The whitelist. Only fields with a real data source, tagged with the triggers they're valid for.
 * A condition on a field not valid for the firing trigger fails safe (not eligible). No field here
 * is invented — there is no "weather" or "AI risk" until something actually produces it.
 */
const RULE_FIELDS = {
  // common — available at every trigger
  rating: { type: 'number', triggers: ['job_completed', 'monthly_close'], label: 'Worker rating' },
  worker_category: { type: 'enum', triggers: ['job_completed', 'monthly_close'], label: 'Worker category' },
  employment_type: { type: 'enum', triggers: ['job_completed', 'monthly_close'], label: 'Employment type' },
  zone: { type: 'number', triggers: ['job_completed', 'monthly_close'], label: "Worker's zone" },
  gender: { type: 'enum', triggers: ['job_completed', 'monthly_close'], label: 'Gender (worker-filled)' },
  experience_months: { type: 'number', triggers: ['job_completed', 'monthly_close'], label: 'Experience (months)' },
  // monthly context
  completed_jobs: { type: 'number', triggers: ['monthly_close'], label: 'Completed jobs (this month)' },
  working_days: { type: 'number', triggers: ['monthly_close'], label: 'Working days (this month)' },
  attendance_pct: { type: 'number', triggers: ['monthly_close'], label: 'Attendance % (this month)' },
  // per-job context
  service: { type: 'enum', triggers: ['job_completed'], label: 'Service (this job)' },
  job_total: { type: 'number', triggers: ['job_completed'], label: 'Job value ₹ (this job)' },
  job_zone: { type: 'number', triggers: ['job_completed'], label: 'Job zone (this job)' },
  weekday: { type: 'enum', triggers: ['job_completed'], label: 'Day of week (this job)' },
  hour: { type: 'number', triggers: ['job_completed'], label: 'Hour 0–23, IST (this job)' },
}
const RULE_TRIGGERS = ['job_completed', 'monthly_close']
const SCOPE_TYPES = ['company', 'city', 'zone', 'service', 'worker_category', 'employment_type', 'specific_workers']
const CALC_TYPES = ['fixed', 'per_job', 'slab', 'percentage']
// Stacking: how a rule combines with others that match the same worker/event. Only rules sharing a
// non-empty stack_group compete; the group collapses per the strictest mode any member declares.
const STACK_MODES = ['allow', 'highest_wins', 'lowest_wins', 'exclusive']

const RULE_OPS = {
  gte: (a, b) => Number(a) >= Number(b),
  lte: (a, b) => Number(a) <= Number(b),
  gt: (a, b) => Number(a) > Number(b),
  lt: (a, b) => Number(a) < Number(b),
  eq: (a, b) => String(a) === String(b),
  neq: (a, b) => String(a) !== String(b),
  in: (a, b) => (Array.isArray(b) ? b : String(b).split(',')).map((x) => String(x).trim()).includes(String(a)),
  between: (a, b) => { const [lo, hi] = Array.isArray(b) ? b : String(b).split(','); return Number(a) >= Number(lo) && Number(a) <= Number(hi) },
}

const monthsBetween = (a, b) => Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()))

/** All field values for one worker at one trigger — the evaluation context. */
async function ruleContext(w, trigger, booking, month) {
  const person = w.profile?.personal || {}
  const ctx = {
    rating: Number(w.rating || 0),
    worker_category: w.worker_category || '',
    employment_type: w.employment_type || '',
    zone: w.zone_id ?? '',
    gender: person.gender || '',
    experience_months: w.joining_date ? monthsBetween(new Date(w.joining_date), new Date()) : 0,
  }
  if (trigger === 'monthly_close') {
    ctx.completed_jobs = await completedJobsInMonth(w.id, month)
    ctx.working_days = (await workedDaysInMonth(w.id, month)).days
    ctx.attendance_pct = (await attendanceForMonth(w, month)).pct
  }
  if (trigger === 'job_completed' && booking) {
    ctx.service = (Array.isArray(booking.items) && booking.items[0]?.name) || booking.type || ''
    ctx.job_total = Number(booking.total || 0)
    ctx.job_zone = booking.zone_id ?? ''
    // IST wall-clock, so "weekend" and "4–8 PM" mean the Indian calendar day/hour, not UTC.
    const ist = new Date((booking.completed_at ? new Date(booking.completed_at) : new Date()).getTime() + 5.5 * 3600 * 1000)
    ctx.weekday = DAY_KEYS[(ist.getUTCDay() + 6) % 7]
    ctx.hour = ist.getUTCHours()
  }
  return ctx
}

/** Does this worker/job fall inside the rule's scope? */
function matchesScope(v, w, booking) {
  const vals = (Array.isArray(v.scope_values) ? v.scope_values : []).map(String)
  switch (v.scope_type) {
    case 'company': return true
    case 'city': return vals.includes(String(w.city || ''))
    case 'zone': return vals.includes(String(booking ? (booking.zone_id ?? '') : (w.zone_id ?? '')))
    case 'worker_category': return vals.includes(String(w.worker_category || ''))
    case 'employment_type': return vals.includes(String(w.employment_type || ''))
    case 'service':
      return booking
        ? vals.includes(String((booking.items && booking.items[0]?.name) || ''))
        : (w.services || []).some((s) => vals.includes(String(s)))
    case 'specific_workers': return vals.includes(String(w.id))
    default: return false
  }
}

/** All (or any) of the [field, op, value] conditions hold. Unknown field or op → not eligible. */
function evalConditions(conditions, mode, ctx) {
  const conds = Array.isArray(conditions) ? conditions : []
  if (!conds.length) return true
  const results = conds.map((c) => {
    const fn = RULE_OPS[c.op]
    if (!fn || !(c.field in ctx)) return false
    return !!fn(ctx[c.field], c.value)
  })
  return mode === 'any' ? results.some(Boolean) : results.every(Boolean)
}

/** The payout amount for one eligible rule. Always whole rupees, never negative. */
function computeCalc(v, ctx) {
  const c = v.calc || {}
  const round = (n) => Math.max(0, Math.round(Number(n) || 0))
  switch (v.calc_type) {
    case 'fixed':
      return round(c.amount)
    case 'percentage': {
      const base = c.base === 'job_total' ? (ctx.job_total || 0) : 0
      return round((base * (Number(c.percent) || 0)) / 100)
    }
    case 'per_job': {
      const cap = Number(c.maxUnits) > 0 ? Number(c.maxUnits) : Infinity
      const units = Math.min(ctx.completed_jobs || 0, cap)
      return round(units * (Number(c.perUnit) || 0))
    }
    case 'slab': {
      const val = Number(ctx[c.slabMetric || 'completed_jobs'] || 0)
      // The single bracket the value lands in pays its amount — not cumulative.
      const slab = (c.slabs || []).find((s) => val >= Number(s.from) && val <= Number(s.to))
      return slab ? round(slab.amount) : 0
    }
    default:
      return 0
  }
}

/** ₹ already paid by this rule in a calendar month — the budget ledger. */
async function ruleSpent(ruleId, month) {
  return (await pool.query('SELECT COALESCE(SUM(amount),0)::int n FROM incentive_payouts WHERE rule_id=$1 AND month=$2', [ruleId, month])).rows[0].n
}

/** Active current versions for a trigger whose effective window covers `on`. */
async function activeRuleVersions(trigger, on = new Date()) {
  const day = on.toISOString().slice(0, 10)
  const { rows } = await pool.query(
    `SELECT v.*, r.name AS rule_name, r.priority AS rule_priority FROM incentive_rule_versions v JOIN incentive_rules r ON r.id = v.rule_id
     WHERE v.is_current = true AND r.active = true AND v.trigger = $1
       AND (v.effective_from IS NULL OR v.effective_from <= $2)
       AND (v.effective_to IS NULL OR v.effective_to >= $2)
     ORDER BY r.priority ASC, r.id ASC`, [trigger, day])
  return rows
}

/**
 * Stacking resolution. Rules with no stack group always pay (independent). Rules sharing a non-empty
 * group compete: the group's effective policy is the strictest mode any member declares
 * (exclusive > highest_wins/lowest_wins > allow), and collapses the group to a single winner —
 *   • highest_wins — the largest computed amount (priority breaks ties)
 *   • lowest_wins  — the smallest computed amount
 *   • exclusive    — the highest-priority rule (lowest priority number), amount as a tiebreak
 * `matches` is [{ v, amount, priority }]; returns the survivors in the original order.
 */
function resolveStacking(matches) {
  const groups = new Map()
  const survivors = []
  for (const m of matches) {
    const g = (m.v.stack_group || '').trim()
    if (!g) { survivors.push(m); continue }
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g).push(m)
  }
  for (const ms of groups.values()) {
    if (ms.length === 1) { survivors.push(ms[0]); continue }
    const modes = ms.map((m) => m.v.stack)
    let policy = 'allow'
    if (modes.includes('exclusive')) policy = 'exclusive'
    else if (modes.includes('highest_wins')) policy = 'highest_wins'
    else if (modes.includes('lowest_wins')) policy = 'lowest_wins'
    if (policy === 'allow') { survivors.push(...ms); continue }
    let winner
    if (policy === 'exclusive') winner = ms.slice().sort((a, b) => a.priority - b.priority || b.amount - a.amount)[0]
    else if (policy === 'highest_wins') winner = ms.slice().sort((a, b) => b.amount - a.amount || a.priority - b.priority)[0]
    else winner = ms.slice().sort((a, b) => a.amount - b.amount || a.priority - b.priority)[0]
    survivors.push(winner)
  }
  const order = new Map(matches.map((m, i) => [m, i]))
  return survivors.sort((a, b) => order.get(a) - order.get(b))
}

/**
 * job_completed trigger. Evaluated per completed booking; each eligible rule credits the wallet
 * immediately via an incentive.credit event. Idempotent per (version, worker, booking) in the
 * engine ledger AND per ref in the wallet, so a redelivered event pays nothing twice.
 */
async function evaluateJobRules(booking) {
  if (!booking?.worker_id) return
  const w = await getWorker(booking.worker_id)
  if (!w || w.status !== 'active') return
  const at = booking.completed_at ? new Date(booking.completed_at) : new Date()
  const month = monthKey(at)
  const ref = String(booking.id)
  // Fields are all derived from this worker + this booking, so the context is the same for every
  // rule — compute it once.
  const ctx = await ruleContext(w, 'job_completed', booking, month)
  // Pass 1 — collect every eligible rule and what it would pay.
  const matches = []
  for (const v of await activeRuleVersions('job_completed', at)) {
    if (!matchesScope(v, w, booking)) continue
    if (!evalConditions(v.conditions, v.match_mode, ctx)) continue
    const amount = computeCalc(v, ctx)
    if (amount <= 0) continue
    matches.push({ v, amount, priority: v.rule_priority })
  }
  // Pass 2 — stacking collapses same-group rules to a winner; then budget + pay the survivors.
  for (const { v, amount } of resolveStacking(matches)) {
    // Hard budget: once a rule's monthly ceiling is reached it stops paying, rather than overshoot.
    if (v.budget_month > 0 && (await ruleSpent(v.rule_id, month)) + amount > v.budget_month) {
      publishEvent(REDIS_URL, 'activity', { actorType: 'system', actorName: 'Incentive Engine', action: 'incentive.budget', entityType: 'incentive', entityId: v.rule_id, detail: `${v.rule_name}: monthly budget ₹${v.budget_month} reached for ${month} — paused` })
      continue
    }
    const label = `${v.rule_name} · ${booking.ref || '#' + booking.id}`
    const ins = await pool.query(
      `INSERT INTO incentive_payouts (rule_id, version_id, worker_id, trigger, month, ref, amount, detail)
       VALUES ($1,$2,$3,'job_completed',$4,$5,$6,$7) ON CONFLICT (version_id, worker_id, ref) DO NOTHING RETURNING id`,
      [v.rule_id, v.id, w.id, month, ref, amount, label])
    if (!ins.rowCount) continue // this version already paid this worker for this booking
    // The money: wallet credit, idempotent on its own ref.
    publishEvent(REDIS_URL, 'incentive.credit', { workerId: w.id, amount, ref: `rule-${v.id}-${ref}`, label })
  }
}

/**
 * monthly_close trigger. Evaluated in the payroll build for one worker; returns the eligible
 * payouts (tagged with the rule + version) to fold into their payroll line. `tally` carries the
 * running spend per rule ACROSS the run so a monthly budget is honoured over all workers, not
 * per worker. The engine ledger row is written at APPROVAL (when the money actually moves).
 */
async function evaluateMonthlyRules(w, month, tally) {
  const ctx = await ruleContext(w, 'monthly_close', null, month)
  // Pass 1 — collect eligible rules for this worker.
  const matches = []
  for (const v of await activeRuleVersions('monthly_close', new Date(`${month}-01T00:00:00`))) {
    if (!matchesScope(v, w, null)) continue
    if (!evalConditions(v.conditions, v.match_mode, ctx)) continue
    const amount = computeCalc(v, ctx)
    if (amount <= 0) continue
    matches.push({ v, amount, priority: v.rule_priority })
  }
  // Pass 2 — stacking, then budget the survivors.
  const out = []
  for (const { v, amount } of resolveStacking(matches)) {
    if (v.budget_month > 0) {
      const projected = (await ruleSpent(v.rule_id, month)) + (tally.get(v.rule_id) || 0) + amount
      if (projected > v.budget_month) continue // over the cap — skip this worker for this rule
      tally.set(v.rule_id, (tally.get(v.rule_id) || 0) + amount)
    }
    out.push({ ruleId: v.rule_id, versionId: v.id, label: v.rule_name, amount })
  }
  return out
}

app.get('/api/admin/payroll', adminAuth, async (_q, res) => {
  const { rows } = await pool.query(
    `SELECT r.*, (SELECT COUNT(*)::int FROM payroll_lines l WHERE l.run_id=r.id) workers,
            (SELECT COALESCE(SUM(l.net),0)::int FROM payroll_lines l WHERE l.run_id=r.id) net
     FROM payroll_runs r ORDER BY r.month DESC LIMIT 24`)
  // Everyone this month's run would pay: a monthly salary, OR an incentive plan carrying a monthly
  // bonus (attendance/quality) — which now includes per-job workers.
  const onMonthly = (await pool.query(
    `SELECT COUNT(*)::int n FROM workers w WHERE w.status='active' AND (
       EXISTS (SELECT 1 FROM salary_plans p WHERE p.id=w.salary_plan_id AND p.salary_type = ANY($1))
       OR EXISTS (SELECT 1 FROM incentive_plans i WHERE i.id=w.incentive_plan_id AND (jsonb_array_length(i.attendance_tiers) > 0 OR i.quality_bonus_amount > 0))
     )`, [MONTHLY_TYPES])).rows[0].n
  res.json({
    ok: true, workersOnMonthlySalary: onMonthly,
    runs: rows.map((r) => ({ id: r.id, month: r.month, status: r.status, workers: r.workers, net: r.net, createdBy: r.created_by, approvedBy: r.approved_by, created: r.created, approvedAt: r.approved_at })),
  })
})

app.get('/api/admin/payroll/:id', adminAuth, async (req, res) => {
  const r = (await pool.query('SELECT * FROM payroll_runs WHERE id=$1', [Number(req.params.id)])).rows[0]
  if (!r) return res.status(404).json({ error: 'Run not found' })
  const lines = (await pool.query(
    `SELECT l.*, w.name FROM payroll_lines l JOIN workers w ON w.id=l.worker_id WHERE l.run_id=$1 ORDER BY w.name`,
    [r.id])).rows
  res.json({ ok: true, run: runDto(r, lines.map(lineDto)) })
})

/** Build (or rebuild) a month's draft. Rebuilding an APPROVED run is refused — it's already paid. */
app.post('/api/admin/payroll', adminAuth, requirePerm('payroll.run'), async (req, res) => {
  const month = String(req.body?.month || '').trim()
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: 'Month must be YYYY-MM' })
  if (month > monthKey(new Date())) return res.status(400).json({ error: "That month hasn't happened yet" })

  const existing = (await pool.query('SELECT * FROM payroll_runs WHERE month=$1', [month])).rows[0]
  if (existing?.status === 'approved') return res.status(409).json({ error: `${month} has already been approved and paid` })

  const who = req.admin?.name || req.admin?.email || 'Admin'
  const run = existing
    ? existing
    : (await pool.query('INSERT INTO payroll_runs (month, created_by) VALUES ($1,$2) RETURNING *', [month, who])).rows[0]
  await pool.query('DELETE FROM payroll_lines WHERE run_id=$1', [run.id]) // a rebuild reflects today's plans

  // Every active worker is eligible: a plan (salary/incentive) OR an engine monthly_close rule can
  // pay them. payrollLine returns null for anyone who earned nothing.
  const workers = (await pool.query("SELECT * FROM workers WHERE status='active'")).rows
  const budgetTally = new Map() // rule_id -> ₹ committed this run, so a monthly budget holds across all workers
  let n = 0
  for (const w of workers) {
    const engineInc = await evaluateMonthlyRules(w, month, budgetTally)
    const line = await payrollLine(w, month, engineInc)
    if (!line) continue
    await pool.query(
      `INSERT INTO payroll_lines (run_id, worker_id, basic, allowance, incentives, deductions, gross, total_deductions, net, note)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10)`,
      [run.id, w.id, line.basic, line.allowance, JSON.stringify(line.incentives), JSON.stringify(line.deductions),
        line.gross, line.totalDeductions, line.net, line.note])
    n++
  }
  publishEvent(REDIS_URL, 'activity', { actorType: 'admin', actorName: who, action: 'payroll.draft', entityType: 'payroll', entityId: run.id, detail: `Built the ${month} payroll draft — ${n} worker(s)` })
  const lines = (await pool.query(`SELECT l.*, w.name FROM payroll_lines l JOIN workers w ON w.id=l.worker_id WHERE l.run_id=$1 ORDER BY w.name`, [run.id])).rows
  res.json({ ok: true, run: runDto((await pool.query('SELECT * FROM payroll_runs WHERE id=$1', [run.id])).rows[0], lines.map(lineDto)) })
})

/**
 * Approve — the only thing here that moves money.
 * Each line credits once, keyed on payroll-<runId>-<workerId>, so a double-approve or a retry
 * cannot pay anyone twice.
 */
app.post('/api/admin/payroll/:id/approve', adminAuth, requirePerm('payroll.approve'), async (req, res) => {
  const id = Number(req.params.id)
  const run = (await pool.query('SELECT * FROM payroll_runs WHERE id=$1', [id])).rows[0]
  if (!run) return res.status(404).json({ error: 'Run not found' })
  if (run.status === 'approved') return res.status(409).json({ error: 'This run has already been approved' })
  const lines = (await pool.query('SELECT * FROM payroll_lines WHERE run_id=$1', [id])).rows
  if (!lines.length) return res.status(400).json({ error: 'Nothing to approve — this run has no lines' })

  const who = req.admin?.name || req.admin?.email || 'Admin'
  await pool.query("UPDATE payroll_runs SET status='approved', approved_by=$1, approved_at=now() WHERE id=$2", [who, id])
  for (const l of lines) {
    // Engine payouts on this line reach the ledger now, when the money actually moves — keyed on
    // (version, worker, month) so re-approval or a redelivery records nothing twice.
    for (const inc of (l.incentives || [])) {
      if (!inc.ruleId || !inc.versionId) continue
      await pool.query(
        `INSERT INTO incentive_payouts (rule_id, version_id, worker_id, trigger, month, ref, amount, detail)
         VALUES ($1,$2,$3,'monthly_close',$4,$4,$5,$6) ON CONFLICT (version_id, worker_id, ref) DO NOTHING`,
        [inc.ruleId, inc.versionId, l.worker_id, run.month, inc.amount, inc.label || 'Incentive'])
    }
    // A line with no basic salary is bonuses only (a per-job worker's attendance/quality bonus) —
    // label and categorise it as such so their wallet doesn't show a "Salary" they don't have.
    const bonusOnly = !l.basic
    publishEvent(REDIS_URL, 'payroll.credit', {
      runId: id, month: run.month, workerId: l.worker_id,
      net: l.net, gross: l.gross,
      deductions: l.deductions || [],
      kind: bonusOnly ? 'bonus' : 'salary',
      label: bonusOnly ? `Bonuses ${run.month}` : `Salary ${run.month}`,
    })
  }
  publishEvent(REDIS_URL, 'activity', {
    actorType: 'admin', actorName: who, action: 'payroll.approve', entityType: 'payroll', entityId: id,
    detail: `Approved the ${run.month} payroll — ₹${lines.reduce((n, l) => n + l.net, 0)} to ${lines.length} worker(s)`,
    meta: { amount: lines.reduce((n, l) => n + l.net, 0) },
  })
  const fresh = (await pool.query('SELECT * FROM payroll_runs WHERE id=$1', [id])).rows[0]
  const full = (await pool.query(`SELECT l.*, w.name FROM payroll_lines l JOIN workers w ON w.id=l.worker_id WHERE l.run_id=$1 ORDER BY w.name`, [id])).rows
  res.json({ ok: true, run: runDto(fresh, full.map(lineDto)) })
})

/* ================= Compensation Rule Engine — admin API =================
 * Author, version, activate and retire compensation rules. Editing NEVER mutates a live version:
 * every save creates a new version and flips is_current, so past payouts keep the version that
 * paid them.
 */
const versionDto = (v) => v && ({
  id: v.id, ruleId: v.rule_id, version: v.version, isCurrent: v.is_current, trigger: v.trigger,
  effectiveFrom: v.effective_from, effectiveTo: v.effective_to,
  scopeType: v.scope_type, scopeValues: v.scope_values || [],
  matchMode: v.match_mode, conditions: v.conditions || [], calcType: v.calc_type, calc: v.calc || {},
  stack: v.stack, stackGroup: v.stack_group || '', budgetMonth: v.budget_month, notes: v.notes || '',
  createdBy: v.created_by, created: v.created,
})
const ruleDto = (r, v, extra = {}) => ({
  id: r.id, code: r.code, name: r.name, description: r.description || '', category: r.category,
  priority: r.priority, active: r.active, created: r.created,
  current: versionDto(v), ...extra,
})

function readRuleVersion(b) {
  const trigger = String(b?.trigger || '')
  if (!RULE_TRIGGERS.includes(trigger)) return { error: `Trigger must be one of: ${RULE_TRIGGERS.join(', ')}` }
  const scopeType = String(b?.scopeType || 'company')
  if (!SCOPE_TYPES.includes(scopeType)) return { error: `Scope must be one of: ${SCOPE_TYPES.join(', ')}` }
  const scopeValues = Array.isArray(b?.scopeValues) ? b.scopeValues.map((x) => String(x)) : []
  if (scopeType !== 'company' && scopeValues.length === 0) return { error: `Pick at least one ${scopeType.replace('_', ' ')} for the scope` }
  const matchMode = b?.matchMode === 'any' ? 'any' : 'all'

  const conditions = []
  for (const c of (Array.isArray(b?.conditions) ? b.conditions : [])) {
    const field = String(c?.field || '')
    const op = String(c?.op || '')
    if (!RULE_FIELDS[field]) return { error: `Unknown condition field: ${field || '(blank)'}` }
    if (!RULE_FIELDS[field].triggers.includes(trigger)) return { error: `"${RULE_FIELDS[field].label}" isn't available on the ${trigger.replace('_', ' ')} trigger` }
    if (!RULE_OPS[op]) return { error: `Unknown operator: ${op || '(blank)'}` }
    if (c.value === undefined || c.value === null || c.value === '') return { error: `Give a value for ${RULE_FIELDS[field].label}` }
    conditions.push({ field, op, value: c.value })
  }

  const calcType = String(b?.calcType || 'fixed')
  if (!CALC_TYPES.includes(calcType)) return { error: `Calculation must be one of: ${CALC_TYPES.join(', ')}` }
  const rawCalc = b?.calc || {}
  const int = (v) => Math.round(Number(v) || 0)
  let calc = {}
  if (calcType === 'fixed') {
    calc = { amount: int(rawCalc.amount) }
    if (calc.amount < 1) return { error: 'Fixed amount must be at least ₹1' }
  } else if (calcType === 'percentage') {
    calc = { percent: Number(rawCalc.percent) || 0, base: 'job_total' }
    if (!(calc.percent > 0 && calc.percent <= 100)) return { error: 'Percentage must be between 1 and 100' }
    if (trigger !== 'job_completed') return { error: 'Percentage of job value only applies to the job-completed trigger' }
  } else if (calcType === 'per_job') {
    calc = { perUnit: int(rawCalc.perUnit), maxUnits: int(rawCalc.maxUnits) }
    if (calc.perUnit < 1) return { error: 'Per-job amount must be at least ₹1' }
    if (trigger !== 'monthly_close') return { error: 'Per-job (× completed jobs) only applies to the monthly-close trigger' }
  } else if (calcType === 'slab') {
    const metric = String(rawCalc.slabMetric || 'completed_jobs')
    if (!RULE_FIELDS[metric] || RULE_FIELDS[metric].type !== 'number') return { error: 'Slab metric must be a numeric field' }
    if (!RULE_FIELDS[metric].triggers.includes(trigger)) return { error: `Slab metric "${RULE_FIELDS[metric].label}" isn't available on this trigger` }
    const slabs = (Array.isArray(rawCalc.slabs) ? rawCalc.slabs : []).map((s) => ({ from: int(s.from), to: int(s.to), amount: int(s.amount) }))
    if (!slabs.length) return { error: 'Add at least one slab' }
    for (const s of slabs) {
      if (s.from < 0 || s.to < s.from) return { error: 'Each slab needs a valid From ≤ To' }
      if (s.amount < 1) return { error: 'Each slab amount must be at least ₹1' }
    }
    calc = { slabMetric: metric, slabs }
  }

  const budgetMonth = int(b?.budgetMonth)
  if (budgetMonth < 0) return { error: 'Budget cannot be negative (0 = no cap)' }
  const dateOk = (x) => !x || !Number.isNaN(new Date(x).getTime())
  if (!dateOk(b?.effectiveFrom) || !dateOk(b?.effectiveTo)) return { error: 'Effective dates must be valid' }

  const stack = String(b?.stack || 'allow')
  if (!STACK_MODES.includes(stack)) return { error: `Stacking must be one of: ${STACK_MODES.join(', ')}` }
  const stackGroup = String(b?.stackGroup || '').trim().slice(0, 60)
  // A stacking policy only bites when the rule shares a group with another; without a group it does
  // nothing, so guard against the silent-no-op of picking "highest wins" but leaving group blank.
  if (stack !== 'allow' && !stackGroup) return { error: 'A stacking policy needs a stack group — rules in the same group compete' }

  return {
    trigger, scopeType, scopeValues, matchMode, conditions, calcType, calc,
    budgetMonth, stack, stackGroup,
    effectiveFrom: b?.effectiveFrom || null, effectiveTo: b?.effectiveTo || null,
    notes: String(b?.notes || '').slice(0, 500),
  }
}

const auditRule = (ruleId, action, detail, who) =>
  pool.query('INSERT INTO incentive_rule_audit (rule_id, action, detail, changed_by) VALUES ($1,$2,$3,$4)', [ruleId, action, detail, who])

/** Field / operator / scope / calc vocabulary — drives the visual builder in the panel. */
app.get('/api/admin/incentive-rules/meta', adminAuth, async (_q, res) => {
  res.json({
    ok: true,
    triggers: RULE_TRIGGERS,
    scopeTypes: SCOPE_TYPES,
    calcTypes: CALC_TYPES,
    stackModes: STACK_MODES,
    operators: Object.keys(RULE_OPS),
    fields: Object.entries(RULE_FIELDS).map(([key, f]) => ({ key, label: f.label, type: f.type, triggers: f.triggers })),
    categories: ['Attendance', 'Peak Hour', 'Referral', 'Festival', 'Target', 'Quality', 'Zone', 'Weekend', 'Night Shift', 'Retention', 'Joining Bonus', 'Campaign', 'Manual', 'Other'],
  })
})

app.get('/api/admin/incentive-rules', adminAuth, async (_q, res) => {
  // Two-step, not a wide join: `SELECT r.*, v.*` collides on `id` (rule vs version) and the version
  // clobbers the rule id, so the list would hand back version ids as rule ids.
  const rules = (await pool.query('SELECT * FROM incentive_rules ORDER BY priority ASC, id ASC')).rows
  const out = []
  for (const r of rules) {
    const v = (await pool.query('SELECT * FROM incentive_rule_versions WHERE rule_id=$1 AND is_current=true', [r.id])).rows[0]
    const spent = (await pool.query("SELECT COALESCE(SUM(amount),0)::int n FROM incentive_payouts WHERE rule_id=$1 AND month=to_char(now(),'YYYY-MM')", [r.id])).rows[0].n
    out.push(ruleDto(r, v, { spentThisMonth: spent }))
  }
  res.json({ ok: true, rules: out })
})

app.get('/api/admin/incentive-rules/:id', adminAuth, async (req, res) => {
  const id = Number(req.params.id)
  const r = (await pool.query('SELECT * FROM incentive_rules WHERE id=$1', [id])).rows[0]
  if (!r) return res.status(404).json({ error: 'Rule not found' })
  const versions = (await pool.query('SELECT * FROM incentive_rule_versions WHERE rule_id=$1 ORDER BY version DESC', [id])).rows
  const current = versions.find((v) => v.is_current)
  const payouts = (await pool.query('SELECT * FROM incentive_payouts WHERE rule_id=$1 ORDER BY created DESC LIMIT 20', [id])).rows
  const audit = (await pool.query('SELECT * FROM incentive_rule_audit WHERE rule_id=$1 ORDER BY created DESC LIMIT 20', [id])).rows
  res.json({
    ok: true,
    rule: ruleDto(r, current, {
      versions: versions.map(versionDto),
      payouts: payouts.map((p) => ({ id: p.id, workerId: p.worker_id, amount: p.amount, month: p.month, ref: p.ref, detail: p.detail, versionId: p.version_id, created: p.created })),
      audit: audit.map((a) => ({ action: a.action, detail: a.detail, by: a.changed_by, created: a.created })),
    }),
  })
})

app.post('/api/admin/incentive-rules', adminAuth, requirePerm('comp_rules.edit'), async (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Name required' })
  const v = readRuleVersion(req.body)
  if (v.error) return res.status(400).json({ error: v.error })
  const who = req.admin?.name || req.admin?.email || 'Admin'
  const code = (req.body?.code ? String(req.body.code) : name).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 40)
  try {
    const r = (await pool.query(
      'INSERT INTO incentive_rules (code, name, description, category, priority, active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [code, name, String(req.body?.description || ''), String(req.body?.category || 'Other'), Number(req.body?.priority) || 100, req.body?.active !== false])).rows[0]
    const ver = (await pool.query(
      `INSERT INTO incentive_rule_versions (rule_id, version, is_current, trigger, effective_from, effective_to, scope_type, scope_values, match_mode, conditions, calc_type, calc, stack, stack_group, budget_month, notes, created_by)
       VALUES ($1,1,true,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9,$10::jsonb,$11,$12,$13,$14,$15) RETURNING *`,
      [r.id, v.trigger, v.effectiveFrom, v.effectiveTo, v.scopeType, JSON.stringify(v.scopeValues), v.matchMode, JSON.stringify(v.conditions), v.calcType, JSON.stringify(v.calc), v.stack, v.stackGroup, v.budgetMonth, v.notes, who])).rows[0]
    await auditRule(r.id, 'created', `${name} (v1)`, who)
    res.status(201).json({ ok: true, rule: ruleDto(r, ver) })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'A rule with that code already exists' })
    throw e
  }
})

/** Save a new version. The old one is retained; this becomes current. */
app.post('/api/admin/incentive-rules/:id/version', adminAuth, requirePerm('comp_rules.edit'), async (req, res) => {
  const id = Number(req.params.id)
  const r = (await pool.query('SELECT * FROM incentive_rules WHERE id=$1', [id])).rows[0]
  if (!r) return res.status(404).json({ error: 'Rule not found' })
  const v = readRuleVersion(req.body)
  if (v.error) return res.status(400).json({ error: v.error })
  const who = req.admin?.name || req.admin?.email || 'Admin'
  const nextVer = (await pool.query('SELECT COALESCE(MAX(version),0)+1 n FROM incentive_rule_versions WHERE rule_id=$1', [id])).rows[0].n
  await pool.query('UPDATE incentive_rule_versions SET is_current=false WHERE rule_id=$1', [id])
  const ver = (await pool.query(
    `INSERT INTO incentive_rule_versions (rule_id, version, is_current, trigger, effective_from, effective_to, scope_type, scope_values, match_mode, conditions, calc_type, calc, stack, stack_group, budget_month, notes, created_by)
     VALUES ($1,$2,true,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10,$11::jsonb,$12,$13,$14,$15,$16) RETURNING *`,
    [id, nextVer, v.trigger, v.effectiveFrom, v.effectiveTo, v.scopeType, JSON.stringify(v.scopeValues), v.matchMode, JSON.stringify(v.conditions), v.calcType, JSON.stringify(v.calc), v.stack, v.stackGroup, v.budgetMonth, v.notes, who])).rows[0]
  // Name / description / category / priority live on the rule, not the version.
  if (req.body?.name || req.body?.description !== undefined || req.body?.category || req.body?.priority !== undefined) {
    await pool.query('UPDATE incentive_rules SET name=$1, description=$2, category=$3, priority=$4 WHERE id=$5',
      [String(req.body?.name || r.name).trim(), String(req.body?.description ?? r.description), String(req.body?.category || r.category), Number(req.body?.priority) || r.priority, id])
  }
  await auditRule(id, 'versioned', `New version v${nextVer}`, who)
  const fresh = (await pool.query('SELECT * FROM incentive_rules WHERE id=$1', [id])).rows[0]
  res.json({ ok: true, rule: ruleDto(fresh, ver) })
})

app.patch('/api/admin/incentive-rules/:id', adminAuth, requirePerm('comp_rules.edit'), async (req, res) => {
  const id = Number(req.params.id)
  const r = (await pool.query('SELECT * FROM incentive_rules WHERE id=$1', [id])).rows[0]
  if (!r) return res.status(404).json({ error: 'Rule not found' })
  const who = req.admin?.name || req.admin?.email || 'Admin'
  const active = req.body?.active !== undefined ? !!req.body.active : r.active
  const priority = req.body?.priority !== undefined ? Number(req.body.priority) : r.priority
  await pool.query('UPDATE incentive_rules SET active=$1, priority=$2 WHERE id=$3', [active, priority, id])
  if (req.body?.active !== undefined && active !== r.active) await auditRule(id, active ? 'activated' : 'paused', r.name, who)
  const cur = (await pool.query('SELECT * FROM incentive_rule_versions WHERE rule_id=$1 AND is_current=true', [id])).rows[0]
  res.json({ ok: true, rule: ruleDto((await pool.query('SELECT * FROM incentive_rules WHERE id=$1', [id])).rows[0], cur) })
})

app.get('/api/admin/workers/:id/pay', adminAuth, scopeWorker, async (req, res) => {
  const w = await getWorker(Number(req.params.id))
  if (!w) return res.status(404).json({ error: 'Worker not found' })
  const { pct, source, plan, platform } = await resolveCommission(w)
  const plans = (await pool.query('SELECT * FROM salary_plans WHERE active=true ORDER BY sort, id')).rows
  const incPlans = (await pool.query('SELECT * FROM incentive_plans WHERE active=true ORDER BY sort, id')).rows
  const inc = await incentivePlanFor(w)
  const amt = salaryAmounts(w, plan)
  res.json({
    ok: true,
    commissionPercent: w.commission_percent, // null unless a manual rate was set
    salaryPlanId: w.salary_plan_id ?? null,
    salaryPlan: planDto(plan),
    // Effective monthly amounts: per-worker override if set, else the plan's. `salaryOverridden`
    // flags a hand-edited worker so the panel doesn't imply they're simply on the template.
    salaryBasic: amt.basic, salaryAttendance: amt.attendance, salaryAllowance: amt.allowance,
    salaryTotalFixed: amt.total, salaryOverridden: amt.overridden,
    platformCommissionPercent: platform,
    effectiveCommissionPercent: pct,
    /** 'plan' | 'manual' | 'platform' — where the effective rate came from. */
    commissionSource: source,
    walletEnabled: w.wallet_enabled !== false,
    plans: plans.map(planDto),
    incentivePlanId: w.incentive_plan_id ?? null,
    incentivePlan: incentiveDto(inc),
    incentivePlans: incPlans.map(incentiveDto),
    salaryEffectiveFrom: w.salary_effective_from || null,
    pfApplicable: !!w.pf_applicable,
    esiApplicable: !!w.esi_applicable,
    tdsApplicable: !!w.tds_applicable,
    salaryPaymentMode: w.salary_payment_mode || 'bank',
    // The configured statutory rates, so the panel can warn when one is switched on with no rate.
    statutory: {
      pfPercent: await getSettingInt(ADMIN_URL, 'pf_percent', 0),
      pfWageCeiling: await getSettingInt(ADMIN_URL, 'pf_wage_ceiling', 0),
      esiPercent: await getSettingInt(ADMIN_URL, 'esi_percent', 0),
      esiWageCeiling: await getSettingInt(ADMIN_URL, 'esi_wage_ceiling', 0),
      tdsPercent: await getSettingInt(ADMIN_URL, 'tds_percent', 0),
    },
  })
})

app.patch('/api/admin/workers/:id/pay', adminAuth, requirePerm('workers.pay_edit'), scopeWorker, async (req, res) => {
  const id = Number(req.params.id)
  const w = await getWorker(id)
  if (!w) return res.status(404).json({ error: 'Worker not found' })
  const b = req.body || {}
  const before = (await resolveCommission(w)).pct
  let pct = w.commission_percent
  let planId = w.salary_plan_id ?? null

  // A plan and a manual rate are mutually exclusive: setting either clears the other, so there is
  // never a worker carrying two different answers to "what is your commission?".
  if (b.salaryPlanId !== undefined) {
    planId = b.salaryPlanId === null || b.salaryPlanId === '' ? null : Number(b.salaryPlanId)
    if (planId !== null) {
      const plan = (await pool.query('SELECT * FROM salary_plans WHERE id=$1', [planId])).rows[0]
      if (!plan) return res.status(400).json({ error: 'Unknown salary plan' })
      if (!plan.active) return res.status(400).json({ error: 'That plan is retired — pick an active one' })
      pct = null
    }
  }
  if (b.commissionPercent !== undefined) {
    if (b.commissionPercent === null || b.commissionPercent === '') pct = null
    else {
      pct = Number(b.commissionPercent)
      if (!Number.isInteger(pct) || pct < 0 || pct > 100) return res.status(400).json({ error: 'Commission must be a whole number between 0 and 100' })
      planId = null // a hand-typed rate takes this worker off their plan, deliberately
    }
  }
  const walletEnabled = b.walletEnabled !== undefined ? !!b.walletEnabled : w.wallet_enabled !== false

  let incId = w.incentive_plan_id ?? null
  if (b.incentivePlanId !== undefined) {
    incId = b.incentivePlanId === null || b.incentivePlanId === '' ? null : Number(b.incentivePlanId)
    if (incId !== null) {
      const ip = (await pool.query('SELECT id, active FROM incentive_plans WHERE id=$1', [incId])).rows[0]
      if (!ip) return res.status(400).json({ error: 'Unknown incentive plan' })
      if (!ip.active) return res.status(400).json({ error: 'That incentive plan is retired — pick an active one' })
    }
  }
  let effFrom = w.salary_effective_from
  if (b.salaryEffectiveFrom !== undefined) {
    effFrom = b.salaryEffectiveFrom || null
    if (effFrom && Number.isNaN(new Date(effFrom).getTime())) return res.status(400).json({ error: 'Effective from must be a valid date' })
  }
  const mode = b.salaryPaymentMode !== undefined ? String(b.salaryPaymentMode) : (w.salary_payment_mode || 'bank')
  if (!['bank', 'upi'].includes(mode)) return res.status(400).json({ error: 'Payment mode must be bank or upi' })
  // Per-worker salary amounts. '' / null clears the override (back to the plan); a number sets it.
  const amount = (v, cur) => {
    if (v === undefined) return cur
    if (v === null || v === '') return null
    const n = Number(v)
    if (!Number.isInteger(n) || n < 0 || n > 10_000_000) return NaN
    return n
  }
  const sBasic = amount(b.salaryBasic, w.salary_basic)
  const sAtt = amount(b.salaryAttendance, w.salary_attendance)
  const sAllow = amount(b.salaryAllowance, w.salary_allowance)
  if ([sBasic, sAtt, sAllow].some(Number.isNaN)) return res.status(400).json({ error: 'Salary amounts must be whole rupee values' })
  const flag = (k, col) => (b[k] !== undefined ? !!b[k] : !!w[col])
  const pf = flag('pfApplicable', 'pf_applicable')
  const esi = flag('esiApplicable', 'esi_applicable')
  const tds = flag('tdsApplicable', 'tds_applicable')

  await pool.query(
    `UPDATE workers SET commission_percent=$1, salary_plan_id=$2, wallet_enabled=$3, incentive_plan_id=$4,
       salary_effective_from=$5, pf_applicable=$6, esi_applicable=$7, tds_applicable=$8, salary_payment_mode=$9,
       salary_basic=$10, salary_attendance=$11, salary_allowance=$12
     WHERE id=$13`,
    [pct, planId, walletEnabled, incId, effFrom, pf, esi, tds, mode, sBasic, sAtt, sAllow, id])

  const who = req.admin?.name || req.admin?.email || 'Admin'
  const after = await resolveCommission(await getWorker(id))
  const platform = after.platform
  const bits = []
  if (b.salaryPlanId !== undefined) bits.push(after.plan ? `salary plan ${after.plan.name} (${after.pct}%)` : 'taken off their salary plan')
  if (b.commissionPercent !== undefined) bits.push(pct === null ? `commission back to the platform default (${platform}%)` : `commission ${pct}%`)
  if (b.walletEnabled !== undefined && walletEnabled !== (w.wallet_enabled !== false)) bits.push(walletEnabled ? 'wallet enabled' : 'wallet disabled')
  if (bits.length) publishEvent(REDIS_URL, 'activity', { actorType: 'admin', actorName: who, action: 'worker.pay', entityType: 'worker', entityId: id, detail: `${w.name}: ${bits.join(', ')}` })

  // Compare the RESOLVED rates, not the raw columns: moving someone onto a plan leaves
  // commission_percent NULL, so a column comparison would miss a real change to their take-home.
  if (after.pct !== before) {
    publishEvent(REDIS_URL, 'worker.notify', { workerId: id, title: 'Your earnings rate changed', body: `You now keep ${100 - after.pct}% of each job.` })
  }
  if (b.walletEnabled !== undefined && !walletEnabled && w.wallet_enabled !== false) {
    publishEvent(REDIS_URL, 'worker.notify', { workerId: id, title: 'Withdrawals paused', body: 'Your wallet has been put on hold. Please contact the admin.' })
  }
  const fresh = await getWorker(id)
  res.json({
    ok: true,
    commissionPercent: fresh.commission_percent,
    salaryPlanId: fresh.salary_plan_id ?? null,
    salaryPlan: planDto(after.plan),
    platformCommissionPercent: platform,
    effectiveCommissionPercent: after.pct,
    commissionSource: after.source,
    walletEnabled: fresh.wallet_enabled !== false,
  })
})

/** How the wallet settles this worker. The commission lives here because the worker service owns
 *  the worker; the wallet asks rather than keeping a copy that can drift. */
app.get('/api/internal/workers/:id/pay-config', internalOnly, async (req, res) => {
  const w = await getWorker(Number(req.params.id))
  if (!w) return res.status(404).json({ error: 'Worker not found' })
  // Resolved here, not in the wallet: a salary plan has to reach settleBooking or assigning one
  // changes nothing about what the worker is actually paid.
  const { pct, perJob, source } = await resolveCommission(w)
  const inc = await incentivePlanFor(w)
  res.json({
    commissionPercent: pct,
    /** False on a FIXED salary: payroll pays them monthly, so a per-job share would double-pay. */
    paysPerJob: perJob,
    /** 'plan' | 'manual' | 'platform' — for the wallet's logs when something looks wrong. */
    commissionSource: source,
    /** Flat amount added per completed job, from their incentive plan. 0 = none. */
    perJobIncentive: inc?.per_job_amount || 0,
    incentivePlanName: inc?.name || '',
    walletEnabled: w.wallet_enabled !== false,
  })
})

/* ---------- admin: authoring ---------- */
const qDto = (q) => ({ id: q.id, moduleId: q.module_id, question: q.question, options: q.options || [], correctIndex: q.correct_index, active: q.active })

app.get('/api/admin/training', adminAuth, async (_q, res) => {
  const [mods, qs] = await Promise.all([
    pool.query(`SELECT m.*, (SELECT COUNT(*)::int FROM training_questions q WHERE q.module_id = m.id AND q.active) questions
                FROM training_modules m ORDER BY m.sort, m.id`),
    pool.query('SELECT * FROM training_questions ORDER BY id'),
  ])
  const bank = (await pool.query(`SELECT COUNT(*)::int n FROM training_questions q LEFT JOIN training_modules m ON m.id = q.module_id WHERE ${BANK_WHERE}`)).rows[0].n
  res.json({
    ok: true, quizSize: QUIZ_SIZE, passPct: QUIZ_PASS_PCT, bank,
    modules: mods.rows.map((m) => ({ id: m.id, key: m.key, title: m.title, body: m.body, sort: m.sort, published: m.published, questions: m.questions, updated: m.updated })),
    questions: qs.rows.map(qDto),
  })
})

app.post('/api/admin/training/modules', adminAuth, async (req, res) => {
  const title = String(req.body?.title || '').trim()
  if (!title) return res.status(400).json({ error: 'Title required' })
  const key = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)
  const sort = (await pool.query('SELECT COALESCE(MAX(sort), 0) + 1 n FROM training_modules')).rows[0].n
  try {
    const r = await pool.query('INSERT INTO training_modules (key, title, body, sort) VALUES ($1, $2, $3, $4) RETURNING *', [key, title, String(req.body?.body || ''), sort])
    res.json({ ok: true, module: r.rows[0] })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'A module with that name already exists' })
    throw e
  }
})

app.patch('/api/admin/training/modules/:id', adminAuth, async (req, res) => {
  const id = Number(req.params.id)
  const cur = (await pool.query('SELECT * FROM training_modules WHERE id = $1', [id])).rows[0]
  if (!cur) return res.status(404).json({ error: 'Module not found' })
  const b = req.body || {}
  const title = b.title !== undefined ? String(b.title).trim() : cur.title
  const body = b.body !== undefined ? String(b.body) : cur.body
  const sort = b.sort !== undefined ? Number(b.sort) : cur.sort
  const published = b.published !== undefined ? !!b.published : cur.published
  if (!title) return res.status(400).json({ error: 'Title required' })
  // An empty published module is a worker staring at a blank page and ticking "I've read it".
  if (published && !body.trim()) return res.status(400).json({ error: 'Write the module content before publishing it' })
  const r = await pool.query('UPDATE training_modules SET title=$1, body=$2, sort=$3, published=$4, updated=now() WHERE id=$5 RETURNING *', [title, body, sort, published, id])
  if (published && !cur.published) {
    const who = req.admin?.name || req.admin?.email || 'Admin'
    publishEvent(REDIS_URL, 'activity', { actorType: 'admin', actorName: who, action: 'training.publish', entityType: 'training', entityId: id, detail: `Published training module: ${title}` })
  }
  res.json({ ok: true, module: r.rows[0] })
})

app.delete('/api/admin/training/modules/:id', adminAuth, async (req, res) => {
  const id = Number(req.params.id)
  // Progress rows would otherwise point at a module that no longer exists and skew "3 of 9".
  await pool.query('DELETE FROM worker_training WHERE module_id = $1', [id])
  await pool.query('DELETE FROM training_modules WHERE id = $1', [id]) // questions cascade
  res.json({ ok: true })
})

function readQuestion(b) {
  const question = String(b?.question || '').trim()
  const options = Array.isArray(b?.options) ? b.options.map((o) => String(o || '').trim()).filter(Boolean) : []
  const correctIndex = Number(b?.correctIndex)
  if (!question) return { error: 'Question text required' }
  if (options.length < 2) return { error: 'At least two options are required' }
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) return { error: 'Mark which option is correct' }
  return { question, options, correctIndex }
}

app.post('/api/admin/training/questions', adminAuth, async (req, res) => {
  const v = readQuestion(req.body)
  if (v.error) return res.status(400).json({ error: v.error })
  const moduleId = req.body?.moduleId ? Number(req.body.moduleId) : null
  const r = await pool.query(
    'INSERT INTO training_questions (module_id, question, options, correct_index) VALUES ($1, $2, $3::jsonb, $4) RETURNING *',
    [moduleId, v.question, JSON.stringify(v.options), v.correctIndex])
  res.json({ ok: true, question: qDto(r.rows[0]) })
})

app.patch('/api/admin/training/questions/:id', adminAuth, async (req, res) => {
  const id = Number(req.params.id)
  const cur = (await pool.query('SELECT * FROM training_questions WHERE id = $1', [id])).rows[0]
  if (!cur) return res.status(404).json({ error: 'Question not found' })
  if (req.body?.active !== undefined && Object.keys(req.body).length === 1) {
    const r = await pool.query('UPDATE training_questions SET active = $1 WHERE id = $2 RETURNING *', [!!req.body.active, id])
    return res.json({ ok: true, question: qDto(r.rows[0]) })
  }
  const v = readQuestion(req.body)
  if (v.error) return res.status(400).json({ error: v.error })
  const moduleId = req.body?.moduleId !== undefined ? (req.body.moduleId ? Number(req.body.moduleId) : null) : cur.module_id
  const active = req.body?.active !== undefined ? !!req.body.active : cur.active
  const r = await pool.query(
    'UPDATE training_questions SET module_id=$1, question=$2, options=$3::jsonb, correct_index=$4, active=$5 WHERE id=$6 RETURNING *',
    [moduleId, v.question, JSON.stringify(v.options), v.correctIndex, active, id])
  res.json({ ok: true, question: qDto(r.rows[0]) })
})

app.delete('/api/admin/training/questions/:id', adminAuth, async (req, res) => {
  await pool.query('DELETE FROM training_questions WHERE id = $1', [Number(req.params.id)])
  res.json({ ok: true })
})

/* ---------- Phase 12: final approval ----------
 * The 15-point checklist, every item computed from real state — nothing here is a stored tick an
 * admin can set directly, so the list can't drift from what's actually true.
 *
 * Three-way status, not a checkbox:
 *   ok   — satisfied
 *   no   — genuinely outstanding, blocks Go Live
 *   n/a  — nothing to satisfy (no training published, no equipment marked required, no email
 *          provider configured). These do NOT block. Requiring a worker to pass an exam that
 *          doesn't exist would wedge Go Live shut for a reason nobody chose.
 */
const docVerified = (docs, name) => docs.some((d) => d.name === name && d.status === 'Verified')

/* ---------- The worker's 8-step onboarding wizard ----------
 * Every step's completion is DERIVED from the same data the rest of the system reads. There is no
 * "step 3 done" flag: a stored flag and the underlying data disagree the moment anything changes,
 * and the flag is what the wizard would show.
 *
 * The wizard covers only what the WORKER can do. Documents count as done when uploaded, not when
 * verified — verification is the admin's job, and a worker who has done everything asked of them
 * shouldn't sit at "incomplete" waiting on someone else.
 */
const need = (v) => !!String(v || '').trim()

async function onboardingState(workerId) {
  const w = await getWorker(workerId)
  if (!w) return null
  const p = w.profile || {}
  const person = p.personal || {}
  const [docs, training] = await Promise.all([
    pool.query('SELECT name, storage_key FROM worker_documents WHERE worker_id=$1', [workerId]).then((r) => r.rows),
    trainingState(workerId),
  ])
  const uploaded = new Set(docs.filter((d) => d.storage_key).map((d) => d.name))
  const missingDocs = DOC_TYPES.filter((t) => t.required && !uploaded.has(t.name)).map((t) => t.name)
  const bank = p.bank || {}
  const skills = p.skills || {}

  const step = (key, label, done, detail, optional = false) => ({ key, label, done, detail, optional })

  // Which fields make a step "done" is a judgement, so it's stated rather than implied: each step
  // names exactly what's outstanding instead of showing a bare incomplete tick.
  const missingPersonal = [['gender', 'gender'], ['dob', 'date of birth']].filter(([k]) => !need(person[k])).map(([, l]) => l)
  const missingAddress = [['address', 'address'], ['emergencyName', 'emergency contact name'], ['emergencyPhone', 'emergency contact number']]
    .filter(([k]) => !need(person[k])).map(([, l]) => l)

  const steps = [
    step('otp', 'Mobile Verification', !!w.phone_verified_at, w.phone_verified_at ? 'Your number is verified' : 'Sign in with an OTP'),
    step('personal', 'Personal Information', missingPersonal.length === 0,
      missingPersonal.length ? `Still needed: ${missingPersonal.join(', ')}` : 'Done'),
    step('address', 'Address & Emergency Contact', missingAddress.length === 0,
      missingAddress.length ? `Still needed: ${missingAddress.join(', ')}` : 'Done'),
    // Uploaded, not verified — the worker cannot approve their own documents.
    step('documents', 'Documents Upload', missingDocs.length === 0,
      missingDocs.length ? `Still to upload: ${missingDocs.join(', ')}` : 'All required documents uploaded'),
    step('bank', 'Bank Details', !!(bank.bankAccount || bank.bankUpi),
      (bank.bankAccount || bank.bankUpi) ? 'Added — your admin verifies it' : 'Add where you want to be paid'),
    step('skills', 'Skills & Experience', Object.keys(skills).length > 0,
      Object.keys(skills).length ? `${Object.keys(skills).length} claimed — your admin approves them` : 'Pick the services you can do'),
    training.modules.length === 0 || !training.quiz.ready
      // Can't require someone to finish training that hasn't been written, or sit an assessment
      // that doesn't exist yet.
      ? step('training', 'Training & Assessment', true, 'Nothing to do yet — your admin hasn\'t published training', true)
      : step('training', 'Training & Assessment', training.progress.completed === training.progress.total && training.quiz.passed,
        training.quiz.passed ? `Passed with ${training.quiz.bestPct}%`
          : training.progress.completed < training.progress.total ? `${training.progress.completed} of ${training.progress.total} modules read`
            : `Assessment not passed yet (need ${training.quiz.passPct}%)`),
  ]

  const submittedAt = p.onboarding?.submittedAt || null
  const outstanding = steps.filter((s) => !s.done && !s.optional)
  return {
    worker: { id: w.id, name: w.name, status: w.status },
    steps,
    completed: steps.filter((s) => s.done).length,
    total: steps.length,
    canSubmit: outstanding.length === 0,
    outstanding: outstanding.map((s) => s.key),
    submittedAt,
    live: w.status === 'active',
  }
}

app.get('/api/worker/onboarding', auth, async (req, res) => {
  res.json({ ok: true, ...(await onboardingState(req.worker.id)) })
})

/**
 * "I'm done." Records that the worker considers their part finished and tells the admin.
 * It approves nothing — Go Live stays the admin's call. Editing afterwards is deliberately still
 * allowed: a worker who spots their own typo shouldn't have to ask permission to fix it.
 */
app.post('/api/worker/onboarding/submit', auth, async (req, res) => {
  const st = await onboardingState(req.worker.id)
  if (!st.canSubmit) {
    return res.status(400).json({ ok: false, error: 'Finish the remaining steps first', outstanding: st.outstanding })
  }
  const w = await getWorker(req.worker.id)
  const prior = w.profile?.onboarding?.submittedAt || null
  await mergeProfile(req.worker.id, {
    onboarding: { ...(w.profile?.onboarding || {}), submittedAt: prior || new Date().toISOString() },
  })
  if (!prior) {
    publishEvent(REDIS_URL, 'activity', {
      actorType: 'worker', actorId: req.worker.id, actorName: w.name, action: 'onboarding.submit',
      entityType: 'worker', entityId: req.worker.id, detail: `${w.name} submitted their profile for approval`,
    })
  }
  res.json({ ok: true, ...(await onboardingState(req.worker.id)) })
})

/* ---------- Job radius & coverage ----------
 * The two settings on this screen that actually change what dispatch offers.
 *
 * allowOutsideRadius=true (the default, and today's behaviour): zone ranks own-zone work first but
 * still offers other work when the zone is quiet — nobody sits idle next to a job they could do.
 * false: the assignment becomes a restriction — own zone only, and within jobRadiusKm of the store.
 */
app.get('/api/admin/workers/:id/coverage', adminAuth, scopeWorker, async (req, res) => {
  const w = await getWorker(Number(req.params.id))
  if (!w) return res.status(404).json({ error: 'Worker not found' })
  res.json({
    ok: true,
    zoneId: w.zone_id ?? null,
    storeId: w.store_id ?? null,
    jobRadiusKm: w.job_radius_km ?? null,
    allowOutsideRadius: w.allow_outside_radius !== false,
  })
})

app.patch('/api/admin/workers/:id/coverage', adminAuth, scopeWorker, async (req, res) => {
  const id = Number(req.params.id)
  const w = await getWorker(id)
  if (!w) return res.status(404).json({ error: 'Worker not found' })
  const b = req.body || {}
  let radius = w.job_radius_km
  if (b.jobRadiusKm !== undefined) {
    if (b.jobRadiusKm === null || b.jobRadiusKm === '') radius = null
    else {
      radius = Number(b.jobRadiusKm)
      if (!Number.isInteger(radius) || radius < 1 || radius > 100) return res.status(400).json({ error: 'Job radius must be between 1 and 100 km (leave blank for no limit)' })
    }
  }
  const allow = b.allowOutsideRadius !== undefined ? !!b.allowOutsideRadius : w.allow_outside_radius !== false
  // Restricting someone with no zone would leave them matching nothing at all, silently.
  if (!allow && !w.zone_id) return res.status(400).json({ error: 'Assign a zone before restricting this worker to it — otherwise they would match no jobs at all' })

  await pool.query('UPDATE workers SET job_radius_km=$1, allow_outside_radius=$2 WHERE id=$3', [radius, allow, id])
  const who = req.admin?.name || req.admin?.email || 'Admin'
  if (allow !== (w.allow_outside_radius !== false) || radius !== w.job_radius_km) {
    publishEvent(REDIS_URL, 'activity', {
      actorType: 'admin', actorName: who, action: 'worker.coverage', entityType: 'worker', entityId: id,
      detail: `${w.name}: ${allow ? 'can take jobs outside their zone/radius' : `restricted to their zone${radius ? ` and ${radius} km of their store` : ''}`}`,
    })
  }
  const after = await getWorker(id)
  res.json({ ok: true, zoneId: after.zone_id ?? null, storeId: after.store_id ?? null, jobRadiusKm: after.job_radius_km ?? null, allowOutsideRadius: after.allow_outside_radius !== false })
})

/* ---------- Phase 11: admin reviews availability ----------
 * The one place a preference becomes an assignment. Approving adopts what the worker asked for;
 * modifying assigns something else and must say why — a worker whose requested shift is silently
 * swapped learns about it from their roster, which is how goodwill gets spent.
 */
app.get('/api/admin/workers/:id/availability', adminAuth, scopeWorker, async (req, res) => {
  const w = await getWorker(Number(req.params.id))
  if (!w) return res.status(404).json({ error: 'Worker not found' })
  const shifts = (await pool.query('SELECT * FROM shift_defs WHERE active=true ORDER BY sort, start_min')).rows
  const { weekday } = istNow()
  res.json({
    ok: true,
    availability: availabilityDto(w),
    shifts: shifts.map((s) => shiftDefDto(s, weekday)),
    assigned: { shiftDefId: w.shift_def_id || null, zoneId: w.zone_id ?? null },
    hoursThisWeek: await hoursThisWeek(w.id),
  })
})

app.post('/api/admin/workers/:id/availability/review', adminAuth, scopeWorker, async (req, res) => {
  const id = Number(req.params.id)
  const w = await getWorker(id)
  if (!w) return res.status(404).json({ error: 'Worker not found' })
  const pref = w.profile?.availability || {}
  const approve = !!req.body?.approve
  const reason = String(req.body?.reason || '').trim()

  // Approving means "what you asked for"; anything else is a modification and needs a reason.
  const shiftId = approve
    ? (pref.preferredShiftId ?? null)
    : (req.body?.shiftDefId === null || req.body?.shiftDefId === undefined || req.body?.shiftDefId === '' ? null : Number(req.body.shiftDefId))
  const zoneId = approve
    ? (pref.preferredZoneId ?? w.zone_id ?? null)
    : (req.body?.zoneId === null || req.body?.zoneId === undefined || req.body?.zoneId === '' ? null : Number(req.body.zoneId))
  if (!approve && !reason) return res.status(400).json({ error: 'Say why this differs from what the worker asked for' })
  if (shiftId !== null && !(await getShiftDef(shiftId))) return res.status(400).json({ error: 'Unknown shift' })

  await pool.query('UPDATE workers SET shift_def_id=$1, zone_id=$2 WHERE id=$3', [shiftId, zoneId, id])
  const who = req.admin?.name || req.admin?.email || 'Admin'
  await mergeProfile(id, {
    availability: {
      ...pref,
      status: approve ? 'Approved' : 'Modified',
      reason: approve ? '' : reason,
      reviewedBy: who,
      reviewedAt: new Date().toISOString(),
    },
  })

  const sd = await getShiftDef(shiftId)
  publishEvent(REDIS_URL, 'worker.notify', {
    workerId: id,
    title: approve ? 'Availability approved' : 'Availability changed',
    body: approve
      ? `You're on the ${sd ? sd.name : 'flexible'} shift.`
      : `You've been put on the ${sd ? sd.name : 'flexible'} shift: ${reason}`,
  })
  publishEvent(REDIS_URL, 'activity', {
    actorType: 'admin', actorName: who, action: 'availability.review', entityType: 'worker', entityId: id,
    detail: `${approve ? 'Approved' : 'Modified'} availability for ${w.name} — ${sd ? sd.name : 'no'} shift${approve ? '' : ` (${reason})`}`,
  })
  const after = await getWorker(id)
  res.json({ ok: true, availability: availabilityDto(after), assigned: { shiftDefId: after.shift_def_id || null, zoneId: after.zone_id ?? null } })
})

/* ---------- Phase 8: background verification ----------
 * The spec's 7 points. Five of them ARE Phase 4 documents, so they're derived from the document
 * review — the admin verifies a document once, in one place, and this view reflects it.
 *
 * Only Previous Employer and Criminal Check are stored here, because neither exists anywhere else
 * and neither can be automated without a vendor: they are checks a human performs and records.
 * What's stored is therefore the record of that work — outcome, reference, notes, who and when.
 */
const BG_CHECKS = [
  // 'unreachable' is a real outcome, not a euphemism for pass: an ex-employer who never answers
  // means the check did not happen, so it does not satisfy the gate.
  { key: 'previous_employer', label: 'Previous Employer', outcomes: ['clear', 'unreachable', 'flagged', 'not_applicable'] },
  { key: 'criminal', label: 'Criminal Check', outcomes: ['clear', 'flagged'] },
]
const BG_PASS = { previous_employer: ['clear', 'not_applicable'], criminal: ['clear'] }
const BG_KEYS = new Map(BG_CHECKS.map((c) => [c.key, c]))

const BG_LABEL = {
  pending: 'Not started', clear: 'Clear', flagged: 'Flagged',
  unreachable: 'Could not reach', not_applicable: 'Not applicable',
}

async function backgroundState(workerId) {
  const w = await getWorker(workerId)
  if (!w) return null
  const [docs, rows] = await Promise.all([
    pool.query('SELECT name, status FROM worker_documents WHERE worker_id=$1', [workerId]).then((r) => r.rows),
    pool.query('SELECT * FROM background_checks WHERE worker_id=$1', [workerId]).then((r) => r.rows),
  ])
  const stored = new Map(rows.map((r) => [r.key, r]))

  // The five that are documents. `source: 'document'` tells the UI to send the admin to the
  // Documents tab rather than offering a second place to tick the same thing.
  const fromDocs = [
    ['aadhaar', 'Aadhaar', ['Aadhaar Front', 'Aadhaar Back']],
    ['pan', 'PAN', ['PAN Card']],
    ['police', 'Police', ['Police Verification']],
    ['medical', 'Medical', ['Medical Certificate']],
    ['address', 'Address', ['Address Proof']],
  ].map(([key, label, names]) => {
    const ok = names.every((n) => docVerified(docs, n))
    const missing = names.filter((n) => !docs.some((d) => d.name === n))
    const rejected = names.filter((n) => docs.some((d) => d.name === n && d.status === 'Rejected'))
    return {
      key, label, source: 'document', ok,
      status: ok ? 'clear' : 'pending',
      detail: ok ? `${names.join(' + ')} verified`
        : rejected.length ? `${rejected.join(', ')} was rejected — the worker must re-upload`
          : missing.length ? `${missing.join(', ')} not uploaded yet`
            : `${names.join(' + ')} uploaded, awaiting review`,
    }
  })

  const fromChecks = BG_CHECKS.map((c) => {
    const r = stored.get(c.key)
    const status = r?.status || 'pending'
    return {
      key: c.key, label: c.label, source: 'check',
      ok: BG_PASS[c.key].includes(status),
      status, outcomes: c.outcomes,
      reference: r?.reference || '', notes: r?.notes || '',
      checkedBy: r?.checked_by || '', checkedAt: r?.checked_at || null,
      detail: r?.checked_at ? `${BG_LABEL[status] || status} — recorded by ${r.checked_by}` : 'Not started',
      // The worker's own claim, shown so whoever calls the employer knows who to call. It is not
      // evidence of anything until someone verifies it.
      claim: c.key === 'previous_employer' ? (w.profile?.personal?.previousCompany || '') : '',
    }
  })

  const items = [...fromDocs, ...fromChecks]
  return { worker: { id: w.id, name: w.name }, items, verified: items.every((i) => i.ok) }
}

app.get('/api/admin/workers/:id/background', adminAuth, scopeWorker, async (req, res) => {
  const s = await backgroundState(Number(req.params.id))
  if (!s) return res.status(404).json({ error: 'Worker not found' })
  res.json({ ok: true, ...s })
})

/** Record the outcome of a check a human performed. */
app.post('/api/admin/workers/:id/background/:key', adminAuth, scopeWorker, async (req, res) => {
  const id = Number(req.params.id)
  const key = String(req.params.key)
  const check = BG_KEYS.get(key)
  if (!check) return res.status(404).json({ error: 'Unknown check' })
  const w = await getWorker(id)
  if (!w) return res.status(404).json({ error: 'Worker not found' })

  const status = String(req.body?.status || '')
  if (!check.outcomes.includes(status)) return res.status(400).json({ error: `Outcome must be one of: ${check.outcomes.join(', ')}` })
  const notes = String(req.body?.notes || '').trim().slice(0, 500)
  // A flag is a serious call about a person. It has to say what was found — an unexplained flag is
  // unactionable, and whoever decides whether to override it deserves to know why.
  if (status === 'flagged' && !notes) return res.status(400).json({ error: 'Say what was found before flagging this check' })

  const who = req.admin?.name || req.admin?.email || 'Admin'
  await pool.query(
    `INSERT INTO background_checks (worker_id, key, status, reference, notes, checked_by, checked_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (worker_id, key) DO UPDATE SET status=EXCLUDED.status, reference=EXCLUDED.reference,
       notes=EXCLUDED.notes, checked_by=EXCLUDED.checked_by, checked_at=now()`,
    [id, key, status, String(req.body?.reference || '').trim().slice(0, 80), notes, who])

  publishEvent(REDIS_URL, 'activity', {
    actorType: 'admin', actorName: who, action: 'background.check', entityType: 'worker', entityId: id,
    detail: `${check.label} for ${w.name}: ${BG_LABEL[status] || status}${notes ? ` — ${notes}` : ''}`,
  })
  res.json({ ok: true, ...(await backgroundState(id)) })
})

async function goLiveChecklist(workerId) {
  const w = await getWorker(workerId)
  if (!w) return null
  const [docs, training, eqTypes, eqIssued, background, pay] = await Promise.all([
    pool.query('SELECT name, status FROM worker_documents WHERE worker_id=$1', [workerId]).then((r) => r.rows),
    trainingState(workerId),
    pool.query('SELECT id, name FROM equipment_types WHERE active = true AND required = true').then((r) => r.rows),
    pool.query("SELECT type_id FROM worker_equipment WHERE worker_id=$1 AND status='issued'", [workerId]).then((r) => r.rows),
    backgroundState(workerId),
    resolveCommission(w),
  ])
  const heldTypes = new Set(eqIssued.map((e) => e.type_id))
  const missingKit = eqTypes.filter((t) => !heldTypes.has(t.id))
  const platform = await getSettingInt(ADMIN_URL, 'commission_percent', 20)

  const item = (key, label, state, detail) => ({ key, label, state, detail })
  const yn = (ok) => (ok ? 'ok' : 'no')

  const items = [
    item('mobile_verified', 'Mobile Verified', w.phone_verified_at ? 'ok' : 'no',
      w.phone_verified_at ? `Signed in with an OTP on ${new Date(w.phone_verified_at).toLocaleDateString('en-IN')}` : 'The worker has not completed an OTP sign-in yet'),
    // No email transport exists anywhere in the platform, so this can never be earned. It stays
    // visible rather than being quietly dropped from the spec, and never blocks.
    item('email_verified', 'Email Verified', 'na', 'No email provider is configured — this check is not enforced'),
    item('aadhaar_verified', 'Aadhaar Verified', yn(docVerified(docs, 'Aadhaar Front') && docVerified(docs, 'Aadhaar Back')),
      'Both sides must be uploaded and verified'),
    item('pan_verified', 'PAN Verified', yn(docVerified(docs, 'PAN Card')), ''),
    item('police_verified', 'Police Verified', yn(docVerified(docs, 'Police Verification')), ''),
    item('medical_verified', 'Medical Verified', yn(docVerified(docs, 'Medical Certificate')), ''),
    /* Phase 8. Not in the spec's written 15 — added deliberately, because a criminal check that
     * gates nothing is a record that changes nothing. Only the two human-performed checks count
     * here: Aadhaar/PAN/Police/Medical already have their own lines above, and Address has no line
     * in the spec's list, so counting them again would double-block on one rejected document. */
    (() => {
      const own = (background?.items || []).filter((i) => i.source === 'check')
      const bad = own.filter((i) => !i.ok)
      const flagged = own.filter((i) => i.status === 'flagged')
      return item('background_verified', 'Background Verified', yn(bad.length === 0),
        flagged.length ? `${flagged.map((i) => `${i.label} FLAGGED: ${i.notes}`).join('; ')}`
          : bad.length ? `Outstanding: ${bad.map((i) => `${i.label} (${BG_LABEL[i.status] || i.status})`).join(', ')}`
            : 'Previous employer and criminal check both clear')
    })(),
    item('bank_verified', 'Bank Verified', yn(w.bank_status === 'Verified'),
      w.bank_status ? `Bank status: ${w.bank_status}` : 'No bank details submitted yet'),
    item('skills_approved', 'Skills Approved', yn((w.services || []).length > 0),
      (w.services || []).length ? `Approved for ${(w.services || []).join(', ')}` : 'No skill has been approved — the worker would match no jobs'),
    training.modules.length === 0
      ? item('training_completed', 'Training Completed', 'na', 'No training modules are published — nothing to complete')
      : item('training_completed', 'Training Completed', yn(training.progress.completed === training.progress.total),
        `${training.progress.completed} of ${training.progress.total} modules read`),
    !training.quiz.ready
      ? item('assessment_passed', 'Assessment Passed', 'na', `The question bank holds ${training.quiz.bank} of the ${training.quiz.size} needed — the assessment cannot be sat`)
      : item('assessment_passed', 'Assessment Passed', yn(training.quiz.passed),
        training.quiz.passed ? `Passed with ${training.quiz.bestPct}%` : training.quiz.attempts ? `Best ${training.quiz.bestPct}% over ${training.quiz.attempts} attempt(s) — needs ${training.quiz.passPct}%` : 'Not attempted yet'),
    item('zone_assigned', 'Zone Assigned', yn(!!w.zone_id), w.zone_id ? '' : 'No zone — dispatch cannot place this worker'),
    // shift_def_id is admin-only since Phase 11 — before that the worker wrote it themselves, which
    // made this check something they could tick for themselves.
    item('shift_assigned', 'Shift Assigned', yn(!!w.shift_def_id),
      w.shift_def_id ? '' : (w.profile?.availability?.preferredShiftId
        ? 'The worker has requested a shift — approve it under Availability'
        : 'No shift assigned')),
    eqTypes.length === 0
      ? item('equipment_issued', 'Equipment Issued', 'na', 'No equipment is marked as required — this check is not enforced')
      : item('equipment_issued', 'Equipment Issued', yn(missingKit.length === 0),
        missingKit.length ? `Still to issue: ${missingKit.map((t) => t.name).join(', ')}` : `All ${eqTypes.length} required items issued`),
    // Resolved, not read off the column: a worker on a salary plan has commission_percent NULL, so
    // reading the column would call them unconfigured while the wallet happily pays them the plan's
    // rate.
    (() => {
      const c = pay // resolveCommission(), fetched with the rest above
      return item('salary_configured', 'Salary Configured', yn(c.source !== 'platform'),
        c.source === 'platform'
          ? `No plan or rate set — they would earn on the platform default (${platform}% commission)`
          : c.source === 'plan'
            ? `${c.plan.name} — ${c.pct}% commission, the worker keeps ${100 - c.pct}%`
            : `Commission ${c.pct}% (set by hand) — the worker keeps ${100 - c.pct}%`)
    })(),
    item('wallet_enabled', 'Wallet Enabled', yn(w.wallet_enabled !== false), w.wallet_enabled !== false ? '' : 'Withdrawals are on hold'),
  ]
  const blocking = items.filter((i) => i.state === 'no')
  return {
    worker: { id: w.id, name: w.name, status: w.status },
    items,
    blocking: blocking.map((i) => i.key),
    ready: blocking.length === 0,
    live: w.status === 'active',
    // The worker saying "I've finished my part". Not an approval and not a checklist item — it
    // tells the admin there's something to look at.
    submittedAt: w.profile?.onboarding?.submittedAt || null,
  }
}

app.get('/api/admin/workers/:id/checklist', adminAuth, scopeWorker, async (req, res) => {
  const c = await goLiveChecklist(Number(req.params.id))
  if (!c) return res.status(404).json({ error: 'Worker not found' })
  const history = (await pool.query('SELECT * FROM worker_approvals WHERE worker_id=$1 ORDER BY created DESC LIMIT 10', [Number(req.params.id)])).rows
  res.json({ ok: true, ...c, history: history.map((h) => ({ id: h.id, admin: h.admin, overridden: h.overridden || [], reason: h.reason, created: h.created })) })
})

/**
 * GO LIVE — the one place a worker becomes dispatchable.
 * Outstanding items block, but an admin may override with a reason. The override records who
 * waived exactly which checks and why: real onboarding always has a legitimate exception, and an
 * exception nobody can trace afterwards is the thing that actually hurts.
 */
app.post('/api/admin/workers/:id/go-live', adminAuth, scopeWorker, async (req, res) => {
  const id = Number(req.params.id)
  const c = await goLiveChecklist(id)
  if (!c) return res.status(404).json({ error: 'Worker not found' })
  if (c.live) return res.status(409).json({ error: 'This worker is already active' })

  const reason = String(req.body?.reason || '').trim()
  if (!c.ready && !reason) {
    return res.status(400).json({
      error: `${c.blocking.length} check${c.blocking.length === 1 ? '' : 's'} still outstanding. Give a reason to override.`,
      blocking: c.blocking, needsOverride: true,
    })
  }
  const who = req.admin?.name || req.admin?.email || 'Admin'
  await pool.query('UPDATE workers SET status=$1, verified=true WHERE id=$2', ['active', id])
  await pool.query('INSERT INTO worker_approvals (worker_id, admin, overridden, reason) VALUES ($1, $2, $3::jsonb, $4)',
    [id, who, JSON.stringify(c.blocking), c.ready ? '' : reason])

  publishEvent(REDIS_URL, 'worker.notify', { workerId: id, title: "You're live", body: 'Your onboarding is complete — you can start accepting jobs.' })
  const waived = c.ready ? '' : ` — overrode ${c.blocking.join(', ')}: ${reason}`
  publishEvent(REDIS_URL, 'activity', {
    actorType: 'admin', actorName: who, action: 'worker.golive', entityType: 'worker', entityId: id,
    detail: `${c.worker.name} is live${waived}`,
  })
  res.json({ ok: true, ...(await goLiveChecklist(id)) })
})

/** One worker's training state, for the detail screen and Phase 12's checklist. */
app.get('/api/admin/workers/:id/training', adminAuth, scopeWorker, async (req, res) => {
  const st = await trainingState(Number(req.params.id))
  res.json({ ok: true, ...st, modules: st.modules.map(({ body, ...m }) => m) }) // titles + progress; the admin doesn't need the text echoed back
})

app.get('/api/worker/documents/types', auth, (_q, res) => res.json({ ok: true, types: DOC_TYPES }))

app.post('/api/worker/documents/upload', auth, upload.single('file'), async (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ ok: false, error: 'Document name required' })
  // Only known types: an arbitrary name would store a file nobody ever reviews or looks for.
  if (!DOC_NAMES.has(name)) return res.status(400).json({ ok: false, error: `Unknown document type: ${name}` })
  if (!storageConfigured()) return res.status(503).json({ ok: false, error: 'Document storage is not configured. Contact support.' })
  if (!req.file?.buffer?.length) return res.status(400).json({ ok: false, error: 'Attach a photo or PDF of the document' })

  // Trust the bytes, not the client's Content-Type — this is where a renamed file would get in.
  const kind = sniffType(req.file.buffer)
  if (!kind) return res.status(415).json({ ok: false, error: 'Only JPG, PNG, WebP or PDF files are accepted' })

  const key = storageKey(`workers/${req.worker.id}/kyc`, kind.ext)
  try { await putObject(key, req.file.buffer, kind.mime) }
  catch (e) { console.error('[worker] document upload failed:', e.message); return res.status(502).json({ ok: false, error: 'Could not store the document. Please try again.' }) }

  await replaceDocument(req.worker.id, name, {
    key, mime: kind.mime, size: req.file.size, sum: checksum(req.file.buffer),
    fileName: String(req.body?.fileName || req.file.originalname || `${name}.${kind.ext}`).slice(0, 180),
  })
  publishEvent(REDIS_URL, 'activity', { actorType: 'worker', actorId: req.worker.id, actorName: req.worker.name, action: 'kyc.document', entityType: 'worker', entityId: req.worker.id, detail: `Uploaded document: ${name}` })
  res.json({ ok: true, documents: (await documents(req.worker.id)).map(docDto) })
})

// The worker viewing their own document. Ownership is enforced by the worker_id filter.
app.get('/api/worker/documents/:id/url', auth, async (req, res) => {
  const d = (await pool.query('SELECT storage_key FROM worker_documents WHERE id=$1 AND worker_id=$2', [Number(req.params.id), req.worker.id])).rows[0]
  if (!d?.storage_key) return res.status(404).json({ ok: false, error: 'No file for this document' })
  res.json({ ok: true, url: await signedGetUrl(d.storage_key) })
})

/* ---------- admin worker management ---------- */
app.get('/api/admin/workers', adminAuth, async (req, res) => res.json({ stats: await workerStats(req.admin?.scope), workers: await listWorkers(req.query, req.admin?.scope) }))
// `name` is what bookings/dispatch/both apps read, so it stays authoritative and is derived from
// first+last when those are supplied. A caller sending only `name` (the old shape) still works.
const fullName = (b) => [b.first_name, b.last_name].filter(Boolean).join(' ').trim() || String(b.name || '').trim()

app.post('/api/admin/workers', adminAuth, requirePerm('workers.create'), async (req, res) => {
  const b = req.body || {}
  const name = fullName(b)
  if (!name) return res.status(400).json({ error: 'Name required' })
  // The phone IS the login identity (OTP by number), so a duplicate would create a worker who can
  // never sign in — whoever was created first wins the number.
  if (b.phone) {
    const dup = await pool.query('SELECT id, name FROM workers WHERE phone=$1', [String(b.phone).trim()])
    if (dup.rows.length) return res.status(409).json({ error: `That mobile number already belongs to ${dup.rows[0].name}` })
  }
  // A plan and a hand-typed rate are mutually exclusive here too (see PATCH /pay).
  let planId = b.salary_plan_id ? Number(b.salary_plan_id) : null
  if (planId) {
    const plan = (await pool.query('SELECT id, active FROM salary_plans WHERE id=$1', [planId])).rows[0]
    if (!plan) return res.status(400).json({ error: 'Unknown salary plan' })
    if (!plan.active) return res.status(400).json({ error: 'That salary plan is retired' })
  }
  if (b.shift_def_id && !(await getShiftDef(Number(b.shift_def_id)))) return res.status(400).json({ error: 'Unknown shift' })

  const { rows } = await pool.query(
    `INSERT INTO workers (name,first_name,last_name,phone,alternate_mobile,email,city,services,status,verified,rating,zone_id,designation,
                          worker_category,employment_type,joining_date,recruiter,referral_source,
                          cluster_id,store_id,reporting_manager_id,salary_plan_id,shift_def_id,wallet_enabled,
                          job_radius_km,allow_outside_radius,incentive_plan_id,salary_effective_from,
                          pf_applicable,esi_applicable,tds_applicable,salary_payment_mode,
                          salary_basic,salary_attendance,salary_allowance)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35) RETURNING *`,
    [name, b.first_name || null, b.last_name || null, b.phone ? String(b.phone).trim() : null, b.alternate_mobile || null,
      b.email || null, b.city || null, JSON.stringify(b.services || []), b.status || 'pending', !!b.verified, b.rating ?? 4.5,
      b.zone_id ? Number(b.zone_id) : null, b.designation || 'Worker',
      b.worker_category || null, b.employment_type || null, b.joining_date || null, b.recruiter || null, b.referral_source || null,
      b.cluster_id ? Number(b.cluster_id) : null, b.store_id ? Number(b.store_id) : null,
      b.reporting_manager_id ? Number(b.reporting_manager_id) : null, planId,
      b.shift_def_id ? Number(b.shift_def_id) : null, b.wallet_enabled === undefined ? true : !!b.wallet_enabled,
      b.job_radius_km ? Number(b.job_radius_km) : null,
      b.allow_outside_radius === undefined ? true : !!b.allow_outside_radius,
      b.incentive_plan_id ? Number(b.incentive_plan_id) : null,
      b.salary_effective_from || b.joining_date || null,
      !!b.pf_applicable, !!b.esi_applicable, !!b.tds_applicable,
      ['bank', 'upi'].includes(b.salary_payment_mode) ? b.salary_payment_mode : 'bank',
      Number.isInteger(b.salary_basic) ? b.salary_basic : null,
      Number.isInteger(b.salary_attendance) ? b.salary_attendance : null,
      Number.isInteger(b.salary_allowance) ? b.salary_allowance : null])
  // Badge number is derived from the id, so it needs the row to exist first.
  const id = rows[0].id
  await pool.query(`UPDATE workers SET employee_id = 'WKR' || (1000 + $1) WHERE id=$1 AND employee_id IS NULL`, [id])
  const profPatch = {}
  if (b.personal && typeof b.personal === 'object') profPatch.personal = b.personal
  if (b.skillLevels && typeof b.skillLevels === 'object') profPatch.skillLevels = b.skillLevels
  // Weekly off, if the admin set a starting pattern. Marked Approved because an admin chose it —
  // the worker can change it from the app afterwards, which sends it back for review (Phase 11).
  if (Array.isArray(b.weekly_off)) {
    const off = new Set(b.weekly_off)
    const days = {}
    for (const d of DAY_KEYS) days[d] = !off.has(d)
    profPatch.availability = {
      availableDays: days,
      preferredShiftId: b.shift_def_id ? Number(b.shift_def_id) : null,
      status: 'Approved',
      reviewedBy: req.admin?.name || req.admin?.email || 'Admin',
      reviewedAt: new Date().toISOString(),
    }
  }
  if (Object.keys(profPatch).length) await mergeProfile(id, profPatch)
  const who = req.admin?.name || req.admin?.email || 'Admin'
  publishEvent(REDIS_URL, 'activity', { actorType: 'admin', actorName: who, action: 'worker.create', entityType: 'worker', entityId: id, detail: `Created worker ${name}${b.phone ? ` (${b.phone})` : ''}` })
  res.status(201).json(rowToWorker(await getWorker(id)))
})

/* Invite: let a created worker into the app to complete their own onboarding.
 *
 * There is deliberately no activation token. Login is OTP-by-phone, which already proves the
 * worker owns the number the admin entered — a token in the SMS would add ceremony, not security,
 * and the record is keyed by that phone anyway. What the invite actually does is move them from
 * 'pending' (cannot log in) to 'onboarding' (can log in, cannot be dispatched).
 */
app.post('/api/admin/workers/:id/invite', adminAuth, scopeWorker, async (req, res) => {
  const w = await getWorker(Number(req.params.id))
  if (!w) return res.status(404).json({ error: 'Worker not found' })
  if (!w.phone) return res.status(400).json({ error: 'Add a mobile number before inviting' })
  if (w.status === 'active') return res.status(409).json({ error: 'This worker is already live' })

  await pool.query("UPDATE workers SET status='onboarding', invited_at=now() WHERE id=$1", [w.id])

  const tmpl = await getSetting(ADMIN_URL, 'msg91_invite_template_id', '')
  let delivery = 'not sent'
  if (await smsConfigured(ADMIN_URL)) {
    if (!tmpl) delivery = 'SMS provider is configured but msg91_invite_template_id is not set'
    else {
      const sent = await sendTemplateSms(ADMIN_URL, w.phone, tmpl, { name: w.name, company: 'HomeHelp' })
      delivery = sent.ok ? 'sent' : `failed: ${sent.error}`
      if (!sent.ok) console.error(`[worker] invite SMS failed for ${w.phone}: ${sent.error}`)
    }
  } else {
    console.log(`[worker] invite for ${w.name} (${w.phone}) — no SMS provider configured, so nothing was sent.`)
    delivery = 'no SMS provider configured'
  }
  const who = req.admin?.name || req.admin?.email || 'Admin'
  publishEvent(REDIS_URL, 'activity', { actorType: 'admin', actorName: who, action: 'worker.invite', entityType: 'worker', entityId: w.id, detail: `Invited ${w.name} (${w.phone}) — ${delivery}` })
  // Report delivery honestly: the status change succeeded even if the SMS didn't, and the admin
  // needs to know which so they can pass the message on themselves.
  res.json({ ok: true, delivery, worker: rowToWorker(await getWorker(w.id)) })
})
// Full worker detail for the admin View modal — the base record + KYC documents + recent jobs.
app.get('/api/admin/workers/:id', adminAuth, scopeWorker, async (req, res) => {
  const id = Number(req.params.id)
  const w = await getWorker(id)
  if (!w) return res.status(404).json({ error: 'Not found' })
  const [docs, bookings, wallet, noteRows, activityRes, snapRes] = await Promise.all([
    documents(id),
    tryGet(BOOKING_URL, `/api/internal/bookings?worker_id=${id}`, []),
    tryGet(WALLET_URL, `/internal/summary/${id}`, null),
    pool.query('SELECT * FROM worker_notes WHERE worker_id=$1 ORDER BY id DESC LIMIT 20', [id]),
    tryGet(NOTIFICATION_URL, `/internal/list?entityType=worker&entityId=${id}&limit=15`, { items: [] }),
    pool.query('SELECT * FROM worker_metric_snapshots WHERE worker_id=$1 AND snap_date < CURRENT_DATE ORDER BY snap_date DESC LIMIT 1', [id]),
  ])
  const prevSnap = snapRes.rows[0]
  const notes = noteRows.rows.map((n) => ({ id: n.id, note: n.note, author: n.author, created: n.created }))
  const activity = ((activityRes && activityRes.items) || []).slice(0, 15).map((a) => ({ id: a.id, action: a.action, detail: a.detail, ref: a.ref, created: a.created }))
  const svcOf = (b) => b.service || (Array.isArray(b.items) && b.items[0] && (b.items[0].name || b.items[0].service)) || '—'
  const bk = bookings || []
  const recentJobs = bk.slice(0, 8).map((b) => ({
    id: b.id, ref: b.ref || `BK${b.id}`, service: svcOf(b),
    status: b.status || '', total: b.total || 0, date: b.date || '', time: b.time || '',
  }))
  // hasFile drives the admin's View link — rows predating the storage pipeline have no object
  // behind them, and offering a preview that 404s is worse than offering none.
  const documentsOut = (docs || []).map((d) => ({
    id: d.id, name: d.name, fileName: d.file_name, status: d.status, created: d.created,
    hasFile: !!d.storage_key, mime: d.mime || '', sizeBytes: d.size_bytes || 0,
    reviewedBy: d.reviewed_by || '', reviewedAt: d.reviewed_at || null, rejectReason: d.reject_reason || '',
  }))

  // KPIs computed from the worker's bookings.
  const now = new Date(); const dayMs = 86400000
  const within = (ts, n) => ts && (now - new Date(ts)) <= n * dayMs
  const cancelled = bk.filter((b) => b.status === 'cancelled')
  const completed = bk.filter((b) => b.status === 'completed')
  const ACTIVE = ['assigned', 'accepted', 'on_the_way', 'on the way', 'travelling', 'arrived', 'in_progress', 'in progress', 'started']
  const isToday = (ts) => ts && new Date(ts).toDateString() === now.toDateString()
  const cmpIn = (n) => completed.filter((b) => n === 0 ? isToday(b.created) : within(b.created, n)).length
  // On-time % from real attendance check-ins (on_time flag set at check-in vs shift grace window).
  const attRes = await pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE on_time)::int AS ontime FROM attendance WHERE worker_id=$1`, [id]).catch(() => ({ rows: [] }))
  const attTot = attRes.rows[0]?.total || 0, attOn = attRes.rows[0]?.ontime || 0
  const metrics = {
    totalJobs: bk.length, completed: completed.length, cancelled: cancelled.length,
    todayJobs: bk.filter((b) => isToday(b.created)).length,
    weekJobs: bk.filter((b) => within(b.created, 7)).length,
    monthJobs: bk.filter((b) => within(b.created, 30)).length,
    completedToday: cmpIn(0), completedWeek: cmpIn(7), completedMonth: cmpIn(30),
    cancellationPct: bk.length ? Math.round((cancelled.length / bk.length) * 100) : 0,
    completionPct: bk.length ? Math.round((completed.length / bk.length) * 100) : 0,
    // Acceptance rate = jobs the worker took on (not cancelled) / total assigned.
    acceptanceRate: bk.length ? Math.round(((bk.length - cancelled.length) / bk.length) * 100) : 0,
    // On-time attendance %; null-safe 0 when the worker has no check-ins yet.
    onTimePct: attTot ? Math.round((attOn / attTot) * 100) : 0,
    onTimeSamples: attTot,
    todayEarnings: wallet ? (wallet.todayEarnings || 0) : 0,
  }
  // Trend vs the most recent prior daily snapshot (▲/▼ on the KPI tiles). null until history exists.
  metrics.trends = prevSnap ? {
    weekJobs: metrics.weekJobs - (prevSnap.week_jobs || 0),
    completion: metrics.completionPct - (prevSnap.completion_pct || 0),
    cancellation: metrics.cancellationPct - (prevSnap.cancellation_pct || 0),
    rating: Math.round(((w.rating || 0) - (prevSnap.rating || 0)) * 10) / 10,
  } : null

  // ---- Jobs & Performance tab aggregates (all derived from real bookings) ----
  const COMMISSION = await getSettingInt(ADMIN_URL, 'commission_percent', 20)
  const workerShare = (b) => Math.max(0, Math.round(((b.total || 0) * (100 - COMMISSION)) / 100))
  const pctOf = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0)
  const parseClock = (t) => {
    const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
    if (!m) return null
    let h = Number(m[1]); const ap = (m[3] || '').toUpperCase()
    if (ap === 'PM' && h < 12) h += 12
    if (ap === 'AM' && h === 12) h = 0
    return { h, min: Number(m[2]) }
  }
  const schedMs = (b) => {
    if (!b.date) return null
    const d = new Date(`${b.date}T00:00:00`); if (isNaN(d.getTime())) return null
    const c = parseClock(b.time); if (c) d.setHours(c.h, c.min, 0, 0)
    return d.getTime()
  }
  const jobOnTime = (b) => {
    if (b.status !== 'completed') return false
    const s = schedMs(b); if (s == null || !b.started_at) return true
    return new Date(b.started_at).getTime() <= s + 10 * 60000
  }
  const jobNoShow = (b) => {
    const s = schedMs(b)
    return !!b.worker_id && s != null && (now - s > 2 * 3600000) && !b.started_at && !b.completed_at && !['completed', 'cancelled'].includes(b.status)
  }
  const ratings = bk.map((b) => b.rating).filter((r) => r != null && r > 0)
  const avgJobRating = ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : (w.rating || 0)
  const noShow = bk.filter(jobNoShow)
  const onTimeArr = completed.filter(jobOnTime)
  const totalEarned = completed.reduce((s, b) => s + workerShare(b), 0)

  const sameMonth = (ts) => ts && new Date(ts).getMonth() === now.getMonth() && new Date(ts).getFullYear() === now.getFullYear()
  const monthBk = bk.filter((b) => sameMonth(b.created))
  const ACTIVE_ST = ['confirmed', 'worker_assigned', 'accepted', 'on_the_way', 'on the way', 'arrived', 'in_progress', 'in progress', 'started']
  const mStatus = {
    total: monthBk.length,
    completed: monthBk.filter((b) => b.status === 'completed').length,
    cancelled: monthBk.filter((b) => b.status === 'cancelled').length,
    noShow: monthBk.filter(jobNoShow).length,
    inProgress: monthBk.filter((b) => ACTIVE_ST.includes(String(b.status).toLowerCase()) && !jobNoShow(b)).length,
  }
  const svcCount = {}
  for (const b of monthBk) { const s = svcOf(b); svcCount[s] = (svcCount[s] || 0) + 1 }
  const svcSorted = Object.entries(svcCount).sort((a, b) => b[1] - a[1])
  const topSvc = svcSorted.slice(0, 4).map(([service, count]) => ({ service, count, pct: pctOf(count, monthBk.length) }))
  const otherCount = svcSorted.slice(4).reduce((s, [, c]) => s + c, 0)
  if (otherCount > 0) topSvc.push({ service: 'Others', count: otherCount, pct: pctOf(otherCount, monthBk.length) })

  const trendDays = []
  for (let i = 29; i >= 0; i--) {
    const key = new Date(now - i * dayMs).toISOString().slice(0, 10)
    const dayComp = completed.filter((b) => String(b.completed_at || b.created || '').slice(0, 10) === key)
    trendDays.push({ date: key, value: dayComp.length ? Math.round((dayComp.filter(jobOnTime).length / dayComp.length) * 100) : null })
  }
  const perfTrend = trendDays.filter((d) => d.value != null)
  const dayOfMonth = Math.max(1, now.getDate())
  const monthEarned = monthBk.filter((b) => b.status === 'completed').reduce((s, b) => s + workerShare(b), 0)

  const custList = await tryGet(AUTH_URL, '/api/internal/customers', [])
  const custMap = new Map((Array.isArray(custList) ? custList : (custList.items || [])).map((c) => [c.id, c.name]))
  const jobRows = bk.slice(0, 8).map((b) => ({
    id: b.id, ref: b.ref || `BK${b.id}`, service: svcOf(b), customer: custMap.get(b.user_id) || '—',
    date: b.date || (b.created ? String(b.created).slice(0, 10) : ''), time: b.time || '', created: b.created || '',
    amount: b.total || 0, status: b.status || '',
    acceptance: b.worker_id ? 'Accepted' : '—',
    onTime: b.status === 'completed' ? (jobOnTime(b) ? 'On Time' : 'Late') : '—',
    rating: b.rating || null,
    earnings: b.status === 'completed' ? workerShare(b) : 0,
  }))

  const jobsPerformance = {
    summary: {
      totalJobs: bk.length,
      completed: completed.length, completedPct: pctOf(completed.length, bk.length),
      cancelled: cancelled.length, cancelledPct: pctOf(cancelled.length, bk.length),
      noShow: noShow.length, noShowPct: pctOf(noShow.length, bk.length),
      onTimeArrivals: onTimeArr.length, onTimePct: pctOf(onTimeArr.length, completed.length),
      avgRating: avgJobRating, totalEarnings: totalEarned,
    },
    byStatus: {
      total: mStatus.total,
      segments: [
        { key: 'completed', label: 'Completed', count: mStatus.completed, pct: pctOf(mStatus.completed, mStatus.total) },
        { key: 'inProgress', label: 'In Progress', count: mStatus.inProgress, pct: pctOf(mStatus.inProgress, mStatus.total) },
        { key: 'noShow', label: 'No Show', count: mStatus.noShow, pct: pctOf(mStatus.noShow, mStatus.total) },
        { key: 'cancelled', label: 'Cancelled', count: mStatus.cancelled, pct: pctOf(mStatus.cancelled, mStatus.total) },
      ],
    },
    byService: { total: monthBk.length, segments: topSvc },
    metrics: {
      acceptanceRate: metrics.acceptanceRate, acceptanceDelta: null,
      onTimeArrival: pctOf(onTimeArr.length, completed.length), onTimeDelta: null,
      cancellationRate: metrics.cancellationPct, cancellationDelta: prevSnap ? metrics.cancellationPct - (prevSnap.cancellation_pct || 0) : null,
      customerRating: avgJobRating, ratingDelta: prevSnap ? Math.round((avgJobRating - (prevSnap.rating || 0)) * 10) / 10 : null,
      jobsPerDay: Math.round((monthBk.length / dayOfMonth) * 10) / 10, jobsPerDayDelta: null,
      earningsPerDay: Math.round(monthEarned / dayOfMonth), earningsPerDayDelta: null,
    },
    trend: perfTrend,
    jobs: jobRows,
  }
  // Device telemetry the worker app reports via /api/worker/heartbeat.
  const dev = (w.profile && w.profile.device) || {}
  const idleMins = dev.at ? Math.max(0, Math.round((now - new Date(dev.at)) / 60000)) : null
  const device = { battery: dev.battery ?? null, network: dev.network ?? null, idleMins, lastSeen: dev.at || null }
  const lj = bk.find((b) => ACTIVE.includes(String(b.status).toLowerCase()))
  const liveJob = lj ? {
    id: lj.id, ref: lj.ref || `BK${lj.id}`, service: svcOf(lj), status: lj.status,
    total: lj.total || 0, apartment: lj.address || '', otpStatus: lj.service_otp ? 'Set' : 'Pending',
    startedAt: lj.started_at || '', date: lj.date || '', time: lj.time || '',
  } : null

  // Earnings trend — sum of completed-job totals per day (most recent days with activity).
  const byDay = {}
  for (const b of bk) {
    if (b.status !== 'completed') continue
    const key = (b.created ? new Date(b.created) : now).toISOString().slice(0, 10)
    byDay[key] = (byDay[key] || 0) + (b.total || 0)
  }
  const earningsTrend = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0])).slice(-8).map(([date, amount]) => ({ date, amount }))

  // Timeline of the live (or most recent) job, from the activity log.
  const timelineJob = lj || bk[0]
  const timeline = timelineJob
    ? (await tryGet(NOTIFICATION_URL, `/internal/timeline/${timelineJob.id}`, [])).map((t) => ({ action: t.action, detail: t.detail, created: t.created }))
    : []

  // Heuristic worker-health score (no ML — derived from real metrics). Each component is a 0-100
  // risk %; the overall score is a severity-weighted blend. Lower = healthier.
  const rating = w.rating || 0
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)))
  const attendanceRisk = clamp(metrics.cancellationPct * 2.5)                                   // cancellations => unreliable
  const burnoutRisk = clamp((Math.max(0, metrics.weekJobs - 15) / 25) * 100)                     // heavy weekly load
  const lateProbability = clamp((100 - metrics.completionPct) * 0.5 + metrics.cancellationPct * 0.5)
  const complaintProbability = clamp(Math.max(0, 4.8 - rating) * 25)                             // low rating => complaints
  const riskScore = clamp(0.35 * attendanceRisk + 0.2 * burnoutRisk + 0.25 * lateProbability + 0.2 * complaintProbability)
  const level = riskScore < 15 ? 'Low' : riskScore < 35 ? 'Medium' : 'High'
  const top = [['attendance', attendanceRisk], ['burnout', burnoutRisk], ['late', lateProbability], ['complaint', complaintProbability]].sort((a, b) => b[1] - a[1])[0]
  const suggestion = riskScore < 15 ? 'Performing well — no action needed.'
    : top[0] === 'attendance' ? 'High cancellations — review reliability before assigning premium jobs.'
    : top[0] === 'burnout' ? 'Heavy workload — assign nearby jobs only and avoid long-distance travel.'
    : top[0] === 'late' ? 'On-time risk — monitor ETAs and start windows closely.'
    : 'Rating dipping — coaching / a check-in is recommended.'
  const health = { riskScore, level, attendanceRisk, burnoutRisk, lateProbability, complaintProbability, suggestion }

  // documentTypes travels with the detail so the admin can show what's still MISSING, not just
  // what happened to be uploaded — an absent Police Verification is the thing they need to chase.
  res.json({ ...rowToWorker(w), documents: documentsOut, documentTypes: DOC_TYPES, recentJobs, metrics, liveJob, wallet, notes, activity, earningsTrend, timeline, device, health, jobsPerformance })
})
app.patch('/api/admin/workers/:id', adminAuth, requirePerm('workers.edit'), scopeWorker, async (req, res) => res.json(await patchWorker(Number(req.params.id), req.body || {}, res)))
app.delete('/api/admin/workers/:id', adminAuth, requirePerm('workers.delete'), scopeWorker, async (req, res) => { await pool.query('DELETE FROM workers WHERE id=$1', [Number(req.params.id)]); res.json({ ok: true }) })
// Admin notes on a worker.
app.get('/api/admin/workers/:id/notes', adminAuth, scopeWorker, async (req, res) => res.json((await pool.query('SELECT id, note, author, created FROM worker_notes WHERE worker_id=$1 ORDER BY id DESC LIMIT 50', [Number(req.params.id)])).rows))
app.post('/api/admin/workers/:id/notes', adminAuth, scopeWorker, async (req, res) => {
  const note = String(req.body?.note || '').trim().slice(0, 2000)
  if (!note) return res.status(400).json({ error: 'Note is empty' })
  const { rows } = await pool.query('INSERT INTO worker_notes (worker_id,note,author) VALUES ($1,$2,$3) RETURNING id, note, author, created', [Number(req.params.id), note, req.body?.author || 'Admin'])
  res.status(201).json(rows[0])
})

/* ---------- shifts / roster (admin) ---------- */
app.get('/api/admin/shifts', adminAuth, async (_q, res) => {
  const { rows } = await pool.query('SELECT s.*, w.name AS worker_name FROM shifts s JOIN workers w ON w.id=s.worker_id ORDER BY s.worker_id, s.weekday, s.start_min')
  const { weekday, minutes } = istNow()
  res.json(rows.map((s) => ({
    id: s.id, worker_id: s.worker_id, worker_name: s.worker_name, zone_id: s.zone_id, weekday: s.weekday,
    start: toHHMM(s.start_min), end: toHHMM(s.end_min),
    on_now: s.weekday === weekday && s.start_min <= minutes && minutes < s.end_min,
  })))
})
app.post('/api/admin/shifts', adminAuth, async (req, res) => {
  const b = req.body || {}
  if (!b.worker_id) return res.status(400).json({ error: 'Worker is required' })
  const days = Array.isArray(b.weekdays) && b.weekdays.length ? b.weekdays : [b.weekday]
  const sm = toMin(b.start), em = toMin(b.end)
  if (!(em > sm)) return res.status(400).json({ error: 'End time must be after start time' })
  let added = 0
  for (const d of days) {
    if (!Number.isFinite(Number(d))) continue
    await pool.query('INSERT INTO shifts (worker_id,zone_id,weekday,start_min,end_min) VALUES ($1,$2,$3,$4,$5)',
      [Number(b.worker_id), b.zone_id ? Number(b.zone_id) : null, Number(d), sm, em]); added++
  }
  res.status(201).json({ ok: true, added })
})
app.delete('/api/admin/shifts/:id', adminAuth, async (req, res) => { await pool.query('DELETE FROM shifts WHERE id=$1', [Number(req.params.id)]); res.json({ ok: true }) })

/* ---------- shift PLANS + attendance (admin control) ---------- */
app.get('/api/admin/shift-defs', adminAuth, async (_q, res) => {
  const { rows } = await pool.query('SELECT * FROM shift_defs ORDER BY sort, start_min')
  res.json(rows.map((s) => ({
    id: s.id, code: s.code, name: s.name, start: toHHMM(s.start_min), end: toHHMM(s.end_min),
    graceMin: s.grace_min, penalty: s.penalty, minGWeekday: s.min_g_weekday, minGWeekend: s.min_g_weekend, active: !!s.active,
  })))
})
app.put('/api/admin/shift-defs/:id', adminAuth, async (req, res) => {
  const b = req.body || {}
  const sm = b.start != null ? toMin(b.start) : null
  const em = b.end != null ? toMin(b.end) : null
  if (sm != null && em != null && !(em > sm)) return res.status(400).json({ error: 'End time must be after start time' })
  await pool.query(
    `UPDATE shift_defs SET name=COALESCE($1,name), start_min=COALESCE($2,start_min), end_min=COALESCE($3,end_min),
       grace_min=COALESCE($4,grace_min), penalty=COALESCE($5,penalty), min_g_weekday=COALESCE($6,min_g_weekday),
       min_g_weekend=COALESCE($7,min_g_weekend), active=COALESCE($8,active) WHERE id=$9`,
    [b.name ?? null, sm, em, b.graceMin ?? null, b.penalty ?? null, b.minGWeekday ?? null, b.minGWeekend ?? null,
      b.active === undefined ? null : !!b.active, Number(req.params.id)])
  res.json({ ok: true })
})
app.get('/api/admin/attendance', adminAuth, async (req, res) => {
  const day = req.query.day || istDateStr(Date.now())
  const { rows } = await pool.query(
    `SELECT a.*, w.name worker_name, sd.name shift_name FROM attendance a
       JOIN workers w ON w.id=a.worker_id LEFT JOIN shift_defs sd ON sd.id=a.shift_def_id
     WHERE a.day=$1 ORDER BY a.check_in DESC NULLS LAST`, [day])
  res.json({
    day,
    rows: rows.map((a) => ({
      workerId: a.worker_id, workerName: a.worker_name, shift: a.shift_name || '—',
      checkIn: a.check_in ? istClock(a.check_in) : '', checkOut: a.check_out ? istClock(a.check_out) : '',
      onTime: a.on_time, lateMinutes: a.late_minutes || 0, penalty: a.penalty || 0, minG: a.min_g || 0,
      site: a.site_name || '—', geoBreaches: a.geo_breaches || 0, geoOutside: !!a.geo_outside,
    })),
  })
})

/* ---------- apartments / geofence sites (admin control) ---------- */
app.get('/api/admin/sites', adminAuth, async (_q, res) => {
  const { rows } = await pool.query(
    `SELECT s.*, (SELECT COUNT(*)::int FROM workers w WHERE w.site_id = s.id) AS assigned FROM worker_sites s ORDER BY s.id`)
  res.json(rows.map((s) => ({ id: s.id, name: s.name, address: s.address || '', lat: s.lat, lng: s.lng, radius: s.radius, active: !!s.active, assigned: s.assigned })))
})
app.post('/api/admin/sites', adminAuth, async (req, res) => {
  const b = req.body || {}
  if (!b.name || b.lat == null || b.lng == null) return res.status(400).json({ error: 'name, lat, lng are required' })
  const { rows } = await pool.query('INSERT INTO worker_sites (name,address,lat,lng,radius) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [b.name, b.address || '', Number(b.lat), Number(b.lng), Number(b.radius) || 300])
  res.status(201).json({ ok: true, id: rows[0].id })
})
app.put('/api/admin/sites/:id', adminAuth, async (req, res) => {
  const b = req.body || {}
  await pool.query(
    `UPDATE worker_sites SET name=COALESCE($1,name), address=COALESCE($2,address), lat=COALESCE($3,lat),
       lng=COALESCE($4,lng), radius=COALESCE($5,radius), active=COALESCE($6,active) WHERE id=$7`,
    [b.name ?? null, b.address ?? null, b.lat ?? null, b.lng ?? null, b.radius ?? null,
      b.active === undefined ? null : !!b.active, Number(req.params.id)])
  res.json({ ok: true })
})
app.delete('/api/admin/sites/:id', adminAuth, async (req, res) => {
  await pool.query('UPDATE workers SET site_id=NULL WHERE site_id=$1', [Number(req.params.id)])
  await pool.query('DELETE FROM worker_sites WHERE id=$1', [Number(req.params.id)])
  res.json({ ok: true })
})
// Assign (or clear) a worker's apartment for their shifts.
app.post('/api/admin/workers/:id/site', adminAuth, scopeWorker, async (req, res) => {
  const siteId = req.body?.siteId ? Number(req.body.siteId) : null
  await pool.query('UPDATE workers SET site_id=$1 WHERE id=$2', [siteId, Number(req.params.id)])
  res.json({ ok: true })
})

/* Internal: on-shift qualified workers now (for auto-assign / live-ops). */
app.get('/internal/on-shift', internalOnly, async (req, res) => {
  const zoneId = req.query.zone_id ? Number(req.query.zone_id) : null
  const names = String(req.query.services || '').split(',').map((s) => s.toLowerCase().trim()).filter(Boolean)
  const { weekday, minutes } = istNow()
  const vals = [weekday, minutes]
  let sql = `SELECT DISTINCT w.* FROM workers w JOIN shifts s ON s.worker_id=w.id
    WHERE w.status='active' AND s.weekday=$1 AND s.start_min<=$2 AND $2 < s.end_min`
  if (zoneId) { vals.push(zoneId); sql += ` AND (s.zone_id=$3 OR s.zone_id IS NULL)` }
  const rows = (await pool.query(sql, vals)).rows
  const qualified = rows.filter((w) => { const set = serviceSet(w); return names.length === 0 || names.some((n) => set.has(n)) })
  res.json({ count: qualified.length, workers: qualified.map((w) => ({ id: w.id, name: w.name, rating: w.rating, available: !!w.available, zone_id: w.zone_id, last: w.last_lat != null ? { lat: w.last_lat, lng: w.last_lng } : null })) })
})

async function patchWorker(id, b, res) {
  const w = await getWorker(id); if (!w) { res.status(404); return { error: 'Not found' } }
  // The phone is the login identity, so it can't be moved onto a number another worker already
  // owns — that would leave one of them unable to sign in.
  if (b.phone && String(b.phone).trim() !== w.phone) {
    const dup = await pool.query('SELECT name FROM workers WHERE phone=$1 AND id<>$2', [String(b.phone).trim(), id])
    if (dup.rows.length) { res.status(409); return { error: `That mobile number already belongs to ${dup.rows[0].name}` } }
  }
  // Keep `name` in step with first/last when either is supplied — `name` is what bookings,
  // dispatch and both apps read, so it must never drift from the parts the admin edited.
  const first = b.first_name ?? w.first_name
  const last = b.last_name ?? w.last_name
  const derived = [first, last].filter(Boolean).join(' ').trim()
  const name = (b.first_name !== undefined || b.last_name !== undefined) && derived ? derived : (b.name ?? w.name)
  await pool.query(
    `UPDATE workers SET name=$1, phone=$2, email=$3, city=$4, services=$5::jsonb, status=$6, verified=$7,
       bank_status=COALESCE($8,bank_status), zone_id=$9, designation=COALESCE($10,designation),
       first_name=$11, last_name=$12, alternate_mobile=$13, worker_category=$14, employment_type=$15,
       joining_date=$16, recruiter=$17, referral_source=$18
     WHERE id=$19`, [
      name, b.phone ?? w.phone, b.email ?? w.email, b.city ?? w.city,
      JSON.stringify(b.services ?? w.services), b.status ?? w.status,
      b.verified === undefined ? w.verified : !!b.verified, b.bank_status ?? null,
      b.zone_id === undefined ? w.zone_id : (b.zone_id ? Number(b.zone_id) : null), b.designation ?? null,
      first ?? null, last ?? null, b.alternate_mobile ?? w.alternate_mobile,
      b.worker_category ?? w.worker_category, b.employment_type ?? w.employment_type,
      b.joining_date ?? w.joining_date, b.recruiter ?? w.recruiter, b.referral_source ?? w.referral_source, id])
  const profPatch = {}
  if (b.personal && typeof b.personal === 'object') profPatch.personal = { ...(w.profile?.personal || {}), ...b.personal }
  if (b.skillLevels && typeof b.skillLevels === 'object') profPatch.skillLevels = { ...(w.profile?.skillLevels || {}), ...b.skillLevels }
  if (Object.keys(profPatch).length) await mergeProfile(id, profPatch)
  return rowToWorker(await getWorker(id))
}

/* ---------- internal (service-to-service) ---------- */
app.get('/internal/workers', internalOnly, async (req, res) => res.json({ stats: await workerStats(), workers: await listWorkers(req.query) }))
// Real worker-status breakdown (online / busy / offline) for the admin zone dashboards.
app.get('/internal/worker-status', internalOnly, async (req, res) => {
  const zoneId = req.query.zone_id != null && req.query.zone_id !== '' ? Number(req.query.zone_id) : null
  const where = zoneId != null ? 'WHERE zone_id=$1' : ''
  const params = zoneId != null ? [zoneId] : []
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE available AND status='active' AND offered_booking IS NULL)::int AS online,
       COUNT(*) FILTER (WHERE offered_booking IS NOT NULL)::int AS busy,
       COUNT(*) FILTER (WHERE NOT available AND status='active')::int AS offline
     FROM workers ${where}`, params)
  const r = rows[0]
  res.json({ total: r.total, online: r.online, busy: r.busy, offline: r.offline, onBreak: 0 })
})
app.get('/internal/workers/active-for', internalOnly, async (req, res) => {
  const names = String(req.query.services || '').split(',').map((s) => s.toLowerCase().trim()).filter(Boolean)
  const rows = (await pool.query("SELECT services, available FROM workers WHERE status='active'")).rows
  const qualified = rows.filter((w) => { const set = serviceSet(w); return names.some((n) => set.has(n)) })
  // available/onlineCount = qualified workers online now (for instant); count = all active qualified
  // workers (for future scheduled slots, where being online right now doesn't matter).
  res.json({ available: qualified.some((w) => w.available), count: qualified.length, onlineCount: qualified.filter((w) => w.available).length })
})
// Active workers who offer a service — for the customer "Worker Assignment" screen (list only).
app.get('/internal/workers/for-service', internalOnly, async (req, res) => {
  const names = String(req.query.services || '').split(',').map((s) => s.toLowerCase().trim()).filter(Boolean)
  const rows = (await pool.query("SELECT id, name, services, rating, jobs, avatar, available, last_lat, last_lng FROM workers WHERE status='active' ORDER BY jobs DESC NULLS LAST, rating DESC")).rows
  const qualified = rows.filter((w) => { const set = serviceSet(w); return names.some((n) => set.has(n)) })
  res.json(qualified.slice(0, 12).map((w) => ({ id: w.id, name: w.name, rating: w.rating || 4.5, jobs: w.jobs || 0, avatar: w.avatar || null, online: !!w.available, lat: w.last_lat, lng: w.last_lng })))
})
app.get('/internal/workers/:id', internalOnly, async (req, res) => { const w = await getWorker(Number(req.params.id)); return w ? res.json(rowToWorker(w)) : res.status(404).json({ error: 'Not found' }) })
app.get('/internal/workers/:id/service-set', internalOnly, async (req, res) => {
  const w = await getWorker(Number(req.params.id))
  res.json({
    services: w ? [...serviceSet(w)] : [], name: w?.name, rating: w?.rating, available: !!w?.available,
    status: w?.status, offered_booking: w?.offered_booking, zone_id: w?.zone_id ?? null,
    last: w?.last_lat != null ? { lat: w.last_lat, lng: w.last_lng } : null,
    // Phase 11: the worker's own weekly hours cap. Dispatch already calls this on every request,
    // so the limit rides along rather than costing another round trip.
    workLimit: w ? await workLimit(w) : { maxWeeklyHours: null, hoursThisWeek: null, capped: false },
    // Coverage. When allowOutsideRadius is false these become a real filter in dispatch, which is
    // what makes "only jobs in your zone" true rather than a hopeful label on a screen.
    storeId: w?.store_id ?? null,
    jobRadiusKm: w?.job_radius_km ?? null,
    allowOutsideRadius: w?.allow_outside_radius !== false,
  })
})
app.post('/internal/workers/:id/offered', internalOnly, async (req, res) => {
  const wid = Number(req.params.id)
  const bookingId = req.body?.bookingId ?? null
  await pool.query('UPDATE workers SET offered_booking=$1 WHERE id=$2', [bookingId, wid])
  // Log every offer so the acceptance rate has a denominator. Re-offering the same booking
  // to the same worker must not create a second row, hence ON CONFLICT DO NOTHING.
  if (bookingId != null) {
    await pool.query(
      `INSERT INTO job_offers (worker_id, booking_id) VALUES ($1, $2)
       ON CONFLICT (worker_id, booking_id) DO NOTHING`,
      [wid, Number(bookingId)],
    ).catch((e) => console.error('[worker] job_offers insert:', e?.message || e))
  }
  res.json({ ok: true })
})

// Records how a worker responded to an offer ('accepted' | 'declined'). Called by dispatch.
// Only ever moves a row off 'offered', so a late duplicate can't rewrite a real response.
app.post('/internal/workers/:id/offer-outcome', internalOnly, async (req, res) => {
  const wid = Number(req.params.id)
  const bookingId = Number(req.body?.bookingId)
  const outcome = String(req.body?.outcome || '')
  if (!bookingId || !['accepted', 'declined'].includes(outcome)) return res.status(400).json({ ok: false, error: 'bad outcome' })
  await pool.query(
    `UPDATE job_offers SET outcome=$1, responded_at=now()
      WHERE worker_id=$2 AND booking_id=$3 AND outcome='offered'`,
    [outcome, wid, bookingId],
  ).catch((e) => console.error('[worker] offer-outcome:', e?.message || e))
  res.json({ ok: true })
})
app.post('/internal/workers/:id/location', internalOnly, async (req, res) => { await pool.query('UPDATE workers SET last_lat=$1, last_lng=$2 WHERE id=$3', [req.body?.lat, req.body?.lng, Number(req.params.id)]); res.json({ ok: true }) })
app.get('/internal/workers/:id/public-profile', internalOnly, async (req, res) => { const w = await getWorker(Number(req.params.id)); res.json(w ? { id: w.id, name: w.name, rating: w.rating, jobs: w.jobs, phone: w.phone, avatar: w.avatar, verified: !!w.verified, city: w.city, services: Array.isArray(w.services) ? w.services : [] } : null) })
app.patch('/internal/workers/:id', internalOnly, async (req, res) => res.json(await patchWorker(Number(req.params.id), req.body || {}, res)))
// Wallet service adjusts the balance snapshot (deltas) after ledger changes.
app.post('/internal/workers/:id/balance', internalOnly, async (req, res) => {
  const b = req.body || {}
  await pool.query(`UPDATE workers SET balance=balance+$1, pending=pending+$2, hold=hold+$3, withdrawn=withdrawn+$4, advance_outstanding=advance_outstanding+$5, earnings=earnings+$6, jobs=jobs+$7 WHERE id=$8`,
    [b.balance || 0, b.pending || 0, b.hold || 0, b.withdrawn || 0, b.advance_outstanding || 0, b.earnings || 0, b.jobs || 0, Number(req.params.id)])
  const w = await getWorker(Number(req.params.id))
  res.json({ ok: true, wallet: walletDto(w) })
})

// Admin bank approve/reject (routes via gateway /api/admin/workers/:id/bank/*).
/* ---------- admin skill review (Phase 6 claim -> Phase 9 approval) ----------
 * Approving is what actually GRANTS the capability: it adds the service to workers.services, which
 * is what dispatch matches on. Rejecting removes it. The worker's claim alone never does either.
 * The admin can also approve at a DIFFERENT level than claimed — that's the point of a review.
 */
app.post('/api/admin/workers/:id/skills/review', adminAuth, scopeWorker, async (req, res) => {
  const id = Number(req.params.id)
  const service = String(req.body?.service || '').trim()
  const approve = !!req.body?.approve
  const reason = String(req.body?.reason || '').trim()
  const level = String(req.body?.level || '').trim()
  if (!approve && !reason) return res.status(400).json({ error: 'A rejection reason is required' })
  if (level && !SKILL_LEVELS.includes(level)) return res.status(400).json({ error: 'Invalid level' })

  const w = await getWorker(id)
  if (!w) return res.status(404).json({ error: 'Worker not found' })
  const skills = w.profile?.skills || {}
  if (!skills[service]) return res.status(404).json({ error: 'That skill was not claimed' })

  skills[service] = {
    ...skills[service],
    ...(level ? { level } : {}),
    status: approve ? 'Approved' : 'Rejected',
    reason: approve ? '' : reason,
    reviewedBy: req.admin?.name || req.admin?.email || 'Admin',
    reviewedAt: new Date().toISOString(),
  }
  await mergeProfile(id, { skills })

  // The live capability set follows the decision — this is the only thing dispatch sees.
  const set = new Set(w.services || [])
  if (approve) set.add(service); else set.delete(service)
  await pool.query('UPDATE workers SET services=$1::jsonb WHERE id=$2', [JSON.stringify([...set]), id])

  publishEvent(REDIS_URL, 'worker.notify', {
    workerId: id,
    title: approve ? 'Skill approved' : 'Skill not approved',
    body: approve ? `You can now be assigned ${service} jobs (${skills[service].level}).` : `${service} was not approved: ${reason}`,
  })
  const who = req.admin?.name || req.admin?.email || 'Admin'
  publishEvent(REDIS_URL, 'activity', { actorType: 'admin', actorName: who, action: 'skills.review', entityType: 'worker', entityId: id, detail: `${approve ? 'Approved' : 'Rejected'} ${service} for ${w.name}${approve ? ` (${skills[service].level})` : ` — ${reason}`}` })
  res.json({ ok: true, ...rowToWorker(await getWorker(id)) })
})

/* ---------- admin KYC document review ----------
 * The counterpart to bank/approve|reject below. Until now nothing anywhere wrote
 * worker_documents.status, so the admin panel's Verified/Rejected badges were unreachable and a
 * document sat on 'Pending' forever.
 */
app.get('/api/admin/workers/:id/documents/:docId/url', adminAuth, scopeWorker, async (req, res) => {
  const d = (await pool.query('SELECT storage_key FROM worker_documents WHERE id=$1 AND worker_id=$2', [Number(req.params.docId), Number(req.params.id)])).rows[0]
  if (!d?.storage_key) return res.status(404).json({ ok: false, error: 'No file for this document' })
  res.json({ ok: true, url: await signedGetUrl(d.storage_key) })
})
app.post('/api/admin/workers/:id/documents/:docId/review', adminAuth, scopeWorker, async (req, res) => {
  const wid = Number(req.params.id), docId = Number(req.params.docId)
  const approve = !!req.body?.approve
  const reason = String(req.body?.reason || '').trim()
  if (!approve && !reason) return res.status(400).json({ ok: false, error: 'A rejection reason is required' })
  const who = req.admin?.name || req.admin?.email || 'Admin'
  const { rows } = await pool.query(
    `UPDATE worker_documents SET status=$3, reviewed_by=$4, reviewed_at=now(), reject_reason=$5
     WHERE id=$1 AND worker_id=$2 RETURNING name`,
    [docId, wid, approve ? 'Verified' : 'Rejected', who, approve ? null : reason])
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Document not found' })
  const w = await getWorker(wid)
  // worker_notifications lives in the wallet service's DB, so this goes over the bus rather than
  // reaching across databases. A rejection MUST tell the worker why, or they can't fix it.
  publishEvent(REDIS_URL, 'worker.notify', {
    workerId: wid,
    title: approve ? 'Document verified' : 'Document rejected',
    body: approve ? `Your ${rows[0].name} has been verified.` : `Your ${rows[0].name} was rejected: ${reason}`,
  })
  publishEvent(REDIS_URL, 'activity', { actorType: 'admin', actorName: who, action: 'kyc.review', entityType: 'worker', entityId: wid, detail: `${approve ? 'Verified' : 'Rejected'} ${rows[0].name} for ${w?.name || `worker ${wid}`}${approve ? '' : ` — ${reason}`}` })
  res.json({ ok: true, documents: (await documents(wid)).map((d) => ({ id: d.id, name: d.name, status: d.status })) })
})

app.post('/api/admin/workers/:id/bank/approve', adminAuth, scopeWorker, async (req, res) => { await pool.query("UPDATE workers SET bank_status='Verified' WHERE id=$1", [Number(req.params.id)]); res.json({ ok: true }) })
app.post('/api/admin/workers/:id/bank/reject', adminAuth, scopeWorker, async (req, res) => { await pool.query("UPDATE workers SET bank_status='Rejected' WHERE id=$1", [Number(req.params.id)]); res.json({ ok: true }) })

/* ---------- events ---------- */
// Result of the RazorpayX bank-account validation (penny-drop) kicked off on bank save.
async function applyBankVerification(workerId, ok, data = {}) {
  if (!workerId) return
  const status = ok ? 'Verified' : 'Rejected'
  await pool.query('UPDATE workers SET bank_status=$1 WHERE id=$2', [status, workerId])
  await mergeProfile(workerId, { bankVerification: { status, registeredName: data.registeredName || '', nameMatch: data.nameMatch ?? null, reason: data.reason || '', at: new Date().toISOString() } })
  const detail = ok
    ? `Bank verified${data.registeredName ? ' — ' + data.registeredName : ''}${data.nameMatch === false ? ' (name mismatch — review)' : ''}`
    : `Bank verification failed (${data.reason || 'invalid account'})`
  publishEvent(REDIS_URL, 'activity', { actorType: 'system', actorName: 'Payments', action: 'kyc.bank.verify', entityType: 'worker', entityId: workerId, detail })
}

subscribeEvents(REDIS_URL, 'worker', async (type, data) => {
  if (type === 'settings.updated') return invalidateSettings()
  if (type === 'bank.verified') return applyBankVerification(data.workerId, true, data)
  if (type === 'bank.verify.failed') return applyBankVerification(data.workerId, false, data)
  // Compensation Rule Engine — job_completed trigger. Runs alongside the wallet's own settlement
  // (its own consumer group), evaluates every active job rule, and credits eligible payouts.
  if (type === 'booking.completed' && data.booking) return evaluateJobRules(data.booking).catch((e) => console.error('[worker] job-rule eval failed:', e.message))
})


// Daily snapshot of each active worker's metrics, so the Worker Details KPI tiles can show a
// real period-over-period trend (▲/▼) instead of a faked delta. One row per worker per day.
async function snapshotMetrics() {
  const workers = (await pool.query("SELECT id, rating, earnings FROM workers WHERE status='active'")).rows
  const today = new Date().toISOString().slice(0, 10)
  const now = new Date(), dayMs = 86400000
  const within = (ts, n) => ts && (now - new Date(ts)) <= n * dayMs
  for (const wk of workers) {
    const bk = await tryGet(BOOKING_URL, `/api/internal/bookings?worker_id=${wk.id}`, [])
    const completed = bk.filter((b) => b.status === 'completed').length
    const cancelled = bk.filter((b) => b.status === 'cancelled').length
    await pool.query(
      `INSERT INTO worker_metric_snapshots (worker_id,snap_date,week_jobs,month_jobs,completion_pct,cancellation_pct,rating,earnings)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (worker_id,snap_date) DO UPDATE SET
       week_jobs=EXCLUDED.week_jobs, month_jobs=EXCLUDED.month_jobs, completion_pct=EXCLUDED.completion_pct,
       cancellation_pct=EXCLUDED.cancellation_pct, rating=EXCLUDED.rating, earnings=EXCLUDED.earnings`,
      [wk.id, today, bk.filter((b) => within(b.created, 7)).length, bk.filter((b) => within(b.created, 30)).length,
        bk.length ? Math.round((completed / bk.length) * 100) : 0, bk.length ? Math.round((cancelled / bk.length) * 100) : 0,
        wk.rating || 0, wk.earnings || 0])
  }
  console.log(`[worker] metric snapshot captured for ${workers.length} workers (${today})`)
}
function scheduleMetricSnapshots() {
  setInterval(() => snapshotMetrics().catch((e) => console.error('[worker] snapshot error:', e.message)), 24 * 3600 * 1000)
  setTimeout(() => snapshotMetrics().catch((e) => console.error('[worker] snapshot error:', e.message)), 25000)
}

init()
  .then(async () => {
    // Create the KYC bucket if it isn't there. Non-fatal: the service still serves everything
    // else, and the upload endpoint returns a clear 503 rather than accepting files it can't store.
    await ensureBucket().catch((e) => console.error('[worker] storage init failed:', e.message))
    await ensurePublicBucket().catch((e) => console.error('[worker] public storage init failed:', e.message))
    app.listen(PORT, () => console.log(`[worker] service on http://localhost:${PORT}`))
    scheduleMetricSnapshots()
  })
  .catch((e) => { console.error('[worker] failed to start:', e.message); process.exit(1) });
