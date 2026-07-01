# HomeHelp Customer App — Backend API

Express + Socket.IO server backed by **SQLite** (`homehelp.db`, via Node's built-in
`node:sqlite`). Base URL is `http://<LAN-IP>:4000` (baked into the Android build as
`VITE_API_URL`). All JSON. Auth endpoints return a bearer token (`demo-<userId>`) that
must be sent as `Authorization: Bearer <token>` on protected routes (marked 🔒).

## Database tables
- **users** — `id, phone, name, email, provider, avatar, country, city, location, wallet, rating, created`
- **addresses** — `id, user_id, label, line, house, apartment, street, landmark, city, pincode, is_default`
- **services** — `id, name, icon, price, category, available, sort`
- **bookings** — `id, ref, user_id, type, freq, note, date, time, address, payment, payment_status, items(json), duration, subtotal, fee, tax, discount, coupon, total, status, service_otp, pro_name, pro_rating, rating, review, photo, cancel_reason, cancel_fee, refund, created`
- **transactions** — `id, user_id, type, title, amount, balance, ref, created`
- **tickets** — `id, user_id, category, message, status, ref, created`

---

## Health
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | – | `{ ok: true }` |

## Auth
| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| POST | `/api/auth/request-otp` | – | `{ phone }` | Sends OTP (dev OTP is always `4321`). Returns `{ ok, devOtp }`. |
| POST | `/api/auth/verify-otp` | – | `{ phone, otp }` | Verifies OTP, **finds or creates** the user by phone. Returns `{ token, user }`. New users come back with an empty `name` → app routes them to the name step. |
| POST | `/api/auth/google` | – | `{ credential }` or `{ demo: true }` | Google sign-in (decodes the JWT credential). Returns `{ token, user }`. |

## Me / Profile
| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| GET | `/api/me` | 🔒 | – | `{ user, addresses }` |
| PATCH | `/api/me` | 🔒 | `{ name?, email?, phone?, country?, city?, location? }` | Updates profile. When `city`/`location` is set and the user has no address, a default **Home** address is created from the location. Returns `{ user }`. |

## Addresses
| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| GET | `/api/addresses` | 🔒 | – | List addresses (default first). |
| POST | `/api/addresses` | 🔒 | `{ label, house, apartment, street, landmark, city, pincode }` | Add address (builds `line` if not given). |
| PATCH | `/api/addresses/:id/default` | 🔒 | – | Make address default. |
| DELETE | `/api/addresses/:id` | 🔒 | – | Delete address. |

## Home content
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/home` | – | `{ referral, trust, instantEta }` — referral card, trust badges, instant ETA (mins). |
| GET | `/api/referral` | – | `{ code, reward, label }` for the referral banner. |

## Notifications & favourites
| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| GET | `/api/notifications` | 🔒 | – | Booking updates + offers + cashback notifications. |
| GET | `/api/favourites` | 🔒 | – | List of favourited service ids. |
| POST | `/api/favourites/:id` | 🔒 | – | Add a favourite → updated list. |
| DELETE | `/api/favourites/:id` | 🔒 | – | Remove a favourite → updated list. |

## Services & catalogue
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/services` | – | `{ categories, services }`. Each service has `id,name,icon,price,category,available,image`. |
| GET | `/api/services/:id` | – | Service detail: `description, image, includes` (trained-to), `excludes` (not-included), `note`, `terms` (T&C array), `durations` (each with `price` + struck `original`), `rating`, `reviews`. |
| PATCH | `/api/services/:id` | – | Admin: update `price`/`available`; broadcasts `services:update`. |

## Payment gateway (mock)
| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| GET | `/api/payment/methods` | – | – | Grouped methods (UPI: PhonePe/GPay/Paytm/BHIM, Cards, Net Banking, Wallet, Cash). |
| POST | `/api/payment/order` | 🔒 | `{ amount }` | Create a gateway order → `{ orderId, amount, currency }`. |
| POST | `/api/payment/charge` | 🔒 | `{ orderId, method, amount }` | Authorise/capture → `{ status:'paid', txnId, method, amount }`. Wallet method checks balance. |

Booking settlement: `wallet` reduces the in-app balance; external methods (UPI/card/net-banking) are recorded as `paid` without touching the wallet; `cash` stays `pending` until completion.

