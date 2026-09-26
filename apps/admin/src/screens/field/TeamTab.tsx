import { useMemo, useState } from 'react'
import { Phone, MapPin, Search, Users, Clock } from 'lucide-react'
import { fetchWorkers, fetchLiveMap, type LiveMapWorker } from '../../api'
import type { Worker } from '../../types'
import { usePoll, Header, Spinner, ErrorBox, EmptyBox, timeAgo, telHref, mapHref } from './shared'

type State = 'busy' | 'online' | 'offline'
type Row = { id: number; name: string; phone: string; code: string; city: string; state: State; seenAt: string | null; stale: boolean; lat: number | null; lng: number | null; onShift: boolean }
type Filter = 'all' | State
const STATE_LABEL: Record<State, string> = { busy: 'On a job', online: 'Online', offline: 'Offline' }
const STATE_TONE: Record<State, string> = { busy: 'violet', online: 'green', offline: 'grey' }
const ORDER: Record<State, number> = { busy: 0, online: 1, offline: 2 }

async function loadTeam(): Promise<Row[]> {
  // /workers is the roster (scoped); /live-map adds last GPS fix + on-job. Live map is best-effort.
  const [wr, live] = await Promise.all([fetchWorkers('', 'all'), fetchLiveMap().catch(() => null)])
  const byId = new Map<number, LiveMapWorker>((live?.workers || []).map((w) => [w.id, w]))
  return (wr.workers || [])
    .filter((w: Worker) => w.status === 'active')
    .map((w: Worker) => {
      const l = byId.get(w.id)
      const state: State = l ? l.state : w.available ? 'online' : 'offline'
      return {
        id: w.id, name: w.name, phone: w.phone || l?.phone || '', code: w.employee_id || '', city: w.city || '',
        state, seenAt: l?.seenAt || null, stale: l ? l.stale : true,
        lat: l ? l.lat : w.last_lat ?? null, lng: l ? l.lng : w.last_lng ?? null, onShift: !!w.on_shift,
      }
    })
    .sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.name.localeCompare(b.name))
}

export default function TeamTab() {
  const { data, error, loading, refreshing, reload } = usePoll(loadTeam, 30000)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const rows = data || []
  const counts = useMemo(() => ({
    all: rows.length, online: rows.filter((r) => r.state === 'online').length,
    busy: rows.filter((r) => r.state === 'busy').length, offline: rows.filter((r) => r.state === 'offline').length,
  }), [rows])
  const s = q.trim().toLowerCase()
  const shown = rows.filter((r) => (filter === 'all' || r.state === filter)
    && (!s || r.name.toLowerCase().includes(s) || r.phone.includes(s) || r.code.toLowerCase().includes(s)))

  return (
    <>
      <Header title="Team" sub={data ? `${counts.online + counts.busy} of ${counts.all} experts online` : 'Loading…'} onRefresh={() => reload()} refreshing={refreshing}>
        <div className="fd-search"><Search size={18} /><input type="search" placeholder="Search name, phone or ID" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="fd-seg" role="tablist">
          {(['all', 'online', 'busy', 'offline'] as Filter[]).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'busy' ? 'On job' : STATE_LABEL[f]} <small>{counts[f]}</small>
            </button>
          ))}
        </div>
      </Header>

      <div className="fd-body">
        {loading && !data ? <Spinner label="Loading your team…" />
          : error && !data ? <ErrorBox msg={error} onRetry={() => reload()} />
          : shown.length === 0 ? (
            <EmptyBox icon={<Users size={30} />} title={rows.length ? 'No experts match' : 'No active experts in your area'}
              msg={rows.length ? 'Try a different search or filter.' : 'Experts assigned to your scope will show here.'} />
          ) : (
            <div className="fd-list">
              {error && <div className="fd-banner">Couldn't refresh — showing last data. {error}</div>}
              {shown.map((r) => (
                <article key={r.id} className="fd-card fd-member">
                  <div className="fd-card-top">
                    <span className="fd-avatar v">{initials(r.name)}<i className={'fd-presence ' + STATE_TONE[r.state]} /></span>
                    <div className="fd-grow">
                      <div className="fd-title">{r.name}</div>
                      <div className="fd-meta">
                        <span className={'fd-badge ' + STATE_TONE[r.state]}>{STATE_LABEL[r.state]}</span>
                        {r.onShift && <span className="fd-badge blue">On shift</span>}
                        {r.code && <span>{r.code}</span>}
                      </div>
                      <div className="fd-meta" style={{ marginTop: 4 }}>
                        <span><Clock size={13} /> {r.seenAt ? `Seen ${timeAgo(r.seenAt)}` : 'No location yet'}</span>
                        {r.city && <span>{r.city}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="fd-actions">
                    {r.phone ? <a className="fd-btn fd-btn-call" href={telHref(r.phone)}><Phone size={18} /> Call</a>
                      : <button className="fd-btn" disabled><Phone size={18} /> No phone</button>}
                    {mapHref(r.lat, r.lng) ? <a className="fd-btn" href={mapHref(r.lat, r.lng)} target="_blank" rel="noreferrer"><MapPin size={18} /> {r.stale ? 'Last location' : 'Map'}</a>
                      : <button className="fd-btn" disabled><MapPin size={18} /> No location</button>}
                  </div>
                </article>
              ))}
            </div>
          )}
      </div>
    </>
  )
}

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?'
