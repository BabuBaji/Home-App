import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck, Check, X, Clock, Info, SlidersHorizontal, Inbox } from 'lucide-react'
import { Card, StatCard, Badge, Loading, ErrorState, Field, Modal, Dropdown, useToast } from '../components/UI'
import { fetchApprovals, approveRequest, rejectRequest, fetchApprovalRules, updateApprovalRule } from '../api'
import type { ApprovalRequest, ApprovalRuleRow } from '../types'
import { useStore, has } from '../store'

/* Approval matrix — maker-checker.
 *
 * Inbox: sensitive actions waiting for a second admin's sign-off. You can't approve your own request
 * (separation of duties), and you must hold the action's reviewer permission. When enough approvers
 * sign, the action executes for real.
 * Rules: which actions require approval, above what ₹ threshold, who may approve, and how many.
 */

const rupee = (n: number | null) => (n == null ? '—' : '₹' + (n || 0).toLocaleString('en-IN'))
// Date + time — approvals need the moment, not just the day, for the audit trail.
const dateTime = (s?: string | null) => (s ? new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const PERM_LABEL: Record<string, string> = { 'approvals.review': 'Approver (approvals.review)', 'admins.edit': 'Admin manager (admins.edit)', 'settings.edit': 'Settings editor (settings.edit)' }
const STATUS_TONE: Record<string, 'amber' | 'green' | 'red' | 'gray'> = { pending: 'amber', executed: 'green', approved: 'green', rejected: 'red', failed: 'red' }

export default function Approvals() {
  const toast = useToast()
  const { admin } = useStore()
  const canReview = has(admin, 'approvals.review')
  const canManage = has(admin, 'approvals.manage')
  const [tab, setTab] = useState<'inbox' | 'rules'>(canReview ? 'inbox' : 'rules')

  const [requests, setRequests] = useState<ApprovalRequest[] | null>(null)
  const [meId, setMeId] = useState<number>(0)
  const [scope, setScope] = useState<'pending' | 'all'>('pending')
  const [rules, setRules] = useState<ApprovalRuleRow[] | null>(null)
  const [reviewerPerms, setReviewerPerms] = useState<string[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const [rejectFor, setRejectFor] = useState<ApprovalRequest | null>(null)
  const [reason, setReason] = useState('')

  const loadInbox = () => {
    if (!canReview) return
    fetchApprovals(scope).then((r) => { setRequests(r.requests); setMeId(r.meId) }).catch((e: Error) => setErr(e.message))
  }
  const loadRules = () => {
    if (!canManage) return
    fetchApprovalRules().then((r) => { setRules(r.actions); setReviewerPerms(r.reviewerPerms) }).catch((e: Error) => setErr(e.message))
  }
  useEffect(loadInbox, [scope])
  useEffect(loadRules, [])

  const pendingCount = useMemo(() => (requests || []).filter((r) => r.status === 'pending').length, [requests])

  if (err) return <ErrorState msg={err} onRetry={() => { setErr(''); loadInbox(); loadRules() }} />

  const doApprove = async (r: ApprovalRequest) => {
    setBusy(r.id)
    try {
      const res = await approveRequest(r.id)
      const st = res.request?.status
      toast(st === 'executed' ? 'Approved & executed' : 'Approval recorded — more sign-offs needed', 'ok')
      loadInbox()
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(null) }
  }
  const doReject = async () => {
    if (!rejectFor) return
    setBusy(rejectFor.id)
    try { await rejectRequest(rejectFor.id, reason.trim()); toast('Request rejected'); setRejectFor(null); setReason(''); loadInbox() }
    catch (e) { toast((e as Error).message, 'err') } finally { setBusy(null) }
  }
  const saveRule = async (action: string, patch: Partial<ApprovalRuleRow>) => {
    const cur = (rules || []).find((r) => r.action === action)
    if (!cur) return
    const next = { ...cur, ...patch }
    setRules((rs) => (rs || []).map((r) => (r.action === action ? next : r)))
    try { await updateApprovalRule(action, { enabled: next.enabled, threshold: next.threshold, minApprovers: next.minApprovers, reviewerPerm: next.reviewerPerm }); toast('Rule saved') }
    catch (e) { toast((e as Error).message, 'err'); loadRules() }
  }

  const canActOn = (r: ApprovalRequest) => r.status === 'pending' && r.requestedById !== meId && has(admin, r.reviewerPerm) && !r.approvals.some((a) => a.byId === meId)

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="stat-row">
        <StatCard icon={<Clock size={20} />} tint="#fff4e5" label="Pending" value={pendingCount} sub="awaiting sign-off" />
        {/* Rule config is only visible with approvals.manage, so this count is only meaningful then. */}
        {canManage && <StatCard icon={<SlidersHorizontal size={20} />} tint="#eef0ff" label="Rules on" value={(rules || []).filter((r) => r.enabled).length} sub={`of ${(rules || []).length} actions`} />}
      </div>

      <div className="tabs">
        {canReview && <button className={'tab' + (tab === 'inbox' ? ' active' : '')} onClick={() => setTab('inbox')}><Inbox size={15} /> Inbox{pendingCount ? ` (${pendingCount})` : ''}</button>}
        {canManage && <button className={'tab' + (tab === 'rules' ? ' active' : '')} onClick={() => setTab('rules')}><SlidersHorizontal size={15} /> Approval Rules</button>}
      </div>

      {tab === 'inbox' && canReview && (
        <Card title="Approval requests" right={
          <Dropdown value={scope} width={160} options={[{ value: 'pending', label: 'Pending only' }, { value: 'all', label: 'All (history)' }]} onChange={(v) => setScope(v as 'pending' | 'all')} />
        }>
          {!requests ? <Loading /> : requests.length === 0
            ? <div className="muted" style={{ fontSize: 13, padding: '8px 0' }}>Nothing waiting. Requests appear here when a sensitive action crosses its approval threshold.</div>
            : (
              <div className="tablewrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ width: '40%' }}>Request</th>
                      <th style={{ textAlign: 'right', width: '13%' }}>Amount</th>
                      <th style={{ textAlign: 'center', width: '20%' }}>Status</th>
                      <th style={{ textAlign: 'right', width: '27%' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => {
                      const actable = canActOn(r)
                      return (
                        <tr key={r.id}>
                          <td>
                            <strong style={{ fontSize: 13.5 }}>{r.summary}</strong>
                            <div className="muted" style={{ fontSize: 11.5 }}>{r.label} · by {r.requestedBy} · {dateTime(r.created)}</div>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{r.amount != null ? rupee(r.amount) : '—'}</td>
                          <td style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                            <Badge tone={STATUS_TONE[r.status] || 'gray'}>{r.status}</Badge>
                            {r.minApprovers > 1 && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{r.approvals.length}/{r.minApprovers} signed</div>}
                            {r.status === 'rejected' && r.reason && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{r.reason}</div>}
                            {r.status === 'failed' && r.error && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 2 }}>{r.error}</div>}
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {actable ? (
                              <div style={{ display: 'inline-flex', gap: 8 }}>
                                <button className="btn sm" disabled={busy === r.id} onClick={() => doApprove(r)}><Check size={14} /> Approve</button>
                                <button className="btn line sm" style={{ color: 'var(--red)' }} disabled={busy === r.id} onClick={() => { setRejectFor(r); setReason('') }}><X size={14} /> Reject</button>
                              </div>
                            ) : r.status === 'pending'
                              ? <span className="muted" style={{ fontSize: 12 }}>{r.requestedById === meId ? 'Your request' : r.approvals.some((a) => a.byId === meId) ? 'You signed' : 'Not an approver'}</span>
                              : (
                                <div className="muted" style={{ fontSize: 11.5, textAlign: 'right', lineHeight: 1.5 }}>
                                  <div>{r.status === 'rejected' ? 'Rejected' : r.status === 'failed' ? 'Failed' : 'Approved'}{r.decidedBy ? ` by ${r.decidedBy}` : ''}</div>
                                  {r.decidedAt && <div>{dateTime(r.decidedAt)}</div>}
                                </div>
                              )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </Card>
      )}

      {tab === 'rules' && canManage && (
        <Card title="Approval matrix">
          <div style={{ display: 'flex', gap: 8, fontSize: 12, background: '#eff6ff', color: '#1e40af', padding: 10, borderRadius: 10, marginBottom: 12 }}>
            <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>When a rule is on, that action requires sign-off once its amount reaches the threshold (₹0 = always). The maker can't approve their own request, and an approver must hold the chosen permission.</span>
          </div>
          {!rules ? <Loading /> : (
            <div className="tablewrap">
              <table className="tbl">
                <thead><tr><th>Action</th><th>Requires approval</th><th>Threshold (₹)</th><th>Approvers</th><th>Approver permission</th></tr></thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.action}>
                      <td><strong>{r.label}</strong><div className="muted" style={{ fontSize: 11.5 }}>{r.action}</div></td>
                      <td>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                          <input type="checkbox" checked={r.enabled} onChange={(e) => saveRule(r.action, { enabled: e.target.checked })} />
                          <Badge tone={r.enabled ? 'green' : 'gray'}>{r.enabled ? 'On' : 'Off'}</Badge>
                        </label>
                      </td>
                      <td>
                        <input value={String(r.threshold)} disabled={!r.enabled} style={inpStyle}
                          onChange={(e) => setRules((rs) => (rs || []).map((x) => x.action === r.action ? { ...x, threshold: Number(e.target.value.replace(/\D/g, '') || 0) } : x))}
                          onBlur={() => saveRule(r.action, { threshold: r.threshold })} />
                      </td>
                      <td>
                        <input value={String(r.minApprovers)} disabled={!r.enabled} style={{ ...inpStyle, width: 56 }}
                          onChange={(e) => setRules((rs) => (rs || []).map((x) => x.action === r.action ? { ...x, minApprovers: Math.max(1, Math.min(5, Number(e.target.value.replace(/\D/g, '') || 1))) } : x))}
                          onBlur={() => saveRule(r.action, { minApprovers: r.minApprovers })} />
                      </td>
                      <td>
                        <Dropdown value={r.reviewerPerm} width={230} disabled={!r.enabled}
                          options={reviewerPerms.map((p) => ({ value: p, label: PERM_LABEL[p] || p }))}
                          onChange={(v) => saveRule(r.action, { reviewerPerm: v })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {rejectFor && (
        <Modal title="Reject request" onClose={() => setRejectFor(null)} footer={
          <>
            <button className="btn line" onClick={() => setRejectFor(null)}>Cancel</button>
            <button className="btn" style={{ background: 'var(--red)' }} disabled={busy === rejectFor.id} onClick={doReject}>Reject</button>
          </>
        }>
          <p style={{ fontSize: 13, marginBottom: 10 }}>{rejectFor.summary}</p>
          <Field label="Reason (optional)"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being rejected?" autoFocus /></Field>
        </Modal>
      )}
    </div>
  )
}

const inpStyle: React.CSSProperties = { width: 110, border: '1px solid var(--line,#e5e7eb)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }
