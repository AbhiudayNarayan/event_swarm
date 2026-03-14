import React, { useState, useEffect } from 'react'
import { api } from '../shared'
import { toast } from 'react-hot-toast'
import { useEventConfig } from '../EventContext'

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRoomRowClass(ev) {
  if (ev.conflict_note?.includes('TRUE CONFLICT')) return 'event-card-row conflict-row'
  if (ev.conflict_note?.includes('PARALLEL OK'))  return 'event-card-row parallel-row'
  return 'event-card-row'
}

function getConflictPill(ev) {
  if (ev.conflict_note?.includes('TRUE CONFLICT'))   return <span className="conflict-pill conflict">⚠ Room Conflict</span>
  if (ev.conflict_note?.includes('PARALLEL OK'))     return <span className="conflict-pill parallel">⇄ Parallel OK</span>
  if (ev.conflict_note?.includes('SPEAKER DOUBLE'))  return <span className="conflict-pill double-booked">👤 Double-booked</span>
  return null
}

function groupEventsByDayAndRoom(events) {
  const days = {}
  for (const ev of events) {
    const d = ev.day ?? 1
    if (!days[d]) days[d] = {}
    const r = ev.room || 'Unassigned'
    if (!days[d][r]) days[d][r] = []
    days[d][r].push(ev)
  }
  return days
}

const EMPTY_EVENT = { id: '', name: '', speaker: '', day: 1, start_time: '', end_time: '', room: '', status: 'upcoming', track: '' }

