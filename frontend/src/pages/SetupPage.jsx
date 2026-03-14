import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useEventConfig } from '../EventContext'
import { api } from '../shared'

export default function SetupPage() {
  const navigate = useNavigate()
  const { activeEvent, eventId, refresh } = useEventConfig()

  // Form State
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [venue, setVenue] = useState('')
  const [expectedParticipants, setExpectedParticipants] = useState('')
  const [description, setDescription] = useState('')
  const [targetAudience, setTargetAudience] = useState('')

  const [socialPlatform, setSocialPlatform] = useState('All Three')
  const [eventHashtag, setEventHashtag] = useState('')
  const [keySpeakers, setKeySpeakers] = useState('')

  const [emailTemplate, setEmailTemplate] = useState('')
  const [senderName, setSenderName] = useState('')

  const [saving, setSaving] = useState(false)

  // Load from context on mount or when activeEvent changes
  useEffect(() => {
    if (activeEvent) {
      setEventName(activeEvent.event_name || '')
      setEventDate(activeEvent.dates?.start || '')
      setVenue(activeEvent.venue || '')
      setExpectedParticipants(activeEvent.expected_footfall || '')
      setDescription(activeEvent.description || '')
      setTargetAudience(activeEvent.target_audience || '')
      
      const branding = activeEvent.branding || {}
      setEventHashtag(branding.hashtags ? branding.hashtags.join(' ') : '')
      setKeySpeakers(activeEvent.key_speakers || '')
      setEmailTemplate(activeEvent.email_template || '')
      
      const org = activeEvent.organiser || {}
      setSenderName(org.name || '')
    }
  }, [activeEvent])

  const handleSave = async () => {
    if (!eventName) {
      toast.error('Event Name is required.')
      return
    }
    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('event_name', eventName)
      if (eventDate) formData.append('event_date', eventDate)
      if (venue) formData.append('venue', venue)
      if (expectedParticipants) formData.append('expected_footfall', expectedParticipants)
      if (targetAudience) formData.append('target_audience', targetAudience)
      if (description) formData.append('description', description)
      if (keySpeakers) formData.append('key_speakers', keySpeakers)
      if (emailTemplate) formData.append('email_template', emailTemplate)
      if (senderName) formData.append('organiser_name', senderName)
      if (eventHashtag) formData.append('hashtag_list', eventHashtag)

      const res = await api.post('/api/setup/context', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      
      if (res.status === 200) {
        toast.success(`Event metadata saved ✓`)
        refresh() // Pull updated data
      } else {
        toast.error('Failed to save metadata')
      }
    } catch (err) {
      toast.error('Save failed — is the backend running?')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!eventId) return
    if (window.confirm('Are you sure you want to delete this event? This will erase all data and lock the agents.')) {
      try {
        await api.delete(`/api/events/${eventId}`)
        toast.success('Event deleted')
        refresh()
        navigate('/events')
      } catch (err) {
        toast.error('Failed to delete event')
      }
    }
  }

  if (!activeEvent) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>No Active Event</h2>
        <p style={{ marginBottom: '24px' }}>Please go to the Events page to select or create an event first.</p>
        <button className="btn btn-primary" onClick={() => navigate('/events')}>Go to Events</button>
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div className="page-header-card">
        <div>
          <h2 className="page-header">Event Settings</h2>
          <p className="page-subtitle" style={{ margin: 0 }}>Edit core metadata, branding, and templates for {eventName}.</p>
        </div>
      </div>

      <div className="setup-grid" style={{ gridTemplateColumns: '1fr', maxWidth: '800px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          <div className="agent-card">
            <h3 className="section-title">Section A — Basic Info</h3>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Event Name *</label>
                <input className="form-input" value={eventName} onChange={e => setEventName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Event Date</label>
                <input type="text" className="form-input" placeholder="e.g. Oct 12 - Oct 14" value={eventDate} onChange={e => setEventDate(e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Event Venue</label>
                <input className="form-input" value={venue} onChange={e => setVenue(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Expected Participants</label>
                <input type="number" className="form-input" value={expectedParticipants} onChange={e => setExpectedParticipants(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Target Audience</label>
              <input className="form-input" placeholder="e.g. CS students, ML researchers" value={targetAudience} onChange={e => setTargetAudience(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Event Description</label>
              <textarea className="form-textarea" rows="4" placeholder="Theme, highlights, prizes, schedule overview..." value={description} onChange={e => setDescription(e.target.value)} />
            </div>
          </div>

          <div className="agent-card">
            <h3 className="section-title">Section B — Content & Marketing</h3>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Primary Social Platform</label>
                <select className="form-input" style={{ appearance: 'none' }} value={socialPlatform} onChange={e => setSocialPlatform(e.target.value)}>
                  <option>All Three</option>
                  <option>Twitter/X</option>
                  <option>LinkedIn</option>
                  <option>Instagram</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Event Hashtags (space separated)</label>
                <input className="form-input" placeholder="#Neurathon26 #AIHack" value={eventHashtag} onChange={e => setEventHashtag(e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Key Speakers (One per line)</label>
              <textarea className="form-textarea" rows="3" placeholder="Dr. Smith\nProf. Doe" value={keySpeakers} onChange={e => setKeySpeakers(e.target.value)} />
            </div>
          </div>

          <div className="agent-card">
            <h3 className="section-title">Section C — Communications</h3>
            <div className="form-group">
              <label className="form-label">Sender Name</label>
              <input className="form-input" placeholder="e.g. Neurathon Team" value={senderName} onChange={e => setSenderName(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Base Email Template</label>
              <textarea className="form-textarea" rows="4" placeholder="Hi {name}, you are registered as {role}..." value={emailTemplate} onChange={e => setEmailTemplate(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
            <button className="btn-swarm" onClick={handleSave} disabled={saving} style={{ padding: '12px 32px' }}>
              <span className="material-symbols-outlined">save</span>
              {saving ? '⏳ Saving...' : '💾 Save Settings'}
            </button>
            
            <button 
              onClick={handleReset} 
              style={{ background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.2)', color: 'var(--red)', padding: '12px 24px', borderRadius: '12px', fontSize: '13px', cursor: 'pointer', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete_forever</span>
              Delete Event
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
