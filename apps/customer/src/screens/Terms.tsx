import { Header } from '../components/UI'

// Read-only Terms & Conditions. Plain, customer-friendly summary of how HomeHelp works.
const SECTIONS: { t: string; d: string }[] = [
  { t: '1. Using HomeHelp', d: 'HomeHelp connects you with trained, background-verified experts for home services such as cleaning, laundry and kitchen help. By creating an account and placing a booking, you agree to these terms. You must be 18 or older and provide accurate details.' },
  { t: '2. Bookings', d: 'When you book, you choose a service, a duration and either an Instant or a Scheduled slot. A booking is confirmed once an expert is assigned. The price shown is for the duration you select; if a job needs more time, the expert will confirm any change with you before continuing.' },
  { t: '3. Payments', d: 'You can pay by UPI, card, wallet or cash. Online payments are charged at the time of booking; cash is paid directly to the expert after the service. All prices are in Indian Rupees (₹) and include applicable taxes shown on your invoice.' },
  { t: '4. Cancellations & refunds', d: 'Cancellation is free until an expert is assigned. Once the expert is on the way, a small travel fee applies. Eligible refunds are credited to your HomeHelp wallet, usually instantly. Full details are in the Cancellation & Refund Policy.' },
  { t: '5. Your responsibilities', d: 'Please provide safe access to your home, a correct address, and any supplies the service needs. Treat experts with respect. You’re responsible for securing valuables and for anyone present at the service location during the visit.' },
  { t: '6. Service quality', d: 'We vet and train our experts, but services are carried out by independent professionals. If something isn’t right, raise it from the booking or through Help & Support within a reasonable time and we’ll work to make it right.' },
  { t: '7. Ratings & reviews', d: 'After a completed service you can rate and review your expert. Reviews should be honest and respectful. We may remove content that is abusive, misleading or violates others’ privacy.' },
  { t: '8. Coupons & rewards', d: 'Coupons, referral rewards and wallet credits are subject to their own conditions, may have expiry dates, and can’t be exchanged for cash unless stated. We may change or withdraw offers at any time.' },
  { t: '9. Liability', d: 'HomeHelp facilitates bookings and is liable only to the extent permitted by law. We’re not responsible for indirect or incidental losses. Nothing here limits rights you have under applicable consumer law.' },
  { t: '10. Privacy', d: 'We collect only the information needed to provide the service — such as your name, contact number and address — and use it to fulfil bookings and improve the app. We don’t sell your personal data.' },
  { t: '11. Changes to these terms', d: 'We may update these terms as the service evolves. Continued use of the app after an update means you accept the revised terms.' },
  { t: '12. Contact us', d: 'Questions about these terms? Reach us any time at support@homehelp.in or through Profile → Help & Support.' },
]

export default function Terms() {
  return (
    <div className="screen">
      <Header title="Terms & Conditions" />
      <div className="content">
        <p className="muted sm" style={{ margin: '4px 2px 14px' }}>
          The essentials of using HomeHelp, in plain language. Last updated July 2026.
        </p>
        {SECTIONS.map((s) => (
          <div className="card pad mt" key={s.t}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{s.t}</div>
            <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.55 }}>{s.d}</p>
          </div>
        ))}
        <p className="muted sm" style={{ margin: '16px 2px 24px', textAlign: 'center' }}>© 2026 HomeHelp Services Pvt. Ltd.</p>
      </div>
    </div>
  )
}
