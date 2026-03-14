import React, { useState, useEffect } from 'react'
import { useEventConfig } from '../EventContext'
import toast from 'react-hot-toast'

export default function EventsPage() {
  const { eventId: activeId, refresh: refreshContext } = useEventConfig()
  
  const [events, setEvents] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Create form state
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    event_name: '',
    event_date: '',
    venue: '',
    target_audience: '',
    description: '',
    participants_method: 'upload', // 'upload' | 'text'
    participants_file: null,
    participants_text: '',
    schedule_method: 'upload', // 'upload' | 'text'
    schedule_file: null,
    schedule_text: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchEvents = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/events')
      if (res.ok) {
        const data = await res.json()
        setEvents(data.events || [])
      }
    } catch (e) {
      toast.error('Failed to fetch events')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchEvents()
  }, [activeId])

  const handleActivate = async (id) => {
    try {
      const res = await fetch(`/api/events/${id}/activate`, { method: 'POST' })
      if (res.ok) {
        toast.success('Event activated')
        refreshContext()
        fetchEvents()
      } else {
        toast.error('Failed to activate')
      }
    } catch (e) {
      toast.error('Error activating event')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this event? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/events/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Event deleted')
        if (id === activeId) {
          refreshContext() // Will clear active event if it was deleted
        }
        fetchEvents()
      } else {
        toast.error('Failed to delete')
      }
    } catch (e) {
      toast.error('Error deleting event')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (step < 3) {
      if (step === 1 && !formData.event_name.trim()) return toast.error('Event Name is required')
      setStep(s => s + 1)
      return
    }
    setIsSubmitting(true)
    try {
      const body = new FormData()
      body.append('event_name', formData.event_name)
      if (formData.event_date) body.append('event_date', formData.event_date)
      if (formData.venue) body.append('venue', formData.venue)
      if (formData.target_audience) body.append('target_audience', formData.target_audience)
      if (formData.description) body.append('description', formData.description)
      
      if (formData.participants_method === 'upload' && formData.participants_file) {
        body.append('participants_file', formData.participants_file)
      } else if (formData.participants_method === 'text') {
        body.append('participants_natural', formData.participants_text)
      }

      if (formData.schedule_method === 'upload' && formData.schedule_file) {
        body.append('schedule_file', formData.schedule_file)
      } else if (formData.schedule_method === 'text') {
        body.append('schedule_natural', formData.schedule_text)
      }

      const res = await fetch('/api/setup/context', {
        method: 'POST',
        body
      })
      if (res.ok) {
        toast.success('Event created successfully!')
        setShowCreateModal(false)
        refreshContext()
        fetchEvents()
        setFormData({
          event_name: '', event_date: '', venue: '', target_audience: '', description: '',
          participants_method: 'upload', participants_file: null, participants_text: '',
          schedule_method: 'upload', schedule_file: null, schedule_text: ''
        })
        setStep(1)
      } else {
        toast.error('Failed to create event')
      }
    } catch (err) {
      toast.error('Error creating event')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="events-page" style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>Events Manager</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Create, manage, and switch between active events.</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          style={{
            background: 'linear-gradient(135deg, var(--blue), var(--purple))',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '12px',
            fontSize: '15px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 15px rgba(74,144,255,0.3)'
          }}
        >
          <span className="material-symbols-outlined">add_circle</span>
          Create New Event
        </button>
      </div>

      {isLoading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading events...</div>
      ) : events.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', padding: '60px', borderRadius: '16px', textAlign: 'center', border: '1px solid var(--border)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--blue)', marginBottom: '16px' }}>event_busy</span>
          <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>No Events Found</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Get started by creating your first event.</p>
          <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">Create Event</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {events.map(ev => {
            const isActive = ev.event_id === activeId || ev.is_active
            return (
              <div key={ev.event_id} style={{
                background: isActive ? 'linear-gradient(145deg, var(--bg-card), rgba(74,144,255,0.05))' : 'var(--bg-card)',
                border: isActive ? '1px solid var(--blue)' : '1px solid var(--border)',
                borderRadius: '16px',
                padding: '24px',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                boxShadow: isActive ? '0 8px 32px rgba(74,144,255,0.1)' : 'none'
              }}>
                {isActive && (
                  <div style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(0,230,118,0.1)', color: 'var(--green)', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span className="status-dot" style={{ background: 'var(--green)' }}></span> Active
                  </div>
                )}
                
                <div>
                  <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '4px', paddingRight: isActive ? '70px' : '0' }}>{ev.event_name}</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{ev.tagline || (ev.dates?.start ? `Starts ${ev.dates.start}` : 'No date set')} · {ev.venue || 'TBA'}</p>
                </div>
                
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ background: 'var(--bg-input)', padding: '8px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)', display: 'block' }}>{ev.events_count || 0}</strong> Activities
                  </div>
                  <div style={{ background: 'var(--bg-input)', padding: '8px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)', display: 'block' }}>{ev.participants_count || 0}</strong> People
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                  {!isActive && (
                    <button 
                      onClick={() => handleActivate(ev.event_id)}
                      style={{ flex: 1, padding: '8px', background: 'rgba(74,144,255,0.1)', color: 'var(--blue)', border: '1px solid rgba(74,144,255,0.2)', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}
                    >
                      Set Active
                    </button>
                  )}
                  <button 
                    onClick={() => handleDelete(ev.event_id)}
                    style={{ flex: isActive ? 1 : 0, padding: '8px 16px', background: 'rgba(255,82,82,0.1)', color: 'var(--red)', border: '1px solid rgba(255,82,82,0.2)', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showCreateModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(6,6,16,0.8)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '24px',
            width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
            display: 'flex', flexDirection: 'column'
          }}>
            <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 10 }}>
              <h2 style={{ fontSize: '24px', fontWeight: '600' }}>Create New Event</h2>
              <button 
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div style={{ padding: '32px' }}>
              {/* STAGE HEADER */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '32px' }}>
                {[1, 2, 3].map(s => (
                  <div key={s} style={{ height: '4px', flex: 1, background: step >= s ? 'var(--blue)' : 'var(--border)', borderRadius: '2px', transition: 'all 0.3s' }}></div>
                ))}
              </div>

              {/* STEP 1: CORE */}
              {step === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <h3 style={{ fontSize: '18px', color: 'var(--text-primary)', marginBottom: '8px' }}>1. Basic Details</h3>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Event Name *</label>
                    <input type="text" value={formData.event_name} onChange={e => setFormData({...formData, event_name: e.target.value})} onKeyDown={e => { if(e.key === 'Enter') { e.preventDefault(); if (formData.event_name.trim()) setStep(s => s + 1); else toast.error('Event Name is required'); } }} style={{ width: '100%', padding: '12px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '12px', color: 'white', fontSize: '15px' }} placeholder="e.g. Neurathon '26" />
                  </div>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Dates</label>
                      <input type="text" value={formData.event_date} onChange={e => setFormData({...formData, event_date: e.target.value})} onKeyDown={e => { if(e.key === 'Enter') { e.preventDefault(); setStep(s => s + 1); } }} style={{ width: '100%', padding: '12px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '12px', color: 'white', fontSize: '15px' }} placeholder="e.g. Oct 12 - Oct 14" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Venue</label>
                      <input type="text" value={formData.venue} onChange={e => setFormData({...formData, venue: e.target.value})} onKeyDown={e => { if(e.key === 'Enter') { e.preventDefault(); setStep(s => s + 1); } }} style={{ width: '100%', padding: '12px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '12px', color: 'white', fontSize: '15px' }} placeholder="e.g. IIT-B Main Campus" />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Description</label>
                    <textarea rows="3" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} style={{ width: '100%', padding: '12px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '12px', color: 'white', fontSize: '15px', resize: 'vertical' }} placeholder="Brief overview of the event..." />
                  </div>
                </div>
              )}

              {/* STEP 2: PARTICIPANTS (DUAL INPUT) */}
              {step === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <h3 style={{ fontSize: '18px', color: 'var(--text-primary)', marginBottom: '8px' }}>2. Participants Data</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '-12px' }}>How do you want to provide participant information? You can upload a file or just describe it.</p>
                  
                  <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-card)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <button type="button" onClick={() => setFormData({...formData, participants_method: 'upload'})} style={{ flex: 1, padding: '10px', background: formData.participants_method === 'upload' ? 'var(--bg-surface)' : 'transparent', color: formData.participants_method === 'upload' ? 'var(--blue)' : 'var(--text-secondary)', border: 'none', borderRadius: '8px', fontWeight: '500', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>upload_file</span> File Upload
                    </button>
                    <button type="button" onClick={() => setFormData({...formData, participants_method: 'text'})} style={{ flex: 1, padding: '10px', background: formData.participants_method === 'text' ? 'var(--bg-surface)' : 'transparent', color: formData.participants_method === 'text' ? 'var(--blue)' : 'var(--text-secondary)', border: 'none', borderRadius: '8px', fontWeight: '500', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>chat</span> Plain English
                    </button>
                  </div>

                  {formData.participants_method === 'upload' ? (
                    <div style={{ border: '2px dashed var(--border)', borderRadius: '16px', padding: '40px 20px', textAlign: 'center', background: 'var(--bg-input)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '40px', color: 'var(--text-muted)', marginBottom: '16px' }}>csv</span>
                      <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>Upload your participant CSV or JSON file</p>
                      <input type="file" onChange={e => setFormData({...formData, participants_file: e.target.files[0]})} accept=".csv,.json" style={{ color: 'var(--text-primary)', background: 'var(--bg-card)', padding: '8px', borderRadius: '8px' }} />
                    </div>
                  ) : (
                    <div>
                      <textarea rows="6" placeholder="e.g. We have John Doe (john@example.com) acting as a Judge, and team Alpha consists of..." value={formData.participants_text} onChange={e => setFormData({...formData, participants_text: e.target.value})} style={{ width: '100%', padding: '16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '12px', color: 'white', fontSize: '15px', resize: 'vertical' }} />
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>GPT-4o will automatically extract names, emails, and roles from your text.</p>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: SCHEDULE (DUAL INPUT) */}
              {step === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <h3 style={{ fontSize: '18px', color: 'var(--text-primary)', marginBottom: '8px' }}>3. Schedule Data</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '-12px' }}>Now add your event schedule in plain english.</p>
                  
                  <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-card)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <button type="button" onClick={() => setFormData({...formData, schedule_method: 'upload'})} style={{ flex: 1, padding: '10px', background: formData.schedule_method === 'upload' ? 'var(--bg-surface)' : 'transparent', color: formData.schedule_method === 'upload' ? 'var(--blue)' : 'var(--text-secondary)', border: 'none', borderRadius: '8px', fontWeight: '500', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>upload_file</span> File Upload
                    </button>
                    <button type="button" onClick={() => setFormData({...formData, schedule_method: 'text'})} style={{ flex: 1, padding: '10px', background: formData.schedule_method === 'text' ? 'var(--bg-surface)' : 'transparent', color: formData.schedule_method === 'text' ? 'var(--blue)' : 'var(--text-secondary)', border: 'none', borderRadius: '8px', fontWeight: '500', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>chat</span> Plain English
                    </button>
                  </div>

                  {formData.schedule_method === 'upload' ? (
                    <div style={{ border: '2px dashed var(--border)', borderRadius: '16px', padding: '40px 20px', textAlign: 'center', background: 'var(--bg-input)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '40px', color: 'var(--text-muted)', marginBottom: '16px' }}>event_note</span>
                      <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>Upload your schedule CSV or JSON file</p>
                      <input type="file" onChange={e => setFormData({...formData, schedule_file: e.target.files[0]})} accept=".csv,.json" style={{ color: 'var(--text-primary)', background: 'var(--bg-card)', padding: '8px', borderRadius: '8px' }} />
                    </div>
                  ) : (
                    <div>
                      <textarea rows="8" placeholder="e.g. Day 1 starts with a Keynote at 9 AM in Hall A by Dr. Smith. Then at 10 AM we have the Python Workshop in Room 101..." value={formData.schedule_text} onChange={e => setFormData({...formData, schedule_text: e.target.value})} style={{ width: '100%', padding: '16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '12px', color: 'white', fontSize: '15px', resize: 'vertical', fontFamily: 'monospace' }} />
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>GPT-4o will instantly convert your prose into scheduled events with times and rooms.</p>
                    </div>
                  )}
                </div>
              )}

              {/* ACTIONS */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
                {step > 1 ? (
                  <button type="button" onClick={() => setStep(s => s - 1)} style={{ padding: '12px 24px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '12px', cursor: 'pointer', fontWeight: '500' }}>Back</button>
                ) : <div></div>}

                {step < 3 ? (
                  <button type="button" onClick={() => {
                    if (step === 1 && !formData.event_name.trim()) return toast.error('Event Name is required')
                    setStep(s => s + 1)
                  }} style={{ padding: '12px 24px', background: 'var(--text-primary)', color: 'var(--bg-base)', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: '600' }}>Continue</button>
                ) : (
                  <button type="button" onClick={handleSubmit} disabled={isSubmitting} style={{ padding: '12px 32px', background: 'linear-gradient(135deg, var(--blue), var(--purple))', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isSubmitting ? (
                      <><span className="material-symbols-outlined" style={{ animation: 'spin 1s linear infinite' }}>autorenew</span> Creating...</>
                    ) : (
                      <><span className="material-symbols-outlined">rocket_launch</span> Create Event & Save</>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
