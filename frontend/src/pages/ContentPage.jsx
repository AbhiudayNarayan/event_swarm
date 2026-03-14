import React, { useState, useEffect } from 'react'
import { api, StatusBadge } from '../shared'
import { toast } from 'react-hot-toast'
import ReactMarkdown from 'react-markdown'

function HistoryTab() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/outputs/posts')
      .then(r => setPosts(r.data.posts || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="output-terminal" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading history…</div>
  if (!posts.length) return <div className="output-terminal" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No generated posts yet. Use the Swarm Chat to generate content.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {posts.map((p, i) => (
        <div key={i} className={`history-card ${p.approved ? 'approved' : 'pending'}`}>
          <div className="history-meta">
            {new Date(p.timestamp).toLocaleString()} — <em>{p.triggered_by?.slice(0, 60)}</em>
            <span className="badge" style={{ marginLeft: 8, fontSize: 10, background: p.approved ? 'var(--green)' : 'var(--cyan)', color: '#000' }}>
              {p.approved ? '✓ Approved' : 'Pending'}
            </span>
          </div>
          <div className="history-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {Object.entries(p.posts || {}).map(([platform, text]) => (
              <div key={platform} className="output-terminal" style={{ maxHeight: 160, overflow: 'auto' }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: 10, marginBottom: 6, textTransform: 'uppercase' }}>{platform}</div>
                <ReactMarkdown>{text}</ReactMarkdown>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function ContentPage() {
  const [tab, setTab] = useState('generate')
  const [eventName, setEventName] = useState('')
  const [description, setDescription] = useState('')
  const [audience, setAudience] = useState('')
  const [status, setStatus] = useState('idle')
  const [results, setResults] = useState(null)
  const [hasPrefill, setHasPrefill] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('swarm_event_config')
      if (saved) {
        const config = JSON.parse(saved)
        setEventName(config.eventName || '')
        setDescription(config.description || '')
        setAudience(config.targetAudience || '')
        setHasPrefill(true)
      }
    } catch (e) {}
  }, [])

  const handleGenerate = async () => {
    if (!eventName || !description) return toast.error('Fill required fields')
    setStatus('running')
    setResults(null)
    try {
      const payload = { event_name: eventName, raw_text: description, target_audience: audience }
      const response = await api.post('/api/content', payload)
      setResults(response.data)
      setStatus('done')
      toast.success('Content Generated')
    } catch (err) {
      console.error(err)
      setStatus('error')
      toast.error('Failed to generate content')
    }
  }

  return (
    <div>
      <div className="page-header-card">
        <div>
          <h2 className="page-header">Content Strategist</h2>
          <p className="page-subtitle" style={{ margin: 0 }}>Create compelling copy tailored to your audience.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <span className="badge" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>AGENT 1 OF 3</span>
          <StatusBadge status={status} />
        </div>
      </div>

      <div className="tab-row">
        <button className={`tab-btn ${tab === 'generate' ? 'active' : ''}`} onClick={() => setTab('generate')}>Generate</button>
        <button className={`tab-btn ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</button>
      </div>

      {tab === 'generate' ? (
        <>
          {hasPrefill && <div className="prefill-banner">✓ Pre-filled from your Event Setup — edit if needed</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)', gap: '32px' }}>
            <div className="agent-card" style={{ height: 'fit-content' }}>
              <div className="form-group">
                <label className="form-label">Event Name</label>
                <input className="form-input" value={eventName} onChange={e => setEventName(e.target.value)} placeholder="e.g. Neurathon '26" />
              </div>
              <div className="form-group">
                <label className="form-label">Target Audience</label>
                <input className="form-input" value={audience} onChange={e => setAudience(e.target.value)} placeholder="e.g. AI Researchers, Developers" />
              </div>
              <div className="form-group">
                <label className="form-label">Event Description & Brief</label>
                <textarea className="form-textarea" value={description} onChange={e => setDescription(e.target.value)} placeholder="Provide key details, dates, and selling points..." />
              </div>
              <button className="btn-primary" style={{ width: '100%', marginTop: '8px' }} onClick={handleGenerate} disabled={status === 'running'}>
                <span className="material-symbols-outlined">play_arrow</span>
                {status === 'running' ? 'Generating...' : 'Generate Content'}
              </button>
            </div>
            <div>
              <h3 className="section-title">Generation Results</h3>
              {results ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {['twitter', 'linkedin', 'instagram', 'posting_schedule'].map(key => (
                    <div className="output-terminal" style={{ maxHeight: '200px', overflow: 'auto' }} key={key}>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '10px', marginBottom: '8px', textTransform: 'uppercase' }}>{key.replace('_', ' ')}</div>
                      <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: 'inherit' }}>
                        {typeof results[key] === 'object' ? JSON.stringify(results[key], null, 2) : (results[key] || '...')}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="output-terminal" style={{ height: '100%', minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  {status === 'running' ? 'Running agent...' : 'Awaiting input payload...'}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <HistoryTab />
      )}
    </div>
  )
}
