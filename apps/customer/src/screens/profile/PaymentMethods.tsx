// 90 · Saved Payment Methods — real CRUD against /api/payment-methods. DISPLAY DATA ONLY: the app
// stores a masked label (e.g. "•••• 4242"), never a full card number (the server rejects those).
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Smartphone, CreditCard, Building2, Star, Trash2, X, ChevronRight } from 'lucide-react'
import { Loading, useToast } from '../../components/UI'
import { pushBackHandler } from '../../backStack'
import { fetchSavedMethods, addSavedMethod, setPrimaryMethod, removeSavedMethod, type SavedMethod } from '../../api'

const KINDS = [
  { k: 'upi', label: 'UPI', group: 'UPI Accounts', icon: <Smartphone size={18} />, placeholder: 'yourname@upi' },
  { k: 'card', label: 'Card', group: 'Cards', icon: <CreditCard size={18} />, placeholder: 'Last 4 digits' },
  { k: 'netbanking', label: 'Net Banking', group: 'Net Banking', icon: <Building2 size={18} />, placeholder: 'Bank name' },
]
const GROUPS = [{ kind: 'upi', title: 'UPI Accounts' }, { kind: 'card', title: 'Cards' }, { kind: 'netbanking', title: 'Net Banking' }]
const kindIcon = (k: string) => KINDS.find((x) => x.k === k)?.icon || <CreditCard size={18} />

export default function PaymentMethods() {
  const nav = useNavigate()
  const toast = useToast()
  const [list, setList] = useState<SavedMethod[] | null>(null)
  const [form, setForm] = useState<{ kind: string; label: string; detail: string } | null>(null)

  const load = () => fetchSavedMethods().then(setList).catch(() => setList([]))
  useEffect(() => { load() }, [])
  useEffect(() => { if (form) return pushBackHandler(() => setForm(null)) }, [form])

  async function save() {
    if (!form) return
    if (!form.label.trim()) return toast('Enter a name/label')
    if (/\d{12,}/.test(form.detail)) return toast('Please enter only the last 4 digits, not the full card number')
    try {
      await addSavedMethod({ kind: form.kind, label: form.label.trim(), detail: form.detail.trim() || undefined, is_primary: (list || []).length === 0 })
      setForm(null); await load(); toast('Payment method saved')
    } catch (e) { toast((e as Error).message) }
  }
  async function primary(id: number) { try { await setPrimaryMethod(id); await load() } catch (e) { toast((e as Error).message) } }
  async function del(id: number) { try { await removeSavedMethod(id); await load(); toast('Removed') } catch (e) { toast((e as Error).message) } }

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Saved Payment Methods</h1></div>
      <button className="iconbtn" onClick={() => setForm({ kind: 'upi', label: '', detail: '' })} aria-label="Add"><Plus size={18} /></button>
    </header>
  )
  if (!list) return <div className="screen">{head}<Loading /></div>

  return (
    <div className="screen">
      {head}
      <div className="content">
        {list.length === 0 && (
          <div className="state"><div className="ico">💳</div><h3>No saved methods</h3><p>Add a UPI ID, card or bank for faster checkout.</p></div>
        )}

        {GROUPS.map((g) => {
          const items = list.filter((m) => m.kind === g.kind)
          if (!items.length) return null
          return (
            <section key={g.kind} className="pm-group">
              <h2 className="pm-group-h">{g.title}</h2>
              <div className="ws-card">
                {items.map((m) => (
                  <div key={m.id} className="pm-row">
                    <span className="pm-ico">{kindIcon(m.kind)}</span>
                    <div className="pm-main">
                      <div className="pm-label">{m.label}{m.is_primary && <span className="pm-primary">Primary</span>}</div>
                      {m.detail && <div className="pm-detail">{m.detail}</div>}
                    </div>
                    {!m.is_primary && <button className="pm-act" onClick={() => primary(m.id)} aria-label="Set primary"><Star size={16} /></button>}
                    <button className="pm-act danger" onClick={() => del(m.id)} aria-label="Remove"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            </section>
          )
        })}

        <button className="fm-add" onClick={() => setForm({ kind: 'upi', label: '', detail: '' })}>
          <Plus size={18} /> Add Payment Method
        </button>
      </div>

      {form && (
        <div className="sheet-wrap" onClick={() => setForm(null)}>
          <div className="sheet fm-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="fm-sheet-head"><span>Add Payment Method</span><button onClick={() => setForm(null)} aria-label="Close"><X size={18} /></button></div>
            <div className="pm-kinds">
              {KINDS.map((k) => (
                <button key={k.k} className={`pm-kind ${form.kind === k.k ? 'sel' : ''}`} onClick={() => setForm({ ...form, kind: k.k })}>
                  {k.icon}<span>{k.label}</span>
                </button>
              ))}
            </div>
            <label className="fm-field"><span>{form.kind === 'card' ? 'Card name' : form.kind === 'netbanking' ? 'Bank name' : 'UPI name'}</span>
              <input value={form.label} autoFocus onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={form.kind === 'card' ? 'e.g. Visa' : form.kind === 'netbanking' ? 'e.g. HDFC Bank' : 'e.g. Google Pay'} />
            </label>
            <label className="fm-field"><span>{form.kind === 'upi' ? 'UPI ID' : form.kind === 'card' ? 'Last 4 digits' : 'Account note'}</span>
              <input value={form.detail} maxLength={form.kind === 'card' ? 8 : 40}
                onChange={(e) => setForm({ ...form, detail: e.target.value })}
                placeholder={KINDS.find((k) => k.k === form.kind)?.placeholder} />
            </label>
            <p className="pm-note">We never store full card numbers — only a masked label for display.</p>
            <button className="btn full" onClick={save}>Save Method</button>
          </div>
        </div>
      )}
    </div>
  )
}
