import { useEffect, useMemo, useState } from 'react'
import {
  ShieldCheck, ShieldHalf, Lock, Users2, Plus, Pencil, Trash2, ChevronLeft, Check, Search, Copy, Info,
} from 'lucide-react'
import { Card, StatCard, Badge, Loading, ErrorState, Field, useToast, useConfirm } from '../components/UI'
import { fetchRoles, fetchPermissionCatalog, createRole, updateRole, deleteRole } from '../api'
import type { Role, PermGroup } from '../types'
import { useStore, has } from '../store'

/* Roles & Permissions — the real RBAC editor (replaces the old static mock).
 *
 * A role is a named bundle of permission keys from the server-owned catalogue. The four system
 * roles are canonical baselines: shown read-only, reset to their bundle on every boot. Custom roles
 * are fully editable and are what you build for job titles like "Payroll Executive" or "Zone
 * Manager". Editing here is enforced everywhere — nav, routes, buttons, and the APIs all gate on the
 * same permission keys, so unchecking a box genuinely removes access.
 */

const SYS_TINT: Record<string, string> = { super: '#5b51e8', admin: '#2e90fa', manager: '#16a34a', support: '#f59e0b' }
const tintOf = (r: Role) => SYS_TINT[r.key] || '#7c6cf0'

type Draft = { key: string; name: string; description: string; landing: string; active: boolean; perms: Set<string> }
const draftFrom = (r: Role): Draft => ({ key: r.key, name: r.name, description: r.description, landing: r.landing || '/dashboard', active: r.active, perms: new Set(r.permissions) })
const emptyDraft = (): Draft => ({ key: '', name: '', description: '', landing: '/dashboard', active: true, perms: new Set() })

