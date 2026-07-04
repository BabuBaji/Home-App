// Async event bus over Redis Streams.
// - publishEvent(type, payload): append to the shared stream.
// - subscribeEvents(group, handler): each SERVICE passes its own group name, so every
//   service receives every event (fan-out). Within a group there is one consumer, so a
//   service processes each event exactly once and tracks its own cursor.
import Redis from 'ioredis'

const STREAM = process.env.EVENT_STREAM || 'homehelp:events'
let _pub = null

function pub(url) {
  if (!_pub) _pub = new Redis(url)
  return _pub
}

export async function publishEvent(redisUrl, type, payload = {}) {
  try {
    await pub(redisUrl).xadd(STREAM, '*', 'type', type, 'data', JSON.stringify(payload))
  } catch (e) {
    console.error('[events] publish failed', type, e.message)
  }
}

export function subscribeEvents(redisUrl, group, handler) {
  const r = new Redis(redisUrl)
  const consumer = `${group}-1`
  ;(async () => {
    // Start at '$' → only events published after this service comes up (reactions, not replay).
    try { await r.xgroup('CREATE', STREAM, group, '$', 'MKSTREAM') } catch { /* BUSYGROUP: group exists */ }
    for (;;) {
      try {
        const res = await r.xreadgroup('GROUP', group, consumer, 'BLOCK', 5000, 'COUNT', 20, 'STREAMS', STREAM, '>')
        if (!res) continue
        for (const [, entries] of res) {
          for (const [id, fields] of entries) {
            const obj = {}
            for (let i = 0; i < fields.length; i += 2) obj[fields[i]] = fields[i + 1]
            try { await handler(obj.type, JSON.parse(obj.data || '{}')) }
            catch (err) { console.error(`[events] ${group} handler error for ${obj.type}:`, err.message) }
            await r.xack(STREAM, group, id)
          }
        }
      } catch (e) {
        console.error(`[events] ${group} read error:`, e.message)
        await new Promise((res) => setTimeout(res, 1000))
      }
    }
  })()
  return r
}
