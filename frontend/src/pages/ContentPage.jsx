import React, { useState, useEffect } from 'react'
import { api, StatusBadge } from '../shared'
import { toast } from 'react-hot-toast'
import ReactMarkdown from 'react-markdown'
import { useEventConfig } from '../EventContext'

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

function ImageStudioTab() {
  const { eventName, generatedImages, setGeneratedImages } = useEventConfig()
  const [prompt, setPrompt] = useState('')
  const [imageType, setImageType] = useState('Event Poster')
  const [style, setStyle] = useState('Digital Art')
  const [aspectRatio, setAspectRatio] = useState('Square (1024×1024)')
  const [status, setStatus] = useState('idle')
  const [currentImage, setCurrentImage] = useState(null)

  const handleGenerateImage = async () => {
    if (!prompt) return toast.error('Please describe your image')
    setStatus('running')
    setCurrentImage(null)

    let w = 1024, h = 1024;
    if (aspectRatio === 'Landscape (1280×720)') { w = 1280; h = 720; }
    if (aspectRatio === 'Portrait (720×1280)') { w = 720; h = 1280; }
    if (aspectRatio === 'Banner (1200×400)') { w = 1200; h = 400; }

    try {
      const fullPrompt = `${imageType} - ${prompt}`
      const response = await api.post('/api/content/generate-image', {
        prompt: fullPrompt,
        style,
        event_name: eventName || '',
        width: w,
        height: h
      })
      const data = response.data
      setCurrentImage(data)

      setGeneratedImages(prev => {
        const next = [data, ...prev]
        return next.slice(0, 5)
      })

      setStatus('done')
      toast.success('Image Generated!')
    } catch (err) {
      console.error(err)
      setStatus('error')
      toast.error('Failed to generate image')
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)', gap: '32px' }}>
      <div className="agent-card" style={{ height: 'fit-content' }}>
        <div className="form-group">
          <label className="form-label">Describe your image</label>
          <input className="form-input" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="e.g. opening keynote stage with crowd" />
        </div>
        <div className="form-group">
          <label className="form-label">Image type</label>
          <select className="form-input" value={imageType} onChange={e => setImageType(e.target.value)}>
            <option>Event Poster</option>
            <option>Social Media Banner</option>
            <option>Sponsor Spotlight</option>
            <option>Announcement Graphic</option>
            <option>Schedule Infographic</option>
            <option>Custom</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Style</label>
          <select className="form-input" value={style} onChange={e => setStyle(e.target.value)}>
            <option>Digital Art</option>
            <option>Photorealistic</option>
            <option>Minimalist</option>
            <option>Illustrated</option>
            <option>Cinematic</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Aspect ratio</label>
          <select className="form-input" value={aspectRatio} onChange={e => setAspectRatio(e.target.value)}>
            <option>Square (1024×1024)</option>
            <option>Landscape (1280×720)</option>
            <option>Portrait (720×1280)</option>
            <option>Banner (1200×400)</option>
          </select>
        </div>
        <button className="btn-primary" style={{ width: '100%', marginTop: '8px' }} onClick={handleGenerateImage} disabled={status === 'running'}>
          <span className="material-symbols-outlined">image</span>
          {status === 'running' ? 'Generating (3-10s)...' : 'Generate Image'}
        </button>
      </div>

      <div>
        <h3 className="section-title">Result</h3>
        {status === 'running' ? (
          <div className="output-terminal" style={{ height: '100%', minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <div className="spinner" style={{ width: 24, height: 24, border: '2px solid var(--border)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
          </div>
        ) : currentImage ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="history-card" style={{ padding: 16, textAlign: 'center' }}>
              <img 
                src={currentImage.image_url} 
                alt="Generated" 
                onError={(e) => e.target.style.display='none'}
                onLoad={(e) => e.target.style.display='block'}
                style={{display:'none', width:'100%', borderRadius:'8px'}}
              />
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'left', flex: 1, marginRight: 16 }}>{currentImage.prompt_used}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={handleGenerateImage}>Regenerate</button>
                  <a href={currentImage.image_url} download target="_blank" rel="noreferrer" className="btn-primary" style={{ padding: '4px 12px', fontSize: 12, textDecoration: 'none' }}>Download</a>
                </div>
              </div>
            </div>

            {generatedImages.length > 0 && (
              <div>
                <h4 style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase' }}>Recent Images</h4>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
                  {generatedImages.map((img, i) => (
                    <img key={i} src={img.image_url} alt="Thumbnail" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4, cursor: 'pointer', border: currentImage?.image_url === img.image_url ? '2px solid var(--brand)' : '2px solid transparent' }} onClick={() => setCurrentImage(img)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="output-terminal" style={{ height: '100%', minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Fill out the form and click Generate
          </div>
        )}
      </div>
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
        <button className={`tab-btn ${tab === 'image-studio' ? 'active' : ''}`} onClick={() => setTab('image-studio')}>Image Studio</button>
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
      ) : tab === 'history' ? (
        <HistoryTab />
      ) : (
        <ImageStudioTab />
      )}
    </div>
  )
}
