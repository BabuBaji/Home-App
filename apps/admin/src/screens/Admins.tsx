import { useEffect, useMemo, useState } from 'react'
import { UserCog, UserCheck, UserX, ShieldCheck, Pencil, MoreVertical, Filter, Plus, UserPlus, KeyRound } from 'lucide-react'
import { StatCard, Card, Badge, Avatar, SearchBox, Pagination, SumBars, Modal, Field, Loading, ErrorState, Empty, useToast, shortDate } from '../components/UI'
import { Donut } from '../components/Charts'
import { fetchAdmins, createAdminUser, updateAdminUser, deleteAdminUser, fetchAudit } from '../api'
import type { Admin } from '../types'
import { useStore, can } from '../store'

const ROLE_META: { id: Admin['role']; label: string; tone: string; color: string }[] = [
  { id: 'super', label: 'Super Admin', tone: 'violet', color: '#5b51e8' },
  { id: 'admin', label: 'Admin', tone: 'blue', color: '#2e90fa' },
  { id: 'manager', label: 'Manager', tone: 'green', color: '#16a34a' },
  { id: 'support', label: 'Support Admin', tone: 'amber', color: '#f59e0b' },
]
const roleLabel = (r: string) => ROLE_META.find((m) => m.id === r)?.label || r
const roleTone = (r: string) => ROLE_META.find((m) => m.id === r)?.tone || 'gray'

type AuditRow = { admin: string; action: string; target?: string | null; created: string }
const ACTIVITY_ICON = (action: string) => {
  const a = (action || '').toLowerCase()
  if (a.includes('delete') || a.includes('deactiv') || a.includes('disable')) return UserX
  if (a.includes('role') || a.includes('permission')) return ShieldCheck
  if (a.includes('password') || a.includes('reset') || a.includes('key')) return KeyRound
  return UserPlus
}

const blank = { name: '', email: '', phone: '', role: 'support' as Admin['role'], status: 'active', password: '' }