## Coupons & quote
| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| GET | `/api/coupons` | – | – | Available coupons. |
| POST | `/api/coupons/validate` | – | `{ code, subtotal }` | Validate a coupon → `{ code, discount, label }`. |
| POST | `/api/quote` | – | `{ items:[{id,durationId}], coupon? }` | Authoritative price breakdown (subtotal, fee, tax, discount, total). |

## Wallet
| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| GET | `/api/wallet` | 🔒 | – | `{ balance, cashback, transactions }`. |
| POST | `/api/wallet/add` | 🔒 | `{ amount }` | Top up wallet. |

## Support
| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| GET | `/api/support/reasons` | – | – | Cancellation reasons. |
| GET | `/api/tickets` | 🔒 | – | List support tickets. |
| POST | `/api/tickets` | 🔒 | `{ category, message }` | Create a support ticket. |

## Bookings
| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| GET | `/api/bookings` | 🔒 | – | List the user's bookings. |
| GET | `/api/bookings/:id` | 🔒 | – | Single booking (owner only). |
| POST | `/api/bookings` | 🔒 | `{ items, type, freq?, note?, date?, time?, address?, payment?, coupon? }` | Create a booking; prices server-side, debits wallet for non-cash. |
| POST | `/api/bookings/:id/track` | 🔒 | – | Start the live tracking simulation. |
| POST | `/api/bookings/:id/verify-otp` | 🔒 | `{ otp }` | Customer gives the pro the service OTP → status `in_progress`. |
| POST | `/api/bookings/:id/complete` | 🔒 | – | Mark completed (settles cash payment). |
| POST | `/api/bookings/:id/reschedule` | 🔒 | `{ date, time }` | Reschedule. |
| POST | `/api/bookings/:id/cancel` | 🔒 | `{ reason }` | Cancel (computes fee + refund). |
| POST | `/api/bookings/:id/review` | 🔒 | `{ rating, review?, photo? }` | Rate the completed job. |

## Real-time (Socket.IO)
Connect to the same base URL.
- **Server → client:** `services:init`, `services:update`, `booking:update` (status, distance, ETA, position).
- **Client → server:** `booking:join <id>`, `booking:leave <id>`.

Booking lifecycle: `confirmed → worker_assigned → on_the_way → arrived → in_progress → completed` (or `cancelled`).

---

## Page → backend API map
| Screen | Route | APIs used |
|---|---|---|
| Login | `/login` | `POST /api/auth/request-otp`, `POST /api/auth/verify-otp`, `POST /api/auth/google` |
| Name onboarding | `/onboarding/name` | `PATCH /api/me` |
| Location onboarding | `/onboarding/location` | `PATCH /api/me` (auto-creates default address) |
| Home | `/home` | `GET /api/services`, `GET /api/home`, `GET /api/me`, `GET /api/bookings` |
| Service sheet | `/service/:id` | `GET /api/services/:id`, `GET /api/services` |
| Book / duration | `/book/:id` | `GET /api/services/:id`, `GET /api/home`, `POST /api/bookings` |
| Track | `/track/:id` | `GET /api/bookings/:id`, `POST .../track`, `POST .../verify-otp`, `POST .../complete`, socket `booking:update` |
| Bookings | `/bookings` | `GET /api/bookings` |
| Wallet | `/wallet` | `GET /api/wallet`, `POST /api/wallet/add` |
| Profile | `/profile` | `GET /api/me`, `GET /api/coupons`, `GET /api/bookings` |
| Addresses | `/addresses` | `GET/POST/PATCH/DELETE /api/addresses` |
| Support | `/support` | `GET /api/support/reasons`, `GET/POST /api/tickets` |
| Reschedule / Cancel / Rate | `/reschedule|cancel|rate/:id` | `POST /api/bookings/:id/reschedule|cancel|review` |

## App flow (Snabbit-style)
1. **Login** — phone + OTP (or Google).
2. **Name** (`/onboarding/name`) — new users enter their name (+ optional email).
3. **Location** (`/onboarding/location`) — GPS detect or search; saved to the user and seeded as the default address.
4. **Home** — "home ▾" + address, Schedule/Instant hero, "One Expert who can do it all" photo grid, ₹150 referral banner, "Experts Vetted for Quality" trust seal.
5. **Service sheet** (`/service/:id`) — "What is included?": trained-to ✓ list, not-included ✗ list, equipment note, **Schedule** / **Book Instant**.
6. **Book** (`/book/:id`) — "Arrives in 5 min ⚡", duration grid (discounted + struck prices), pay selector, **₹X Pay Now →**.
7. **Track** — live expert tracking → rate.
