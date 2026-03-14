import React, { useState, useRef, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { api } from '../shared'
import ReactMarkdown from 'react-markdown'
import { useEventConfig } from '../EventContext'

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
  const textareaRef = useRef(null)
  const chatEndRef = useRef(null)
  const { activeEvent, isLoading, setGeneratedImages, eventName, swarmEvents, setSwarmEvents } = useEventConfig()

  const [messages, setMessages]       = useState([])
  const [input, setInput]             = useState('')
  const [thinking, setThinking]       = useState(false)
  const [ctxStatus, setCtxStatus]     = useState(null)
  const [expandedIds, setExpandedIds] = useState({})
  const [isListening, setIsListening] = useState(false)

  // Remove duplicate textareaRef and chatEndRef declarations from here
  // const chatEndRef = useRef(null)
  // const textareaRef = useRef(null)

  // ── Scroll to bottom whenever messages change ────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  // ── Load persisted chat history from MongoDB on mount ────────────────────
  useEffect(() => {
    api.get('/api/outputs/chat-history')
      .then(r => {
        const history = r.data.history || []
        if (history.length > 0) {
          const loaded = history.map((h, i) => ({
            id: i,
            role: h.role,
            text: h.content,
          }))
          setMessages(loaded)
        }
      })
      .catch(() => {})  // silently ignore if backend not yet up
  }, [])

  // ── Fetch context status on mount ────────────────────────────────────────
  useEffect(() => {
    api.get('/api/setup/context/status', { params: { event_name: eventName } })
      .then(r => setCtxStatus(r.data))
      .catch(() => {
        setCtxStatus({ loaded: getContextLoaded(), events_count: '?', participants_count: '?' })
      })
  }, [eventName])

  // ── Auto-resize textarea ─────────────────────────────────────────────────
  const handleInputChange = (e) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast.error('Voice not supported in this browser'); return; }
    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    setIsListening(true);
    recognition.start();
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInput(prev => prev + transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
  };


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

    const payload = {
      message: msg,
      event_name: eventName || 'default',
      history
    }
    
    try {
      const res = await api.post('/api/swarm/chat', payload)
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
        <ContextBar 
          eventName={eventName} 
          status={ctxStatus} 
          onClear={() => {
            setMessages([])
            setSwarmEvents([])
          }}
          hasMessages={messages.length > 0}
        />

        {/* ── Messages ── */}
        <div className="chat-window">
          {messages.length === 0 && !thinking ? (
            <EmptyState onSelect={t => sendMessage(t)} />
          ) : (
            messages.map(msg =>
              msg.role === 'user'
                ? <UserBubble key={msg.id} text={msg.text} msg={msg} />
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

        {/* ── Suggestion chips (visible only when chat is empty) ── */}
        {messages.length === 0 && (
          <div style={{display:'flex', flexWrap:'wrap', gap:'8px', padding:'0 24px 12px'}}>
            {[
              "Delay opening keynote by 20 mins and notify participants",
              "Generate a sponsor announcement post and email everyone",
              "What is the current event schedule?",
              "Give me a full event status report"
            ].map(chip => (
              <button key={chip} className="btn"
                style={{borderRadius:'20px', fontSize:'12px', padding:'5px 14px', background:'var(--bg-card)', border:'1px solid var(--border)'}}
                onClick={() => sendMessage(chip)}>
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* ── Input bar ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 24px 24px' }}>
          <div className="chat-input-bar" style={{ margin: 0, padding: 0 }}>
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
              className="btn"
              onClick={startVoice}
              title="Voice input"
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                background: isListening ? 'var(--green)' : 'transparent',
                border: '1px solid var(--border)',
                transition: 'background 0.2s'
              }}>
              {isListening ? '🔴' : '🎤'}
            </button>
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

        {/* ── Live Agent Feed ── */}
        <div style={{ padding: '0 24px 24px' }}>
          <div className="swarm-event-log">
            <h4 style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--green)' }}>stream</span>
              Live Agent Feed
            </h4>
            {swarmEvents.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No recent activity.</div>
            ) : (
              swarmEvents.map((e, i) => (
                <div key={i} className={`swarm-event-item swarm-event--${e.status}`}>
                  <span className="swarm-event-agent">{e.agent}</span>
                  <span className="swarm-event-msg">{e.message}</span>
                  <span className="swarm-event-time">{new Date(e.timestamp).toLocaleTimeString('en-US', { hour12: false })}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ContextBar({ eventName, status, onClear, hasMessages }) {
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
      {hasMessages && (
        <button 
          onClick={onClear}
          className="btn"
          style={{ 
            background: 'transparent', 
            border: '1px solid var(--border)', 
            padding: '4px 10px', 
            fontSize: '11px', 
            borderRadius: '6px',
            marginLeft: '12px',
            color: 'var(--text-muted)'
          }}
          title="Clear Chat"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>delete</span>
          Clear
        </button>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{
      textAlign: 'center',
      padding: '60px 20px 20px',
      color: 'var(--text-secondary)'
    }}>
      <p style={{
        fontSize: '22px',
        fontWeight: '500',
        color: 'var(--text-primary)',
        marginBottom: '8px'
      }}>
        Hello 👋
      </p>
      <p style={{fontSize: '14px'}}>
        I have full context of your event. What can I do for you?
      </p>
    </div>
  )
}

function UserBubble({ text, msg }) {
  return (
    <div className="chat-bubble-wrap user">
      <div className="chat-avatar">👤</div>
      <div className="chat-bubble user">
        {text}
      </div>
    </div>
  )
}

function SocialMockCard({ posts, runId }) {
  const [metrics, setMetrics] = useState(() => ({
    twitter:   { impressions: Math.floor(Math.random()*500)+200, likes: Math.floor(Math.random()*50)+10, retweets: Math.floor(Math.random()*20)+2 },
    linkedin:  { impressions: Math.floor(Math.random()*300)+100, clicks: Math.floor(Math.random()*30)+5,  reactions: Math.floor(Math.random()*40)+8 },
    instagram: { reach: Math.floor(Math.random()*400)+150,       likes: Math.floor(Math.random()*60)+15,  comments: Math.floor(Math.random()*10)+1 }
  }))

  useEffect(() => {
    // Auto-approve in backend so it persists as 'Published' right away
    if (runId) {
      api.post('/api/swarm/approve-post', { run_id: runId }).catch(() => {})
    }
  }, [runId])

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => ({
        ...prev,
        twitter: { ...prev.twitter, impressions: prev.twitter.impressions + Math.floor(Math.random()*5) },
        linkedin: { ...prev.linkedin, impressions: prev.linkedin.impressions + Math.floor(Math.random()*5) },
        instagram: { ...prev.instagram, reach: prev.instagram.reach + Math.floor(Math.random()*5) }
      }))
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div style={{ marginTop: 12, padding: 16, background: 'rgba(0, 230, 118, 0.04)', border: '1px solid rgba(0, 230, 118, 0.2)', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--green)', fontWeight: 600, marginBottom: 12, fontSize: 13 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
        Posted to Twitter • Instagram • LinkedIn
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {Object.entries(posts).map(([platform, text]) => {
           if (platform === 'announcement' || !text) return null;
           return (
             <div key={platform} style={{ background: 'var(--bg-card)', padding: 12, borderRadius: 6, fontSize: 12, border: '1px solid var(--border)' }}>
               <div style={{ textTransform: 'capitalize', color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                 {platform}
                 <span style={{ color: 'var(--green)', fontSize: 10 }}>● LIVE</span>
               </div>
               <div style={{ maxHeight: 80, overflow: 'auto', marginBottom: 12, color: 'var(--text-primary)' }}>
                 <ReactMarkdown>{text}</ReactMarkdown>
               </div>
               {metrics[platform] && (
                 <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                   {Object.entries(metrics[platform]).map(([k, v]) => (
                     <div key={k}>
                       <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{k}</div>
                       <div style={{ fontWeight: 600, color: 'var(--text-normal)' }}>{v.toLocaleString()}</div>
                     </div>
                   ))}
                 </div>
               )}
             </div>
           )
        })}
      </div>
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

        {/* Social Mock Preview */}
        {results?.content?.posts && (
           <SocialMockCard posts={results.content.posts} runId={data?.run_id} />
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
