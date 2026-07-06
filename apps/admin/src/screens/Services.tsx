import { useEffect, useState } from 'react'
import { LayoutGrid, CheckCircle2, PauseCircle, Tag, Funnel, Plus, Eye, Pencil, Trash2 } from 'lucide-react'
import { fetchServices, createService, updateService, deleteService } from '../api'
import type { AdminService } from '../types'
import { StatCard, Card, Badge, Avatar, SearchBox, Pagination, Loading, ErrorState, Modal, Field, useToast, money } from '../components/UI'

type Tone = 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'gray'

const CAT_TONE: Record<string, Tone> = {
  'Home Services': 'violet',
  'Repair & Maintenance': 'green',
  'Appliance Services': 'amber',
  'Home Improvement': 'blue',
}

const ICON_TINTS = ['#eef0ff', '#e7f7ee', '#fff6e6', '#e8eefe']

type Draft = { name: string; category: string; price: string; icon: string; available: boolean }
const emptyDraft: Draft = { name: '', category: 'Home Services', price: '', icon: '🧰', available: true }

export default function Services() {
  const toast = useToast()
  const [rows, setRows] = useState<AdminService[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [modal, setModal] = useState<null | 'add' | 'edit' | 'view'>(null)
  const [active, setActive] = useState<AdminService | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [saving, setSaving] = useState(false)

  const load = () => { setErr(''); fetchServices().then(setRows).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!rows) return <Loading />

  const total = rows.length
  const activeCount = rows.filter((s) => s.available).length
  const inactiveCount = rows.filter((s) => !s.available).length
  const categories = new Set(rows.map((s) => s.category)).size

  const ql = q.trim().toLowerCase()
  const filtered = rows.filter((s) => {
    if (category !== 'all' && s.category !== category) return false
    if (status === 'active' && !s.available) return false
    if (status === 'inactive' && s.available) return false
    if (ql && !(s.name.toLowerCase().includes(ql) || (s.category || '').toLowerCase().includes(ql))) return false
    return true
  })
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)

  const openAdd = () => { setDraft(emptyDraft); setActive(null); setModal('add') }
  const openEdit = (s: AdminService) => { setActive(s); setDraft({ name: s.name, category: s.category, price: String(s.price), icon: s.icon, available: s.available }); setModal('edit') }
  const openView = (s: AdminService) => { setActive(s); setModal('view') }
  const close = () => { setModal(null); setActive(null); setSaving(false) }

  const save = () => {
    if (!draft.name.trim()) { toast('Name is required', 'err'); return }
    setSaving(true)
    const body = { name: draft.name.trim(), category: draft.category, price: Number(draft.price) || 0, icon: draft.icon || '🧰', available: draft.available }
    const p = modal === 'edit' && active ? updateService(active.id, body) : createService(body)
    p.then(() => { toast(modal === 'edit' ? 'Service updated' : 'Service created', 'ok'); close(); load() })
      .catch((e: Error) => { toast(e.message, 'err'); setSaving(false) })
  }

  const remove = (s: AdminService) => {
    if (!window.confirm(`Delete service "${s.name}"?`)) return
    deleteService(s.id)
      .then(() => { toast('Service deleted', 'ok'); load() })
      .catch((e: Error) => toast(e.message, 'err'))
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="stat-row">
        <StatCard icon={<LayoutGrid size={22} />} tint="#5b51e8" label="Total Services" value={total.toLocaleString('en-IN')} sub="all time" />
        <StatCard icon={<CheckCircle2 size={22} />} tint="#16a34a" label="Active Services" value={activeCount.toLocaleString('en-IN')} sub="all time" />
        <StatCard icon={<PauseCircle size={22} />} tint="#2e90fa" label="Inactive Services" value={inactiveCount.toLocaleString('en-IN')} sub="all time" />
        <StatCard icon={<Tag size={22} />} tint="#f59e0b" label="Categories" value={categories.toLocaleString('en-IN')} sub="all time" />
      </div>

      <Card>
        <div className="toolbar">
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search services by name or category..." />
          <select className="select flt" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1) }}>
            <option value="all">All Categories</option>
            <option value="Home Services">Home Services</option>
            <option value="Repair & Maintenance">Repair & Maintenance</option>
            <option value="Appliance Services">Appliance Services</option>
            <option value="Home Improvement">Home Improvement</option>
          </select>
          <select className="select flt" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <div className="tb-spacer" />
          <button className="btn line"><Funnel size={16} /> Filters</button>
          <button className="btn" onClick={openAdd}><Plus size={16} /> Add Service</button>
        </div>

        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Service</th>
                <th>Category</th>
                <th>Base Price</th>
                <th>Duration</th>
                <th>Workers Assigned</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => (
                <tr key={r.id}>
                  <td>
                    <div className="cell-user">
                      <span
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          background: ICON_TINTS[i % ICON_TINTS.length],
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 20,
                          lineHeight: 1,
                          flexShrink: 0,
                        }}
                      >
                        {r.icon}
                      </span>
                      <div>
                        <strong>{r.name}</strong>
                        <div className="muted" style={{ fontSize: 12 }}>{r.category}</div>
                      </div>
                    </div>
                  </td>
                  <td><Badge tone={CAT_TONE[r.category] || 'gray'}>{r.category}</Badge></td>
                  <td className="num">{money(r.price)}</td>
                  <td>1 - 2 hrs</td>
                  <td>
                    <div className="cell-user" style={{ gap: 6 }}>
                      <span style={{ display: 'inline-flex' }}>
                        {[0, 1, 2].map((a) => (
                          <span key={a} style={{ marginLeft: a ? -8 : 0, display: 'inline-flex' }}>
                            <Avatar name={r.name + a} size={26} />
                          </span>
                        ))}
                      </span>
                      <span className="muted">+{r.bookings}</span>
                    </div>
                  </td>
                  <td><Badge tone={r.available ? 'green' : 'red'}>{r.available ? 'Active' : 'Inactive'}</Badge></td>
                  <td>
                    <div className="actions">
                      <button className="iconbtn" title="View" onClick={() => openView(r)}><Eye size={16} /></button>
                      <button className="iconbtn" title="Edit" onClick={() => openEdit(r)}><Pencil size={16} /></button>
                      <button className="iconbtn" title="Delete" style={{ color: 'var(--red)' }} onClick={() => remove(r)}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination page={page} pageSize={pageSize} total={filtered.length} noun="services" onPage={setPage} onSize={(s) => { setPageSize(s); setPage(1) }} />
      </Card>

      {(modal === 'add' || modal === 'edit') && (
        <Modal
          title={modal === 'edit' ? 'Edit Service' : 'Add Service'}
          onClose={close}
          footer={
            <>
              <button className="btn line" onClick={close}>Cancel</button>
              <button className="btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : modal === 'edit' ? 'Save Changes' : 'Add Service'}</button>
            </>
          }
        >
          <Field label="Service Name">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Cleaning" />
          </Field>
          <Field label="Category">
            <select className="select" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
              <option value="Home Services">Home Services</option>
              <option value="Repair & Maintenance">Repair & Maintenance</option>
              <option value="Appliance Services">Appliance Services</option>
              <option value="Home Improvement">Home Improvement</option>
            </select>
          </Field>
          <Field label="Base Price (₹)">
            <input type="number" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} placeholder="499" />
          </Field>
          <Field label="Icon (emoji)">
            <input value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} placeholder="🧹" />
          </Field>
          <Field label="Status">
            <select className="select" value={draft.available ? 'active' : 'inactive'} onChange={(e) => setDraft({ ...draft, available: e.target.value === 'active' })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
        </Modal>
      )}

      {modal === 'view' && active && (
        <Modal
          title="Service Details"
          onClose={close}
          footer={<button className="btn line" onClick={close}>Close</button>}
        >
          <Field label="Service Name">
            <input value={active.name} readOnly />
          </Field>
          <Field label="Category">
            <input value={active.category} readOnly />
          </Field>
          <Field label="Base Price (₹)">
            <input value={String(active.price)} readOnly />
          </Field>
          <Field label="Icon (emoji)">
            <input value={active.icon} readOnly />
          </Field>
          <Field label="Status">
            <input value={active.available ? 'Active' : 'Inactive'} readOnly />
          </Field>
          <Field label="Total Bookings">
            <input value={String(active.bookings)} readOnly />
          </Field>
        </Modal>
      )}
    </div>
  )
}
