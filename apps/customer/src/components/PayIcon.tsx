import type { ReactElement } from 'react'
import { CreditCard, Landmark, Wallet, Banknote } from 'lucide-react'

// Brand-styled payment icons for the wallet top-up / checkout method lists. Crisp inline SVG marks
// built from each provider's brand colours + monogram (PhonePe purple, the Google four-colour ring,
// Paytm two-tone, UPI orange/green) so the list reads like a real UPI pay sheet instead of a
// generic emoji. Simplified original marks — recognisable next to the method name.
export function PayIcon({ id, fallback }: { id: string; fallback?: string }): ReactElement {
  switch (id) {
    case 'phonepe':
      return (
        <svg viewBox="0 0 40 40" className="pay-svg" aria-hidden="true">
          <rect width="40" height="40" rx="11" fill="#5f259f" />
          <text x="20" y="26" textAnchor="middle" fontFamily="Arial, system-ui, sans-serif" fontSize="16" fontWeight="700" fill="#fff">Pe</text>
        </svg>
      )
    case 'gpay':
      return (
        <svg viewBox="0 0 40 40" className="pay-svg" aria-hidden="true">
          <rect width="40" height="40" rx="11" fill="#fff" stroke="#e8e6f2" />
          {/* four-colour segmented ring + bar = a Google-style "G" */}
          <g fill="none" strokeWidth="4" strokeLinecap="butt">
            <circle cx="20" cy="20" r="8" stroke="#EA4335" strokeDasharray="11 40" transform="rotate(-95 20 20)" />
            <circle cx="20" cy="20" r="8" stroke="#FBBC05" strokeDasharray="11 40" transform="rotate(-5 20 20)" />
            <circle cx="20" cy="20" r="8" stroke="#34A853" strokeDasharray="11 40" transform="rotate(85 20 20)" />
            <circle cx="20" cy="20" r="8" stroke="#4285F4" strokeDasharray="11 40" transform="rotate(175 20 20)" />
          </g>
          <rect x="20" y="18" width="8.5" height="4" fill="#4285F4" />
        </svg>
      )
    case 'paytm':
      return (
        <svg viewBox="0 0 40 40" className="pay-svg" aria-hidden="true">
          <rect width="40" height="40" rx="11" fill="#fff" stroke="#e8e6f2" />
          <text x="20" y="24" textAnchor="middle" fontFamily="Arial, system-ui, sans-serif" fontSize="10.5" fontWeight="800" letterSpacing="-0.3">
            <tspan fill="#002970">pay</tspan><tspan fill="#00baf2">tm</tspan>
          </text>
        </svg>
      )
    case 'upi':
      return (
        <svg viewBox="0 0 40 40" className="pay-svg" aria-hidden="true">
          <rect width="40" height="40" rx="11" fill="#fff" stroke="#e8e6f2" />
          {/* UPI arrow accents (orange + green) */}
          <path d="M12 13 l4 0 -2.2 6 z" fill="#f47216" />
          <path d="M16 13 l4 0 -2.2 6 z" fill="#0d8a3e" />
          <text x="20" y="31" textAnchor="middle" fontFamily="Arial, system-ui, sans-serif" fontSize="9" fontWeight="800" letterSpacing="0.2">
            <tspan fill="#f47216">U</tspan><tspan fill="#0d8a3e">PI</tspan>
          </text>
        </svg>
      )
    case 'card':
    case 'razorpay':
      return <span className="pay-tile card"><CreditCard size={17} /></span>
    case 'netbanking':
      return <span className="pay-tile bank"><Landmark size={17} /></span>
    case 'wallet':
      return <span className="pay-tile wallet"><Wallet size={17} /></span>
    case 'cash':
      return <span className="pay-tile cash"><Banknote size={17} /></span>
    default:
      // Unknown method → keep whatever the backend sent (emoji), inside a neutral tile.
      return <span className="pay-tile neutral">{fallback || '💳'}</span>
  }
}

// A small overlapping cluster of UPI-app brand icons — used on the checkout's single "UPI" row so
// the customer sees which apps it opens (PhonePe / Google Pay / Paytm) at a glance.
export function PayCluster({ ids = ['phonepe', 'gpay', 'paytm'] }: { ids?: string[] }): ReactElement {
  return (
    <span className="pay-cluster" aria-hidden="true">
      {ids.map((id) => <span key={id} className="pay-cluster-i"><PayIcon id={id} /></span>)}
    </span>
  )
}
