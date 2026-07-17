import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Star, BadgeCheck, ShieldCheck, MapPin, Wrench, Phone } from 'lucide-react'
import { Loading } from '../../components/UI'
import { useJob, proName, proRating } from './useJob'
import { WorkerAvatar } from './parts'

// Module 6 · #43 — Worker Profile. Real fields from the enriched booking pro (name, rating, jobs,
// verified, skills, city). Fields the backend does not track (years/languages) are omitted, not faked.
export default function WorkerProfile() {
  const { id } = useParams()
  const nav = useNavigate()
  const { b } = useJob(id, false)

  if (!b) return <div className="screen jt"><Loading /></div>

  const p = b.pro
  const jobs = p?.jobs ?? p?.servicesDone ?? 0
  const skills = p?.skills || p?.services || (b.items || []).map((i) => i.name)
  const rating = proRating(b)
  const first = proName(b).split(' ')[0]

  return (
    <div className="screen jt">
      <div className="jt-top">
        <button className="jt-ic" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={22} /></button>
        <b>Worker Profile</b><span style={{ width: 40 }} />
      </div>

      <div className="content jt-scroll">
        <div className="jt-wp-head">
          <WorkerAvatar b={b} size={76} />
          <div className="jt-wp-id">
            <div className="jt-wp-name">{proName(b)}</div>
            <div className="jt-wp-rate"><Star size={13} className="jt-star" /> {rating} · {jobs} jobs</div>
            {p?.city && <div className="jt-wp-city">{p.city}</div>}
            {p?.verified && <span className="jt-wp-badge"><BadgeCheck size={13} /> Verified Partner</span>}
          </div>
        </div>

        <div className="jt-wp-stats">
          <div><b>{jobs}</b><span>Jobs Completed</span></div>
          <div><b>{rating}<Star size={13} className="jt-star" /></b><span>Rating</span></div>
          <div><b>{skills.length}</b><span>Services</span></div>
        </div>

        <div className="jt-wp-sec">
          <h4>About</h4>
          <p>Professional home-service expert{p?.city ? ` based in ${p.city}` : ''}. {jobs}+ jobs completed on HomeHelp with a {rating}★ rating.</p>
        </div>

        {skills.length > 0 && (
          <div className="jt-wp-sec">
            <h4>Skills &amp; Services ({skills.length})</h4>
            <div className="jt-chips">{skills.map((s) => <span key={s} className="jt-chip">{s}</span>)}</div>
          </div>
        )}

        <div className="jt-wp-sec jt-wp-rows">
          {p?.phone && <a className="jt-wp-line" href={`tel:${p.phone}`}><Phone size={17} /><span className="grow">Mobile</span><b>{p.phone}</b></a>}
          {p?.city && <div className="jt-wp-line"><MapPin size={17} /><span className="grow">Serves in</span><b>{p.city}</b></div>}
          <div className="jt-wp-line"><Wrench size={17} /><span className="grow">Services offered</span><b>{skills.length}</b></div>
          <div className="jt-wp-line"><ShieldCheck size={17} /><span className="grow">Background</span><b>{p?.verified ? 'ID & Address Verified' : 'In review'}</b></div>
        </div>
      </div>

      <div className="jt-foot">
        <button className="jt-btn" onClick={() => { if (p?.phone) window.location.href = `tel:${p.phone}`; else nav(`/job/${b.id}/call`) }}><Phone size={16} /> Call {first}</button>
      </div>
    </div>
  )
}
