import { useEffect, useMemo, useState } from 'react'
import {
  ShieldCheck, ShieldHalf, Lock, Users2, Plus, Table2, Pencil, Trash2, Download,
  Search, ChevronDown, Check, Minus, Eye, UserCog, Headphones, Wallet, FileText,
  Copy, Activity, FolderCog, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { Card, StatCard, Badge, Loading, useToast } from '../components/UI'
import { fetchAdmins } from '../api'
import type { Admin } from '../types'

type Tone = 'violet' | 'blue' | 'green' | 'amber' | 'red' | 'gray'
type Perm = 'yes' | 'no' | 'view'

interface Role {
  id: string; name: string; desc: string; users: number; active: boolean
  Icon: typeof ShieldCheck; tint: string; roleKey?: Admin['role']
}
interface ModuleRow {
  module: string; desc: string; Icon: typeof ShieldCheck
  view: Perm; add: Perm; edit: Perm; del: Perm; exp: Perm
}

// Fixed system roles (super > admin > manager > support). The extra display roles
// describe the conceptual system; only the four real roles map to backend members.
const ROLES_DEF: readonly Role[] = [
  { id: 'super', name: 'Super Admin', desc: 'Full system access', users: 0, active: true, Icon: ShieldCheck, tint: '#5b51e8', roleKey: 'super' },
  { id: 'admin', name: 'Admin', desc: 'Manage platform operations', users: 0, active: true, Icon: UserCog, tint: '#2e90fa', roleKey: 'admin' },
  { id: 'manager', name: 'Manager', desc: 'Oversee teams and operations', users: 0, active: true, Icon: Users2, tint: '#16a34a', roleKey: 'manager' },
  { id: 'support', name: 'Support Admin', desc: 'Handle support and tickets', users: 0, active: true, Icon: Headphones, tint: '#f59e0b', roleKey: 'support' },
  { id: 'finance', name: 'Finance Admin', desc: 'Manage payments and refunds', users: 2, active: true, Icon: Wallet, tint: '#f04438' },
  { id: 'content', name: 'Content Admin', desc: 'Manage content and CMS', users: 2, active: true, Icon: FileText, tint: '#2e90fa' },
  { id: 'viewer', name: 'Viewer', desc: 'View only access', users: 2, active: false, Icon: Eye, tint: '#868aa6' },
] as const

const MODULES: readonly ModuleRow[] = [
  { module: 'Dashboard', desc: 'Access to dashboard and analytics', Icon: Table2, view: 'yes', add: 'yes', edit: 'yes', del: 'yes', exp: 'yes' },
  { module: 'Customers', desc: 'Manage customer data and profiles', Icon: Users2, view: 'yes', add: 'yes', edit: 'yes', del: 'yes', exp: 'yes' },
  { module: 'Workers (Pros)', desc: 'Manage workers and applications', Icon: UserCog, view: 'yes', add: 'yes', edit: 'yes', del: 'yes', exp: 'yes' },
  { module: 'Bookings', desc: 'Manage bookings and schedule', Icon: FileText, view: 'yes', add: 'yes', edit: 'yes', del: 'yes', exp: 'yes' },
  { module: 'Payments', desc: 'Manage payments and transactions', Icon: Wallet, view: 'yes', add: 'yes', edit: 'yes', del: 'no', exp: 'no' },
  { module: 'Refunds', desc: 'Manage refunds and return requests', Icon: Wallet, view: 'yes', add: 'yes', edit: 'yes', del: 'no', exp: 'no' },
  { module: 'Reports & Analytics', desc: 'Access reports and analytics', Icon: Table2, view: 'yes', add: 'no', edit: 'no', del: 'no', exp: 'yes' },
] as const

const PERM_COLS = [
  { k: 'view', label: 'View' },
  { k: 'add', label: 'Add' },
  { k: 'edit', label: 'Edit' },
  { k: 'del', label: 'Delete' },
  { k: 'exp', label: 'Export' },
] as const

function PermCell({ p }: { p: Perm }) {
  if (p === 'yes') return <span style={{ color: 'var(--green)' }}><Check size={17} strokeWidth={2.6} /></span>
  if (p === 'view') return <span style={{ color: 'var(--muted)' }}><Eye size={16} /></span>
  return <span style={{ color: '#c7c9d6' }}><Minus size={16} strokeWidth={2.6} /></span>
}

const SYSTEM_MSG = 'Roles are defined by the system and cannot be modified'

export default function Roles() {
  const toast = useToast()
  const [admins, setAdmins] = useState<Admin[] | null>(null)
  const [selected, setSelected] = useState<string>('admin')
  const [tab, setTab] = useState<'roles' | 'permissions'>('roles')
  const [detailTab, setDetailTab] = useState<'permissions' | 'users' | 'activity'>('permissions')
  const [roleSearch, setRoleSearch] = useState('')
  const [permSearch, setPermSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState('all')

  useEffect(() => { fetchAdmins().then(setAdmins).catch(() => setAdmins([])) }, [])

  const ROLES = useMemo<Role[]>(() => {
    const list = admins || []
    return ROLES_DEF.map((r) => r.roleKey
      ? { ...r, users: list.filter((a) => a.role === r.roleKey).length }
      : { ...r })
  }, [admins])

  const role = ROLES.find((r) => r.id === selected) || ROLES[0]

  const filteredRoles = useMemo(() => {
    const ql = roleSearch.trim().toLowerCase()
    if (!ql) return ROLES
    return ROLES.filter((r) => r.name.toLowerCase().includes(ql) || r.desc.toLowerCase().includes(ql))
  }, [ROLES, roleSearch])

  const filteredModules = useMemo(() => {
    const ql = permSearch.trim().toLowerCase()
    return MODULES.filter((m) => {
      if (moduleFilter !== 'all' && m.module !== moduleFilter) return false
      if (ql && !(m.module.toLowerCase().includes(ql) || m.desc.toLowerCase().includes(ql))) return false
      return true
    })
  }, [permSearch, moduleFilter])

  const activeRoles = ROLES.filter((r) => r.active).length

  function exportMatrix() {
    const header = ['Module', 'Description', ...PERM_COLS.map((c) => c.label)]
    const lines = [header.join(',')]
    for (const m of MODULES) {
      const row = [m.module, m.desc, m.view, m.add, m.edit, m.del, m.exp]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      lines.push(row.join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'permission-matrix.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  if (!admins) return <Loading />

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="stat-row">
        <StatCard icon={<ShieldCheck size={22} />} tint="#5b51e8" label="Total Roles" value={ROLES.length} sub="system roles" />
        <StatCard icon={<ShieldHalf size={22} />} tint="#16a34a" label="Active Roles" value={activeRoles} sub="system roles" />
        <StatCard icon={<Users2 size={22} />} tint="#f59e0b" label="Total Permissions" value={54} sub="across modules" />
        <StatCard icon={<Lock size={22} />} tint="#2e90fa" label="Custom Roles" value={4} sub="system roles" />
      </div>

      <div className="toolbar" style={{ marginBottom: 0 }}>
        <div className="tabs" style={{ marginBottom: 0, border: 'none', flex: '0 0 auto' }}>
          <button className={'tab' + (tab === 'roles' ? ' active' : '')} onClick={() => setTab('roles')}>Roles</button>
          <button className={'tab' + (tab === 'permissions' ? ' active' : '')} onClick={() => setTab('permissions')}>Permissions</button>
        </div>
        <div className="tb-spacer" />
        <button className="btn line"><Table2 size={16} /> Permission Matrix</button>
        <button className="btn" onClick={() => toast(SYSTEM_MSG, 'err')}><Plus size={17} /> Add Role</button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '320px 1fr 300px', gap: 16, alignItems: 'start' }}>
        {/* ---- roles list ---- */}
        <Card title={`Roles (${ROLES.length})`} right={
          <div className="searchbox" style={{ maxWidth: 150 }}><Search size={15} /><input placeholder="Search role…" value={roleSearch} onChange={(e) => setRoleSearch(e.target.value)} /></div>
        }>
          <div className="minilist">
            {filteredRoles.map((r) => (
              <button key={r.id} onClick={() => setSelected(r.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer',
                  padding: '12px 11px', borderRadius: 11, border: 'none', marginBottom: 2,
                  background: selected === r.id ? 'var(--violet-50)' : 'transparent',
                  borderLeft: selected === r.id ? '3px solid var(--violet)' : '3px solid transparent',
                }}>
                <span style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', flexShrink: 0, background: r.tint + '1f', color: r.tint }}><r.Icon size={19} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 13.5, display: 'block' }}>{r.name}</strong>
                  <small className="muted" style={{ fontSize: 12 }}>{r.desc}</small>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <strong style={{ fontSize: 14, display: 'block' }}>{r.users}</strong>
                  <small className="muted" style={{ fontSize: 11 }}>{r.users === 1 ? 'User' : 'Users'}</small>
                </div>
                <Badge tone={r.active ? 'green' : 'red'}>{r.active ? 'Active' : 'Inactive'}</Badge>
              </button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>Showing 1 to {filteredRoles.length} of {ROLES.length} roles</p>
        </Card>

        {/* ---- role details ---- */}
        <Card>
          <div className="card-head" style={{ alignItems: 'flex-start' }}>
            <h3 style={{ fontSize: 16 }}>Role Details</h3>
            <div className="actions">
              <button className="btn line" onClick={() => toast(SYSTEM_MSG, 'err')}><Pencil size={15} /> Edit Role</button>
              <button className="btn line" style={{ color: 'var(--red)' }} onClick={() => toast(SYSTEM_MSG, 'err')}><Trash2 size={15} /> Delete Role</button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '8px 0 16px' }}>
            <span style={{ width: 56, height: 56, borderRadius: 15, display: 'grid', placeItems: 'center', background: role.tint + '1f', color: role.tint, flexShrink: 0 }}><role.Icon size={26} /></span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <strong style={{ fontSize: 18 }}>{role.name}</strong>
                <Badge tone={role.active ? 'green' : 'red'}>{role.active ? 'Active' : 'Inactive'}</Badge>
              </div>
              <p className="muted" style={{ fontSize: 13, marginTop: 3 }}>{role.desc} and data</p>
            </div>
          </div>

          <div className="tabs" style={{ marginBottom: 18 }}>
            <button className={'tab' + (detailTab === 'permissions' ? ' active' : '')} onClick={() => setDetailTab('permissions')}>Permissions</button>
            <button className={'tab' + (detailTab === 'users' ? ' active' : '')} onClick={() => setDetailTab('users')}>Users ({role.users})</button>
            <button className={'tab' + (detailTab === 'activity' ? ' active' : '')} onClick={() => setDetailTab('activity')}>Role Activity</button>
          </div>

          {detailTab === 'permissions' && (
            <>
              <div className="toolbar">
                <strong style={{ fontSize: 14.5 }}>Permissions (32)</strong>
                <div className="searchbox" style={{ maxWidth: 240 }}><Search size={15} /><input placeholder="Search permission…" value={permSearch} onChange={(e) => setPermSearch(e.target.value)} /></div>
                <div className="tb-spacer" />
                <select className="select flt" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
                  <option value="all">All Modules</option>
                  {MODULES.map((m) => <option key={m.module} value={m.module}>{m.module}</option>)}
                </select>
                <button className="btn line" onClick={exportMatrix}><Download size={15} /> Export</button>
              </div>

              <div className="tablewrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Module / Permission</th>
                      {PERM_COLS.map((c) => <th key={c.k} style={{ textAlign: 'center' }}>{c.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredModules.map((m) => (
                      <tr key={m.module}>
                        <td>
                          <div className="cell-user">
                            <span className="mini-ico" style={{ width: 30, height: 30 }}><m.Icon size={16} /></span>
                            <div><strong>{m.module}</strong><small>{m.desc}</small></div>
                            <ChevronDown size={15} style={{ color: 'var(--muted)', marginLeft: 4 }} />
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}><div style={{ display: 'inline-flex' }}><PermCell p={m.view} /></div></td>
                        <td style={{ textAlign: 'center' }}><div style={{ display: 'inline-flex' }}><PermCell p={m.add} /></div></td>
                        <td style={{ textAlign: 'center' }}><div style={{ display: 'inline-flex' }}><PermCell p={m.edit} /></div></td>
                        <td style={{ textAlign: 'center' }}><div style={{ display: 'inline-flex' }}><PermCell p={m.del} /></div></td>
                        <td style={{ textAlign: 'center' }}><div style={{ display: 'inline-flex' }}><PermCell p={m.exp} /></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pager">
                <span className="pager-info">Showing 1 to {filteredModules.length} of 10 modules</span>
                <div className="pager-mid">
                  <button className="pgbtn" disabled><ChevronLeft size={15} /></button>
                  <button className="pgbtn active">1</button>
                  <button className="pgbtn">2</button>
                  <button className="pgbtn"><ChevronRight size={15} /></button>
                </div>
                <div className="pgsize" />
              </div>
            </>
          )}

          {detailTab === 'users' && <p className="muted" style={{ padding: '30px 0' }}>{role.users} users assigned to the {role.name} role.</p>}
          {detailTab === 'activity' && <p className="muted" style={{ padding: '30px 0' }}>No recent activity for the {role.name} role.</p>}
        </Card>

        {/* ---- right rail ---- */}
        <div className="col-rail">
          <Card title="About Roles">
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
              Roles help you manage access control by defining what users can see and do in the system.
            </p>
            <div className="minilist">
              <AboutRow Icon={Plus} label="Create custom roles" />
              <AboutRow Icon={ShieldCheck} label="Assign permissions" />
              <AboutRow Icon={Lock} label="Manage role access" />
            </div>
          </Card>

          <Card title="Permission Legend">
            <div className="minilist">
              <LegendRow color="var(--green)" Icon={Check} title="Allowed" sub="Permission is granted" />
              <LegendRow color="#c7c9d6" Icon={Minus} title="Not Allowed" sub="Permission is denied" />
              <LegendRow color="var(--muted)" Icon={Eye} title="View Only" sub="View access only" />
            </div>
          </Card>

          <Card title="Quick Actions">
            <div className="minilist">
              <QuickRow Icon={Table2} title="Permission Matrix" sub="View all role permissions" />
              <QuickRow Icon={Copy} title="Copy Role" sub="Duplicate an existing role" />
              <QuickRow Icon={Activity} title="Role Activity" sub="View role change history" />
              <QuickRow Icon={FolderCog} title="Permission Categories" sub="Manage permission groups" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function AboutRow({ Icon, label }: { Icon: typeof Plus; label: string }) {
  return (
    <div className="mini-row" style={{ alignItems: 'center' }}>
      <span className="mini-ico" style={{ width: 28, height: 28 }}><Icon size={15} /></span>
      <span className="mini-bd" style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
    </div>
  )
}

function LegendRow({ color, Icon, title, sub }: { color: string; Icon: typeof Check; title: string; sub: string }) {
  return (
    <div className="mini-row" style={{ alignItems: 'center' }}>
      <span style={{ width: 28, height: 28, borderRadius: 9, display: 'grid', placeItems: 'center', flexShrink: 0, color, background: 'var(--line-2)' }}><Icon size={15} strokeWidth={2.6} /></span>
      <div className="mini-bd"><strong>{title}</strong><small>{sub}</small></div>
    </div>
  )
}

function QuickRow({ Icon, title, sub }: { Icon: typeof Plus; title: string; sub: string }) {
  return (
    <div className="mini-row link-row" style={{ alignItems: 'center' }}>
      <span className="mini-ico"><Icon size={16} /></span>
      <div className="mini-bd"><strong>{title}</strong><small>{sub}</small></div>
      <ChevronRight size={16} style={{ color: 'var(--muted)' }} />
    </div>
  )
}
