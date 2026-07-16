// Shared helpers for the Module 9 wallet screens (66-73).
// Everything derives from what the wallet/refund endpoints return — nothing is invented.

export const money = (n?: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`
// The design writes amounts with paise (₹1,248.00).
export const money2 = (n?: number) =>
  `₹${(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// en-IN renders "10:20 am"; the design shows "10:20 AM".
export const stamp = (s: string) =>
  new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    .replace(/\b(am|pm)\b/i, (m) => m.toUpperCase())

export const dayStamp = (s: string) =>
  new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

/** Group any dated rows into month sections ("May 2025"), preserving the incoming order. */
export function byMonth<T>(rows: T[], dateOf: (r: T) => string): { key: string; label: string; items: T[] }[] {
  const out: { key: string; label: string; items: T[] }[] = []
  for (const r of rows) {
    const d = new Date(dateOf(r))
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const found = out.find((g) => g.key === key)
    if (found) found.items.push(r)
    else out.push({ key, label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }), items: [r] })
  }
  return out
}

/**
 * How a ledger row reads on the Transactions screen. `kind` is the server's typed reason
 * (ADD_MONEY, BOOKING_PAYMENT, CASHBACK, REFUND, REFERRAL_BONUS, GIFT_CARD…); older rows predate
 * it and carry null, so fall back to the credit/debit type rather than guessing from the title.
 */
export type TxnTab = 'All' | 'Credit' | 'Debit' | 'Refund'

export const txnKindLabel = (kind: string | null | undefined, type: 'credit' | 'debit'): string => {
  switch (kind) {
    case 'ADD_MONEY': return 'Success'
    case 'BOOKING_PAYMENT':
    case 'PARTIAL_PAYMENT': return 'Paid'
    case 'CASHBACK': return 'Cashback'
    case 'REFERRAL_BONUS': return 'Referral'
    case 'REFUND': return 'Refund'
    case 'GIFT_CARD': return 'Gift card'
    case 'WELCOME_BONUS': return 'Bonus'
    default: return type === 'credit' ? 'Success' : 'Paid'
  }
}

export const inTxnTab = (t: { type: 'credit' | 'debit'; kind?: string | null }, tab: TxnTab): boolean =>
  tab === 'All' ? true
    : tab === 'Refund' ? t.kind === 'REFUND'
      : tab === 'Credit' ? t.type === 'credit'
        : t.type === 'debit'
