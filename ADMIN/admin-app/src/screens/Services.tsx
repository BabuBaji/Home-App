import { useEffect, useState } from 'react'
import { Sparkles, CheckCircle2, XCircle, Plus, Trash2 } from 'lucide-react'
import { fetchServices, createService, updateService, deleteService } from '../api'
import type { AdminService } from '../types'
import { Card, StatCard, Loading, ErrorState, Empty, Badge, SearchBox, Modal, Field, money, useToast } from '../components/UI'
import { useStore, can } from '../store'

const CATEGORIES = ['Cleaning', 'Kitchen', 'Bathroom', 'Laundry', 'Deep Cleaning', 'Beauty', 'Repairs', 'Appliance', 'Care', 'Outdoor']

export default function Services() {
  const toast = useToast()
  const { admin } = useStore()
  const [rows, setRows] = useState<AdminService[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState(''); const [cat, setCat] = useState('all')
  const [edit, setEdit] = useState<AdminService | 'new' | null>(null)

  const load = () => { setErr(''); fetchServices().then(setRows).catch((e) => setErr(e.message)) }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />

  const filtered = rows?.filter((s) => (cat === 'all' || s.category === cat) && (!q || s.name.toLowerCase().includes(q.toLowerCase())))
  const active = rows?.filter((s) => s.available).length || 0

  async function toggle(s: AdminService) { try { await updateService(s.id, { available: !s.available }); toast('Service updated'); load() } catch (e: any) { toast(e.message, 'err') } }
  async function remove(s: AdminService) { if (!confirm(`Delete ${s.name}?`)) return; try { await deleteService(s.id); toast('Service removed'); load() } catch (e: any) { toast(e.message, 'err') } }

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="stat-row">
        <StatCard icon={<Sparkles size={22} />} tint="#5b51e8" label="Total Services" value={rows?.length ?? '—'} />
        <StatCard icon={<CheckCircle2 size={22} />} tint="#16a34a" label="Active" value={active} />
        <StatCard icon={<XCircle size={22} />} tint="#f04438" label="Inactive" value={(rows?.length || 0) - active} />
        <StatCard icon={<Sparkles size={22} />} tint="#f5a524" label="Categories" value={CATEGORIES.length} />
      </div>
      <Card>
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search services…" />
          <select className="select" value={cat} onChange={(e) => setCat(e.target.value)}><option value="all">All Categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          <div className="spacer" />
          {can(admin?.role, 'manager') && <button className="btn" onClick={() => setEdit('new')}><Plus size={17} /> Add Service</button>}
        </div>
        {!rows ? <Loading /> : !filtered?.length ? <Empty msg="No services found." /> : (
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>Service</th><th>Category</th><th>Price</th><th>Bookings</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td><div className="cell-user"><span style={{ fontSize: 22 }}>{s.icon}</span><strong>{s.name}</strong></div></td>
                    <td><span className="badge violet">{s.category}</span></td>
                    <td className="num">{money(s.price)}</td>
                    <td className="num">{s.bookings}</td>
                    <td><button className={'switch' + (s.available ? ' on' : '')} onClick={() => can(admin?.role, 'manager') && toggle(s)} /></td>
                    <td><div className="actions">
                      {can(admin?.role, 'manager') && <span className="link" onClick={() => setEdit(s)}>Edit</span>}
                      {can(admin?.role, 'admin') && <button className="iconbtn" style={{ width: 30, height: 30, color: 'var(--red)' }} onClick={() => remove(s)}><Trash2 size={15} /></button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {edit && <ServiceModal service={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} toast={toast} />}
    </div>
  )
}

function ServiceModal({ service, onClose, onSaved, toast }: { service: AdminService | null; onClose: () => void; onSaved: () => void; toast: (m: string, k?: 'ok' | 'err') => void }) {
  const [f, setF] = useState({ name: service?.name || '', icon: service?.icon || '🧰', price: service?.price ?? 99, category: service?.category || 'Cleaning', available: service?.available ?? true })
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }))
  async function save() {
    if (!f.name.trim()) return toast('Name is required', 'err')
    setBusy(true)
    try { if (service) await updateService(service.id, f); else await createService(f); toast('Saved'); onSaved() } catch (e: any) { toast(e.message, 'err') } finally { setBusy(false) }
  }
  return (
    <Modal title={service ? 'Edit Service' : 'Add Service'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <div className="form-grid">
        <Field label="Service name"><input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="House Cleaning" /></Field>
        <Field label="Icon (emoji)"><input value={f.icon} onChange={(e) => set('icon', e.target.value)} placeholder="🧹" /></Field>
        <Field label="Starting price (₹)"><input type="number" value={f.price} onChange={(e) => set('price', Number(e.target.value))} /></Field>
        <Field label="Category"><select value={f.category} onChange={(e) => set('category', e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
      </div>
      <Field label="Available"><select value={f.available ? '1' : '0'} onChange={(e) => set('available', e.target.value === '1')}><option value="1">Yes</option><option value="0">No</option></select></Field>
    </Modal>
  )
}
