import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEventConfig } from '../EventContext'

const AnimatedNumber = ({ value }) => {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    let start = 0
    const step = Math.ceil(value / 20)
    const timer = setInterval(() => {
      start += step
      if (start >= value) { setDisplay(value); clearInterval(timer) }
      else setDisplay(start)
    }, 40)
    return () => clearInterval(timer)
  }, [value])
  return <span>{display}</span>
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { eventName, eventDate, venue } = useEventConfig()
  
  const isSetupComplete = Boolean(eventName && eventDate && venue)

  return (
    <div>
      {eventName && eventDate && venue && (
        <div className="banner-conflict success" style={{ background: 'rgba(0, 230, 118, 0.1)', borderColor: 'rgba(0, 230, 118, 0.3)', color: 'var(--green)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="material-symbols-outlined">check_circle</span>
            <span>✓ Event configured: {eventName} — {eventDate} — {venue}</span>
          </div>
          <button onClick={() => navigate('/setup')} style={{ background: 'none', border: 'none', color: 'var(--green)', textDecoration: 'underline', fontSize: '13px', cursor: 'pointer' }}>
            Edit Setup
          </button>
        </div>
      )}

      <div className="hero">
        <h1 style={{ background: 'linear-gradient(135deg, #fff, #88a)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Manage events with autonomous AI agents.
        </h1>
        <p className="page-subtitle" style={{ maxWidth: '600px', margin: '0 auto 32px' }}>
          Event Logistics Swarm orchestrates the entire lifecycle of your next event using
          specialized intelligence nodes.
        </p>

        <div className="metrics-row">
          <div className="metric-card">
            <div className="metric-value"><AnimatedNumber value={5} /></div>
            <div className="metric-label">Core Agents</div>
          </div>
          <div className="metric-card">
            <div className="metric-value"><AnimatedNumber value={1} /></div>
            <div className="metric-label">Orchestrator</div>
          </div>
          <div className="metric-card">
            <div className="metric-value"><AnimatedNumber value={25} /></div>
            <div className="metric-label">API Routes</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">∞</div>
            <div className="metric-label">Scalability</div>
          </div>
        </div>
      </div>

      <h3 className="section-title">Available Operations</h3>
      
      {!isSetupComplete ? (
        <div className="agent-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '48px' }}>
          <span style={{ fontSize: '64px', marginBottom: '16px' }}>🚀</span>
          <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>Start with Event Setup</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '500px', marginBottom: '24px', lineHeight: '1.5' }}>
            Complete the setup checklist to configure your event. All AI agents will be pre-filled automatically.
          </p>
          <button className="btn-primary" onClick={() => navigate('/setup')}>
            Go to Event Setup <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
          </button>
        </div>
      ) : (
        <div className="agent-grid">
          <div className="agent-card" onClick={() => navigate('/content')} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div className="brand-icon" style={{ background: 'linear-gradient(135deg, var(--blue), var(--cyan))' }}>
                <span className="material-symbols-outlined">note_stack</span>
              </div>
              <span className="badge badge-idle">TEXT GEN</span>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Content Strategist</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5', flexGrow: 1, marginBottom: '24px' }}>
              Generate and refine marketing copy, speaker intro posts, and long-form promotional content.
            </p>
            <div style={{ color: 'var(--blue)', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Open Interface <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>arrow_forward</span>
            </div>
          </div>

          <div className="agent-card" onClick={() => navigate('/email')} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div className="brand-icon" style={{ background: 'linear-gradient(135deg, var(--purple), var(--blue))' }}>
                <span className="material-symbols-outlined">mail</span>
              </div>
              <span className="badge badge-idle">OUTREACH</span>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Email Agent</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5', flexGrow: 1, marginBottom: '24px' }}>
              Draft, personalize, and QA outbound or transactional emails mapped perfectly to your participant CSV.
            </p>
            <div style={{ color: 'var(--blue)', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Open Interface <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>arrow_forward</span>
            </div>
          </div>

          <div className="agent-card" onClick={() => navigate('/scheduler')} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div className="brand-icon" style={{ background: 'linear-gradient(135deg, var(--green), var(--cyan))' }}>
                <span className="material-symbols-outlined">deployed_code</span>
              </div>
              <span className="badge badge-idle">LOGISTICS</span>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Scheduler Agent</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5', flexGrow: 1, marginBottom: '24px' }}>
              Coordinate complex multi-track calendars, propose slots, and automatically manage and resolve meeting conflicts.
            </p>
            <div style={{ color: 'var(--blue)', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Open Interface <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>arrow_forward</span>
            </div>
          </div>

          <div className="agent-card" onClick={() => navigate('/budget')} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div className="brand-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                <span className="material-symbols-outlined">payments</span>
              </div>
              <span className="badge badge-idle">FINANCE</span>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Budget Agent</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5', flexGrow: 1, marginBottom: '24px' }}>
              Track event expenses, categorize spending automatically, and receive alerts to prevent budget overruns.
            </p>
            <div style={{ color: '#f59e0b', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Open Interface <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>arrow_forward</span>
            </div>
          </div>

          <div className="agent-card" onClick={() => navigate('/logistics')} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div className="brand-icon" style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
                <span className="material-symbols-outlined">inventory_2</span>
              </div>
              <span className="badge badge-idle">OPERATIONS</span>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Logistics Agent</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5', flexGrow: 1, marginBottom: '24px' }}>
              Manage equipment requests, vendor deliveries, room readiness checks, and autonomously resolve operational issues.
            </p>
            <div style={{ color: '#f97316', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Open Interface <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>arrow_forward</span>
            </div>
          </div>

          <div className="agent-card" onClick={() => navigate('/swarm')} style={{ cursor: 'pointer', border: '1px solid rgba(123, 97, 255, 0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div className="brand-icon" style={{ background: 'linear-gradient(135deg, var(--purple), var(--cyan))', boxShadow: '0 0 16px rgba(123, 97, 255, 0.5)' }}>
                <span className="material-symbols-outlined">hub</span>
              </div>
              <span className="badge badge-running">LANGGRAPH</span>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Swarm Orchestrator</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5', flexGrow: 1, marginBottom: '24px' }}>
              Run the full event logistics swarm pipeline. Pass context once and watch agents collaborate to resolve tasks sequentially.
            </p>
            <div style={{ color: 'var(--purple)', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Open Interface <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>arrow_forward</span>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: '40px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '32px' }}>
        <h3 className="section-title">Architecture Setup</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6' }}>
          This frontend interfaces via FastAPI routing to LangChain and OpenAI GPT backend nodes. 
          Use the specialized tabs to configure exact payloads for targeted nodes, or use the Swarm orchestrator 
          for autonomous execution. The QA bot maintains a conversational memory grounded via graph state.
        </p>
      </div>
    </div>
  )
}
