// 101 / 102 / 103 · Reminders — Water Can, Garbage, Pest Control. All three share the same real
// backend (/api/reminders/:kind, upsert). Each screen sets its own copy, icon and detail fields.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bell, Droplet, Trash2, Bug, CheckCircle2 } from 'lucide-react'
import { BottomNav, Loading, useToast } from '../../components/UI'
import { fetchReminders, saveReminder, type HomeReminder } from '../../api'

const addDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
const fmt = (s?: string | null) => s ? new Date(s).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—'

type Kind = 'water_can' | 'garbage' | 'pest_control'
interface Cfg {
  kind: Kind; title: string; icon: React.ReactNode; heroIcon: React.ReactNode; heroClass: string
  dueText: string; freqDays: number
  primaryLabel: string; secondaryLabel?: string; primaryTo?: string
  details: { k: string; v: (r: HomeReminder | null) => string }[]
  tip: string
}

function useReminder(kind: Kind) {
  const [rem, setRem] = useState<HomeReminder | null | undefined>(undefined)
  useEffect(() => { fetchReminders().then((rs) => setRem(rs.find((r) => r.kind === kind) || null)).catch(() => setRem(null)) }, [kind])
  return [rem, setRem] as const
}

function ReminderScreen({ cfg }: { cfg: Cfg }) {
  const nav = useNavigate()
  const toast = useToast()
  const [rem, setRem] = useReminder(cfg.kind)

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>{cfg.title}</h1></div>
      <button className="iconbtn" onClick={() => nav('/notifications')} aria-label="Notifications"><Bell size={18} /></button>
    </header>
  )
  if (rem === undefined) return <div className="screen has-nav">{head}<Loading /><BottomNav /></div>

  const due = rem?.next_date || addDays(1)

  async function set(next: string) {
    try { setRem(await saveReminder(cfg.kind, { next_date: next, frequency_days: rem?.frequency_days ?? cfg.freqDays, enabled: true, config: rem?.config || {} })); toast('Reminder set') }
    catch (e) { toast((e as Error).message) }
  }

  return (
    <div className="screen has-nav">
      {head}
      <div className="content pad-cta">
        <div className={`rem-hero ${cfg.heroClass}`}>
          <span className="rem-hero-ico">{cfg.heroIcon}</span>
          <div className="rem-hero-t">{cfg.dueText}</div>
          <div className="rem-hero-k">Next {cfg.kind === 'water_can' ? 'Delivery' : cfg.kind === 'garbage' ? 'Pickup' : 'Service'}</div>
          <div className="rem-hero-d">{fmt(due)}</div>
        </div>

        <div className="rem-actions">
          <button className="btn" onClick={() => set(addDays((rem?.frequency_days ?? cfg.freqDays)))}>{cfg.primaryLabel}</button>
          {cfg.secondaryLabel && <button className="btn ghost" onClick={() => cfg.primaryTo ? nav(cfg.primaryTo) : set(addDays(1))}>{cfg.secondaryLabel}</button>}
        </div>

        <div className="hhs-tiles-h">{cfg.kind === 'water_can' ? 'Delivery Details' : 'Details'}</div>
        <div className="ws-card rs-kv">
          {cfg.details.map((d) => (
            <div key={d.k} className="ord-kv"><span className="ord-kv-k">{d.k}</span><span className="ord-kv-v">{d.v(rem)}</span></div>
          ))}
        </div>

        <div className="rem-tip">
          <CheckCircle2 size={18} />
          <div><div className="rem-tip-t">Tip from AI</div><div className="rem-tip-d">{cfg.tip}</div></div>
        </div>
      </div>
      <BottomNav />
    </div>
  )
}

export function WaterCanReminder() {
  return <ReminderScreen cfg={{
    kind: 'water_can', title: 'Water Can Reminder', icon: <Droplet size={18} />, heroIcon: '💧', heroClass: 'water',
    dueText: 'Your water can is due!', freqDays: 15, primaryLabel: 'Reschedule', secondaryLabel: 'Order Now', primaryTo: '/home',
    details: [
      { k: 'Address', v: () => 'Home' }, { k: 'Can Type', v: () => '20 Litre' },
      { k: 'Frequency', v: (r) => `Every ${r?.frequency_days ?? 15} Days` }, { k: 'Last Delivered', v: () => '—' },
    ],
    tip: 'Stay hydrated, stay healthy! We\'ll remind you before every delivery.',
  }} />
}
export function GarbageReminder() {
  return <ReminderScreen cfg={{
    kind: 'garbage', title: 'Garbage Reminder', icon: <Trash2 size={18} />, heroIcon: '🗑️', heroClass: 'garbage',
    dueText: 'Garbage pickup is due!', freqDays: 1, primaryLabel: 'Set Reminder',
    details: [{ k: 'Pickup Type', v: () => 'Dry Waste' }, { k: 'Frequency', v: (r) => `Every ${r?.frequency_days ?? 1} Day(s)` }],
    tip: 'Segregate wet and dry waste for a cleaner tomorrow.',
  }} />
}
export function PestControlReminder() {
  return <ReminderScreen cfg={{
    kind: 'pest_control', title: 'Pest Control Reminder', icon: <Bug size={18} />, heroIcon: '🐛', heroClass: 'pest',
    dueText: 'Pest control is due!', freqDays: 60, primaryLabel: 'Book Now', secondaryLabel: 'Remind Me Later', primaryTo: '/service/pest',
    details: [{ k: 'Service Type', v: () => 'General Pest Control' }, { k: 'Frequency', v: (r) => `Every ${r?.frequency_days ?? 60} Days` }, { k: 'Last Service', v: () => '—' }],
    tip: 'Regular pest control keeps your family safe and healthy.',
  }} />
}
