import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, HardHat, CalendarDays, Sparkles, Tag, CreditCard, RotateCcw,
  AlertOctagon, Ban, Wallet, Bell, LifeBuoy, BarChart3, PieChart, Settings as Cog,
  ShieldCheck, UserCog, Menu, X, LogOut, Search, Calendar,
} from 'lucide-react'
import { useStore, can } from '../store'
import { Avatar } from './UI'

const NAV = [
  { section: 'Main', items: [
    { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
    { to: '/customers', label: 'Customers', Icon: Users },
    { to: '/workers', label: 'Workers (Pros)', Icon: HardHat },
    { to: '/worker-wallet', label: 'Worker Wallet', Icon: Wallet },
    { to: '/bookings', label: 'Bookings', Icon: CalendarDays },
    { to: '/services', label: 'Services', Icon: Sparkles },
    { to: '/pricing', label: 'Pricing', Icon: Tag },
    { to: '/payments', label: 'Payments', Icon: CreditCard },
    { to: '/refunds', label: 'Refunds', Icon: RotateCcw },
  ] },
  { section: 'Operations', items: [
    { to: '/complaints', label: 'Complaints', Icon: AlertOctagon },
    { to: '/notifications', label: 'Notifications', Icon: Bell },
    { to: '/tickets', label: 'Support Tickets', Icon: LifeBuoy },
  ] },
  { section: 'Analytics', items: [
    { to: '/reports', label: 'Reports', Icon: BarChart3 },
    { to: '/analytics', label: 'Analytics', Icon: PieChart },
  ] },
  { section: 'Settings', items: [
    { to: '/settings', label: 'Settings', Icon: Cog },
    { to: '/admins', label: 'Admin Users', Icon: UserCog, min: 'admin' },
  ] },
]

const TITLES: Record<string, string> = {
  dashboard: 'Dashboard', customers: 'Customers', workers: 'Workers (Pros)', 'worker-wallet': 'Worker Wallet', bookings: 'Bookings',
  services: 'Services', pricing: 'Pricing', payments: 'Payments', refunds: 'Refunds',
  complaints: 'Complaints', notifications: 'Notifications', tickets: 'Support Tickets',
  reports: 'Reports', analytics: 'Analytics', settings: 'Settings', admins: 'Admin Users',
}

export default function Layout({ children }: { children: ReactNode }) {
  const { admin, signOut } = useStore()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const seg = pathname.split('/')[1] || 'dashboard'

  return (
    <div className="shell">
      <aside className={'sidebar' + (open ? ' open' : '')}>
        <div className="brand">
          <span className="brand-logo"><LayoutDashboard size={20} /></span>
          <div><strong>HomeHelp</strong><small>Admin</small></div>
          <button className="iconbtn only-mobile" onClick={() => setOpen(false)}><X size={20} /></button>
        </div>
        <nav className="navlist">
          {NAV.map((grp) => (
            <div key={grp.section} className="navgrp">
              <span className="navgrp-title">{grp.section}</span>
              {grp.items.filter((it) => !it.min || can(admin?.role, it.min)).map((it) => (
                <NavLink key={it.to} to={it.to} className={({ isActive }) => 'navitem' + (isActive ? ' active' : '')} onClick={() => setOpen(false)}>
                  <it.Icon size={19} /> <span>{it.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <button className="signout" onClick={() => { signOut(); nav('/login') }}><LogOut size={18} /> Sign out</button>
      </aside>

      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="iconbtn only-mobile" onClick={() => setOpen(true)}><Menu size={22} /></button>
          <div className="titlewrap">
            <h1 className="page-title">{TITLES[seg] || 'Dashboard'}</h1>
            <span className="crumb only-desktop">Home <span>/</span> {TITLES[seg] || 'Dashboard'}</span>
          </div>
          <div className="topbar-search only-desktop"><Search size={16} /><input placeholder="Search anything…" /></div>
          <div className="spacer" />
          <span className="daterange only-desktop"><Calendar size={15} /> Last 7 days</span>
          <button className="iconbtn"><Bell size={20} /><span className="dot-badge" /></button>
          <div className="me">
            <Avatar name={admin?.name || 'Admin'} src={admin?.avatar} size={34} />
            <div className="only-desktop"><strong>{admin?.name}</strong><small>{admin?.role}</small></div>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  )
}