export default function Admins() {
  const toast = useToast()
  const { admin } = useStore()
  const [rows, setRows] = useState<Admin[] | null>(null)
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const pageSize = 10

  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Admin | null>(null)
  const [form, setForm] = useState<typeof blank>(blank)
  const [busy, setBusy] = useState(false)
  const [menuFor, setMenuFor] = useState<number | null>(null)

  const load = () => {
    setErr('')
    fetchAdmins().then(setRows).catch((e: Error) => setErr(e.message))
    fetchAudit().then((a: any[]) => setAudit(a as AuditRow[])).catch(() => setAudit([]))
  }
  useEffect(load, [])

  const set = (k: keyof typeof blank, v: string) => setForm((p) => ({ ...p, [k]: v }))

  async function submitAdd() {
    setBusy(true)
    try {
      await createAdminUser({ name: form.name, email: form.email, phone: form.phone, role: form.role, password: form.password })
      toast('Admin user created'); setAdding(false); load()
    } catch (e: any) { toast(e.message, 'err') } finally { setBusy(false) }
  }
  async function submitEdit() {
    if (!editing) return
    setBusy(true)
    try {
      await updateAdminUser(editing.id, { name: form.name, phone: form.phone, role: form.role, status: form.status })
      toast('Admin user updated'); setEditing(null); load()
    } catch (e: any) { toast(e.message, 'err') } finally { setBusy(false) }
  }
  async function toggleStatus(a: Admin) {
    setMenuFor(null)
    try {
      await updateAdminUser(a.id, { status: a.status === 'active' ? 'inactive' : 'active' })
      toast(a.status === 'active' ? 'User deactivated' : 'User activated'); load()
    } catch (e: any) { toast(e.message, 'err') }
  }
  async function removeAdmin(a: Admin) {
    setMenuFor(null)
    if (!window.confirm(`Delete admin user ${a.name}?`)) return
    try { await deleteAdminUser(a.id); toast('Admin user deleted'); load() } catch (e: any) { toast(e.message, 'err') }
  }

  const openEdit = (a: Admin) => { setForm({ name: a.name, email: a.email, phone: a.phone || '', role: a.role, status: a.status || 'active', password: '' }); setEditing(a) }

  // hooks must run before any early return
  const filtered = useMemo(() => {
    const list = rows || []
    const ql = q.trim().toLowerCase()
    return list.filter((r) => {
      if (roleFilter !== 'all' && r.role !== roleFilter) return false
      if (statusFilter !== 'all' && (r.status || 'active') !== statusFilter) return false
      if (ql && !(r.name.toLowerCase().includes(ql) || (r.email || '').toLowerCase().includes(ql))) return false
      return true
    })
  }, [rows, q, roleFilter, statusFilter])

  const roleBars = useMemo(() => {
    const list = rows || []
    const total = Math.max(1, list.length)
    return ROLE_META.map((m) => {
      const n = list.filter((r) => r.role === m.id).length
      const pct = (n / total) * 100
      return { label: m.label, value: `${n} (${pct.toFixed(1)}%)`, pct, color: m.color }
    })
  }, [rows])

  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!rows) return <Loading />

  const total = rows.length
  const activeCount = rows.filter((r) => (r.status || 'active') === 'active').length
  const inactiveCount = rows.filter((r) => (r.status || 'active') !== 'active').length
  const superCount = rows.filter((r) => r.role === 'super').length
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)
  const canDelete = can(admin?.role, 'super')

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="stat-row">
        <StatCard icon={<UserCog size={22} />} tint="#5b51e8" label="Total Admin Users" value={total} sub="all time" />
        <StatCard icon={<UserCheck size={22} />} tint="#16a34a" label="Active Users" value={activeCount} sub="all time" />
        <StatCard icon={<UserX size={22} />} tint="#f59e0b" label="Inactive Users" value={inactiveCount} sub="all time" />
        <StatCard icon={<ShieldCheck size={22} />} tint="#2e90fa" label="Super Admins" value={superCount} sub="all time" />
      </div>

      <div className="cols">
        <Card>
          <div className="toolbar">
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search by name, email or role..." />
            <select className="select flt" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1) }}>
              <option value="all">All Roles</option>
              <option value="super">Super Admin</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="support">Support Admin</option>
            </select>
            <select className="select flt" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select className="select flt" defaultValue="all"><option value="all">All Cities</option></select>
            <select className="select flt" defaultValue="date"><option value="date">Joined Date</option></select>
            <button className="btn line"><Filter size={16} /> Filters</button>
            <div className="tb-spacer" />
            <button className="btn" onClick={() => { setForm(blank); setAdding(true) }}><Plus size={17} /> Add Admin User</button>
          </div>

          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>User</th><th>Role</th><th>Email</th><th>Phone</th><th>City</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
              <tbody>
                {pageRows.map((r) => {
                  const active = (r.status || 'active') === 'active'
                  return (
                  <tr key={r.id}>
                    <td><div className="cell-user"><Avatar name={r.name} src={r.avatar} size={36} />
                      <div><strong>{r.name}</strong><small>Joined on {shortDate(r.created)}</small></div></div></td>
                    <td><Badge tone={roleTone(r.role)} dot={false}>{roleLabel(r.role)}</Badge></td>
                    <td className="muted">{r.email}</td>
                    <td className="muted">{r.phone || '—'}</td>
                    <td className="muted">—</td>
                    <td><Badge tone={active ? 'green' : 'red'}>{active ? 'Active' : 'Inactive'}</Badge></td>
                    <td className="muted">{r.last_login ? shortDate(r.last_login) : '—'}</td>
                    <td><div className="actions" style={{ position: 'relative' }}>
                      <button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => openEdit(r)}><Pencil size={15} /></button>
                      <button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => setMenuFor(menuFor === r.id ? null : r.id)}><MoreVertical size={15} /></button>
                      {menuFor === r.id && (
                        <div className="menu" style={{ position: 'absolute', right: 0, top: 34, zIndex: 20, background: 'var(--card, #fff)', border: '1px solid var(--line)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', minWidth: 160, padding: 6 }}>
                          <button className="menu-item" style={menuItemStyle} onClick={() => toggleStatus(r)}>{active ? 'Deactivate' : 'Activate'}</button>
                          <button className="menu-item" style={menuItemStyle} onClick={() => { setMenuFor(null); openEdit(r) }}>Edit</button>
                          {canDelete && <button className="menu-item" style={{ ...menuItemStyle, color: 'var(--red)' }} onClick={() => removeAdmin(r)}>Delete</button>}
                        </div>
                      )}
                    </div></td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <Empty msg="No admin users match your filters." />}
          <Pagination page={page} pageSize={pageSize} total={filtered.length} noun="users" onPage={setPage} />
        </Card>

        <div className="col-rail">
          <Card title="User Summary">
            <Donut data={[
              { label: 'Active', value: activeCount, color: '#16a34a' },
              { label: 'Inactive', value: inactiveCount, color: '#f04438' },
            ]} />
            <div className="legend">
              <LegendRow color="#16a34a" label="Active" value={`${activeCount} (${total ? ((activeCount / total) * 100).toFixed(1) : '0.0'}%)`} />
              <LegendRow color="#f04438" label="Inactive" value={`${inactiveCount} (${total ? ((inactiveCount / total) * 100).toFixed(1) : '0.0'}%)`} />
            </div>
          </Card>

          <Card title="Users by Role">
            <SumBars rows={roleBars} />
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', marginTop: 10, paddingTop: 10, fontSize: 13, fontWeight: 700 }}>
              <span>Total</span><span>{total}</span>
            </div>
          </Card>

          <Card title="Recent Activity">
            <div className="minilist">
              {audit.length === 0 && <Empty msg="No recent activity." />}
              {audit.slice(0, 8).map((a, i) => {
                const Icon = ACTIVITY_ICON(a.action)
                return (
                  <div className="mini-row" key={i}>
                    <span className="mini-ico"><Icon size={16} /></span>
                    <div className="mini-bd"><strong>{a.admin}</strong><small>{a.action}{a.target ? ` · ${a.target}` : ''}</small><small>{shortDate(a.created)}</small></div>
                  </div>
                )
              })}
            </div>
            <div className="link" style={{ display: 'block', textAlign: 'left', marginTop: 10, fontSize: 13 }}>View All Activity</div>
          </Card>
        </div>
      </div>

      {adding && (
        <Modal title="Add Admin User" onClose={() => setAdding(false)} footer={
          <>
            <button className="btn line" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn" disabled={busy} onClick={submitAdd}>{busy ? 'Saving…' : 'Create User'}</button>
          </>
        }>
          <div className="form-grid">
            <Field label="Name"><input value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Email"><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Phone"><input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="Role">
              <select value={form.role} onChange={(e) => set('role', e.target.value)}>
                <option value="super">Super Admin</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="support">Support Admin</option>
              </select>
            </Field>
            <Field label="Password"><input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} /></Field>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title="Edit Admin User" onClose={() => setEditing(null)} footer={
          <>
            <button className="btn line" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" disabled={busy} onClick={submitEdit}>{busy ? 'Saving…' : 'Save Changes'}</button>
          </>
        }>
          <div className="form-grid">
            <Field label="Name"><input value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Email"><input value={form.email} disabled /></Field>
            <Field label="Phone"><input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="Role">
              <select value={form.role} onChange={(e) => set('role', e.target.value)}>
                <option value="super">Super Admin</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="support">Support Admin</option>
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={(e) => set('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          </div>
        </Modal>
      )}
    </div>
  )
}

const menuItemStyle: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
  border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 7,
  fontSize: 13, fontWeight: 600, color: 'var(--ink-2)',
}

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 6 }}>
      <i style={{ width: 9, height: 9, borderRadius: 9, background: color, display: 'inline-block' }} />
      <span style={{ flex: 1 }}>{label}</span>
      <span className="muted">{value}</span>
    </div>
  )
}
