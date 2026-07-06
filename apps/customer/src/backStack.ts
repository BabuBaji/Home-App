// A tiny stack of "close this overlay" handlers. Full-screen overlays that aren't routes
// (support chat, invoice preview, sheets) register here on open. The global Android
// hardware-back handler checks this first, so back closes the top overlay instead of
// navigating the router away from the underlying page.
const stack: Array<() => void> = []

export function pushBackHandler(fn: () => void): () => void {
  stack.push(fn)
  return () => {
    const i = stack.indexOf(fn)
    if (i >= 0) stack.splice(i, 1)
  }
}

// Runs (and pops) the top overlay's close handler. Returns true if one handled the back press.
export function runTopBackHandler(): boolean {
  const fn = stack.pop()
  if (fn) { fn(); return true }
  return false
}
