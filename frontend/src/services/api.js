import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

export const api = axios.create({ baseURL: API_BASE })

export const checkHealth = () => api.get('/api/health').then(r => r.data)

export const submitTextReport = (caseId, text, reportedBy) =>
  api.post('/api/reports/text', { case_id: caseId, text, reported_by: reportedBy }).then(r => r.data)

export const submitVoiceReport = (caseId, audioBlob) => {
  const form = new FormData()
  form.append('case_id', caseId)
  form.append('audio', audioBlob, 'recording.webm')
  return api.post('/api/reports/voice', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

export const transcribeAudio = (audioBlob) => {
  const form = new FormData()
  form.append('audio', audioBlob, 'recording.webm')
  return api.post('/api/reports/transcribe', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

export const getGraph = (caseId) =>
  api.get('/api/graph', { params: caseId ? { case_id: caseId } : {} }).then(r => r.data)

export const getNeighborhood = (nodeId, depth = 3) =>
  api.get(`/api/graph/neighborhood/${nodeId}`, { params: { depth } }).then(r => r.data)

export const getAnomalies = () => api.get('/api/anomalies').then(r => r.data)
