import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Network, Users2, GitBranch, Layers, UserCog, ChevronDown, ChevronRight, MapPin, Pencil, CornerDownRight, Building2,
} from 'lucide-react'
import { Card, StatCard, Badge, Avatar, Loading, ErrorState, Dropdown, useToast } from '../components/UI'
import { fetchAdmins, fetchRoles, fetchZones, updateAdminUser, type Zone } from '../api'
import type { Admin, Role } from '../types'
import { useStore, has } from '../store'

/* Organization — the reporting tree in full.
 *
 * admins.reports_to forms the hierarchy; a manager's EFFECTIVE data scope is their own turf plus the
 * roll-up of everyone below them (resolved server-side). This screen visualises that structure and
 * lets you re-parent an admin inline (cycles are rejected by the server).
 */

const SYS_TINT: Record<string, string> = { super: '#5b51e8', admin: '#2e90fa', manager: '#16a34a', support: '#f59e0b' }
const tintOf = (key: string) => SYS_TINT[key] || '#7c6cf0'

export default function OrgHierarchy() {
  const toast = useToast()
  const nav = useNavigate()
  const { admin } = useStore()
  const canEdit = has(admin, 'admins.edit')

  const [admins, setAdmins] = useState<Admin[] | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [err, setErr] = useState('')
  const [sel, setSel] = useState<number | null>(null)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)

  const load = () => {
    setErr('')
    Promise.all([fetchAdmins(), fetchRoles(), fetchZones()])
      .then(([a, r, z]) => { setAdmins(a); setRoles(r.roles); setZones(z); setSel((s) => s ?? a[0]?.id ?? null) })
      .catch((e: Error) => setErr(e.message))
  }
  useEffect(load, [])

  const byId = useMemo(() => new Map((admins || []).map((a) => [a.id, a])), [admins])
  const roleName = (key: string) => roles.find((r) => r.key === key)?.name || key
  const zoneName = (id: number | string) => zones.find((z) => z.id === Number(id))?.name || `Zone ${id}`
  const childrenOf = (pid: number | null) => (admins || []).filter((a) => (a.reportsTo ?? null) === pid)
  // Roots = no manager, or a manager that isn't in the list.
  const roots = useMemo(() => (admins || []).filter((a) => !a.reportsTo || !byId.has(a.reportsTo)), [admins, byId])

  // descendants (to keep re-parent options acyclic) + max chain depth for the stat.
  const descendantsOf = (id: number): Set<number> => {
    const out = new Set<number>(); const stack = [id]
    while (stack.length) { const x = stack.pop()!; for (const c of childrenOf(x)) if (!out.has(c.id)) { out.add(c.id); stack.push(c.id) } }
    return out
  }
  const depthOf = (a: Admin): number => { let d = 1, cur: Admin | undefined = a, guard = 0; while (cur?.reportsTo && byId.has(cur.reportsTo) && guard++ < 100) { d++; cur = byId.get(cur.reportsTo) } return d }

  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!admins) return <Loading />

  const managers = admins.filter((a) => childrenOf(a.id).length > 0).length
  const teamLeads = admins.filter((a) => a.scopeType === 'team').length
  const maxDepth = admins.reduce((m, a) => Math.max(m, depthOf(a)), 0)

  const ownScope = (a: Admin) => {
    const t = a.scopeType || 'all'
    if (t === 'all') return 'Entire company'
    if (t === 'team') return 'Team roll-up (no own turf)'
    const vals = a.scopeValues || []
    const labels = t === 'zone' ? vals.map(zoneName) : vals.map(String)
    return `${t === 'zone' ? 'Zones' : 'Cities'}: ${labels.join(', ') || '—'}`
  }
  const effChips = (a: Admin): string[] => {
    const e = a.effectiveScope
    if (!e || e.type === 'all') return []
    const c = e.cities || []
    return c.length ? c : (e.zoneIds || []).map(zoneName)
  }
  const compact = (labels: string[]) => (labels.length <= 3 ? labels.join(', ') : `${labels.slice(0, 3).join(', ')} +${labels.length - 3}`)

  const toggle = (id: number) => setCollapsed((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const reParent = async (a: Admin, managerId: number | null) => {
    setSaving(true)
    try { await updateAdminUser(a.id, { reportsTo: managerId }); toast('Reporting line updated'); load() }
    catch (e) { toast((e as Error).message, 'err') } finally { setSaving(false) }
  }

  // ---- recursive tree row ----
  const renderNode = (a: Admin, depth: number): React.ReactNode => {
    const kids = childrenOf(a.id)
    const isOpen = !collapsed.has(a.id)
    const chips = effChips(a)
    const isSel = sel === a.id
    return (
      <div key={a.id}>
        <div onClick={() => setSel(a.id)} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 11, cursor: 'pointer',
          marginBottom: 4, background: isSel ? 'var(--violet-50, #eef2ff)' : 'var(--card, #fff)',
          border: '1px solid ' + (isSel ? tintOf(a.role) : 'var(--line, #eef0f4)'),
          borderLeft: '3px solid ' + tintOf(a.role),
        }}>
          <button onClick={(e) => { e.stopPropagation(); if (kids.length) toggle(a.id) }} className="iconbtn" style={{ width: 22, height: 22, visibility: kids.length ? 'visible' : 'hidden' }}>
            {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          <Avatar name={a.name} src={a.avatar} size={30} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <strong style={{ fontSize: 13.5 }}>{a.name}</strong>
              <span style={{ fontSize: 11, color: tintOf(a.role), fontWeight: 600 }}>{roleName(a.role)}</span>
              {(a.status || 'active') !== 'active' && <Badge tone="red">Inactive</Badge>}
            </div>
            <div className="muted" style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5 }}>
              {a.scopeType === 'all' || !a.scopeType
                ? <span>Sees all data</span>
                : chips.length ? <><MapPin size={11} /> {compact(chips)}</> : <span>Sees nothing (empty scope)</span>}
              {kids.length > 0 && <span>· {kids.length} report{kids.length > 1 ? 's' : ''}</span>}
            </div>
          </div>
        </div>
        {isOpen && kids.length > 0 && (
          <div style={{ marginLeft: 20, paddingLeft: 12, borderLeft: '1.5px dashed var(--line, #e5e7eb)' }}>
            {kids.map((c) => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const selected = sel != null ? byId.get(sel) : undefined
  const selKids = selected ? childrenOf(selected.id) : []
  const selChips = selected ? effChips(selected) : []
  // Managers this admin may report to: anyone except themselves and their own descendants.
  const managerOptions = selected
    ? [{ value: '', label: '— None (top level) —' }, ...admins
        .filter((a) => a.id !== selected.id && !descendantsOf(selected.id).has(a.id))
        .map((a) => ({ value: String(a.id), label: `${a.name} · ${roleName(a.role)}` }))]
    : []

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="stat-row">
        <StatCard icon={<Users2 size={20} />} tint="#eef0ff" label="Admins" value={admins.length} sub="in the org" />
        <StatCard icon={<Building2 size={20} />} tint="#e7f7ee" label="Top level" value={roots.length} sub="no manager" />
        <StatCard icon={<UserCog size={20} />} tint="#fff4e5" label="Managers" value={managers} sub="have reports" />
        <StatCard icon={<Layers size={20} />} tint="#eaf3ff" label="Deepest chain" value={maxDepth} sub="levels" />
        <StatCard icon={<GitBranch size={20} />} tint="#f3eefe" label="Team leads" value={teamLeads} sub="roll-up scope" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 16, alignItems: 'start' }}>
        <Card title="Reporting structure" right={
          <button className="btn line" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => setCollapsed((s) => s.size ? new Set() : new Set(admins.filter((a) => childrenOf(a.id).length).map((a) => a.id)))}>
            {collapsed.size ? 'Expand all' : 'Collapse all'}
          </button>
        }>
          <div style={{ display: 'grid', gap: 2 }}>
            {roots.map((r) => renderNode(r, 0))}
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Network size={13} /> A manager automatically sees the combined data scope of everyone below them.
          </div>
        </Card>

        {/* detail rail */}
        {selected && (
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <Avatar name={selected.name} src={selected.avatar} size={44} />
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 15 }}>{selected.name}</strong>
                <div style={{ fontSize: 12.5, color: tintOf(selected.role), fontWeight: 600 }}>{roleName(selected.role)}</div>
              </div>
            </div>

            <Row label="Reports to">
              {canEdit
                ? <Dropdown value={selected.reportsTo ? String(selected.reportsTo) : ''} width="100%" disabled={saving} options={managerOptions} onChange={(v) => reParent(selected, v ? Number(v) : null)} />
                : <span>{selected.reportsTo && byId.has(selected.reportsTo) ? byId.get(selected.reportsTo)!.name : 'Top level'}</span>}
            </Row>

            <Row label="Own scope"><span>{ownScope(selected)}</span></Row>

            <Row label="Effective scope (sees)">
              {selected.scopeType === 'all' || !selected.scopeType
                ? <span>All data — unrestricted</span>
                : selChips.length
                  ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{selChips.map((c) => <Badge key={c} tone="blue" dot={false}>{c}</Badge>)}</div>
                  : <span className="muted">Nothing (empty scope)</span>}
              {selected.scopeType === 'team' && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Rolled up from {selKids.length} report(s).</div>}
            </Row>

            <Row label={`Direct reports (${selKids.length})`}>
              {selKids.length === 0
                ? <span className="muted">None</span>
                : <div style={{ display: 'grid', gap: 4 }}>
                    {selKids.map((k) => (
                      <button key={k.id} onClick={() => setSel(k.id)} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, fontSize: 12.5 }}>
                        <CornerDownRight size={13} className="muted" /> <Avatar name={k.name} src={k.avatar} size={20} /> <span>{k.name}</span>
                        <span className="muted" style={{ fontSize: 11 }}>· {roleName(k.role)}</span>
                      </button>
                    ))}
                  </div>}
            </Row>

            <button className="btn line" style={{ marginTop: 6, width: '100%' }} onClick={() => nav('/admins')}><Pencil size={14} /> Edit in Admin Users</button>
          </Card>
        )}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '9px 0', borderTop: '1px solid var(--line, #eef0f4)' }}>
      <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 13 }}>{children}</div>
    </div>
  )
}
