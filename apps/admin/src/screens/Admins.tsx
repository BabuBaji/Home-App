import { useEffect, useMemo, useState } from 'react'
import { UserCog, UserCheck, UserX, ShieldCheck, Pencil, MoreVertical, Filter, Plus, UserPlus, KeyRound } from 'lucide-react'
import { StatCard, Card, Badge, Avatar, SearchBox, Pagination, SumBars, Modal, Field, Loading, ErrorState, Empty, useToast, useConfirm, shortDate } from '../components/UI'
import { Donut } from '../components/Charts'
import { fetchAdmins, createAdminUser, updateAdminUser, deleteAdminUser, fetchAudit, fetchRoles, fetchZones, type Zone } from '../api'
import type { Admin, Role } from '../types'
import { useStore, has } from '../store'

// Colours for the four system roles; custom roles fall back to a neutral tone. Labels always come
// from the live roles list so a custom role shows its real name everywhere.
const SYS_TONE: Record<string, { tone: string; color: string }> = {
  super: { tone: 'violet', color: '#5b51e8' },
  admin: { tone: 'blue', color: '#2e90fa' },
  manager: { tone: 'green', color: '#16a34a' },
  support: { tone: 'amber', color: '#f59e0b' },
}
const roleTone = (r: string) => SYS_TONE[r]?.tone || 'gray'
const roleColor = (r: string) => SYS_TONE[r]?.color || '#98a2b3'

type AuditRow = { admin: string; action: string; target?: string | null; created: string }
const ACTIVITY_ICON = (action: string) => {
  const a = (action || '').toLowerCase()
  if (a.includes('delete') || a.includes('deactiv') || a.includes('disable')) return UserX
  if (a.includes('role') || a.includes('permission')) return ShieldCheck
  if (a.includes('password') || a.includes('reset') || a.includes('key')) return KeyRound
  return UserPlus
}

type ScopeType = 'all' | 'city' | 'zone' | 'team'
const blank = { name: '', email: '', phone: '', role: 'support', status: 'active', password: '', scopeType: 'all' as ScopeType, scopeValues: [] as (string | number)[], reportsTo: '' }

