import { useEffect, useRef, useState } from 'react'

// Circular photo cropper. Replaces Android's OEM crop intent, which is free-form (so it doesn't
// match the round avatar) and on many devices only reveals its confirm button once the crop has
// been altered. Here the mask IS the avatar shape, and "Use photo" is always available.
//
// Model: the image is drawn centred, scaled to COVER the circle at zoom 1, then offset by the
// user's drag. Output is a square JPEG of exactly what sits inside the circle.
const BOX = 268          // on-screen diameter of the crop circle, in CSS px
const OUT = 512          // exported image size
const MAX_ZOOM = 3

export default function PhotoCropper({ src, onCancel, onDone }: {
  src: Blob
  onCancel: () => void
  onDone: (out: Blob) => void
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [off, setOff] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const url = useRef('')

  useEffect(() => {
    url.current = URL.createObjectURL(src)
    const el = new Image()
    el.onload = () => setImg(el)
    el.src = url.current
    return () => { if (url.current) URL.revokeObjectURL(url.current) }
  }, [src])

  // Scale that makes the image just cover the circle; everything else multiplies this.
  const base = img ? Math.max(BOX / img.width, BOX / img.height) : 1
  const scale = base * zoom

  /** Keep the image covering the circle — no empty gaps at the edges. */
  function clamp(x: number, y: number, s: number) {
    if (!img) return { x, y }
    const halfW = Math.max(0, (img.width * s - BOX) / 2)
    const halfH = Math.max(0, (img.height * s - BOX) / 2)
    return { x: Math.min(halfW, Math.max(-halfW, x)), y: Math.min(halfH, Math.max(-halfH, y)) }
  }

  useEffect(() => { setOff((o) => clamp(o.x, o.y, scale)) }, [zoom, img])   // re-clamp when zoom changes

  function onDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }
  }
  function onMove(e: React.PointerEvent) {
    if (!drag.current) return
    const d = drag.current
    setOff(clamp(d.ox + (e.clientX - d.x), d.oy + (e.clientY - d.y), scale))
  }
  const onUp = () => { drag.current = null }

  async function confirm() {
    if (!img || busy) return
    setBusy(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = OUT; canvas.height = OUT
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, OUT, OUT)
      // Same transform as the preview, scaled from the on-screen circle up to the export size.
      const k = OUT / BOX
      const w = img.width * scale * k
      const h = img.height * scale * k
      ctx.drawImage(img, OUT / 2 - w / 2 + off.x * k, OUT / 2 - h / 2 + off.y * k, w, h)
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
      if (blob) onDone(blob)
    } finally { setBusy(false) }
  }

  return (
    <div className="pc-back">
      <div className="pc-panel">
        <div className="pc-title">Position your photo</div>
        <div
          className="pc-stage" style={{ width: BOX, height: BOX }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        >
          {img && (
            <img
              src={url.current} alt="" draggable={false}
              style={{
                width: img.width * scale, height: img.height * scale,
                transform: `translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px))`,
              }}
            />
          )}
          <div className="pc-ring" />
        </div>
        <div className="pc-hint">Drag to move · slide to zoom</div>
        <input
          className="pc-zoom" type="range" min={1} max={MAX_ZOOM} step={0.01}
          value={zoom} onChange={(e) => setZoom(Number(e.target.value))}
        />
        <div className="pc-actions">
          <button className="pc-btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="pc-btn" onClick={confirm} disabled={!img || busy}>{busy ? 'Saving…' : 'Use photo'}</button>
        </div>
      </div>
    </div>
  )
}
