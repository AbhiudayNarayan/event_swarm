import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { API } from './shared'

const EventContext = createContext(null)

export function EventProvider({ children }) {
  const [activeEvent, setActiveEvent] = useState(null)
  const [eventName, setEventName] = useState('')
  const [eventId, setEventId] = useState(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [generatedImages, setGeneratedImages] = useState([])
  
  const [swarmEvents, setSwarmEvents] = useState([])
  const [agentStatuses, setAgentStatuses] = useState({})
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(
    () => localStorage.getItem('el_swarm_onboarded') === 'true'
  )
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
  const [budgetState, setBudgetState] = useState({
    overview: null, expenses: [], alerts: [], analyses: [], activeTab: 'overview'
  })
  const [logisticsState, setLogisticsState] = useState({
    items: [], issues: [], activeTab: 'equipment'
  })

  const fetchActiveEvent = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`${API}/api/events/active`)
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

  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
    const wsUrl = apiBase.replace(/^http/, 'ws') + '/ws/swarm';
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            setSwarmEvents(prev => [...prev, data]);
            // Update agent status map
            setAgentStatuses(prev => ({
                ...prev,
                [data.agent]: data.status
            }));
        } catch (e) {
            console.error("WS parse error", e);
        }
    };

    ws.onerror = () => console.warn("Swarm WebSocket error");
    ws.onclose = () => console.log("Swarm WebSocket closed");

    return () => ws.close();
  }, [])

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
    budgetState,
    setBudgetState,
    logisticsState,
    setLogisticsState,
    swarmEvents,
    setSwarmEvents,
    agentStatuses,
    setAgentStatuses,
    hasSeenOnboarding,
    setHasSeenOnboarding,
  }

  return <EventContext.Provider value={value}>{children}</EventContext.Provider>
}

export function useEventConfig() {
  const ctx = useContext(EventContext)
  if (!ctx) throw new Error('useEventConfig must be used inside <EventProvider>')
  return ctx
}