export default function Admins() {
  const toast = useToast()
  const confirm = useConfirm()
  const { admin } = useStore()
  const [rows, setRows] = useState<Admin[] | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [zones, setZones] = useState<Zone[]>([])
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
  // Roles for the dropdowns/labels — includes custom roles. Needs roles.view; harmless if it 403s
  // (the admin simply sees role keys instead of names, and the built-in add/edit modals still work).
  useEffect(() => { fetchRoles().then((r) => setRoles(r.roles)).catch(() => setRoles([])) }, [])
  // Zones carry their city, so we derive both the city list and the zone list for the scope picker.
  useEffect(() => { fetchZones().then(setZones).catch(() => setZones([])) }, [])
  const roleLabel = (key: string) => roles.find((r) => r.key === key)?.name || key
  const assignableRoles = roles.filter((r) => r.active)
  const cityOptions = [...new Set(zones.map((z) => z.city).filter(Boolean))].sort()
  const zoneName = (id: number | string) => zones.find((z) => z.id === Number(id))?.name || `Zone ${id}`
  const adminName = (id: number) => (rows || []).find((a) => a.id === id)?.name || `#${id}`
  const compact = (labels: string[]) => (labels.length <= 2 ? labels.join(', ') : `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`)
  // Effective scope = own turf + everything rolled up from this admin's reports.
  const effLabel = (a: Admin) => {
    const e = a.effectiveScope
    if (!e || e.type === 'all') return 'All'
    const cities = e.cities || []
    const zids = e.zoneIds || []
    if (!cities.length && !zids.length) return 'None'
    return compact(cities.length ? cities : zids.map(zoneName))
  }

  const set = (k: keyof typeof blank, v: string) => setForm((p) => ({ ...p, [k]: v }))
  const setScopeType = (t: ScopeType) => setForm((p) => ({ ...p, scopeType: t, scopeValues: [] }))
  const toggleScopeValue = (v: string | number) => setForm((p) => ({ ...p, scopeValues: p.scopeValues.includes(v) ? p.scopeValues.filter((x) => x !== v) : [...p.scopeValues, v] }))

  async function submitAdd() {
    setBusy(true)
    try {
      await createAdminUser({ name: form.name, email: form.email, phone: form.phone, role: form.role, password: form.password, scopeType: form.scopeType, scopeValues: form.scopeValues, reportsTo: form.reportsTo ? Number(form.reportsTo) : null })
      toast('Admin user created'); setAdding(false); load()
    } catch (e: any) { toast(e.message, 'err') } finally { setBusy(false) }
  }
  async function submitEdit() {
    if (!editing) return
    setBusy(true)
    try {
      await updateAdminUser(editing.id, { name: form.name, phone: form.phone, role: form.role, status: form.status, scopeType: form.scopeType, scopeValues: form.scopeValues, reportsTo: form.reportsTo ? Number(form.reportsTo) : null })
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
    if (!(await confirm({ title: `Delete admin user ${a.name}?`, message: 'They will lose all console access.', confirmLabel: 'Delete', danger: true }))) return
    try { await deleteAdminUser(a.id); toast('Admin user deleted'); load() } catch (e: any) { toast(e.message, 'err') }
  }

  const openEdit = (a: Admin) => { setForm({ name: a.name, email: a.email, phone: a.phone || '', role: a.role, status: a.status || 'active', password: '', scopeType: a.scopeType || 'all', scopeValues: a.scopeValues || [], reportsTo: a.reportsTo ? String(a.reportsTo) : '' }); setEditing(a) }

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
    // One bar per role that either exists in the catalogue or is actually held by someone.
    const keys = [...new Set([...roles.map((r) => r.key), ...list.map((r) => r.role)])]
    return keys.map((key) => {
      const n = list.filter((r) => r.role === key).length
      const pct = (n / total) * 100
      return { label: roles.find((r) => r.key === key)?.name || key, value: `${n} (${pct.toFixed(1)}%)`, pct, color: roleColor(key) }
    }).filter((b) => !b.label.startsWith('_') )
  }, [rows, roles])

  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!rows) return <Loading />

  const total = rows.length
  const activeCount = rows.filter((r) => (r.status || 'active') === 'active').length
  const inactiveCount = rows.filter((r) => (r.status || 'active') !== 'active').length
  const superCount = rows.filter((r) => r.role === 'super').length
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)
  const canDelete = has(admin, 'admins.delete')
  const canCreate = has(admin, 'admins.create')
  const canEdit = has(admin, 'admins.edit')

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
              {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
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
            {canCreate && <button className="btn" onClick={() => { setForm(blank); setAdding(true) }}><Plus size={17} /> Add Admin User</button>}
          </div>

          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>User</th><th>Role</th><th>Email</th><th>Phone</th><th>Scope</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
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
                    <td>
                      {(!r.scopeType || r.scopeType === 'all')
                        ? <span className="muted">All</span>
                        : <Badge tone="blue" dot={false}>{effLabel(r)}</Badge>}
                      {r.scopeType === 'team' && <div className="muted" style={{ fontSize: 11 }}>rolled up from reports</div>}
                      {r.reportsTo ? <div className="muted" style={{ fontSize: 11 }}>↳ reports to {adminName(r.reportsTo)}</div> : null}
                    </td>
                    <td><Badge tone={active ? 'green' : 'red'}>{active ? 'Active' : 'Inactive'}</Badge></td>
                    <td className="muted">{r.last_login ? shortDate(r.last_login) : '—'}</td>
                    <td><div className="actions" style={{ position: 'relative' }}>
                      {canEdit && <button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => openEdit(r)}><Pencil size={15} /></button>}
                      {(canEdit || canDelete) && <button className="iconbtn" style={{ width: 30, height: 30 }} onClick={() => setMenuFor(menuFor === r.id ? null : r.id)}><MoreVertical size={15} /></button>}
                      {!canEdit && !canDelete && <span className="muted" style={{ fontSize: 12 }}>—</span>}
                      {menuFor === r.id && (
                        <div className="menu" style={{ position: 'absolute', right: 0, top: 34, zIndex: 20, background: 'var(--card, #fff)', border: '1px solid var(--line)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', minWidth: 160, padding: 6 }}>
                          {canEdit && <button className="menu-item" style={menuItemStyle} onClick={() => toggleStatus(r)}>{active ? 'Deactivate' : 'Activate'}</button>}
                          {canEdit && <button className="menu-item" style={menuItemStyle} onClick={() => { setMenuFor(null); openEdit(r) }}>Edit</button>}
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
          <Card title="Organization">
            {rows.length === 0
              ? <div className="muted" style={{ fontSize: 12.5 }}>No admins yet.</div>
              : <OrgTree admins={rows} roleLabel={roleLabel} />}
            <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>A manager sees the combined data scope of everyone below them.</div>
          </Card>
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
                {assignableRoles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="Password"><input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} /></Field>
            <Field label="Reports to (manager)">
              <select value={form.reportsTo} onChange={(e) => set('reportsTo', e.target.value)}>
                <option value="">— None (top level) —</option>
                {(rows || []).filter((a) => !editing || a.id !== editing.id).map((a) => <option key={a.id} value={a.id}>{a.name} · {roleLabel(a.role)}</option>)}
              </select>
            </Field>
            <ScopePicker scopeType={form.scopeType} scopeValues={form.scopeValues} cities={cityOptions} zones={zones} onType={setScopeType} onToggle={toggleScopeValue} />
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
                {assignableRoles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={(e) => set('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
            <Field label="Reports to (manager)">
              <select value={form.reportsTo} onChange={(e) => set('reportsTo', e.target.value)}>
                <option value="">— None (top level) —</option>
                {(rows || []).filter((a) => !editing || a.id !== editing.id).map((a) => <option key={a.id} value={a.id}>{a.name} · {roleLabel(a.role)}</option>)}
              </select>
            </Field>
            <ScopePicker scopeType={form.scopeType} scopeValues={form.scopeValues} cities={cityOptions} zones={zones} onType={setScopeType} onToggle={toggleScopeValue} />
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

function OrgTree({ admins, roleLabel }: { admins: Admin[]; roleLabel: (k: string) => string }) {
  const childrenOf = (pid: number | null) => admins.filter((a) => (a.reportsTo ?? null) === pid).sort((a, b) => a.name.localeCompare(b.name))
  const renderNode = (a: Admin, depth: number): React.ReactNode => (
    <div key={a.id}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', paddingLeft: depth * 14, fontSize: 12.5 }}>
        {depth > 0 && <span className="muted">↳</span>}
        <strong>{a.name}</strong>
        <span className="muted" style={{ fontSize: 11 }}>· {roleLabel(a.role)}</span>
      </div>
      {childrenOf(a.id).map((c) => renderNode(c, depth + 1))}
    </div>
  )
  // Roots = admins with no manager (or whose manager isn't in the list).
  const ids = new Set(admins.map((a) => a.id))
  const roots = admins.filter((a) => !a.reportsTo || !ids.has(a.reportsTo)).sort((a, b) => a.name.localeCompare(b.name))
  return <div>{roots.map((r) => renderNode(r, 0))}</div>
}

function ScopePicker({ scopeType, scopeValues, cities, zones, onType, onToggle }:
  { scopeType: ScopeType; scopeValues: (string | number)[]; cities: string[]; zones: Zone[]; onType: (t: ScopeType) => void; onToggle: (v: string | number) => void }) {
  const opts = scopeType === 'city' ? cities.map((c) => ({ v: c as string | number, label: c })) : zones.map((z) => ({ v: z.id as string | number, label: `${z.name} · ${z.city || '—'}` }))
  return (
    <Field label="Data scope">
      <select value={scopeType} onChange={(e) => onType(e.target.value as ScopeType)}>
        <option value="all">Entire company — all data</option>
        <option value="city">Specific cities</option>
        <option value="zone">Specific zones</option>
        <option value="team">Team — roll up from reports</option>
      </select>
      {(scopeType === 'city' || scopeType === 'zone') && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {opts.length === 0 && <span className="muted" style={{ fontSize: 12 }}>No {scopeType === 'city' ? 'cities' : 'zones'} defined yet.</span>}
            {opts.map((o) => {
              const on = scopeValues.includes(o.v)
              return (
                <button type="button" key={String(o.v)} onClick={() => onToggle(o.v)} style={{
                  padding: '5px 10px', fontSize: 12.5, borderRadius: 999, cursor: 'pointer',
                  border: '1px solid ' + (on ? '#4f46e5' : 'var(--line,#e5e7eb)'), background: on ? '#eef2ff' : '#fff', color: on ? '#4f46e5' : 'inherit', fontWeight: on ? 600 : 400,
                }}>{o.label}</button>
              )
            })}
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
            Own turf: the selected {scopeType === 'city' ? 'cities' : 'zones'}, plus anything rolled up from their reports. Permissions still control what they can do.
          </div>
        </>
      )}
      {scopeType === 'team' && (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
          No territory of their own — this admin automatically sees the combined scope of everyone reporting to them. Set “Reports to” on those admins to build the team.
        </div>
      )}
    </Field>
  )
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
