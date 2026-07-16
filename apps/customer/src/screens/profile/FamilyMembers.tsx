// 89 · Family Members — real CRUD against /api/family. Add / edit / delete / set primary.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, MoreVertical, Trash2, Star, X } from 'lucide-react'
import { Loading, useToast } from '../../components/UI'
import { pushBackHandler } from '../../backStack'
import { fetchFamily, addFamily, updateFamily, removeFamily, type FamilyMember } from '../../api'

const RELATIONS = ['Mom', 'Dad', 'Spouse', 'Son', 'Daughter', 'Sister', 'Brother', 'Grandparent', 'Friend', 'Other']

export default function FamilyMembers() {
  const nav = useNavigate()
  const toast = useToast()
  const [list, setList] = useState<FamilyMember[] | null>(null)
  const [menu, setMenu] = useState<number | null>(null)
  const [form, setForm] = useState<{ name: string; relation: string; phone: string; primary: boolean } | null>(null)

  const load = () => fetchFamily().then(setList).catch(() => setList([]))
  useEffect(() => { load() }, [])
  useEffect(() => { if (form) return pushBackHandler(() => setForm(null)) }, [form])
  useEffect(() => { if (menu !== null) return pushBackHandler(() => setMenu(null)) }, [menu])

  async function save() {
    if (!form) return
    if (!form.name.trim()) return toast('Enter a name')
    try {
      await addFamily({ name: form.name.trim(), relation: form.relation || undefined, phone: form.phone.trim() || undefined, is_primary: form.primary })
      setForm(null); await load(); toast('Family member added')
    } catch (e) { toast((e as Error).message) }
  }
  async function makePrimary(id: number) { setMenu(null); try { await updateFamily(id, { is_primary: true }); await load() } catch (e) { toast((e as Error).message) } }
  async function del(id: number) { setMenu(null); try { await removeFamily(id); await load(); toast('Removed') } catch (e) { toast((e as Error).message) } }

  const head = (
    <header className="appbar ord-appbar">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      <div className="titles"><h1>Family Members</h1></div>
      <button className="iconbtn" onClick={() => setForm({ name: '', relation: '', phone: '', primary: false })} aria-label="Add"><Plus size={18} /></button>
    </header>
  )
  if (!list) return <div className="screen">{head}<Loading /></div>

  return (
    <div className="screen">
      {head}
      <div className="content">
        {list.length === 0 && (
          <div className="state"><div className="ico">👪</div><h3>No family members yet</h3><p>Add people you book services for.</p></div>
        )}

        <div className="fm-list">
          {list.map((m) => (
            <div key={m.id} className="fm-row">
              <span className="fm-av">{(m.name || '?').charAt(0).toUpperCase()}</span>
              <div className="fm-main">
                <div className="fm-name">{m.name}{m.is_primary && <span className="fm-primary">Primary</span>}</div>
                <div className="fm-sub">{[m.relation, m.phone && `+91 ${m.phone}`].filter(Boolean).join(' · ')}</div>
              </div>
              <button className="fm-menu" onClick={() => setMenu(menu === m.id ? null : m.id)} aria-label="Options"><MoreVertical size={18} /></button>
              {menu === m.id && (
                <>
                  <div className="fm-menu-back" onClick={() => setMenu(null)} />
                  <div className="fm-menu-pop">
                    {!m.is_primary && <button onClick={() => makePrimary(m.id)}><Star size={15} /> Set as primary</button>}
                    <button className="danger" onClick={() => del(m.id)}><Trash2 size={15} /> Remove</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <button className="fm-add" onClick={() => setForm({ name: '', relation: '', phone: '', primary: false })}>
          <Plus size={18} /> Add Family Member
        </button>
      </div>

      {form && (
        <div className="sheet-wrap" onClick={() => setForm(null)}>
          <div className="sheet fm-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="fm-sheet-head"><span>Add Family Member</span><button onClick={() => setForm(null)} aria-label="Close"><X size={18} /></button></div>
            <label className="fm-field"><span>Name</span><input value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" /></label>
            <label className="fm-field"><span>Relation</span>
              <select value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })}>
                <option value="">Select</option>
                {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="fm-field"><span>Phone</span><input inputMode="numeric" value={form.phone} maxLength={10} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/[^0-9]/g, '') })} placeholder="10-digit number" /></label>
            <label className="fm-check"><input type="checkbox" checked={form.primary} onChange={(e) => setForm({ ...form, primary: e.target.checked })} /> Set as primary member</label>
            <button className="btn full" onClick={save}>Add Member</button>
          </div>
        </div>
      )}
    </div>
  )
}
