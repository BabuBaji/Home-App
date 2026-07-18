import { useEffect, useState, type CSSProperties, type ChangeEvent } from 'react'
import { Plus, ImageIcon, CalendarClock, Pencil, Trash2 } from 'lucide-react'
import { Card, StatCard, Badge, Loading, ErrorState, Modal, Field, Dropdown, useToast } from '../components/UI'
import { fetchBanners, createBanner, updateBanner, deleteBanner, fetchZones, uploadBannerImage, mediaUrl, type Zone } from '../api'
import type { HomeBanner } from '../types'
import { useStore, has } from '../store'

/* Home Hero Banners — schedule festival wishes / promos that appear in the customer app's rotating
 * hero for a date window. Live offers + the weather surge are merged in automatically by the backend;
 * this screen manages only the manually-scheduled slides. */

// Preview gradients — mirror the customer app's hero themes.
const THEME: Record<string, string> = {
  purple: 'linear-gradient(to bottom,#5b63d6,#2e2a6b)',
  night: 'linear-gradient(to bottom,#5b63d6,#14133f)',
  festive: 'linear-gradient(to bottom,#5b63d6,#b8329a)',
  sunset: 'linear-gradient(to bottom,#5b63d6,#d9488a)',
}
const THEMES = ['purple', 'festive', 'sunset', 'night']
const KINDS = ['festival', 'promo', 'announcement']
const today = () => new Date().toISOString().slice(0, 10)
const fmt = (d: string | null) => (d ? d.slice(0, 10) : '—')

type Form = {
  id?: number; title: string; subtitle: string; emoji: string; theme: string; kind: string
  cta_label: string; cta_link: string; starts: string; ends: string; priority: string; zone_id: string; status: string; image_url: string
}
const EMPTY: Form = { title: '', subtitle: '', emoji: '🎉', theme: 'festive', kind: 'festival', cta_label: 'Book Now', cta_link: '/popular-services', starts: '', ends: '', priority: '60', zone_id: '', status: 'active', image_url: '' }

