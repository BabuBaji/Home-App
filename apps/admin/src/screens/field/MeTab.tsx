import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Monitor, LogOut, Mail, Phone, ShieldCheck, MapPinned, ChevronRight, Download } from 'lucide-react'
import { useStore, has } from '../../store'
import { fetchLiveMap, fetchStores, fetchRoles } from '../../api'
import { useConfirm } from '../../components/UI'
import { FIELD_TABS } from './tabs'
import { pretty } from './shared'

const SCOPE_LABEL: Record<string, string> = { all: 'All areas', city: 'Cities', zone: 'Zones', store: 'Hubs', team: 'My team (reports)' }

type InstallEvt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

export default function MeTab() {
  const { admin, signOut } = useStore()
  const confirm = useConfirm()
  const nav = useNavigate()
  const [roleName, setRoleName] = useState('')
  const [names, setNames] = useState<Record<string, string>>({})
  const [install, setInstall] = useState<InstallEvt | null>(null)

  const scopeType = admin?.scopeType || 'all'
  const values = admin?.scopeValues || []

  useEffect(() => {
    if (!admin) return
    let on = true
    // Friendly names — only ask endpoints this admin may read, so nothing 403s.
    if (has(admin, 'roles.view')) fetchRoles().then((r) => { const x = r.roles.find((ro) => ro.key === admin.role); if (on && x) setRoleName(x.name) }).catch(() => {})
    if (scopeType === 'zone') fetchLiveMap().then((d) => { if (on) setNames(Object.fromEntries(d.zones.map((z) => [String(z.id), z.name]))) }).catch(() => {})
    if (scopeType === 'store' && has(admin, 'zones.view')) fetchStores().then((s) => { if (on) setNames(Object.fromEntries(s.map((x) => [String(x.id), x.name]))) }).catch(() => {})
    return () => { on = false }
  }, [admin, scopeType])

  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setInstall(e as InstallEvt) }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])

  if (!admin) return null
  const scopeItems = scopeType === 'all' || scopeType === 'team' ? [] : values.map((v) => names[String(v)] || (scopeType === 'zone' ? `Zone ${v}` : scopeType === 'store' ? `Hub ${v}` : String(v)))
  const tabs = FIELD_TABS.filter((t) => t.perm && has(admin, t.perm))

  async function doSignOut() {
    if (!(await confirm({ title: 'Sign out?', message: 'You will stop receiving SOS alerts on this device.', confirmLabel: 'Sign out', danger: true }))) return
    signOut(); nav('/login', { replace: true })
  }

  return (
    <>
      <header className="fd-head fd-head-me">
        <div className="fd-me">
          <span className="fd-avatar big">{(admin.name || admin.email || '?').slice(0, 1).toUpperCase()}</span>
          <div style={{ minWidth: 0 }}>
            <h1>{admin.name}</h1>
            <span className="fd-badge violet">{roleName || pretty(admin.role)}</span>
          </div>
        </div>
      </header>

      <div className="fd-body">
        <section className="fd-card fd-rows">
          <div className="fd-row"><Mail size={18} /><span className="fd-grow">{admin.email}</span></div>
          {admin.phone && <div className="fd-row"><Phone size={18} /><span className="fd-grow">{admin.phone}</span></div>}
          <div className="fd-row"><MapPinned size={18} />
            <span className="fd-grow">
              <b>{SCOPE_LABEL[scopeType] || pretty(scopeType)}</b>
              {scopeItems.length > 0 && <span className="fd-chips" style={{ marginTop: 8 }}>{scopeItems.map((s) => <span key={s} className="fd-chip static">{s}</span>)}</span>}
              {scopeType === 'team' && <small className="fd-sub" style={{ display: 'block' }}>Everything your direct and indirect reports cover.</small>}
            </span>
          </div>
          <div className="fd-row"><ShieldCheck size={18} />
            <span className="fd-grow">
              <b>Field access</b>
              <small className="fd-sub" style={{ display: 'block' }}>{tabs.length ? tabs.map((t) => t.label).join(' · ') : 'No field sections — ask an administrator.'}</small>
            </span>
          </div>
        </section>

        <section className="fd-card fd-rows">
          {install && (
            <button className="fd-row fd-row-btn" onClick={async () => { await install.prompt(); setInstall(null) }}>
              <Download size={18} /><span className="fd-grow">Install on this phone</span><ChevronRight size={18} />
            </button>
          )}
          <Link className="fd-row fd-row-btn" to="/dashboard">
            <Monitor size={18} /><span className="fd-grow">Open desktop panel</span><ChevronRight size={18} />
          </Link>
          <button className="fd-row fd-row-btn fd-red" onClick={doSignOut}>
            <LogOut size={18} /><span className="fd-grow">Sign out</span>
          </button>
        </section>
        <p className="fd-foot">HomeHelp Field · add to your home screen for one-tap access</p>
      </div>
    </>
  )
}
