// 93a · Location Permission (Privacy › Location Permission).
//
// The switch is the app's OWN setting, so both directions work instantly without leaving the app:
// off means nothing in the app reads the device location (see geo.getCurrentPosition), on means it
// may. Settings is only ever involved in one case — turning it on when Android has permanently
// refused the permission, which no app can undo from inside.
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, Settings } from 'lucide-react'
import { Geolocation } from '@capacitor/geolocation'
import { Capacitor } from '@capacitor/core'
import { useToast } from '../../components/UI'
import { openAppLocationSettings } from '../../geo'
import { locationAllowed, setLocationAllowed } from '../../locationPref'

export default function LocationPermission() {
  const nav = useNavigate()
  const toast = useToast()
  const [on, setOn] = useState(locationAllowed())
  const [osGranted, setOsGranted] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  const readOs = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) { setOsGranted(true); return }
    try {
      const p = await Geolocation.checkPermissions()
      setOsGranted(p.location === 'granted' || p.coarseLocation === 'granted')
    } catch { setOsGranted(false) }
  }, [])

  useEffect(() => { readOs() }, [readOs])
  // Returning from Settings doesn't remount the screen, so re-read the OS state on focus.
  useEffect(() => {
    const again = () => readOs()
    document.addEventListener('visibilitychange', again)
    window.addEventListener('focus', again)
    return () => {
      document.removeEventListener('visibilitychange', again)
      window.removeEventListener('focus', again)
    }
  }, [readOs])

  async function toggle() {
    if (busy) return
    // OFF is purely ours — instant, no dialogs, nothing to ask anyone.
    if (on) {
      setOn(false)
      setLocationAllowed(false)
      toast('Location off — we’ll use your saved address')
      return
    }
    // ON: switch it on first, then make sure Android will actually hand us a fix.
    setOn(true)
    setLocationAllowed(true)
    if (!Capacitor.isNativePlatform()) return
    setBusy(true)
    try {
      const p = await Geolocation.checkPermissions()
      let granted = p.location === 'granted' || p.coarseLocation === 'granted'
      if (!granted) {
        const r = await Geolocation.requestPermissions()
        granted = r.location === 'granted' || r.coarseLocation === 'granted'
      }
      setOsGranted(granted)
      toast(granted ? 'Location on' : 'Android is blocking location — allow it in Settings')
    } catch { setOsGranted(false) } finally { setBusy(false) }
  }

  const needsSettings = on && osGranted === false

  return (
    <div className="screen">
      <header className="appbar ord-appbar">
        <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="titles"><h1>Location Permission</h1></div>
        <span className="iconbtn ghost" />
      </header>

      <div className="content">
        <div className="ws-card">
          <div className="notif-row">
            <span className="ws-ico"><MapPin size={17} /></span>
            <span className="grow">
              <span className="ws-t">Use my location</span>
              <span className="ws-d">
                {on ? 'On — we find your address and track your expert'
                    : 'Off — we’ll use your saved address instead'}
              </span>
            </span>
            <button
              className={`switch ${on ? 'on' : ''}`}
              onClick={toggle} disabled={busy}
              role="switch" aria-checked={on} aria-label="Use my location"
            ><span /></button>
          </div>
        </div>

        {needsSettings && (
          <>
            <div className="pm-status off" style={{ marginTop: 14 }}>
              <span className="pm-status-ic"><Settings size={20} /></span>
              <div>
                <div className="pm-status-t">Android is blocking location</div>
                <div className="pm-status-d">You’ve got it on here, but the permission is denied at system level.</div>
              </div>
            </div>
            <button className="btn full" onClick={openAppLocationSettings}>Open Settings</button>
          </>
        )}
      </div>
    </div>
  )
}
