/* Launch / splash screen (Module-1 #1). Premium light look: a photo hero, the
   CLEAN HOME · HAPPY HOME wordmark and progress dots. Shown as an overlay while
   the app boots — the `visible` prop + boot timing live in App.tsx (unchanged). */
export default function Splash({ visible }: { visible: boolean }) {
  return (
    <div className={`splashx ${visible ? '' : 'splashx--hide'}`}>
      <div className="spx-hero">
        <img src="/auth/splash.jpg" alt="" />
        <div className="spx-hero-fade" />
      </div>

      <div className="spx-main">
        <div className="spx-mark" aria-hidden>
          <svg viewBox="0 0 64 64" width="58" height="58" fill="none"
            stroke="#6d4ee6" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round">
            <path d="M11 29 L32 12 L53 29" />
            <path d="M16 27 V49 a3 3 0 0 0 3 3 H45 a3 3 0 0 0 3 -3 V27" />
            <path d="M26 52 V39 a2 2 0 0 1 2 -2 h8 a2 2 0 0 1 2 2 V52" />
          </svg>
        </div>

        <div className="spx-title">
          <b>CLEAN HOME</b>
          <span>HAPPY HOME</span>
        </div>
        <p className="spx-tag">Professional home services<br />at your fingertips</p>

        <div className="spx-dots">
          <i className="on" /><i /><i /><i /><i />
        </div>
      </div>
    </div>
  )
}
