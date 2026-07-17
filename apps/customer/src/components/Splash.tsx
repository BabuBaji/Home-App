/* Launch / splash screen (Module-1 #1). Full-bleed brand poster shown as an overlay
   while the app boots, with a short launch chime. The poster already carries the
   Home Help wordmark / tagline, so no text is overlaid. Boot timing lives in App.tsx. */
import { useEffect, useRef } from 'react'

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

  return (
    <div className={`splashx splashx--launch ${visible ? '' : 'splashx--hide'}`}>
      <img className="spx-poster" src="/auth/splash-poster.png"
        alt="Home Help — A Cleaner Home, A Better Life" />
    </div>
  )
}
