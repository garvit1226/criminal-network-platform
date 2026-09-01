import { useRef, useState } from 'react'
import { Mic, Square, Send, Loader2, FileText, ChevronUp, Edit3, Plus, Sparkles, CheckCircle2, AlertCircle, Hash } from 'lucide-react'
import { submitTextReport, transcribeAudio } from '../services/api'

export default function ReportInput({ caseId, setCaseId, onIngested }) {
  const [reportTitle, setReportTitle] = useState(caseId || `FIR-${Date.now().toString().slice(-6)}`)
  const [text, setText] = useState('')
  const [lastSubmittedTitle, setLastSubmittedTitle] = useState('')
  const [lastSubmittedText, setLastSubmittedText] = useState('')
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [statusMsg, setStatusMsg] = useState(null)
  const [isMinimized, setIsMinimized] = useState(false)

  const mediaRecorder = useRef(null)
  const chunks = useRef([])

  async function startRecording() {
    setError(null)
    setStatusMsg(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4'

      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunks.current = []

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.current.push(e.data)
        }
      }

      rec.onstop = async () => {
        // Clean up audio tracks after recorder has fully stopped
        stream.getTracks().forEach((t) => t.stop())

        const blob = new Blob(chunks.current, { type: mimeType || 'audio/webm' })
        if (blob.size < 1000) {
          setError('No audible speech detected. Please speak closer to your mic.')
          return
        }

        setBusy(true)
        setStatusMsg('Transcribing audio...')
        try {
          const res = await transcribeAudio(blob)
          const transcribed = (res?.text || '').trim()
          if (!transcribed) {
            setError('Could not recognize any words. Please try speaking clearly.')
          } else {
            setText((prev) => (prev ? prev + ' ' + transcribed : transcribed))
            setStatusMsg('Voice transcription complete!')
          }
        } catch (e) {
          setError('Transcription failed. Is the backend server running?')
        } finally {
          setBusy(false)
        }
      }

      rec.start(250) // Slice audio every 250ms for reliable buffering
      mediaRecorder.current = rec
      setRecording(true)
    } catch (e) {
      setError('Microphone access denied or unavailable.')
    }
  }

  function stopRecording() {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop()
    }
    setRecording(false)
  }

  async function handleSubmit() {
    if (!text.trim()) {
      setError('Report text is required.')
      return
    }

    setBusy(true)
    setError(null)
    setStatusMsg('Extracting entities & relations...')

    const effectiveTitle = reportTitle.trim() || `FIR-${Date.now().toString().slice(-6)}`

    try {
      if (setCaseId) setCaseId(effectiveTitle)

      await submitTextReport(effectiveTitle, text.trim(), 'Investigator')
      setLastSubmittedTitle(effectiveTitle)
      setLastSubmittedText(text.trim())
      setStatusMsg('Report ingested successfully!')
      
      // Notify parent to refresh graph & scan anomalies
      if (onIngested) {
        await onIngested()
      }

      // Auto-minimize input box after 800ms so anomaly panel expands
      setTimeout(() => {
        setIsMinimized(true)
        setStatusMsg(null)
      }, 800)
    } catch (e) {
      setError('Could not submit report. Check backend connection.')
    } finally {
      setBusy(false)
    }
  }

  // Handle Edit Action (Preserves previous text and title)
  function handleEditReport() {
    if (lastSubmittedTitle) setReportTitle(lastSubmittedTitle)
    if (lastSubmittedText && !text) setText(lastSubmittedText)
    setIsMinimized(false)
  }

  // Handle New Blank Report Action
  function handleNewReport() {
    const newId = `FIR-${Date.now().toString().slice(-6)}`
    setReportTitle(newId)
    if (setCaseId) setCaseId(newId)
    setText('')
    setIsMinimized(false)
  }

  // ==========================================================
  // MINIMIZED STATE VIEW: Displays Custom File Name / Number
  // ==========================================================
  if (isMinimized) {
    const displayTitle = lastSubmittedTitle || reportTitle || 'Incident Report'

    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex items-center justify-between transition-all">
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600 border border-blue-100 shrink-0">
            <FileText size={15} />
          </div>
          <div className="min-w-0">
            {/* FILE NAME / FIR NUMBER DISPLAY */}
            <h2 className="text-xs font-bold text-slate-900 truncate max-w-[200px]" title={displayTitle}>
              {displayTitle}
            </h2>
            <p className="text-[11px] text-slate-500 truncate max-w-[190px]">
              {lastSubmittedText || 'Narrative active · Graph updated'}
            </p>
          </div>
        </div>

        {/* ACTIONS: EDIT & NEW */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleEditReport}
            title="Edit report name or text"
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition cursor-pointer"
          >
            <Edit3 size={13} />
            <span>Edit</span>
          </button>

          <button
            onClick={handleNewReport}
            title="Start a new blank report"
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition cursor-pointer"
          >
            <Plus size={13} />
            <span>New</span>
          </button>
        </div>
      </div>
    )
  }

  // ==========================================================
  // EXPANDED STATE VIEW: File Name Input + Narrative Textarea
  // ==========================================================
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col transition-all">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600 border border-blue-100">
            <FileText size={16} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {lastSubmittedText ? 'Edit Incident Report' : 'New Incident Report'}
            </h2>
            <p className="text-[11px] text-slate-500">
              Set file / FIR name and narrative for link analysis
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsMinimized(true)}
          title="Minimize Input Box"
          className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition cursor-pointer"
        >
          <ChevronUp size={16} />
        </button>
      </div>

      {/* FILE NAME / FIR NUMBER INPUT FIELD */}
      <div className="mb-2.5">
        <label className="block text-[11px] font-medium text-slate-600 mb-1">
          File Name / FIR Number / Case Title
        </label>
        <div className="relative">
          <Hash size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            value={reportTitle}
            onChange={(e) => setReportTitle(e.target.value)}
            placeholder="e.g. FIR-2024-001 or Cyber Syndicate A"
            className="w-full rounded-lg border border-slate-200 bg-slate-50/50 pl-7 pr-3 py-1.5 text-xs text-slate-900 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition placeholder:font-normal placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* NARRATIVE TEXTAREA */}
      <div>
        <label className="block text-[11px] font-medium text-slate-600 mb-1">
          Report Narrative
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe the incident, people, locations, transactions, calls, vehicles, bank accounts, or other evidence..."
          rows={4}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition resize-none placeholder:text-slate-400 leading-relaxed"
        />
      </div>

      {/* ERROR FEEDBACK */}
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2.5 py-1.5 mt-2">
          <AlertCircle size={13} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* SUCCESS STATUS */}
      {statusMsg && !error && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1.5 mt-2">
          <CheckCircle2 size={13} className="shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* ACTION BUTTONS */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100 gap-2">
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={busy}
          type="button"
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition cursor-pointer ${
            recording
              ? 'bg-red-50 border-red-300 text-red-700 animate-pulse'
              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
        >
          {recording ? <Square size={13} className="text-red-600" /> : <Mic size={13} className="text-slate-600" />}
          <span>{recording ? 'Stop Dictating' : 'Dictate'}</span>
        </button>

        <button
          onClick={handleSubmit}
          disabled={busy || !text.trim()}
          type="button"
          className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition cursor-pointer"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} className="text-blue-200" />}
          <span>{lastSubmittedText ? 'Update & Extract' : 'Extract & Add'}</span>
        </button>
      </div>
    </div>
  )
}