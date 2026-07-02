// Realtime relay. Services never hold sockets — they publish a {room,event,payload}
// message to a Redis pub/sub channel; the gateway's socket.io hub subscribes and emits it
// to the matching booking room (or broadcasts when room is null).
import Redis from 'ioredis'

const CHANNEL = process.env.REALTIME_CHANNEL || 'homehelp:realtime'
let _pub = null

export async function publishRealtime(redisUrl, room, event, payload) {
  try {
    if (!_pub) _pub = new Redis(redisUrl)
    await _pub.publish(CHANNEL, JSON.stringify({ room: room || null, event, payload: payload ?? null }))
  } catch (e) {
    console.error('[realtime] publish failed', event, e.message)
  }
}

export { CHANNEL as REALTIME_CHANNEL }
