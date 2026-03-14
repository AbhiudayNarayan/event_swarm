import axios from 'axios'
import React from 'react'

export const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
export const api = axios.create({ baseURL: API })

export function StatusBadge({ status }) {
  let statusClass = 'badge-idle'
  const displayStatus = String(status).toUpperCase()

  if (displayStatus === 'RUNNING') {
    statusClass = 'badge-running'
  } else if (displayStatus === 'DONE' || displayStatus === 'SUCCESS') {
    statusClass = 'badge-done'
  } else if (displayStatus === 'ERROR') {
    statusClass = 'badge-error'
  }

  return (
    <span className={`badge ${statusClass}`}>
      {displayStatus === 'IDLE' ? 'IDLE' : displayStatus}
    </span>
  )
}