export default function Roles() {
  const toast = useToast()
  const confirm = useConfirm()
  const { admin } = useStore()
  const canManage = has(admin, 'roles.manage')

  const [roles, setRoles] = useState<Role[] | null>(null)
  const [catalog, setCatalog] = useState<PermGroup[]>([])
  const [err, setErr] = useState('')
  const [selected, setSelected] = useState<string>('')      // role key shown in the detail pane
  const [editing, setEditing] = useState<Draft | null>(null) // non-null → the editor is open
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [roleSearch, setRoleSearch] = useState('')
  const [permSearch, setPermSearch] = useState('')

  const load = () => {
    setErr('')
    Promise.all([fetchRoles(), fetchPermissionCatalog()])
      .then(([r, c]) => { setRoles(r.roles); setCatalog(c.catalog); setSelected((s) => s || r.roles[0]?.key || '') })
      .catch((e: Error) => setErr(e.message))
  }
  useEffect(load, [])

  const totalPerms = useMemo(() => catalog.reduce((n, g) => n + g.perms.length, 0), [catalog])

  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!roles) return <Loading />

  const role = roles.find((r) => r.key === selected) || roles[0]
  const filteredRoles = roles.filter((r) => {
    const q = roleSearch.trim().toLowerCase()
    return !q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
  })

  const openCreate = () => { setCreating(true); setEditing(emptyDraft()) }
  const openEdit = (r: Role) => { setCreating(false); setEditing(draftFrom(r)) }
  const openClone = (r: Role) => { setCreating(true); setEditing({ ...draftFrom(r), key: '', name: `${r.name} (copy)` }) }

  const save = async () => {
    if (!editing) return
    const body = { name: editing.name.trim(), description: editing.description, landing: editing.landing, active: editing.active, permissions: [...editing.perms] }
    if (!body.name) { toast('Give the role a name', 'err'); return }
    setSaving(true)
    try {
      if (creating) { const r = await createRole(body); setSelected(r.role.key); toast('Role created') }
      else { const r = await updateRole(editing.key, body); setSelected(r.role.key); toast('Role updated') }
      setEditing(null); load()
    } catch (e) { toast((e as Error).message, 'err') } finally { setSaving(false) }
  }

  const remove = async (r: Role) => {
    if (!(await confirm({ title: `Delete the “${r.name}” role?`, message: 'This cannot be undone. Any admin still on this role must be reassigned first.', confirmLabel: 'Delete', danger: true }))) return
    try { await deleteRole(r.key); if (selected === r.key) setSelected(roles[0]?.key || ''); toast('Role deleted'); load() }
    catch (e) { toast((e as Error).message, 'err') }
  }

  const activeRoles = roles.filter((r) => r.active).length
  const customRoles = roles.filter((r) => !r.isSystem).length

  /* ---------------- EDITOR ---------------- */
  if (editing) {
    const d = editing
    const setD = (patch: Partial<Draft>) => setEditing({ ...d, ...patch })
    const togglePerm = (key: string) => { const next = new Set(d.perms); next.has(key) ? next.delete(key) : next.add(key); setD({ perms: next }) }
    const toggleGroup = (g: PermGroup, on: boolean) => { const next = new Set(d.perms); g.perms.forEach((p) => (on ? next.add(p.key) : next.delete(p.key))); setD({ perms: next }) }
    const shownGroups = catalog.map((g) => ({ ...g, perms: g.perms.filter((p) => { const q = permSearch.trim().toLowerCase(); return !q || p.label.toLowerCase().includes(q) || g.label.toLowerCase().includes(q) || p.key.includes(q) }) })).filter((g) => g.perms.length)

    return (
      <div className="grid" style={{ gap: 16 }}>
        <button className="btn line" style={{ justifySelf: 'start' }} onClick={() => setEditing(null)}><ChevronLeft size={15} /> Back to roles</button>
        <Card>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label="Role name *"><input value={d.name} onChange={(e) => setD({ name: e.target.value })} placeholder="e.g. Payroll Executive" /></Field>
            <Field label="Landing page"><input value={d.landing} onChange={(e) => setD({ landing: e.target.value })} placeholder="/dashboard" /></Field>
          </div>
          <Field label="Description"><input value={d.description} onChange={(e) => setD({ description: e.target.value })} placeholder="What is this role for?" /></Field>
          {creating && <div className="muted" style={{ fontSize: 12 }}>A stable key (e.g. <code>payroll_executive</code>) is generated from the name.</div>}
          {!creating && <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 6 }}>
            <input type="checkbox" checked={d.active} onChange={(e) => setD({ active: e.target.checked })} /> Active (can be assigned to admin users)
          </label>}
        </Card>

        <Card title={`Permissions (${d.perms.size} of ${totalPerms})`} right={
          <div className="searchbox" style={{ maxWidth: 220 }}><Search size={15} /><input placeholder="Filter permissions…" value={permSearch} onChange={(e) => setPermSearch(e.target.value)} /></div>
        }>
          <div style={{ display: 'grid', gap: 14 }}>
            {shownGroups.map((g) => {
              const on = g.perms.filter((p) => d.perms.has(p.key)).length
              const all = on === g.perms.length
              return (
                <div key={g.module} style={{ borderTop: '1px solid var(--line, #eef0f4)', paddingTop: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <strong style={{ fontSize: 13.5 }}>{g.label} <span className="muted" style={{ fontWeight: 400 }}>· {on}/{g.perms.length}</span></strong>
                    <button className="btn line" style={{ padding: '3px 9px', fontSize: 11.5 }} onClick={() => toggleGroup(g, !all)}>{all ? 'Clear' : 'Select all'}</button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {g.perms.map((p) => {
                      const sel = d.perms.has(p.key)
                      return (
                        <button key={p.key} onClick={() => togglePerm(p.key)} title={p.key} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', fontSize: 12.5, borderRadius: 999, cursor: 'pointer',
                          border: '1px solid ' + (sel ? '#4f46e5' : 'var(--line,#e5e7eb)'), background: sel ? '#eef2ff' : '#fff', color: sel ? '#4f46e5' : 'inherit', fontWeight: sel ? 600 : 400,
                        }}>
                          {sel && <Check size={13} strokeWidth={3} />}{p.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn line" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn" disabled={saving || !d.name.trim()} onClick={save}>{saving ? 'Saving…' : creating ? 'Create role' : 'Save changes'}</button>
        </div>
      </div>
    )
  }

  /* ---------------- LIST + DETAIL ---------------- */
  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="stat-row">
        <StatCard icon={<ShieldCheck size={22} />} tint="#5b51e8" label="Total Roles" value={roles.length} sub={`${customRoles} custom`} />
        <StatCard icon={<ShieldHalf size={22} />} tint="#16a34a" label="Active Roles" value={activeRoles} sub="assignable" />
        <StatCard icon={<Users2 size={22} />} tint="#f59e0b" label="Permissions" value={totalPerms} sub="across modules" />
        <StatCard icon={<Lock size={22} />} tint="#2e90fa" label="System Roles" value={roles.filter((r) => r.isSystem).length} sub="built-in" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>
        {/* roles list */}
        <Card title={`Roles (${roles.length})`} right={canManage
          ? <button className="btn" style={{ padding: '5px 11px', fontSize: 12.5 }} onClick={openCreate}><Plus size={15} /> New</button>
          : undefined}>
          <div className="searchbox" style={{ marginBottom: 10 }}><Search size={15} /><input placeholder="Search role…" value={roleSearch} onChange={(e) => setRoleSearch(e.target.value)} /></div>
          <div className="minilist">
            {filteredRoles.map((r) => (
              <button key={r.key} onClick={() => setSelected(r.key)} style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer',
                padding: '11px 11px', borderRadius: 11, border: 'none', marginBottom: 2,
                background: selected === r.key ? 'var(--violet-50, #eef2ff)' : 'transparent',
                borderLeft: '3px solid ' + (selected === r.key ? tintOf(r) : 'transparent'),
              }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', flexShrink: 0, background: tintOf(r) + '1f', color: tintOf(r) }}><ShieldCheck size={18} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 13.5, display: 'block' }}>{r.name}</strong>
                  <small className="muted" style={{ fontSize: 11.5 }}>{r.permissions.length} perms{r.isSystem ? ' · system' : ''}</small>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <strong style={{ fontSize: 14, display: 'block' }}>{r.users}</strong>
                  <small className="muted" style={{ fontSize: 11 }}>{r.users === 1 ? 'user' : 'users'}</small>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* detail */}
        {role && <RoleDetail key={role.key} role={role} catalog={catalog} canManage={canManage}
          onEdit={() => openEdit(role)} onClone={() => openClone(role)} onDelete={() => remove(role)} />}
      </div>
    </div>
  )
}

function RoleDetail({ role, catalog, canManage, onEdit, onClone, onDelete }:
  { role: Role; catalog: PermGroup[]; canManage: boolean; onEdit: () => void; onClone: () => void; onDelete: () => void }) {
  const held = new Set(role.permissions)
  return (
    <Card>
      <div className="card-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ fontSize: 17, margin: 0 }}>{role.name}</h3>
            <Badge tone={role.isSystem ? 'blue' : 'violet'} dot={false}>{role.isSystem ? 'System' : 'Custom'}</Badge>
            <Badge tone={role.active ? 'green' : 'red'}>{role.active ? 'Active' : 'Paused'}</Badge>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>{role.description || '—'} · key <code>{role.key}</code> · {role.users} user(s)</p>
        </div>
        {canManage && (
          <div className="actions">
            <button className="btn line" onClick={onClone}><Copy size={15} /> Clone</button>
            {role.isSystem
              ? <button className="btn line" disabled title="System roles are read-only"><Pencil size={15} /> Edit</button>
              : <button className="btn line" onClick={onEdit}><Pencil size={15} /> Edit</button>}
            {!role.isSystem && <button className="btn line" style={{ color: 'var(--red)' }} onClick={onDelete}><Trash2 size={15} /> Delete</button>}
          </div>
        )}
      </div>

      {role.isSystem && (
        <div style={{ display: 'flex', gap: 8, fontSize: 12, background: '#eff6ff', color: '#1e40af', padding: 10, borderRadius: 10, margin: '4px 0 14px' }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>This is a built-in role — its permissions are fixed and reset on every deploy. To make a variant, <strong>Clone</strong> it into a custom role you can edit.</span>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12, marginTop: role.isSystem ? 0 : 8 }}>
        {catalog.map((g) => {
          const on = g.perms.filter((p) => held.has(p.key)).length
          if (role.key === 'super') { /* super holds everything; show all lit */ }
          return (
            <div key={g.module} style={{ borderTop: '1px solid var(--line, #eef0f4)', paddingTop: 10 }}>
              <strong style={{ fontSize: 13, display: 'block', marginBottom: 7 }}>{g.label} <span className="muted" style={{ fontWeight: 400 }}>· {on}/{g.perms.length}</span></strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {g.perms.map((p) => {
                  const sel = held.has(p.key)
                  return (
                    <span key={p.key} title={p.key} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', fontSize: 12, borderRadius: 999,
                      border: '1px solid ' + (sel ? '#c7d2fe' : 'var(--line,#eef0f4)'), background: sel ? '#eef2ff' : '#fafafa',
                      color: sel ? '#4f46e5' : '#b0b4c0', fontWeight: sel ? 600 : 400,
                    }}>
                      {sel ? <Check size={12} strokeWidth={3} /> : null}{p.label}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