export default function HomeBanners() {
  const toast = useToast()
  const { admin } = useStore()
  const canEdit = has(admin, 'campaigns.edit') || has(admin, 'campaigns.create')
  const [rows, setRows] = useState<HomeBanner[] | null>(null)
  const [zones, setZones] = useState<Zone[]>([])
  const [err, setErr] = useState('')
  const [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)

  const load = () => fetchBanners().then((r) => { setRows(r); setErr('') }).catch((e: Error) => setErr(e.message))
  useEffect(() => { load(); fetchZones().then(setZones).catch(() => {}) }, [])

  if (err && !rows) return <ErrorState msg={err} onRetry={load} />
  if (!rows) return <Loading />

  const now = today()
  const isLive = (b: HomeBanner) => b.status === 'active' && (!b.starts || b.starts.slice(0, 10) <= now) && (!b.ends || b.ends.slice(0, 10) >= now)
  const liveCount = rows.filter(isLive).length
  const scheduled = rows.filter((b) => b.starts && b.starts.slice(0, 10) > now).length

  const openNew = () => setForm({ ...EMPTY, starts: now })
  const openEdit = (b: HomeBanner) => setForm({
    id: b.id, title: b.title, subtitle: b.subtitle, emoji: b.emoji, theme: b.theme, kind: b.kind,
    cta_label: b.cta_label, cta_link: b.cta_link, starts: b.starts ? b.starts.slice(0, 10) : '',
    ends: b.ends ? b.ends.slice(0, 10) : '', priority: String(b.priority), zone_id: b.zone_id == null ? '' : String(b.zone_id), status: b.status, image_url: b.image_url || '',
  })

  const onPickImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f || !form) return
    setUploading(true)
    try { const { url } = await uploadBannerImage(f); setForm({ ...form, image_url: url }); toast('Image uploaded') }
    catch (err) { toast((err as Error).message, 'err') } finally { setUploading(false) }
  }

  const save = async () => {
    if (!form) return
    if (!form.title.trim()) return toast('Title is required', 'err')
    setBusy(true)
    const body = {
      title: form.title.trim(), subtitle: form.subtitle.trim(), emoji: form.emoji.trim(), theme: form.theme, kind: form.kind,
      cta_label: form.cta_label.trim(), cta_link: form.cta_link.trim(), starts: form.starts || null, ends: form.ends || null,
      priority: Number(form.priority) || 50, zone_id: form.zone_id === '' ? null : Number(form.zone_id), status: form.status, image_url: form.image_url,
    }
    try {
      if (form.id) { await updateBanner(form.id, body); toast('Banner updated') }
      else { await createBanner(body); toast('Banner created') }
      setForm(null); load()
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }
  const remove = async (b: HomeBanner) => {
    if (!confirm(`Delete banner “${b.title}”?`)) return
    try { await deleteBanner(b.id); toast('Banner deleted'); load() } catch (e) { toast((e as Error).message, 'err') }
  }
  const toggle = async (b: HomeBanner) => {
    try { await updateBanner(b.id, { status: b.status === 'active' ? 'paused' : 'active' }); load() } catch (e) { toast((e as Error).message, 'err') }
  }

  const th: CSSProperties = { padding: '9px 12px', borderBottom: '1px solid var(--line,#eef0f4)', whiteSpace: 'nowrap', textAlign: 'left' }
  const td: CSSProperties = { padding: '11px 12px', borderBottom: '1px solid var(--line-2,#f4f4fa)', fontSize: 13, whiteSpace: 'nowrap', verticalAlign: 'middle' }
  const zoneName = (id: number | null) => (id == null ? 'All zones' : zones.find((z) => z.id === id)?.name || `Zone ${id}`)

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ alignItems: 'center', gap: 10, marginTop: -4, flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 12 }}>Festival & promo slides for the app's rotating hero. Live offers and the weather surge are added automatically.</span>
        {canEdit && <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={openNew}><Plus size={14} /> New banner</button>}
      </div>

      <div className="stat-row">
        <StatCard icon={<ImageIcon size={18} />} tint="#eef0ff" label="Total banners" value={rows.length} sub="scheduled slides" />
        <StatCard icon={<ImageIcon size={18} />} tint={liveCount ? '#e7f7ee' : '#eef0ff'} label="Live now" value={liveCount} sub="showing in app" />
        <StatCard icon={<CalendarClock size={18} />} tint={scheduled ? '#fff4e5' : '#eef0ff'} label="Upcoming" value={scheduled} sub="future start" />
      </div>

      <Card title="Scheduled banners" right={<span className="muted" style={{ fontSize: 12 }}>{rows.length} total{!canEdit && ' · view only'}</span>}>
        {rows.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, padding: '18px 0' }}>No banners yet. {canEdit && 'Create one to greet customers on a festival or push a promo.'}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 820 }}>
              <thead><tr style={{ color: 'var(--muted,#667085)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                {['Banner', 'Kind', 'Window', 'Zone', 'Priority', 'Status', 'Action'].map((h) => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>{rows.map((b) => (
                <tr key={b.id} style={isLive(b) ? { boxShadow: 'inset 3px 0 0 #16a34a' } : undefined}>
                  <td style={td}>
                    <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                      <span style={{ width: 34, height: 34, borderRadius: 9, background: THEME[b.theme] || THEME.purple, display: 'grid', placeItems: 'center', fontSize: 17, flex: '0 0 auto', overflow: 'hidden' }}>
                        {b.image_url ? <img src={mediaUrl(b.image_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (b.emoji || '🏷️')}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{b.title}</div>
                        {b.subtitle && <div className="muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>{b.subtitle}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ ...td, textTransform: 'capitalize' }}>{b.kind}</td>
                  <td style={td}>{fmt(b.starts)} → {fmt(b.ends)}</td>
                  <td style={td}>{zoneName(b.zone_id)}</td>
                  <td style={td}>{b.priority}</td>
                  <td style={td}><Badge tone={isLive(b) ? 'green' : b.status === 'paused' ? 'gray' : 'amber'} dot={false}>{isLive(b) ? 'Live' : b.status === 'paused' ? 'Paused' : 'Scheduled'}</Badge></td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {canEdit ? (
                      <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn line" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => toggle(b)}>{b.status === 'active' ? 'Pause' : 'Activate'}</button>
                        <button className="btn line" style={{ padding: '5px 9px' }} onClick={() => openEdit(b)} aria-label="Edit"><Pencil size={13} /></button>
                        <button className="btn line" style={{ padding: '5px 9px', color: '#dc2626' }} onClick={() => remove(b)} aria-label="Delete"><Trash2 size={13} /></button>
                      </span>
                    ) : <span className="muted" style={{ fontSize: 12 }}>—</span>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>

      {form && (
        <Modal title={form.id ? 'Edit banner' : 'New banner'} onClose={() => setForm(null)} wide footer={<>
          <button className="btn line" onClick={() => setForm(null)}>Cancel</button>
          <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : form.id ? 'Save changes' : 'Create banner'}</button>
        </>}>
          <div className="grid" style={{ gap: 12 }}>
            {/* live preview */}
            <div style={{ borderRadius: 14, background: THEME[form.theme] || THEME.purple, color: '#fff', padding: '16px 18px', minHeight: 108, position: 'relative', overflow: 'hidden' }}>
              {form.image_url && <>
                <img src={mediaUrl(form.image_url)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(20,16,50,.72), rgba(20,16,50,.15))' }} />
              </>}
              <div style={{ position: 'relative' }}>
                <div style={{ fontSize: 11, opacity: .85, textTransform: 'uppercase', letterSpacing: .4 }}>{form.kind}</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{form.title || 'Banner title'}</div>
                {form.subtitle && <div style={{ fontSize: 12.5, opacity: .92, marginTop: 4, maxWidth: '78%' }}>{form.subtitle}</div>}
                {form.cta_label && <span style={{ display: 'inline-block', marginTop: 10, background: '#fff', color: '#4a3fb0', fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999 }}>{form.cta_label} →</span>}
              </div>
              {form.emoji && !form.image_url && <span style={{ position: 'absolute', right: 16, bottom: 8, fontSize: 60, lineHeight: 1 }}>{form.emoji}</span>}
            </div>

            {/* background image upload */}
            <Field label="Background image (optional)">
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <label className="btn line sm" style={{ cursor: 'pointer' }}>
                  {uploading ? 'Uploading…' : form.image_url ? 'Replace image' : 'Upload image'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={uploading} onChange={onPickImage} />
                </label>
                {form.image_url && <button type="button" className="btn line sm" style={{ color: '#dc2626' }} onClick={() => setForm({ ...form, image_url: '' })}>Remove</button>}
                <span className="muted" style={{ fontSize: 11.5 }}>JPG/PNG/WebP, up to 5 MB. Wide images (16:9) work best.</span>
              </div>
            </Field>

            <div className="row" style={{ gap: 10 }}>
              <div style={{ flex: 1 }}><Field label="Title"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Happy Diwali 🪔" /></Field></div>
              <div style={{ width: 90 }}><Field label="Emoji"><input value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} placeholder="🎉" /></Field></div>
            </div>
            <Field label="Subtitle"><input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} placeholder="Celebrate a spotless home — 30% off" /></Field>

            <div className="row" style={{ gap: 10 }}>
              <div style={{ flex: 1 }}><Field label="Kind"><Dropdown value={form.kind} width="100%" options={KINDS.map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) }))} onChange={(v) => setForm({ ...form, kind: v })} /></Field></div>
              <div style={{ flex: 1 }}><Field label="Theme"><Dropdown value={form.theme} width="100%" options={THEMES.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))} onChange={(v) => setForm({ ...form, theme: v })} /></Field></div>
            </div>

            <div className="row" style={{ gap: 10 }}>
              <div style={{ flex: 1 }}><Field label="Button label (optional)"><input value={form.cta_label} onChange={(e) => setForm({ ...form, cta_label: e.target.value })} placeholder="Book Now" /></Field></div>
              <div style={{ flex: 1 }}><Field label="Button link"><input value={form.cta_link} onChange={(e) => setForm({ ...form, cta_link: e.target.value })} placeholder="/offers" /></Field></div>
            </div>

            <div className="row" style={{ gap: 10 }}>
              <div style={{ flex: 1 }}><Field label="Starts"><input type="date" value={form.starts} onChange={(e) => setForm({ ...form, starts: e.target.value })} /></Field></div>
              <div style={{ flex: 1 }}><Field label="Ends"><input type="date" value={form.ends} onChange={(e) => setForm({ ...form, ends: e.target.value })} /></Field></div>
            </div>

            <div className="row" style={{ gap: 10 }}>
              <div style={{ flex: 1 }}><Field label="Zone"><Dropdown value={form.zone_id} width="100%" options={[{ value: '', label: 'All zones' }, ...zones.map((z) => ({ value: String(z.id), label: z.name }))]} onChange={(v) => setForm({ ...form, zone_id: v })} /></Field></div>
              <div style={{ width: 120 }}><Field label="Priority"><input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} /></Field></div>
              <div style={{ width: 130 }}><Field label="Status"><Dropdown value={form.status} width="100%" options={[{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }]} onChange={(v) => setForm({ ...form, status: v })} /></Field></div>
            </div>
            <div className="muted" style={{ fontSize: 11.5 }}>Higher priority shows earlier in the rotation. Leave dates empty for an always-on banner. The greeting slide is always shown first automatically.</div>
          </div>
        </Modal>
      )}
    </div>
  )
}
