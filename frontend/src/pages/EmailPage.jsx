import React, { useState } from 'react'
import { api } from '../shared'
import { toast } from 'react-hot-toast'

export default function EmailPage() {
  const [file, setFile] = useState(null)
  const [template, setTemplate] = useState("Hi {name},\n\nWe're excited to have you at Neurathon '26 as a {role}. Your team {team_name} has been registered.\n\nLooking forward to seeing you!\n\nBest regards,\nThe Organizing Team")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [approved, setApproved] = useState(false)

  const handleGenerate = async () => {
    if (!file) return toast.error("Please upload a CSV file")
    if (!template.trim()) return toast.error("Please enter an email template")
    
    setLoading(true)
    setResult(null)
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('template', template)
      
      const response = await api.post('/api/email', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      
      setResult(response.data)
      toast.success("Emails generated successfully!")
    } catch (err) {
      console.error(err)
      toast.error("Email generation failed. Check your backend terminal.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-body">
      <div className="page-header-card">
        <h1>Email Agent</h1>
        <p>CSV-powered personalized email generation with human approval</p>
      </div>
      
      <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>
        
        {/* LEFT */}
        <div className="agent-card" style={{ flex: 1 }}>
          <h3>Configuration</h3>
          
          <div className="form-group">
            <label className="form-label">Participant CSV</label>
            <div className="file-drop-zone">
              <input 
                type="file" 
                accept=".csv,.xlsx" 
                onChange={(e) => setFile(e.target.files?.[0] || null)} 
              />
              <p>{file ? file.name : "Drop your CSV here or click to browse"}</p>
            </div>
          </div>
          
          <div className="form-group">
            <label className="form-label">Email Template</label>
            <p style={{ fontSize:"0.8rem", color:"var(--text-muted)" }}>Use {'{name}'}, {'{role}'}, {'{team_name}'} as placeholders</p>
            <textarea 
              className="form-textarea" 
              rows={8} 
              value={template} 
              onChange={(e) => setTemplate(e.target.value)} 
            />
          </div>
          
          <button 
            className="btn btn-primary" 
            onClick={handleGenerate} 
            disabled={loading}
          >
            {loading ? "Generating..." : "Generate Emails"}
          </button>
        </div>

        {/* RIGHT */}
        <div className="agent-card" style={{ flex: 1.5 }}>
          <h3>Preview</h3>
          
          {loading ? (
            <div className="spinner"></div>
          ) : !result ? (
            <div className="empty-state">Upload a CSV and click Generate to preview personalized emails</div>
          ) : (
            <>
              <div style={{ display:"flex", gap:"1rem", marginBottom:"1rem" }}>
                <div className="metric-card">
                  <div className="metric-value">{result.total_recipients}</div>
                  <div className="metric-label">Total Recipients</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">{result.segments?.participants || 0}</div>
                  <div className="metric-label">Participants</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">{result.segments?.mentors || 0}</div>
                  <div className="metric-label">Mentors</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">{result.segments?.judges || 0}</div>
                  <div className="metric-label">Judges</div>
                </div>
              </div>
              
              <p className="output-label">Email Previews</p>
              <div className="output-terminal" style={{ maxHeight:"320px", overflowY:"auto" }}>
                {result.preview?.map((person, idx) => (
                  <div key={idx} style={{ borderBottom:"1px solid var(--border)", paddingBottom:"0.75rem", marginBottom:"0.75rem" }}>
                    <p style={{ fontWeight: 'bold' }}>{person.name} · {person.role}</p>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{person.email}</p>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{person.body.slice(0, 120)}...</p>
                  </div>
                ))}
              </div>
              
              {!approved ? (
                <button 
                  className="btn btn-approve" 
                  onClick={() => setShowModal(true)}
                  style={{ marginTop: '16px' }}
                >
                  ✅ Approve & Send ({result.total_recipients} emails)
                </button>
              ) : (
                <div className="banner-conflict success" style={{ marginTop: '16px' }}>
                  ✅ Emails approved! In a real deployment these would now be dispatched to all recipients.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* MODAL */}
      {showModal && result && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h2>Confirm Email Dispatch</h2>
            <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>You are about to send to {result.total_recipients} recipients. Preview of first 3 emails:</p>
            
            <div style={{ marginBottom: '24px' }}>
              {result.preview?.slice(0, 3).map((person, idx) => (
                <div key={idx} style={{ background:"var(--bg-input)", borderRadius:"8px", padding:"0.75rem", marginBottom:"0.5rem" }}>
                  <p style={{ fontWeight: 'bold' }}>{person.name} — {person.role}</p>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{person.email}</p>
                  <p style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>{person.body.slice(0, 80)}...</p>
                </div>
              ))}
            </div>
            
            <div className="modal-actions">
              <button className="btn btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
              <button 
                className="btn btn-approve" 
                onClick={() => { 
                  setApproved(true); 
                  setShowModal(false); 
                  toast.success("Emails approved for dispatch!"); 
                }}
              >
                Approve & Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
