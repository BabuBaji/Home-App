import { useState } from 'react'
import { getApiBase, setApiBase } from '../api'

/**
 * Lets the user point the app at a different backend address at runtime (no rebuild).
 * Saving persists to localStorage and reloads so the new URL applies everywhere
 * (REST + socket). Used on the Login and Profile screens.
 */
export default function ServerSettings() {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(getApiBase() || 'http://192.168.0.112:4000')
  function save() { setApiBase(url); location.reload() }
  return (
    <div style={{ marginTop: 12, textAlign: 'center' }}>
      <button className="btn-text" style={{ fontSize: 12, opacity: 0.7 }} onClick={() => setOpen((o) => !o)}>
        ⚙ Server settings
      </button>
      {open && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://192.168.0.112:4000"
            style={{ flex: 1, padding: '8px 10px', borderRadius: 10, border: '1px solid #ddd', fontSize: 13 }}
          />
          <button className="btn" onClick={save}>Save</button>
        </div>
      )}
    </div>
  )
}
