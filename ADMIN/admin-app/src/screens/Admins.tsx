import { useEffect, useState } from 'react'
import { UserCog, Plus, Trash2 } from 'lucide-react'
import { fetchAdmins, createAdminUser, updateAdminUser, deleteAdminUser } from '../api'
import type { Admin } from '../types'
import { Card, StatCard, Loading, ErrorState, Empty, Badge, Avatar, Modal, Field, shortDate, useToast } from '../components/UI'
import { useStore, can } from '../store'

const ROLES = ['super', 'admin', 'manager', 'support']
const ROLE_TONE: Record<string, string> = { super: 'violet', admin: 'blue', manager: 'green', support: 'amber' }

export default function Admins() {
  const toast = useToast()
  const { admin } = useStore()
  const [rows, setRows] = useState<Admin[] | null>(null)
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState<Admin | 'new' | null>(null)
  const load = () => { setErr(''); fetchAdmins().then(setRows).catch((e) => setErr(e.message)) }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />

  const active = rows?.filter((a) => a.status === 'active').length || 0

  async function remove(a: Admin) {
    if (!confirm(`Remove ${a.name}?`)) return
    try { await deleteAdminUser(a.id); toast('Admin removed'); load() } catch (e: any) { toast(e.message, 'err') }
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="stat-row">
        <StatCard icon={<UserCog size={22} />} tint="#5b51e8" label="Total Admins" value={rows?.length ?? '—'} />
        <StatCard icon={<UserCog size={22} />} tint="#16a34a" label="Active" value={active} />
        <StatCard icon={<UserCog size={22} />} tint="#2e90fa" label="Super Admins" value={rows?.filter((a) => a.role === 'super').length ?? '—'} />
      </div>
      <Card>
        <div className="toolbar"><div className="spacer" /><button className="btn" onClick={() => setEdit('new')}><Plus size={17} /> Add Admin</button></div>
        {!rows ? <Loading /> : rows.length === 0 ? <Empty msg="No admins." /> : (
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>Admin</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Last Login</th><th></th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td><div className="cell-user"><Avatar name={a.name} size={34} /><strong>{a.name}</strong></div></td>
                    <td className="muted">{a.email}</td>
                    <td className="muted">{a.phone || '—'}</td>
                    <td><Badge tone={ROLE_TONE[a.role]}>{a.role}</Badge></td>
                    <td><Badge>{a.status}</Badge></td>
                    <td className="muted">{a.last_login ? new Date(a.last_login).toLocaleString('en-IN') : 'Never'}</td>
                    <td><div className="actions">
                      <span className="link" onClick={() => setEdit(a)}>Edit</span>
                      {can(admin?.role, 'super') && a.id !== admin?.id && <button className="iconbtn" style={{ width: 30, height: 30, color: 'var(--red)' }} onClick={() => remove(a)}><Trash2 size={15} /></button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {edit && <AdminModal row={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} toast={toast} />}
    </div>
  )
}

function AdminModal({ row, onClose, onSaved, toast }: { row: Admin | null; onClose: () => void; onSaved: () => void; toast: (m: string, k?: 'ok' | 'err') => void }) {
  const [f, setF] = useState({ name: row?.name || '', email: row?.email || '', phone: row?.phone || '', role: row?.role || 'manager', status: row?.status || 'active', password: '' })
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function save() {
    if (!f.name.trim() || !f.email.trim()) return toast('Name and email required', 'err')
    setBusy(true)
    try {
      if (row) await updateAdminUser(row.id, { name: f.name, phone: f.phone, role: f.role, status: f.status, ...(f.password ? { password: f.password } : {}) })
      else await createAdminUser(f)
      toast('Saved'); onSaved()
    } catch (e: any) { toast(e.message, 'err') } finally { setBusy(false) }
  }
  return (
    <Modal title={row ? 'Edit Admin' : 'Add Admin'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <div className="form-grid">
        <Field label="Full name"><input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Email"><input type="email" value={f.email} disabled={!!row} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Phone"><input value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Role"><select value={f.role} onChange={(e) => set('role', e.target.value)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Status"><select value={f.status} onChange={(e) => set('status', e.target.value)}><option value="active">Active</option><option value="disabled">Disabled</option></select></Field>
        <Field label={row ? 'New password (optional)' : 'Password'}><input type="password" value={f.password} onChange={(e) => set('password', e.target.value)} placeholder={row ? 'Leave blank to keep' : 'min 6 chars'} /></Field>
      </div>
    </Modal>
  )
}
