import { useEffect } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useStore, has } from '../../store'
import SosTab from './SosTab'
import JobsTab from './JobsTab'
import TeamTab from './TeamTab'
import MeTab from './MeTab'
import { FIELD_TABS } from './tabs'
import './field.css'

/* HomeHelp Field — the phone-first app for hub/zone managers and the safety desk. Its own full-screen
   layout (no desktop sidebar), a bottom tab bar, installable via a manifest linked only here. */


function useFieldHead() {
  useEffect(() => {
    const added: HTMLElement[] = []
    const add = (tag: string, attrs: Record<string, string>) => {
      const el = document.createElement(tag)
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
      el.setAttribute('data-field', '1')
      document.head.appendChild(el); added.push(el)
    }
    add('link', { rel: 'manifest', href: '/field.webmanifest' })
    add('link', { rel: 'apple-touch-icon', href: '/field-icon-192.png' })
    add('meta', { name: 'theme-color', content: '#5b51e8' })
    add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' })
    add('meta', { name: 'mobile-web-app-capable', content: 'yes' })
    add('meta', { name: 'apple-mobile-web-app-title', content: 'HH Field' })
    const prevTitle = document.title
    document.title = 'HomeHelp Field'
    document.documentElement.classList.add('fd-html')
    return () => { added.forEach((el) => el.remove()); document.title = prevTitle; document.documentElement.classList.remove('fd-html') }
  }, [])
}

export default function FieldApp() {
  const { admin } = useStore()
  useFieldHead()
  const tabs = FIELD_TABS.filter((t) => !t.perm || has(admin, t.perm))
  const first = tabs[0]?.to || 'me'

  const gate = (perm: string, el: JSX.Element) => (has(admin, perm) ? el : <NoAccess />)

  return (
    <div className="fd-root">
      <main className="fd-main">
        <Routes>
          <Route index element={<Navigate to={first} replace />} />
          <Route path="sos" element={gate('safety.view', <SosTab />)} />
          <Route path="jobs" element={gate('liveops.view', <JobsTab />)} />
          <Route path="team" element={gate('workers.view', <TeamTab />)} />
          <Route path="me" element={<MeTab />} />
          <Route path="*" element={<Navigate to={first} replace />} />
        </Routes>
      </main>
      <nav className="fd-tabbar" aria-label="Field app">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => 'fd-tab' + (isActive ? ' active' : '')}>
            <t.icon size={22} strokeWidth={2.1} />
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function NoAccess() {
  return (
    <div className="fd-state" style={{ paddingTop: 80 }}>
      <div className="fd-state-ico"><ShieldAlert size={30} /></div>
      <h3>No access</h3>
      <p>Your role doesn't include this section. Ask an administrator if you need it.</p>
    </div>
  )
}
