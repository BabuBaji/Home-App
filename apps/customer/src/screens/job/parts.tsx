import { MINI_STEPS, miniIdx } from './useJob'
import { Check } from 'lucide-react'
import type { Booking } from '../../types'

// Worker avatar — real photo if the worker has one, else a violet initial circle. No stock image.
export function WorkerAvatar({ b, size = 56, initial }: { b?: Booking; size?: number; initial?: string }) {
  const url = b?.pro?.avatar || null
  const ch = initial || (b ? (b.pro?.name || b.pro_name || 'W').trim()[0]?.toUpperCase() : 'W')
  if (url) return <img className="jt-ava" src={url} alt="" style={{ width: size, height: size }} />
  return <span className="jt-ava jt-ava-init" style={{ width: size, height: size, fontSize: size * 0.4 }}>{ch}</span>
}

// The 5-dot progress rail used across the tracking screens (matches the mock footer strip).
export function MiniTimeline({ status }: { status: string }) {
  const reached = miniIdx(status)
  const done = status === 'completed'
  return (
    <div className="jt-mini">
      {MINI_STEPS.map((s, i) => {
        const ok = done || i <= reached
        return (
          <div key={s} className={`jt-mini-step ${ok ? 'ok' : ''} ${i === reached && !done ? 'cur' : ''}`}>
            <span className="jt-mini-dot">{ok ? <Check size={11} /> : <i />}</span>
            <span className="jt-mini-lbl">{s}</span>
          </div>
        )
      })}
    </div>
  )
}
