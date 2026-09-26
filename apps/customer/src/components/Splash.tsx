/* Launch / splash screen (Module-1 #1). Full-bleed brand poster shown as an overlay
   while the app boots, with a short launch chime. The poster already carries the
   Home Help wordmark / tagline, so no text is overlaid. Boot timing lives in App.tsx. */
import { useEffect, useRef, useState } from 'react'

export default function Splash({ visible }: { visible: boolean }) {
  const played = useRef(false)
  useEffect(() => {
    if (played.current) return
    played.current = true
    const a = new Audio('/auth/launch.wav')
    a.volume = 0.9
    a.play().catch(() => {
      // Autoplay blocked — play on the first user interaction instead.
      const kick = () => {
        a.play().catch(() => {})
        window.removeEventListener('touchstart', kick)
        window.removeEventListener('click', kick)
      }
      window.addEventListener('touchstart', kick, { once: true })
      window.addEventListener('click', kick, { once: true })
    })
  }, [])

  // Once the fade-out (0.5s) has finished, leave the page entirely: the hidden poster is scaled to
  // 106% for the fade, so kept in the DOM it sat over the app 6% wider than the screen.
  const [gone, setGone] = useState(false)
  useEffect(() => {
    if (visible) { setGone(false); return }
    const t = setTimeout(() => setGone(true), 600)
    return () => clearTimeout(t)
  }, [visible])
  if (gone) return null

  return (
    <div className={`splashx splashx--launch ${visible ? '' : 'splashx--hide'}`}>
      <img className="spx-poster" src="/auth/splash-poster.png"
        alt="Home Help — A Cleaner Home, A Better Life" />
    </div>
  )
}
