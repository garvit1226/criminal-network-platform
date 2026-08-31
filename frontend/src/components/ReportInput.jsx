import { useRef, useState } from 'react'
import { Mic, Square, Send, Loader2, FileText } from 'lucide-react'
import { submitTextReport, submitVoiceReport, transcribeAudio } from '../services/api'

export default function ReportInput({ caseId, setCaseId, onIngested }) {
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const mediaRecorder = useRef(null)
  const chunks = useRef([])

  async function startRecording() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunks.current = []
      rec.ondataavailable = (e) => chunks.current.push(e.data)
      rec.onstop = async () => {
        const blob = new Blob(chunks.current, { type: 'audio/webm' })
        setBusy(true)
        try {
          const { text: transcribed } = await transcribeAudio(blob)
          setText((prev) => (prev ? prev + ' ' + transcribed : transcribed))
        } catch (e) {
          setError('Transcription failed. Is the backend / Whisper model running?')
        } finally {
          setBusy(false)
        }
      }
      rec.start()
      mediaRecorder.current = rec
      setRecording(true)
    } catch (e) {
      setError('Microphone access denied or unavailable.')
    }
  }

  function stopRecording() {
    mediaRecorder.current?.stop()
    mediaRecorder.current?.stream.getTracks().forEach((t) => t.stop())
    setRecording(false)
  }

  async function handleSubmit() {
    if (!caseId.trim() || !text.trim()) {
      setError('Case ID and report text are both required.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await submitTextReport(caseId.trim(), text.trim())
      onIngested(result)
      
    } catch (e) {
      setError('Could not submit report. Check the backend connection.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-panel rounded-xl border border-line shadow-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <FileText size={16} className="text-brand-600" />
        <h2 className="text-sm font-semibold text-ink">New crime report</h2>
      </div>

      <label className="block text-xs font-medium text-muted mb-1">Case / FIR number</label>
      <input
        value={caseId}
        onChange={(e) => setCaseId(e.target.value)}
        placeholder="e.g. FIR-2026-00417"
        className="w-full mb-4 rounded-lg border border-line px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-400"
      />

      <label className="block text-xs font-medium text-muted mb-1">Report narrative</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type the report, or use the mic to dictate it..."
        rows={6}
        className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
      />

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      <div className="flex items-center justify-between mt-4">
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={busy}
          className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border transition ${
            recording
              ? 'bg-red-50 border-red-200 text-red-700 animate-pulse'
              : 'bg-slate-50 border-line text-ink hover:bg-slate-100'
          }`}
        >
          {recording ? <Square size={14} /> : <Mic size={14} />}
          {recording ? 'Stop recording' : 'Dictate report'}
        </button>

        <button
          onClick={handleSubmit}
          disabled={busy}
          className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Extract & add to graph
        </button>
      </div>
    </div>
  )
}
