import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, MapPin, Phone, X } from 'lucide-react'
import { getSocket } from '../api'

type Sos = {
  id: string
  workerId: number
  workerName: string
  phone: string
  lat: number | null
  lng: number | null
  at: string
}

/**
 * Global SOS listener + full-screen alert for the admin control tower.
 * Subscribes to the gateway's "admin" room and, on a worker SOS, raises a red modal and
 * sounds a looping siren (Web Audio) until an admin acknowledges. Mounted once (when signed in).
 */
export default function SosAlert() {
  const [alerts, setAlerts] = useState<Sos[]>([])
  const audioRef = useRef<{ ctx: AudioContext; timer: number } | null>(null)

  // ---- socket subscription ----
  useEffect(() => {
    const socket = getSocket()
    const join = () => socket.emit('admin:join')
    join()
    socket.on('connect', join) // re-join after any reconnect
    const onSos = (p: Omit<Sos, 'id'>) => {
      const item: Sos = { ...p, id: `${p.workerId}-${p.at || Date.now()}` }
      setAlerts((prev) => (prev.some((a) => a.id === item.id) ? prev : [item, ...prev]))
      try {
        if (Notification && Notification.permission === 'granted')
          new Notification('🆘 Worker SOS', { body: `${item.workerName} raised an emergency alert`, requireInteraction: true })
      } catch { /* notifications unsupported */ }
    }
    socket.on('sos', onSos)
    // Best-effort browser notification permission (shows OS-level popup too).
    try { if (Notification && Notification.permission === 'default') Notification.requestPermission() } catch { /* ignore */ }
    return () => {
      socket.off('sos', onSos)
      socket.off('connect', join)
      socket.emit('admin:leave')
    }
  }, [])

  // ---- siren: play while any alert is unacknowledged, stop when the queue empties ----
  useEffect(() => {
    if (alerts.length > 0) startSiren()
    else stopSiren()
    return () => { /* stopped explicitly on empty */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts.length])

  function startSiren() {
    if (audioRef.current) return
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctor()
      ctx.resume?.()
      const beep = () => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        // Two-tone alternating siren.
        osc.frequency.setValueAtTime(880, ctx.currentTime)
        osc.frequency.setValueAtTime(660, ctx.currentTime + 0.25)
        gain.gain.setValueAtTime(0.0001, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5)
        osc.connect(gain).connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.52)
      }
      beep()
      const timer = window.setInterval(beep, 900)
      audioRef.current = { ctx, timer }
    } catch { /* audio blocked — visual alert still shows */ }
  }
  function stopSiren() {
    const a = audioRef.current
    if (!a) return
    clearInterval(a.timer)
    a.ctx.close?.()
    audioRef.current = null
  }
  useEffect(() => () => stopSiren(), [])

  if (alerts.length === 0) return null
  const a = alerts[0]
  const time = (() => { try { return new Date(a.at).toLocaleTimeString() } catch { return '' } })()
  const hasLoc = a.lat != null && a.lng != null
  const ack = () => setAlerts((prev) => prev.slice(1))

  return (
    <div style={overlay}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <div style={iconWrap}><AlertTriangle size={30} color="#fff" /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#B42318', letterSpacing: '-.01em' }}>Emergency SOS</div>
            <div style={{ fontSize: 13, color: '#6b6880' }}>A worker has raised an emergency alert</div>
          </div>
          {alerts.length > 1 && <span style={badge}>+{alerts.length - 1} more</span>}
        </div>

        <div style={rows}>
          <Row label="Worker" value={`${a.workerName} (#${a.workerId})`} />
          <Row label="Time" value={time} />
          {a.phone
            ? <a href={`tel:${a.phone}`} style={{ ...rowLink }}><Phone size={16} /> Call {a.phone}</a>
            : <Row label="Phone" value="—" />}
          {hasLoc
            ? <a href={`https://www.google.com/maps?q=${a.lat},${a.lng}`} target="_blank" rel="noreferrer" style={rowLink}><MapPin size={16} /> View live location on map</a>
            : <Row label="Location" value="Not shared" />}
        </div>

        <button style={ackBtn} onClick={ack}>
          <X size={18} /> Acknowledge {alerts.length > 1 ? '(next alert)' : '& dismiss'}
        </button>
        <div style={{ fontSize: 11, color: '#98959f', textAlign: 'center', marginTop: 8 }}>
          Acknowledging stops the siren. Follow your safety escalation protocol.
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #f0eef4' }}>
      <span style={{ color: '#6b6880', fontSize: 13 }}>{label}</span>
      <span style={{ color: '#1a1726', fontSize: 14, fontWeight: 600 }}>{value}</span>
    </div>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(20,10,10,.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(2px)',
}
const card: React.CSSProperties = {
  width: '100%', maxWidth: 420, background: '#fff', borderRadius: 20, padding: 22,
  boxShadow: '0 24px 60px rgba(0,0,0,.35)', border: '2px solid #FDA29B',
  animation: 'none',
}
const iconWrap: React.CSSProperties = {
  width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg,#F04438,#B42318)',
  display: 'grid', placeItems: 'center', flexShrink: 0, boxShadow: '0 6px 16px rgba(240,68,56,.4)',
}
const badge: React.CSSProperties = {
  background: '#FEF3F2', color: '#B42318', fontWeight: 700, fontSize: 11, padding: '4px 9px', borderRadius: 999,
}
const rows: React.CSSProperties = { margin: '14px 0 18px' }
const rowLink: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '11px 0', color: '#5b51e8',
  fontWeight: 600, fontSize: 14, textDecoration: 'none', borderBottom: '1px solid #f0eef4',
}
const ackBtn: React.CSSProperties = {
  width: '100%', height: 50, border: 'none', borderRadius: 13, cursor: 'pointer',
  background: 'linear-gradient(135deg,#F04438,#B42318)', color: '#fff', fontWeight: 700, fontSize: 16,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
}
