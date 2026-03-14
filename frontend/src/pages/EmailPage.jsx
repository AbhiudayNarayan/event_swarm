import React, { useState, useEffect } from 'react'
import { api } from '../shared'
import { toast } from 'react-hot-toast'
import { useEventConfig } from '../EventContext'
import ReactMarkdown from 'react-markdown'

// ── Role badge color map ──────────────────────────────────────────────────────
const ROLE_BADGE = {
  participant: 'badge-running',
  mentor:      'badge-done',
  judge:       'badge-error',
  speaker:     'badge-idle',
  volunteer:   'badge-idle',
}

// ── ParticipantTable ──────────────────────────────────────────────────────────
function ParticipantTable({ participants, setParticipants }) {
  const [editingIdx, setEditingIdx] = useState(null)
  const [draft, setDraft] = useState({})
  const set = (k, v) => setDraft(p => ({ ...p, [k]: v }))

  const saveEdit = () => {
    setParticipants(prev => prev.map((p, i) => i === editingIdx ? draft : p))
    setEditingIdx(null)
    toast.success('Participant updated locally (Save not implemented for demo)')
  }
  const deleteRow = (idx) => {
    if (!window.confirm('Remove this participant?')) return
    setParticipants(prev => prev.filter((_, i) => i !== idx))
  }

  if (!participants.length) return <div className="empty-state">No participants loaded yet.</div>

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th><th>Email</th><th>Role</th><th>Team</th><th>College</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {participants.map((p, idx) => (
            <tr key={idx}>
              {editingIdx === idx ? (
                <>
                  <td><input className="form-input" style={{ padding: '4px 8px', fontSize: '12px' }} value={draft.name || ''} onChange={e => set('name', e.target.value)} /></td>
                  <td><input className="form-input" style={{ padding: '4px 8px', fontSize: '12px' }} value={draft.email || ''} onChange={e => set('email', e.target.value)} /></td>
                  <td>
                    <select className="form-input" style={{ padding: '4px 8px', fontSize: '12px' }} value={draft.role || ''} onChange={e => set('role', e.target.value)}>
                      <option value="participant">participant</option>
                      <option value="mentor">mentor</option>
                      <option value="judge">judge</option>
                      <option value="speaker">speaker</option>
                      <option value="volunteer">volunteer</option>
                    </select>
                  </td>
                  <td><input className="form-input" style={{ padding: '4px 8px', fontSize: '12px' }} value={draft.team_name || ''} onChange={e => set('team_name', e.target.value)} /></td>
                  <td><input className="form-input" style={{ padding: '4px 8px', fontSize: '12px' }} value={draft.college || ''} onChange={e => set('college', e.target.value)} /></td>
                  <td>
                    <div className="data-row-actions">
                      <button className="btn-sm" onClick={() => setEditingIdx(null)}>✕</button>
                      <button className="btn-sm save" onClick={saveEdit}>✓</button>
                    </div>
                  </td>
                </>
              ) : (
                <>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{p.email}</td>
                  <td><span className={`badge ${ROLE_BADGE[p.role] || 'badge-idle'}`}>{p.role}</span></td>
                  <td>{p.team_name}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{p.college}</td>
                  <td>
                    <div className="data-row-actions">
                      <button className="btn-sm edit" onClick={() => { setEditingIdx(idx); setDraft({ ...p }) }}>Edit</button>
                      <button className="btn-sm delete" onClick={() => deleteRow(idx)}>Del</button>
                    </div>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── AddParticipantForm ────────────────────────────────────────────────────────
function AddParticipantForm({ onAdd, onClose }) {
  const [form, setForm] = useState({ name: '', email: '', role: 'participant', team_name: '', college: '' })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const submit = () => {
    if (!form.name || !form.email) return toast.error('Name and email are required')
    onAdd(form)
    onClose()
  }
  return (
    <div className="inline-edit-form" style={{ marginBottom: '12px' }}>
      <p style={{ fontWeight: 700, fontSize: '13px', color: 'var(--blue)' }}>+ Add Participant</p>
      <div className="form-row-inline">
        <div className="form-group"><label className="form-label">Name *</label><input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Email *</label><input className="form-input" value={form.email} onChange={e => set('email', e.target.value)} /></div>
        <div className="form-group">
          <label className="form-label">Role</label>
          <select className="form-input" value={form.role} onChange={e => set('role', e.target.value)}>
            <option>participant</option><option>mentor</option><option>judge</option><option>speaker</option><option>volunteer</option>
          </select>
        </div>
        <div className="form-group"><label className="form-label">Team</label><input className="form-input" value={form.team_name} onChange={e => set('team_name', e.target.value)} /></div>
        <div className="form-group"><label className="form-label">College</label><input className="form-input" value={form.college} onChange={e => set('college', e.target.value)} /></div>
      </div>
      <div className="inline-edit-actions">
        <button className="btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn-sm save" onClick={submit}>Add</button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function EmailPage() {
  const { activeEvent, eventName } = useEventConfig()
  const [participants, setParticipants] = useState([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [activeTab, setActiveTab] = useState('compose')
  const [template, setTemplate] = useState(
    "Hi {name},\n\nWe're excited to have you at Neurathon '26 as a {role}. Your team {team_name} has been registered.\n\nLooking forward to seeing you!\n\nBest regards,\nThe Organizing Team"
  )
  const [genLoading, setGenLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [approved, setApproved] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (activeEvent) {
      if (activeEvent.participants?.length > 0) {
        setParticipants(activeEvent.participants)
      } else {
        setParticipants([])
      }
      if (activeEvent.email_template) {
        setTemplate(activeEvent.email_template)
      }
    }
  }, [activeEvent])

  // ── Generate emails ───────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (participants.length === 0) return toast.error('No participants available. Add them in Event Settings first.')
    if (!template.trim()) return toast.error('Enter an email template')
    setGenLoading(true)
    setResult(null)
    try {
      // Write participants to a temp CSV blob and send to /api/email
      const headers = 'name,email,role,team_name,college'
      const rows = participants.map(p =>
        [p.name, p.email, p.role, p.team_name || '', p.college || ''].join(',')
      )
      const csvText = [headers, ...rows].join('\n')
      const blob = new Blob([csvText], { type: 'text/csv' })
      const formData = new FormData()
      formData.append('file', blob, 'participants.csv')
      formData.append('template', template)
      const res = await api.post('/api/email', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setResult(res.data)
      toast.success('Emails generated!')
    } catch (err) {
      toast.error('Generation failed — check backend')
    } finally {
      setGenLoading(false)
    }
  }

  const handleApproveAndSend = async () => {
    setSending(true)
    try {
      const res = await api.post('/api/email/send', { preview: result.preview })
      setApproved(true)
      setShowModal(false)
      toast.success(`✅ ${res.data.sent} emails sent via Gmail!`)
    } catch {
      toast.error('Send failed — check Gmail credentials in .env')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="page-body">
      <div className="page-header-card">
        <h1>Email Agent</h1>
        <p>GPT-4o personalizes emails per role · Human approval required before send</p>
        {eventName && <div style={{ marginTop: '12px', display: 'inline-block', background: 'rgba(74,144,255,0.1)', color: 'var(--blue)', padding: '4px 12px', borderRadius: '4px', fontSize: '13px', fontWeight: '600' }}>Active Data Source: {eventName}</div>}
      </div>

      <div className="tab-row">
        <button className={`tab-btn ${activeTab === 'compose' ? 'active' : ''}`} onClick={() => setActiveTab('compose')}>Compose</button>
        <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>History</button>
      </div>

      {activeTab === 'compose' ? (
      <>
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
        {/* LEFT — Participant list */}
        <div className="agent-card" style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3>Participant List {participants.length > 0 ? `(${participants.length})` : ''}</h3>
          </div>

          {participants.length === 0 ? (
            <div className="empty-state">No participants found. Edit {eventName} in Event Settings to assign participants.</div>
          ) : (
            <>
              {showAddForm && <AddParticipantForm onAdd={p => setParticipants(prev => [...prev, p])} onClose={() => setShowAddForm(false)} />}
              <ParticipantTable participants={participants} setParticipants={setParticipants} />
              {!showAddForm && <button className="add-row-btn" onClick={() => setShowAddForm(true)}>+ Add Participant</button>}
            </>
          )}

          {/* Template */}
          <div className="form-group" style={{ marginTop: '20px' }}>
            <label className="form-label">Email Template</label>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>Use {'{'+'name}'}, {'{'+'role}'}, {'{'+'team_name}'} as placeholders</p>
            <textarea className="form-textarea" rows={7} value={template} onChange={e => setTemplate(e.target.value)} />
          </div>

          <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleGenerate} disabled={genLoading || participants.length === 0}>
            {genLoading ? '⏳ Generating personalized emails...' : `✉️ Generate Emails (${participants.length})`}
          </button>
        </div>

        {/* RIGHT — Preview */}
        <div className="agent-card" style={{ flex: 1.4 }}>
          <h3>Email Preview</h3>
          {genLoading ? (
            <div className="spinner" style={{ margin: '40px auto' }} />
          ) : !result ? (
            <div className="empty-state">Load participants and click Generate to preview personalized emails</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <div className="metric-card"><div className="metric-value">{result.total_recipients}</div><div className="metric-label">Recipients</div></div>
                <div className="metric-card"><div className="metric-value">{result.segments?.participants || 0}</div><div className="metric-label">Participants</div></div>
                <div className="metric-card"><div className="metric-value">{result.segments?.mentors || 0}</div><div className="metric-label">Mentors</div></div>
                <div className="metric-card"><div className="metric-value">{result.segments?.judges || 0}</div><div className="metric-label">Judges</div></div>
              </div>

              <p className="output-label" style={{ marginBottom: '8px' }}>Email Previews</p>
              <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                {result.preview?.map((person, idx) => (
                  <div key={idx} style={{ background: 'var(--bg-input)', borderRadius: '10px', padding: '12px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <p style={{ fontWeight: 700 }}>{person.name}</p>
                      <span className={`badge ${ROLE_BADGE[person.role] || 'badge-idle'}`}>{person.role}</span>
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '6px' }}>{person.email}</p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.6 }}>{person.body?.slice(0, 150)}...</p>
                  </div>
                ))}
              </div>

              {!approved ? (
                <button className="btn btn-approve" style={{ width: '100%', marginTop: '16px' }} onClick={() => setShowModal(true)}>
                  ✅ Approve & Send ({result.total_recipients} emails)
                </button>
              ) : (
                <div className="banner-conflict success" style={{ marginTop: '16px' }}>✅ Emails dispatched! Check inboxes.</div>
              )}
            </>
          )}
        </div>
    </div>

      {/* ══ Approval Modal ══ */}
      {showModal && result && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h2>Confirm Email Dispatch</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Sending to <strong>{result.total_recipients}</strong> recipients. Preview of first 3:
            </p>
            {result.preview?.slice(0, 3).map((p, i) => (
              <div key={i} style={{ background: 'var(--bg-input)', borderRadius: '8px', padding: '12px', marginBottom: '8px' }}>
                <p style={{ fontWeight: 700 }}>{p.name} — <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{p.role}</span></p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{p.email}</p>
                <p style={{ fontSize: '13px', marginTop: '6px', lineHeight: 1.5 }}>{p.body?.slice(0, 100)}...</p>
              </div>
            ))}
            <div className="modal-actions">
              <button className="btn btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-approve" onClick={handleApproveAndSend} disabled={sending}>
                {sending ? '⏳ Sending...' : 'Approve & Send'}
              </button>
            </div>
          </div>
        </div>
      )}
      </>) : (
        <EmailHistoryPanel />
      )}
    </div>
  )
}

function EmailHistoryPanel() {
  const [drafts, setDrafts] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.get('/api/outputs/email-drafts')
      .then(r => setDrafts(r.data.drafts || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])
  if (loading) return <div className="output-terminal" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading history…</div>
  if (!drafts.length) return <div className="output-terminal" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No email drafts yet. Use the Swarm Chat to draft emails.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {drafts.map((d, i) => (
        <div key={i} className={`history-card ${d.sent ? 'approved' : 'pending'}`}>
          <div className="history-meta">
            {new Date(d.timestamp).toLocaleString()} — <em>{d.trigger?.slice(0, 60)}</em>
            <span className="badge" style={{ marginLeft: 8, fontSize: 10, background: d.sent ? 'var(--green)' : 'var(--cyan)', color: '#000' }}>
              {d.sent ? '✓ Sent' : 'Pending'}
            </span>
          </div>
          <div className="history-body">
            <p><strong>Subject:</strong> {d.subject}</p>
            <p><strong>Recipients ({d.recipients?.length || 0}):</strong> {(d.recipients || []).map(r => r.name).join(', ')}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
