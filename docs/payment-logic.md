# Payment, Incentive & Bonus Logic

The exact rules for every rupee a worker earns or loses. This is the reference to
check any payment against. It documents what the code actually does, not intent.

**Two things hold everywhere:**

- **All money is whole rupees.** Every amount is `Math.round(...)` to the nearest
  rupee. There are no paise.
- **Every credit is idempotent.** `worker_income` has a unique index on
  `(worker_id, ref_id)`. A redelivered event or a re-approval inserts nothing the
  second time, so nobody is ever paid twice for the same thing. Each event below
  lists its `ref_id` key.

---

## Two payment engines

| Engine | When it pays | What it pays |
|---|---|---|
| **Wallet** | Immediately, per event | Per-job share, per-job incentive, on-time bonus, cancellation comp, late penalties |
| **Payroll** | Monthly, after an admin approves the run | Fixed/hybrid salary, attendance bonus, quality bonus, statutory deductions |

Nothing in payroll moves money until the run is **approved**. Building a draft
computes the numbers; approval credits them.

---

## The commission rate (per-job share)

The rate is resolved in this order (a worker has **either** a plan **or** a manual
rate — the two are mutually exclusive, enforced when saved):

1. **On a salary plan** → the plan's `commission_percent`.
2. **Manual override set** (`workers.commission_percent`) → that value.
3. **Neither** → the platform default (`settings.commission_percent`, default 20).

A **fixed**-salary worker has **no per-job share at all** (`paysPerJob = false`).
Their money comes only from payroll — paying a share too would double-pay them.

---

## Income events

### 1. Per-job share — *wallet, on job completion*

The worker's cut of each completed job.

```
share = round( booking.total × (100 − commission) / 100 )
```

- **Who:** per-job and hybrid workers. Fixed workers get `share = 0`.
- **ref_id:** the booking id. Category `Job Earnings` (or `Job Completed` at ₹0
  for a fixed worker, labelled "covered by your salary").
- **Example:** ₹1,000 job at 20% commission → worker keeps **₹800**.

### 2. Per-job incentive — *wallet, on job completion*

A flat amount added to **every** completed job, from the worker's incentive plan.

```
credit = incentive_plan.per_job_amount   (if > 0)
```

- **Who:** any worker on an incentive plan — per-job, fixed **and** hybrid. It is
  separate from the share, so a fixed worker still earns it even though their share
  is ₹0.
- **ref_id:** `perjob-{bookingId}`. Category `Incentive`.

### 3. On-time start bonus — *wallet, when the job is started on time*

```
credit = ONTIME_INCENTIVE   (env, default ₹15)
```

- Paid when the worker starts the service (enters the customer OTP) within
  `START_WINDOW_MIN` (default 15 minutes) of accepting.
- **ref_id:** `ontime-{bookingId}`. Category `Incentive`.

### 4. Attendance bonus — tiered (Sitara) — *payroll, monthly*

Tiers live on the incentive plan (`attendance_tiers`: `[{ label, days, sundays,
amount }]`, ascending by amount). The worker earns the **single highest tier they
reach** — tiers do not stack.

```
worked_days    = distinct days that month with a check-in
worked_sundays = of those, how many were Sundays
tier is reached when:  worked_days ≥ tier.days
                  AND  worked_sundays ≥ tier.sundays
                  AND  rating ≥ tier_min_rating
credit = highest reached tier's amount
```

- **Who:** any worker on an incentive plan (per-job included).
- Absolute working days, not a percentage. Example (the Shakti defaults): Bronze
  ₹3,500 @ 25 days, Silver ₹4,500 @ 27 days, Gold ₹5,500 @ 28 days + 4 Sundays.
- A worker with 28 days but only 2 Sundays gets **Silver**, not Gold.
- This folds in the former standalone Shakti/Sitara scheduler — there is no
  longer a separate monthly cron; payroll is the single place it is paid.

### 5. Quality bonus — *payroll, monthly*

```
credit = incentive_plan.quality_bonus_amount
         (if rating ≥ quality_min_rating  AND  completed_jobs_this_month > 0)
```

- **Both** conditions are required. The rating is a lifetime figure, so the
  completed-job gate ties the bonus to real activity in the month being paid —
  a worker earns it only for a month they actually worked.
- **completed_jobs_this_month** = bookings with `status = completed` and
  `completed_at` in that month.
- **Who:** any worker on an incentive plan.

### 6. Fixed / hybrid salary — *payroll, monthly*

```
salary = basic + attendance_allowance + other_allowance
```

- Each amount is the **per-worker override** (`salary_basic` /
  `salary_attendance` / `salary_allowance`) if set, else the **plan's** value. A
  worker left untouched follows the plan; a hand-edit overrides just that worker.
- Paid only once the salary has **started** — a worker whose
  `salary_effective_from` is after the payroll month is skipped for salary (but
  still evaluated for bonuses).
- `attendance_allowance` is a **guaranteed** monthly amount, distinct from the
  conditional attendance *bonus* in the incentive plan.

### Manual bonuses — *not automatic*

`peak_hour_amount`, `referral_amount` and `festival_amount` are recorded on the
incentive plan but have **no automatic trigger**. The admin pays them by hand with
the Add Bonus action. They never post themselves.


---

## Deduction events

### Statutory — *payroll, monthly.* Rates come from Settings; we apply the admin's numbers.

| Deduction | Base | Formula | Condition |
|---|---|---|---|
| **PF** | `basic` (capped at `pf_wage_ceiling` if set) | `round(base × pf_percent / 100)` | `pf_applicable` and `pf_percent > 0` |
| **ESI** | `gross` | `round(gross × esi_percent / 100)` | `esi_applicable`, `esi_percent > 0`, and gross ≤ `esi_wage_ceiling` (or no ceiling) |
| **TDS** | `gross` | `round(gross × tds_percent / 100)` | `tds_applicable` and `tds_percent > 0` |

- **`gross` = basic + allowance + all incentives** on the payroll line.
- **TDS is a flat configured percentage, NOT a progressive slab calculation.**
- A deduction switched on for a worker but with **no rate set** deducts nothing and
  is **flagged** on the payroll line (`note`) rather than silently zeroed.

### Late-start penalty — *wallet, per job*

```
deduct = LATE_START_PENALTY   (env, default ₹15)
```

Applied when the worker does not start within `START_WINDOW_MIN`. Shift-late and
geofence penalties work similarly.

---

## Net pay (a payroll line)

```
gross           = basic + allowance + Σ incentives
total_deductions = Σ (PF, ESI, TDS)
net             = max(0, gross − total_deductions)
```

`net` can never go below 0. A line with `basic = 0` is **bonuses only** (a per-job
worker's attendance/quality bonus) — it is credited and labelled `Bonuses`
(category `Incentive`), not `Salary`.

A worker who earned nothing in a month (no salary, no bonus) produces **no line** —
they are absent from the run, not a ₹0 row.

---

## Idempotency keys (the `ref_id` per credit)

| Credit | `ref_id` |
|---|---|
| Per-job share | `{bookingId}` |
| Per-job incentive | `perjob-{bookingId}` |
| On-time bonus | `ontime-{bookingId}` |
| Cancellation comp | `comp-{bookingId}` |
| Payroll (salary or bonuses) | `payroll-{runId}-{workerId}` |

Re-running or re-approving anything with the same key credits **nothing** the
second time.

---

## Worked example

A **hybrid** worker: plan basic ₹6,000, no attendance allowance, ₹0 other, 50%
commission; on the Standard Incentive Plan (per-job ₹25, attendance ₹1,000 @ 90%,
quality ₹500 @ 4.5★); PF applicable at 12% (ceiling ₹15,000). In one month they
complete 40 jobs of ₹1,000 each, attend 96% of scheduled days, rating 4.7.

**Wallet (during the month), per ₹1,000 job:**
- Share: `round(1000 × 50/100)` = ₹500
- Per-job incentive: ₹25
- → ₹525 × 40 jobs = **₹21,000** credited live.

**Payroll (end of month):**
- Basic ₹6,000 + allowance ₹0 = ₹6,000 salary
- Attendance bonus: 96% ≥ 90% → +₹1,000
- Quality bonus: 4.7 ≥ 4.5 and 40 jobs > 0 → +₹500
- Gross = 6,000 + 1,000 + 500 = **₹7,500**
- PF = `round(min(6000, 15000) × 12/100)` = ₹720
- Net = 7,500 − 720 = **₹6,780** credited on approval.

**Total for the month: ₹21,000 (wallet) + ₹6,780 (payroll) = ₹27,780.**
