import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

const EventContext = createContext(null)

export function EventProvider({ children }) {
  const [activeEvent, setActiveEvent] = useState(null)
  const [eventName, setEventName] = useState('')
  const [eventId, setEventId] = useState(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [generatedImages, setGeneratedImages] = useState([])
  const [participants, setParticipants] = useState([])
  const [schedulerState, setSchedulerState] = useState({
    report: null,
    conflicts: [],
    changes: [],
    delayResult: null,
    lastRun: null,
    activeTab: 'plan',
    submittedDelays: [],
    cancelledIds: [],
  })

  const fetchActiveEvent = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/events/active')
      if (res.ok) {
        const data = await res.json()
        if (data.loaded) {
          setActiveEvent(data)
          setEventName(data.event_name || '')
          setEventId(data.event_id || null)
          setIsLoaded(true)
        } else {
          setActiveEvent(null)
          setEventName('')
          setEventId(null)
          setIsLoaded(false)
        }
      }
    } catch (err) {
      console.error('EventContext: failed to fetch active event', err)
      setActiveEvent(null)
      setEventName('')
      setEventId(null)
      setIsLoaded(false)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchActiveEvent()
  }, [fetchActiveEvent])

  const value = {
    activeEvent,
    eventName,
    eventId,
    isLoaded,
    isLoading,
    refresh: fetchActiveEvent,
    // Add backward compatible fields for SetupPage until we rewrite it
    eventDate: activeEvent?.dates?.start || '',
    venue: activeEvent?.venue || '',
    expectedParticipants: activeEvent?.expected_footfall || '',
    eventDescription: activeEvent?.description || '',
    targetAudience: activeEvent?.target_audience || '',
    emailTemplate: activeEvent?.email_template || '',
    eventSetupComplete: isLoaded,
    generatedImages,
    setGeneratedImages,
    participants,
    setParticipants,
    schedulerState,
    setSchedulerState,
  }

  return <EventContext.Provider value={value}>{children}</EventContext.Provider>
}

export function useEventConfig() {
  const ctx = useContext(EventContext)
  if (!ctx) throw new Error('useEventConfig must be used inside <EventProvider>')
  return ctx
}
