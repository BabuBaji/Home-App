import { useEffect, useState } from 'react'
import { BookOpen, CheckCircle2, FileText, HelpCircle, Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react'
import {
  fetchTraining, createTrainingModule, updateTrainingModule, deleteTrainingModule,
  createTrainingQuestion, updateTrainingQuestion, deleteTrainingQuestion,
} from '../api'
import type { TrainingAdminState, TrainingModule, TrainingQuestion } from '../types'
import { StatCard, Card, Badge, Loading, ErrorState, Empty, Modal, Field, Dropdown, useToast, useConfirm } from '../components/UI'

/* Training & assessment authoring.
 *
 * The 9 modules are seeded as TITLES ONLY — empty, unpublished drafts. Their content is company
 * policy (grooming standards, the cleaning SOP, incentive rules), so it's written here rather than
 * invented by the system and quizzed on. A module stays invisible to workers until it has a body
 * and is published, and the quiz can't be sat until the bank holds a full paper's worth.
 */

type Tab = 'modules' | 'questions'

const emptyQ = { question: '', options: ['', '', '', ''], correctIndex: 0, moduleId: null as number | null }

export default function Training() {
  const toast = useToast()
  const confirm = useConfirm()
  const [data, setData] = useState<TrainingAdminState | null>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<Tab>('modules')

  const [editing, setEditing] = useState<TrainingModule | null>(null)
  const [draft, setDraft] = useState({ title: '', body: '' })
  const [qModal, setQModal] = useState<null | 'add' | 'edit'>(null)
  const [qEditing, setQEditing] = useState<TrainingQuestion | null>(null)
  const [qDraft, setQDraft] = useState(emptyQ)
  const [saving, setSaving] = useState(false)

  const load = () => { setErr(''); fetchTraining().then(setData).catch((e: Error) => setErr(e.message)) }
  useEffect(load, [])
  if (err) return <ErrorState msg={err} onRetry={load} />
  if (!data) return <Loading />

  const published = data.modules.filter((m) => m.published)
  const drafts = data.modules.filter((m) => !m.published)
  const bankShort = Math.max(0, data.quizSize - data.bank)

  const saveModule = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await updateTrainingModule(editing.id, { title: draft.title, body: draft.body })
      toast('Saved')
      setEditing(null); load()
    } catch (e) { toast((e as Error).message, 'err') } finally { setSaving(false) }
  }

  // The server refuses to publish an empty module; surface that as a reason, not a dead button.
  const togglePublish = async (m: TrainingModule) => {
    try {
      await updateTrainingModule(m.id, { published: !m.published })
      toast(m.published ? `"${m.title}" unpublished` : `"${m.title}" is now live for workers`)
      load()
    } catch (e) { toast((e as Error).message, 'err') }
  }

  const removeModule = async (m: TrainingModule) => {
    if (!(await confirm({
      title: `Delete "${m.title}"?`,
      message: 'Its questions and every worker\'s progress on it go too.',
      confirmLabel: 'Delete', danger: true,
    }))) return
    try { await deleteTrainingModule(m.id); toast('Module deleted'); load() } catch (e) { toast((e as Error).message, 'err') }
  }

  const addModule = async () => {
    const title = prompt('Module name')?.trim()
    if (!title) return
    try { await createTrainingModule(title); toast('Draft created — write the content, then publish'); load() }
    catch (e) { toast((e as Error).message, 'err') }
  }

  const saveQuestion = async () => {
    setSaving(true)
    const body = { ...qDraft, options: qDraft.options.map((o) => o.trim()).filter(Boolean) }
    try {
      if (qModal === 'edit' && qEditing) await updateTrainingQuestion(qEditing.id, body)
      else await createTrainingQuestion(body)
      toast('Saved'); setQModal(null); setQEditing(null); setQDraft(emptyQ); load()
    } catch (e) { toast((e as Error).message, 'err') } finally { setSaving(false) }
  }

  const removeQuestion = async (q: TrainingQuestion) => {
    if (!(await confirm({ title: 'Delete this question?', message: q.question, confirmLabel: 'Delete', danger: true }))) return
    try { await deleteTrainingQuestion(q.id); toast('Question deleted'); load() } catch (e) { toast((e as Error).message, 'err') }
  }

  const moduleName = (id: number | null) => data.modules.find((m) => m.id === id)?.title || 'General'

  return (
    <>
      <div className="stat-row">
        <StatCard icon={<BookOpen size={18} />} tint="#eef0ff" label="Modules" value={data.modules.length} sub={`${published.length} live · ${drafts.length} draft`} />
        <StatCard icon={<CheckCircle2 size={18} />} tint="#e7f7ee" label="Published" value={published.length} sub="Visible to workers" />
        <StatCard icon={<HelpCircle size={18} />} tint="#fff6e6" label="Question bank" value={data.bank} sub={`${data.quizSize} needed per paper`} down={bankShort > 0} />
        <StatCard icon={<FileText size={18} />} tint="#e8eefe" label="Pass mark" value={`${data.passPct}%`} sub={`${data.quizSize} questions, drawn at random`} />
      </div>

      {/* Why the quiz isn't takeable yet — stated plainly rather than left to be discovered. */}
      {bankShort > 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 14, borderLeft: '3px solid #d97706' }}>
          <strong>The assessment isn't ready.</strong> A paper is {data.quizSize} questions drawn at random,
          but the bank has {data.bank}. Add {bankShort} more{published.length === 0 ? ', and publish at least one module' : ''} —
          until then workers are told to ask you to finish setting it up.
        </div>
      )}
      {published.length === 0 && data.modules.length > 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 14, borderLeft: '3px solid #6366f1' }}>
          <strong>Nothing is published yet.</strong> These modules carry your own policies, so they ship empty —
          write each one and publish it. Workers see only published modules.
        </div>
      )}

      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={'tab' + (tab === 'modules' ? ' active' : '')} onClick={() => setTab('modules')}>Modules ({data.modules.length})</button>
        <button className={'tab' + (tab === 'questions' ? ' active' : '')} onClick={() => setTab('questions')}>Questions ({data.questions.length})</button>
      </div>

      {tab === 'modules' && (
        <Card title="Training modules" right={<button className="btn" onClick={addModule}><Plus size={16} /> Add module</button>}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>Module</th><th>Content</th><th>Questions</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {data.modules.map((m) => (
                  <tr key={m.id}>
                    <td>{m.sort}</td>
                    <td><strong>{m.title}</strong></td>
                    <td style={{ color: m.body?.trim() ? 'inherit' : '#94a3b8' }}>
                      {m.body?.trim() ? `${m.body.trim().split(/\s+/).length} words` : 'Not written yet'}
                    </td>
                    <td>{m.questions ?? 0}</td>
                    <td><Badge tone={m.published ? 'green' : 'gray'}>{m.published ? 'Published' : 'Draft'}</Badge></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="iconbtn" title="Edit content" onClick={() => { setEditing(m); setDraft({ title: m.title, body: m.body || '' }) }}><Pencil size={16} /></button>
                      <button className="iconbtn" title={m.published ? 'Unpublish' : 'Publish'} onClick={() => togglePublish(m)}>
                        {m.published ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <button className="iconbtn" title="Delete" onClick={() => removeModule(m)}><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'questions' && (
        <Card title="Question bank" right={<button className="btn" onClick={() => { setQDraft(emptyQ); setQModal('add') }}><Plus size={16} /> Add question</button>}>
          {data.questions.length === 0
            ? <Empty msg="No questions yet. A paper is drawn at random from this bank." />
            : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Question</th><th>Module</th><th>Correct answer</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                  <tbody>
                    {data.questions.map((q) => (
                      <tr key={q.id}>
                        <td style={{ maxWidth: 380 }}>{q.question}</td>
                        <td>{moduleName(q.moduleId)}</td>
                        <td style={{ color: '#15803d' }}>{q.options[q.correctIndex] ?? '—'}</td>
                        <td><Badge tone={q.active ? 'green' : 'gray'}>{q.active ? 'Active' : 'Retired'}</Badge></td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="iconbtn" title="Edit" onClick={() => {
                            setQEditing(q)
                            setQDraft({ question: q.question, options: [...q.options, '', '', '', ''].slice(0, 4), correctIndex: q.correctIndex, moduleId: q.moduleId })
                            setQModal('edit')
                          }}><Pencil size={16} /></button>
                          <button className="iconbtn" title={q.active ? 'Retire' : 'Reactivate'} onClick={async () => {
                            try { await updateTrainingQuestion(q.id, { active: !q.active }); load() } catch (e) { toast((e as Error).message, 'err') }
                          }}>{q.active ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                          <button className="iconbtn" title="Delete" onClick={() => removeQuestion(q)}><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Card>
      )}

      {editing && (
        <Modal title={`Edit — ${editing.title}`} wide onClose={() => setEditing(null)}
          footer={<>
            <button className="btn line" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" disabled={saving} onClick={saveModule}>{saving ? 'Saving…' : 'Save'}</button>
          </>}>
          <Field label="Module name"><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
          <Field label="Content — this is what the worker reads">
            <textarea rows={16} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              placeholder={`Write ${editing.title} in your own words. Workers read this, then answer questions on it.`} />
          </Field>
          {!editing.published && <p style={{ color: '#64748b', fontSize: 13 }}>This module is a draft — no worker can see it until you publish it.</p>}
        </Modal>
      )}

      {qModal && (
        <Modal title={qModal === 'add' ? 'Add question' : 'Edit question'} wide onClose={() => { setQModal(null); setQEditing(null) }}
          footer={<>
            <button className="btn line" onClick={() => { setQModal(null); setQEditing(null) }}>Cancel</button>
            <button className="btn" disabled={saving} onClick={saveQuestion}>{saving ? 'Saving…' : 'Save'}</button>
          </>}>
          <Field label="Question"><input value={qDraft.question} onChange={(e) => setQDraft({ ...qDraft, question: e.target.value })} /></Field>
          <Field label="Module (or leave as General)">
            <Dropdown value={String(qDraft.moduleId ?? '')} width="100%"
              options={[{ value: '', label: 'General' }, ...data.modules.map((m) => ({ value: String(m.id), label: m.title }))]}
              onChange={(v) => setQDraft({ ...qDraft, moduleId: v ? Number(v) : null })} />
          </Field>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 8px' }}>Select the correct answer. Blank options are ignored — two is the minimum.</p>
          {qDraft.options.map((o, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <input type="radio" name="correct" checked={qDraft.correctIndex === i} onChange={() => setQDraft({ ...qDraft, correctIndex: i })} title="Correct answer" />
              <input style={{ flex: 1 }} placeholder={`Option ${i + 1}`} value={o}
                onChange={(e) => { const opts = [...qDraft.options]; opts[i] = e.target.value; setQDraft({ ...qDraft, options: opts }) }} />
            </div>
          ))}
        </Modal>
      )}
    </>
  )
}
