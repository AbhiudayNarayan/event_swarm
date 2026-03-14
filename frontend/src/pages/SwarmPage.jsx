import React, { useState, useRef, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { api } from '../shared'
import ReactMarkdown from 'react-markdown'

// ── Constants ───────────────────────────────────────────────────────────────
const STARTERS = [
  '⏱ The opening keynote in Hall A is running 30 minutes late',
  '🚫 The 2pm workshop in Room 2 has been cancelled',
  '📧 Send a reminder email to all judges for tomorrow\'s sessions',
  '📣 Draft a sponsor spotlight post for TechCorp',
  '🌅 Generate the morning brief for Day 2',
  '📅 Check the schedule for any room conflicts',
]

const AGENT_META = {
  scheduler_agent: { icon: '📅', label: 'Scheduler Agent' },
  content_agent:   { icon: '🎨', label: 'Content Agent' },
  email_agent:     { icon: '📧', label: 'Email Agent' },
}

/** Read the stored event name from localStorage — same source SetupPage writes. */
function getStoredEventName() {
  try {
    const saved = localStorage.getItem('swarm_event_config')
    if (saved) {
      const cfg = JSON.parse(saved)
      return cfg.eventName || 'default'
    }
  } catch (_) {}
  return 'default'
}

function getContextLoaded() {
  try {
    const saved = localStorage.getItem('swarm_event_config')
    if (saved) return JSON.parse(saved).contextLoaded === true
  } catch (_) {}
  return false
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function SwarmPage() {
  // Read directly from localStorage — EventContext.eventName can be stale
  // if the user saved via the "Load Sample & Save" path without navigating through
  // the normal form submission.
  const [eventName] = useState(getStoredEventName)

  const [messages, setMessages]       = useState([])
  const [input, setInput]             = useState('')
  const [thinking, setThinking]       = useState(false)
  const [ctxStatus, setCtxStatus]     = useState(null)
  const [expandedIds, setExpandedIds] = useState({})

  const chatEndRef = useRef(null)
  const textareaRef = useRef(null)

  // ── Scroll to bottom whenever messages change ────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  // ── Fetch context status on mount ────────────────────────────────────────
  useEffect(() => {
    // Use a well-known fixed key so SetupPage and SwarmPage always agree
    api.get('/api/setup/context/status', { params: { event_name: eventName } })
      .then(r => setCtxStatus(r.data))
      .catch(() => {
        // If backend not yet up, fall back to localStorage flag
        setCtxStatus({ loaded: getContextLoaded(), events_count: '?', participants_count: '?' })
      })
  }, [eventName])

  // ── Auto-resize textarea ─────────────────────────────────────────────────
  const handleInputChange = (e) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = async (text) => {
    const msg = text.trim()
    if (!msg || thinking) return

    const userMsg = { id: Date.now(), role: 'user', text: msg }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = '48px'
    }
    setThinking(true)

    // Build history for API (last 10 turns)
    const history = messages.slice(-10).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }))

    try {
      const res = await api.post('/api/swarm/chat', {
        message: msg,
        event_name: eventName || 'default',
        history,
      })
      const data = res.data
      const botMsg = {
        id: Date.now() + 1,
        role: 'bot',
        text: data.display_message || data.understood || 'Done.',
        data,
      }
      setMessages(prev => [...prev, botMsg])
    } catch (err) {
      const errMsg = err?.response?.data?.detail || err.message || 'Unknown error'
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'bot',
        text: `❌ Error: ${errMsg}`,
        data: null,
      }])
    } finally {
      setThinking(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  // ── Approve email send ───────────────────────────────────────────────────
  const handleApprove = async (msgId, emailDrafts) => {
    toast.loading('Sending emails…', { id: 'send' })
    try {
      const res = await api.post('/api/swarm/approve', { email_drafts: emailDrafts })
      toast.success(`✅ Sent ${res.data.sent} emails`, { id: 'send' })
      // update the message to reflect sent state
      setMessages(prev => prev.map(m =>
        m.id === msgId
          ? { ...m, approved: true, approveResult: res.data }
          : m
      ))
    } catch (err) {
      toast.error('Send failed — check GMAIL env vars', { id: 'send' })
    }
  }

  const toggleExpand = (id) => {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Page header */}
      <div className="page-header-card">
        <div>
          <h2 className="page-header">💬 Swarm Orchestrator</h2>
          <p className="page-subtitle" style={{ margin: 0 }}>
            Natural language → all 3 agents fire automatically
          </p>
        </div>
      </div>

      <div className="chat-outer">
        {/* ── Context bar ── */}
        <ContextBar eventName={eventName} status={ctxStatus} />

        {/* ── Messages ── */}
        <div className="chat-window">
          {messages.length === 0 && !thinking ? (
            <EmptyState onSelect={t => sendMessage(t)} />
          ) : (
            messages.map(msg =>
              msg.role === 'user'
                ? <UserBubble key={msg.id} text={msg.text} />
                : <BotBubble
                    key={msg.id}
                    msg={msg}
                    expanded={expandedIds[msg.id]}
                    onToggleExpand={() => toggleExpand(msg.id)}
                    onApprove={(drafts) => handleApprove(msg.id, drafts)}
                  />
            )
          )}

          {/* Typing indicator */}
          {thinking && (
            <div className="chat-bubble-wrap">
              <div className="chat-avatar">🤖</div>
              <div className="chat-bubble bot" style={{ padding: '14px 18px' }}>
                <div className="typing-dots">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* ── Input bar ── */}
        <div className="chat-input-bar">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={
              ctxStatus?.loaded
                ? 'Type a command… (Enter to send, Shift+Enter for newline)'
                : 'Go to Event Setup and load your schedule first…'
            }
            disabled={thinking}
            rows={1}
          />
          <button
            className="chat-send-btn"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || thinking}
            title="Send"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ContextBar({ eventName, status }) {
  const loaded = status?.loaded
  return (
    <div className="chat-context-bar">
      <span style={{ fontWeight: 700, color: 'var(--text-primary)', marginRight: 4 }}>
        {eventName || 'No event configured'}
      </span>
      {loaded ? (
        <>
          <span className="ctx-pill ready">✓ {status.events_count} events</span>
          <span className="ctx-pill ready">✓ {status.participants_count} participants</span>
          <span className="ctx-pill ready" style={{ marginLeft: 'auto' }}>Context Ready</span>
        </>
      ) : (
        <span className="ctx-pill warn" style={{ marginLeft: 'auto' }}>
          ⚠ Go to Event Setup → click "Load Sample & Save" first
        </span>
      )}
    </div>
  )
}

function EmptyState({ onSelect }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>🤖</div>
      <h3 style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-primary)' }}>
        Swarm Orchestrator
      </h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 420 }}>
        I have full context of your event — schedule, participants, sponsors.
        Type a command and I'll decide which agents to fire.
      </p>
      <div className="starter-suggestions">
        {STARTERS.map(s => (
          <button key={s} className="starter-chip" onClick={() => onSelect(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

function UserBubble({ text }) {
  return (
    <div className="chat-bubble-wrap user">
      <div className="chat-avatar">👤</div>
      <div className="chat-bubble user">{text}</div>
    </div>
  )
}

function BotBubble({ msg, expanded, onToggleExpand, onApprove }) {
  const { data, text, approved, approveResult } = msg
  const agentsFired = data?.agents_fired || []
  const results = data?.results || {}
  const emailDrafts = data?.email_drafts || []
  const needsApproval = data?.needs_approval && !approved
  const understood = data?.understood

  // Build expandable details
  const hasDetails = agentsFired.length > 0 && Object.keys(results).length > 0

  const detailText = buildDetailText(results, data)

  return (
    <div className="chat-bubble-wrap">
      <div className="chat-avatar">🤖</div>
      <div className="chat-bubble bot">

        {/* Understood line */}
        {understood && (
          <div className="chat-understood">🎯 {understood}</div>
        )}

        {/* Display message */}
        <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: '1.6' }}>
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>

        {/* Agent activity cards */}
        {agentsFired.map(agentKey => {
          const meta = AGENT_META[agentKey] || { icon: '🔧', label: agentKey }
          const r = results[agentKey === 'scheduler_agent' ? 'scheduler'
                          : agentKey === 'content_agent'   ? 'content'
                          : 'email'] || {}
          const hasError = !!r.error
          return (
            <div className="agent-activity-card" key={agentKey}>
              <span className="agent-icon">{meta.icon}</span>
              <div className="agent-info">
                <div className="agent-name">{meta.label}</div>
                <div className="agent-summary">
                  {hasError ? `⚠ ${r.error}` : (r.summary || 'Completed.')}
                </div>
              </div>
              <span className={hasError ? 'agent-status-err' : 'agent-status-ok'}>
                {hasError ? '✗' : '✓'}
              </span>
            </div>
          )
        })}

        {/* Email approval bar */}
        {needsApproval && emailDrafts.length > 0 && (
          <div className="chat-approve-bar">
            <p>
              {data.approval_message || `Ready to send ${emailDrafts.length} emails.`}
              {' '}<strong>Preview:</strong>{' '}
              {emailDrafts.slice(0, 2).map(d => d.name).join(', ')}
              {emailDrafts.length > 2 ? ` + ${emailDrafts.length - 2} more` : ''}
            </p>
            <button className="btn btn-approve" onClick={() => onApprove(emailDrafts)}>
              ✓ Send
            </button>
            <button className="btn btn-cancel" style={{ fontSize: 12, padding: '6px 10px' }}
              onClick={() => toast('Cancelled — emails not sent.')}>
              ✗
            </button>
          </div>
        )}

        {/* Approved confirmation */}
        {approved && (
          <div style={{
            padding: '8px 12px', background: 'rgba(0,230,118,0.08)',
            border: '1px solid rgba(0,230,118,0.2)', borderRadius: 8,
            fontSize: 12, color: 'var(--green)'
          }}>
            ✅ Emails sent — {approveResult?.sent ?? 0} delivered
            {approveResult?.failed?.length > 0 && `, ${approveResult.failed.length} failed`}
          </div>
        )}

        {/* Expandable full output */}
        {hasDetails && (
          <>
            <button className="chat-expand-btn" onClick={onToggleExpand}>
              {expanded ? '▲ Hide details' : '▼ See full outputs'}
            </button>
            {expanded && (
              <div className="chat-expanded-content">{detailText}</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function buildDetailText(results, data) {
  const lines = []
  if (results.content?.posts) {
    const p = results.content.posts
    if (p.twitter)   lines.push('── Twitter ──\n' + p.twitter)
    if (p.linkedin)  lines.push('── LinkedIn ──\n' + p.linkedin)
    if (p.instagram) lines.push('── Instagram ──\n' + p.instagram)
    if (p.announcement) lines.push('── Announcement ──\n' + p.announcement)
  }
  if (results.scheduler?.changes?.length) {
    lines.push('── Schedule Changes ──\n' + results.scheduler.changes.join('\n'))
  }
  if (results.email?.preview?.length) {
    lines.push('── Email Previews ──')
    results.email.preview.forEach(e => {
      lines.push(`To: ${e.name} <${e.email}>\nSubject: ${e.subject}\n${e.body}\n`)
    })
  }
  return lines.join('\n\n') || 'No extra details.'
}