// ── Tab style helpers ─────────────────────────────────────────────────────────
const tabActiveStyle = { padding: '0.6rem 1.5rem', borderRadius: '8px', border: '1px solid var(--blue)', background: 'rgba(74,144,255,0.15)', color: 'var(--blue)', cursor: 'pointer', fontWeight: 600 }
const tabCyanActive  = { ...tabActiveStyle, border: '1px solid var(--cyan)', background: 'rgba(0,212,255,0.15)', color: 'var(--cyan)' }
const tabInactive    = { padding: '0.6rem 1.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }

// ── EventScheduleDisplay — shared card view ───────────────────────────────────
function EventScheduleDisplay({ events, setEvents }) {
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState({})

  const grouped = groupEventsByDayAndRoom(events)

  const handleEdit = (ev) => { setEditingId(ev.id); setEditDraft({ ...ev }) }
  const handleEditSave = () => {
    setEvents(prev => prev.map(e => e.id === editingId ? { ...editDraft } : e))
    setEditingId(null)
    toast.success('Event updated locally (Save not implemented for demo)')
  }
  const handleDelete = (id) => {
    if (!window.confirm('Delete this event?')) return
    setEvents(prev => prev.filter(e => e.id !== id))
    toast.success('Event removed locally')
  }

  if (events.length === 0) return <div className="empty-state">No events available in the active event's schedule.</div>

  return (
    <div>
      {Object.keys(grouped).sort((a, b) => +a - +b).map(day => (
        <div className="event-day-section" key={day}>
          <div className="event-day-header">
            <h3>Day {day}</h3>
            <span className="day-count">{Object.values(grouped[day]).flat().length} events</span>
          </div>
          {Object.keys(grouped[day]).sort().map(room => (
            <div className="event-room-group" key={room}>
              <div className="event-room-header">🏛 {room}</div>
              {grouped[day][room]
                .slice().sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
                .map((ev, idx) => (
                  <React.Fragment key={ev.id || idx}>
                    {editingId === ev.id ? (
                      <div className="inline-edit-form">
                        <div className="form-row-inline">
                          <div className="form-group">
                            <label className="form-label">Name</label>
                            <input className="form-input" value={editDraft.name || ''} onChange={e => setEditDraft(p => ({ ...p, name: e.target.value }))} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Speaker</label>
                            <input className="form-input" value={editDraft.speaker || ''} onChange={e => setEditDraft(p => ({ ...p, speaker: e.target.value }))} />
                          </div>
                        </div>
                        <div className="form-row-inline">
                          <div className="form-group">
                            <label className="form-label">Room</label>
                            <input className="form-input" value={editDraft.room || ''} onChange={e => setEditDraft(p => ({ ...p, room: e.target.value }))} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Day</label>
                            <input className="form-input" type="number" min={1} max={4} value={editDraft.day || 1} onChange={e => setEditDraft(p => ({ ...p, day: parseInt(e.target.value) || 1 }))} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Start</label>
                            <input className="form-input" value={editDraft.start_time || ''} onChange={e => setEditDraft(p => ({ ...p, start_time: e.target.value }))} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">End</label>
                            <input className="form-input" value={editDraft.end_time || ''} onChange={e => setEditDraft(p => ({ ...p, end_time: e.target.value }))} />
                          </div>
                        </div>
                        <div className="inline-edit-actions">
                          <button className="btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                          <button className="btn-sm save" onClick={handleEditSave}>✓ Save</button>
                        </div>
                      </div>
                    ) : (
                      <div className={getRoomRowClass(ev)}>
                        <span className="event-time-badge">{ev.start_time}–{ev.end_time}</span>
                        <span className="event-card-name">{ev.name}</span>
                        <span className="event-card-speaker">{ev.speaker || '—'}</span>
                        {getConflictPill(ev)}
                        <span className={`badge ${ev.status === 'live' ? 'badge-running' : ev.status === 'ended' ? 'badge-done' : 'badge-idle'}`}>{ev.status || 'upcoming'}</span>
                        <div className="data-row-actions">
                          <button className="btn-sm edit" onClick={() => handleEdit(ev)}>Edit</button>
                          <button className="btn-sm delete" onClick={() => handleDelete(ev.id || idx)}>Del</button>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── AddEventForm ──────────────────────────────────────────────────────────────
function AddEventForm({ onAdd, onClose }) {
  const [form, setForm] = useState({ ...EMPTY_EVENT, id: `E${Date.now()}` })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const submit = () => {
    if (!form.name || !form.room) return toast.error('Name and Room are required')
    onAdd(form)
    onClose()
  }
  return (
    <div className="inline-edit-form" style={{ marginBottom: '16px' }}>
      <p style={{ fontWeight: 700, fontSize: '13px', color: 'var(--blue)' }}>+ Add New Event</p>
      <div className="form-row-inline">
        <div className="form-group"><label className="form-label">Name *</label><input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Speaker</label><input className="form-input" value={form.speaker} onChange={e => set('speaker', e.target.value)} /></div>
      </div>
      <div className="form-row-inline">
        <div className="form-group"><label className="form-label">Room *</label><input className="form-input" value={form.room} onChange={e => set('room', e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Day</label><input className="form-input" type="number" min={1} max={4} value={form.day} onChange={e => set('day', parseInt(e.target.value) || 1)} /></div>
        <div className="form-group"><label className="form-label">Start (HH:MM)</label><input className="form-input" value={form.start_time} onChange={e => set('start_time', e.target.value)} /></div>
        <div className="form-group"><label className="form-label">End (HH:MM)</label><input className="form-input" value={form.end_time} onChange={e => set('end_time', e.target.value)} /></div>
      </div>
      <div className="inline-edit-actions">
        <button className="btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn-sm save" onClick={submit}>Add Event</button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SchedulerPage() {
  const { activeEvent, eventName } = useEventConfig()
  const [activeTab, setActiveTab] = useState('plan')
  
  const [events, setEvents] = useState([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [roomConflictModal, setRoomConflictModal] = useState(null)

  // Delay tab state
  const [delayModal, setDelayModal]   = useState(null)
  const [delayMinutes, setDelayMinutes] = useState(0)
  const [delayResult, setDelayResult] = useState(null)
  const [delayLoading, setDelayLoading] = useState(false)
  const [submittedDelays, setSubmittedDelays] = useState([])
  const [cancelledIds, setCancelledIds] = useState([])

  useEffect(() => {
    if (activeEvent?.schedule && Array.isArray(activeEvent.schedule)) {
      setEvents(activeEvent.schedule)
    } else {
      setEvents([])
    }
  }, [activeEvent])

  // ── Delay handler ────────────────────────────────────────────────────────
  const handleReportDelay = async () => {
    if (delayMinutes <= 0) return toast.error('Enter delay in minutes')
    setDelayLoading(true)
    try {
      const res = await api.post('/api/schedule/delay', {
        delayed_event_id: delayModal.id,
        delayed_event_name: delayModal.name,
        delay_minutes: delayMinutes,
        all_events: events
      })
      setDelayResult(res.data)
      setSubmittedDelays(prev => [...prev, delayModal.id])
      setDelayModal(null)
      toast.success('Delay reported. Impact analysis ready.')
    } catch (err) {
      toast.error('Failed. Check backend.')
    } finally {
      setDelayLoading(false)
    }
  }

  const handleCancelEvent = (id) => {
    if (!window.confirm('Mark this event as cancelled?')) return
    setCancelledIds(prev => [...prev, id])
    setEvents(prev => prev.map(e => e.id === id ? { ...e, status: 'cancelled' } : e))
    toast.success('Event marked as cancelled. Gap noted.')
  }

  return (
    <div className="page-body">
      <div className="page-header-card">
        <h1>Scheduler Agent</h1>
        <p>Detect conflicts · Report delays · Track live events</p>
        {eventName && <div style={{ marginTop: '12px', display: 'inline-block', background: 'rgba(74,144,255,0.1)', color: 'var(--blue)', padding: '4px 12px', borderRadius: '4px', fontSize: '13px', fontWeight: '600' }}>Active Data Source: {eventName}</div>}
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <button style={activeTab === 'plan' ? tabActiveStyle : tabInactive} onClick={() => setActiveTab('plan')}>📋 Plan Schedule</button>
        <button style={activeTab === 'live' ? tabCyanActive : tabInactive} onClick={() => setActiveTab('live')}>📡 Live Tracking</button>
        <button style={activeTab === 'history' ? tabCyanActive : tabInactive} onClick={() => setActiveTab('history')}>📜 History</button>
      </div>

      {/* ══ TAB 1 — Plan ══════════════════════════════════════════════════════ */}
      {activeTab === 'plan' && (
        <div>
          {/* Parsed output */}
          <div className="agent-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3>Event Schedule {events.length > 0 && `(${events.length} events)`}</h3>
              {events.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {!showAddForm && <button className="add-row-btn" style={{ width: 'auto', margin: 0 }} onClick={() => setShowAddForm(true)}>+ Add Event</button>}
                  <button className="btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={() => { setActiveTab('live'); toast.success('Switched to Live Tracking') }}>→ Go Live</button>
                </div>
              )}
            </div>

            {showAddForm && <AddEventForm onAdd={(ev) => setEvents(prev => [...prev, ev])} onClose={() => setShowAddForm(false)} />}
            <EventScheduleDisplay events={events} setEvents={setEvents} />
          </div>
        </div>
      )}

      {/* ══ TAB 2 — Live Tracking ════════════════════════════════════════════ */}
      {activeTab === 'live' && (
        <>
          {events.length === 0 ? (
            <div className="agent-card"><div className="empty-state">No schedule data available. Load events via the Event Setup page.</div></div>
          ) : (
            <>
              <p className="output-label" style={{ marginBottom: '8px' }}>Live Event Monitor</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                Report a delay or cancel an event. Delay analysis uses GPT-4o to calculate downstream impact.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                {events.map((ev, idx) => {
                  const isCancelled = cancelledIds.includes(ev.id) || ev.status === 'cancelled'
                  const hasDelay = submittedDelays.includes(ev.id)
                  return (
                    <div key={idx} style={{
                      background: 'var(--bg-card)',
                      border: hasDelay ? '1px solid var(--purple)' : isCancelled ? '1px solid rgba(255,82,82,0.4)' : '1px solid var(--border)',
                      borderRadius: '12px', padding: '1.25rem',
                      opacity: isCancelled ? 0.65 : 1
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <p style={{ fontWeight: 700, fontSize: '13px' }}>{ev.name}</p>
                        {hasDelay && <span style={{ background: 'rgba(123,97,255,0.2)', color: 'var(--purple)', borderRadius: '20px', padding: '2px 8px', fontSize: '11px' }}>Delayed</span>}
                        {isCancelled && <span style={{ background: 'rgba(255,82,82,0.15)', color: 'var(--red)', borderRadius: '20px', padding: '2px 8px', fontSize: '11px' }}>Cancelled</span>}
                      </div>
                      <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Day {ev.day} · {ev.room}</p>
                      <p style={{ color: 'var(--cyan)', fontFamily: 'monospace', fontSize: '12px', marginBottom: '12px' }}>{ev.start_time}–{ev.end_time}</p>
                      {!hasDelay && !isCancelled && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="btn btn-sm edit" style={{ flex: 1 }} onClick={() => { setDelayModal(ev); setDelayMinutes(0); setDelayResult(null) }}>⏱ Delay</button>
                          <button className="btn btn-sm delete" style={{ flex: 1 }} onClick={() => handleCancelEvent(ev.id)}>✕ Cancel</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {delayResult && (
                <div className="agent-card">
                  <h3>⚠️ Impact Analysis — {delayResult.delayed_event}</h3>
                  <div style={{ display: 'flex', gap: '1rem', margin: '1rem 0' }}>
                    <div className="metric-card"><div className="metric-value">{delayResult.delay_minutes} min</div><div className="metric-label">Delay</div></div>
                    <div className="metric-card"><div className="metric-value">{delayResult.affected_events.length}</div><div className="metric-label">Affected</div></div>
                    <div className="metric-card"><div className="metric-value" style={{ color: 'var(--cyan)', fontFamily: 'monospace', fontSize: '1.1rem' }}>{delayResult.new_end_time}</div><div className="metric-label">New End</div></div>
                  </div>
                  {delayResult.affected_events.length > 0 ? (
                    <>
                      <p className="output-label">Affected Sessions</p>
                      {delayResult.affected_events.map((a, i) => (
                        <div key={i} style={{ borderLeft: '3px solid var(--red)', paddingLeft: '1rem', marginBottom: '0.5rem' }}>
                          <p style={{ fontWeight: 600 }}>{a.name}</p>
                          <p style={{ color: 'var(--red)', fontSize: '12px' }}>{a.reason === 'room' ? 'Same room conflict' : 'Same speaker conflict'}</p>
                        </div>
                      ))}
                    </>
                  ) : <p style={{ color: 'var(--green)' }}>✅ No downstream events affected</p>}
                  <div style={{ background: 'var(--bg-input)', borderRadius: '10px', padding: '1rem', marginTop: '1rem' }}>
                    <p style={{ color: 'var(--cyan)', fontWeight: 700, fontSize: '12px', marginBottom: '4px' }}>🤖 GPT-4o Suggestion</p>
                    <p style={{ lineHeight: 1.7 }}>{delayResult.suggestion}</p>
                  </div>
                  <div style={{ background: 'rgba(255,82,82,0.07)', border: '1px solid rgba(255,82,82,0.2)', borderRadius: '10px', padding: '1rem', marginTop: '1rem' }}>
                    <p style={{ color: 'var(--red)', fontWeight: 700, fontSize: '12px', marginBottom: '4px' }}>📣 Notification Draft</p>
                    <p style={{ fontSize: '13px', lineHeight: 1.6 }}>{delayResult.notification_message}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ══ Room Conflict Modal ══ */}
      {roomConflictModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <h2>🏠 Room Double-Booking Detected</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '1rem' }}>
              The following rooms have overlapping events. Is this intentional?
            </p>
            {roomConflictModal.map((c, i) => (
              <div key={i} style={{ background: 'var(--bg-input)', borderRadius: '8px', padding: '12px', marginBottom: '8px' }}>
                <p style={{ fontWeight: 600, color: 'var(--red)' }}>{c.room}</p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{c.event1_name} and {c.event2_name}</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Overlap: {c.time_overlap}</p>
              </div>
            ))}
            <div className="modal-actions">
              <button className="btn btn-cancel" onClick={() => { setRoomConflictModal(null); setEvents([]) }}>✏️ Let me fix it</button>
               <button className="btn btn-approve" onClick={() => { setRoomConflictModal(null); toast.success('Schedule saved with detected conflicts'); setActiveTab('live') }}>✅ Save as-is</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Delay Modal ══ */}
      {delayModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '420px' }}>
            <h2>⏱ Report Delay</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '1rem' }}>{delayModal.name} · Day {delayModal.day} · {delayModal.room}</p>
            <div className="form-group">
              <label className="form-label">How many minutes did it run over?</label>
              <input type="number" className="form-input" min={1} max={120} value={delayMinutes} onChange={e => setDelayMinutes(parseInt(e.target.value) || 0)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-cancel" onClick={() => setDelayModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleReportDelay} disabled={delayLoading || delayMinutes <= 0}>
                {delayLoading ? '⏳ Analyzing...' : 'Report & Analyze Impact'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ TAB 3 — History ═══════════════════════════════════════════════════ */}
      {activeTab === 'history' && <ScheduleHistoryPanel />}
    </div>
  )
}

function ScheduleHistoryPanel() {
  const [changes, setChanges] = useState([])
  const [loading, setLoading]   = useState(true)
  useEffect(() => {
    api.get('/api/outputs/schedule-changes')
      .then(r => setChanges(r.data.changes || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])
  if (loading) return <div className="output-terminal" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading history…</div>
  if (!changes.length) return <div className="output-terminal" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No schedule changes yet. Use the Swarm Chat to report delays or cancellations.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {changes.map((c, i) => (
        <div key={i} className="history-card">
          <div className="history-meta">
            {new Date(c.timestamp).toLocaleString()} — <em>{c.trigger?.slice(0, 80)}</em>
          </div>
          <div className="history-body">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {(c.changes || []).map((ch, j) => <li key={j}>{ch}</li>)}
            </ul>
          </div>
        </div>
      ))}
    </div>
  )
}
