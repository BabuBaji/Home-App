// 99 · Recurring Cleaning Planner — real cleaning plans (CRUD via /api/plans). My Plan / History
// tabs; add a plan by picking a service + frequency.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, MoreVertical, Plus, Trash2, X } from 'lucide-react'
import { BottomNav, Loading, useToast } from '../../components/UI'
import { pushBackHandler } from '../../backStack'
import { ServiceThumb } from '../../serviceArt'
import { fetchPlans, addPlan, updatePlan, removePlan, fetchServices, type CleaningPlan } from '../../api'
import { useStore } from '../../store'
import type { Service } from '../../types'

const FREQS = ['Every Week', 'Every 3 Days', 'Every 5 Days', 'Every 15 Days', 'Every Month']
const FREQ_DAYS: Record<string, number> = { 'Every Week': 7, 'Every 3 Days': 3, 'Every 5 Days': 5, 'Every 15 Days': 15, 'Every Month': 30 }
const nextDate = (freq: string) => new Date(Date.now() + (FREQ_DAYS[freq] || 7) * 86400000).toISOString().slice(0, 10)
const fmt = (s: string | null) => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function RecurringPlanner() {
  const nav = useNavigate()
  const toast = useToast()
  const { pincode } = useStore()
  const [plans, setPlans] = useState<CleaningPlan[] | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [tab, setTab] = useState<'My Plan' | 'History'>('My Plan')
  const [form, setForm] = useState<{ service: string; freq: string } | null>(null)
  const [menu, setMenu] = useState<number | null>(null)

  const load = () => fetchPlans().then(setPlans).catch(() => setPlans([]))
  useEffect(() => { load(); fetchServices(pincode || undefined).then((c) => setServices(c.services)).catch(() => {}) }, [pincode])
  useEffect(() => { if (form) return pushBackHandler(() => setForm(null)) }, [form])
  useEffect(() => { if (menu !== null) return pushBackHandler(() => setMenu(null)) }, [menu])

  async function save() {
    if (!form?.service) return toast('Pick a service')
    const svc = services.find((s) => s.id === form.service)
    try {
      await addPlan({ service_id: form.service, name: svc?.name || form.service, frequency: form.freq, next_date: nextDate(form.freq) })
      setForm(null); await load(); toast('Plan added')
    } catch (e) { toast((e as Error).message) }
  }
  async function toggle(p: CleaningPlan) { setMenu(null); try { await updatePlan(p.id, { active: !p.active }); await load() } catch (e) { toast((e as Error).message) } }
  async function del(id: number) { setMenu(null); try { await removePlan(id); await load(); toast('Removed') } catch (e) { toast((e as Error).message) } }

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Recurring Cleaning Planner</h1></div>
      <button className="iconbtn" onClick={() => setForm({ service: '', freq: FREQS[0] })} aria-label="Add"><Plus size={18} /></button>
    </header>
  )
  if (!plans) return <div className="screen has-nav">{head}<Loading /><BottomNav /></div>

  const shown = plans.filter((p) => tab === 'My Plan' ? p.active : !p.active)

  return (
    <div className="screen has-nav">
      {head}
      <div className="content">
        <div className="pl-hero">
          <div><div className="pl-hero-t">Your Cleaning Plan</div><div className="pl-hero-d">Stay consistent, stay stress-free.</div></div>
          <span className="pl-hero-art">🧴</span>
        </div>

        <div className="pl-tabs">
          {(['My Plan', 'History'] as const).map((t) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}
        </div>

        {shown.length === 0 && <div className="state"><div className="ico">🗓</div><h3>No {tab === 'History' ? 'past ' : ''}plans</h3><p>Add a recurring service to stay on schedule.</p></div>}

        <div className="pl-list">
          {shown.map((p) => (
            <div key={p.id} className="pl-row">
              <span className="pl-thumb"><ServiceThumb service={{ id: p.service_id, name: p.name, image: `/services/${p.service_id}.jpg` }} medallion={30} /></span>
              <div className="pl-main">
                <div className="pl-name">{p.name}</div>
                <div className="pl-freq">{p.frequency}</div>
                <div className="pl-next">Next: {fmt(p.next_date)}</div>
              </div>
              <span className={`pl-badge ${p.active ? 'on' : ''}`}>{p.active ? 'Active' : 'Paused'}</span>
              <button className="pl-menu" onClick={() => setMenu(menu === p.id ? null : p.id)} aria-label="Options"><MoreVertical size={16} /></button>
              {menu === p.id && (
                <>
                  <div className="fm-menu-back" onClick={() => setMenu(null)} />
                  <div className="fm-menu-pop">
                    <button onClick={() => toggle(p)}>{p.active ? 'Pause plan' : 'Resume plan'}</button>
                    <button className="danger" onClick={() => del(p.id)}><Trash2 size={15} /> Remove</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <button className="btn full" style={{ marginTop: 14 }} onClick={() => setForm({ service: '', freq: FREQS[0] })}>+ Add New Plan</button>
      </div>

      {form && (
        <div className="sheet-wrap" onClick={() => setForm(null)}>
          <div className="sheet fm-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="fm-sheet-head"><span>Add Cleaning Plan</span><button onClick={() => setForm(null)} aria-label="Close"><X size={18} /></button></div>
            <label className="fm-field"><span>Service</span>
              <select value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })}>
                <option value="">Select a service</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="fm-field"><span>Frequency</span>
              <select value={form.freq} onChange={(e) => setForm({ ...form, freq: e.target.value })}>
                {FREQS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <button className="btn full" onClick={save}>Add Plan</button>
          </div>
        </div>
      )}
      <BottomNav />
    </div>
  )
}
