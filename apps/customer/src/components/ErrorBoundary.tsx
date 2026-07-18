import { Component, type ReactNode } from 'react'

/* App-wide safety net: a render crash anywhere below shows a recovery screen instead of a blank
 * white app. "Try again" clears any cached session (a common cause) and reloads to a clean state. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error('[app] render crash:', error) }

  reset = () => {
    try { localStorage.removeItem('hh_token'); localStorage.removeItem('hh_user') } catch { /* ignore */ }
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', gap: 12 }}>
        <div style={{ fontSize: 44 }}>😕</div>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Something went wrong</div>
        <div style={{ fontSize: 13.5, color: '#667085', maxWidth: 300, lineHeight: 1.5 }}>The app hit an unexpected error. Tap below to reload — you may need to sign in again.</div>
        <button onClick={this.reset} style={{ marginTop: 10, background: '#5b51e8', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 28px', fontSize: 15, fontWeight: 700 }}>Try again</button>
      </div>
    )
  }
}
