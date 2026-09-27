// Test data for the customer-app UI audit: a customer (with a name, city and address) who has one
// finished booking and one in progress, served by a fresh zone + on-shift expert. Same steps as the
// customer-crawl setup; `api(method, path, { token, body })` returns the parsed JSON.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function setupCustomer(api, SUP) {
  const RUN = Date.now().toString().slice(-5)
  const pin = `5${RUN}`, lat = 17.40, lng = 78.45
  const zone = await api('POST', '/api/admin/zones', { token: SUP, body: { name: `UI audit ${RUN}`, city: 'Hyderabad', state: 'Telangana', pincodes: pin, status: 'live',
    config: { services: ['mopping', 'kitchen', 'bathroom', 'dusting'], workingHours: { is247: true }, coverage: { lat, lng, radiusKm: 5 } } } })
  const wphone = `9${RUN}7777`
  const w = await api('POST', '/api/admin/workers', { token: SUP, body: { name: `Priya ${RUN}`, phone: wphone, city: 'Hyderabad', zone_id: zone.id, status: 'active', services: ['Sweeping & Mopping', 'Kitchen Cleaning', 'Dusting Furniture', 'Bathroom Cleaning'] } })
  await api('POST', '/api/admin/shifts', { token: SUP, body: { worker_id: w.id || w.worker?.id, zone_id: zone.id, weekdays: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' } })
  const wo = await api('POST', '/api/worker/auth/request-otp', { body: { phone: wphone } })
  const W = (await api('POST', '/api/worker/auth/verify', { body: { phone: wphone, otp: wo.devOtp || '1234' } })).token
  const cphone = `8${RUN}6666`
  const co = await api('POST', '/api/auth/request-otp', { body: { phone: cphone } })
  const C = (await api('POST', '/api/auth/verify-otp', { body: { phone: cphone, otp: co.devOtp || '4321' } })).token
  await api('PATCH', '/api/me', { token: C, body: { name: 'Asha Rao', city: 'Hyderabad', location: 'Banjara Hills, Hyderabad' } })
  const addr = (await api('POST', '/api/addresses', { token: C, body: { label: 'Home', house: 'Flat 402', street: 'Lotus Residency, Banjara Hills', city: 'Hyderabad', pincode: pin, lat, lng, makeDefault: true } })).id
  const book = () => api('POST', '/api/bookings', { token: C, body: { items: [{ id: 'mopping', durationId: '60m' }], type: 'instant', addressId: addr, pincode: pin, lat, lng, payment: 'cash' } })
  const runTo = async (id, finish) => {
    await api('POST', '/api/worker/status', { token: W, body: { state: 'Available' } })
    await api('POST', '/api/worker/heartbeat', { token: W, body: { battery: 80, network: 'wifi' } }) // dispatch only offers to experts whose app checked in lately
    for (let i = 0; i < 20 && (await api('GET', '/api/worker/jobs/offer', { token: W }))?.state !== 'PENDING'; i++) await sleep(1000)
    await api('POST', '/api/worker/jobs/accept', { token: W })
    await api('POST', '/api/worker/jobs/on-the-way', { token: W })
    await api('POST', '/api/worker/jobs/arrived', { token: W })
    const otp = (await api('GET', `/api/bookings/${id}`, { token: C })).service_otp
    await api('POST', '/api/worker/jobs/verify-otp', { token: W, body: { otp } })
    if (finish) { await api('POST', '/api/worker/jobs/end', { token: W, body: {} }); await sleep(1500) }
  }
  const done = await book(); await runTo(done.id, true)
  const live = await book(); await runTo(live.id, false)
  const user = (await api('GET', '/api/me', { token: C })).user
  return { token: C, user, done: done.id, live: live.id }
}
