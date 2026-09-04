import { useRef, useState } from 'react'
import { Mic, Square, Send, Loader2, FileText, ChevronUp, Edit3, Plus, Sparkles, CheckCircle2, AlertCircle, Hash, ShieldCheck } from 'lucide-react'
import { submitTextReport, transcribeAudio } from '../services/api'

export default function ReportInput({ caseId, setCaseId, onIngested, onReset, persistTitle = '', setPersistTitle, persistText = '', setPersistText }) {
  const [reportTitle, setReportTitle] = useState(persistTitle || caseId || '')
  const [text, setText] = useState(persistText || '')
  const [lastSubmittedTitle, setLastSubmittedTitle] = useState(persistTitle || '')
  const [lastSubmittedText, setLastSubmittedText] = useState(persistText || '')
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

      rec.start(250)
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
    if (!reportTitle.trim()) {
      setError('Please enter a File Name / FIR Number.')
      return
    }

    if (!text.trim()) {
      setError('Report narrative text is required.')
      return
    }

    setBusy(true)
    setError(null)
    setStatusMsg('Extracting entities & relations...')

    const effectiveTitle = reportTitle.trim()

    try {
      if (setCaseId) setCaseId(effectiveTitle)

      await submitTextReport(effectiveTitle, text.trim(), 'Investigator')
      setLastSubmittedTitle(effectiveTitle)
      setLastSubmittedText(text.trim())
      if (setPersistTitle) setPersistTitle(effectiveTitle)
      if (setPersistText) setPersistText(text.trim())
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
    setReportTitle('')
    if (setCaseId) setCaseId('')
    setText('')
    if (setPersistTitle) setPersistTitle('')
    if (setPersistText) setPersistText('')
    setIsMinimized(false)
    if (onReset) onReset()
  }

  // ==========================================================
  // MINIMIZED STATE VIEW: Displays Custom File Name / Number
  // Highlighting with vibrant Electric Blue border on hover
  // ==========================================================
  if (isMinimized) {
    const displayTitle = lastSubmittedTitle || reportTitle || 'Incident Report'

    return (
      <div className="group relative bg-[#F1F5F9] rounded-2xl border border-slate-300/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] p-3.5 flex items-center justify-between transition-all duration-300 ease-out hover:border-blue-500 hover:shadow-[0_14px_38px_-6px_rgba(59,130,246,0.22)] hover:-translate-y-0.5 overflow-hidden" style={{ maxHeight: '250px', overflowY: 'auto' }}>
        {/* Top Accent Gradient Line */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-blue-500 via-sky-400 to-indigo-600 opacity-80 group-hover:opacity-100 transition-opacity" />

        <div className="flex items-center gap-3 min-w-0 pr-2">
          <div className="p-2 bg-gradient-to-br from-blue-50 to-indigo-50/80 rounded-xl text-blue-600 border border-blue-200/60 shadow-xs shrink-0 group-hover:scale-105 transition-transform">
            <FileText size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-bold text-slate-900 truncate max-w-[200px]" title={displayTitle}>
                {displayTitle}
              </h2>
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                ACTIVE FIR
              </span>
            </div>
            <p className="text-[11px] text-slate-500 truncate max-w-[190px] mt-0.5">
              {lastSubmittedText || 'Narrative active · Graph updated'}
            </p>
          </div>
        </div>

        {/* ACTIONS: EDIT & NEW */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleEditReport}
            title="Edit report name or text"
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/80 transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            <Edit3 size={13} />
            <span>Edit</span>
          </button>

          <button
            onClick={handleNewReport}
            title="Start a new blank report"
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/80 transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            <Plus size={13} />
            <span>New FIR</span>
          </button>
        </div>
      </div>
    )
  }

  // ==========================================================
  // EXPANDED STATE VIEW: File Name Input + Narrative Textarea
  // Highlighting with vibrant Electric Blue border on hover
  // ==========================================================
  return (
    <div className="group relative bg-[#F1F5F9] rounded-2xl border border-slate-300/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] flex flex-col transition-all duration-300 ease-out hover:border-blue-500 hover:shadow-[0_14px_38px_-6px_rgba(59,130,246,0.22)] hover:-translate-y-0.5 overflow-hidden">
      {/* Top Accent Gradient Line */}
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-blue-500 via-sky-400 to-indigo-600 opacity-80 group-hover:opacity-100 transition-opacity" />

      {/* HEADER */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-gradient-to-br from-blue-50 to-indigo-50/80 rounded-xl text-blue-600 border border-blue-200/60 shadow-xs group-hover:scale-105 transition-transform">
            <FileText size={17} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                {lastSubmittedText ? 'Edit Incident Report' : 'FIR / Incident Report'}
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/80">
                INGESTION
              </span>
            </div>

          </div>
        </div>

        <button
          onClick={() => setIsMinimized(true)}
          title="Minimize Input Box"
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-all cursor-pointer"
        >
          <ChevronUp size={16} />
        </button>
      </div>

      {/* FILE NAME / FIR NUMBER INPUT FIELD */}
      <div className="mb-3">
        <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center justify-between">
          <span>File Name / FIR Number / Case Title</span>
          <span className="text-[10px] text-slate-400 font-normal">Required identifier</span>
        </label>
        <div className="relative">
          <Hash size={14} className="absolute left-3 top-2.5 text-blue-500/70" />
          <input
            type="text"
            value={reportTitle}
            onChange={(e) => setReportTitle(e.target.value)}
            placeholder="Enter FIR number or case title (e.g. FIR-2024-001)..."
            className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition shadow-xs placeholder:font-normal placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* NARRATIVE TEXTAREA */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center justify-between">
          <span>Report Narrative & Evidence</span>
          <span className="text-[10px] text-slate-400 font-normal">NLP Entity Extraction</span>
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe the incident, people, locations, transactions, calls, vehicles, bank accounts, or other evidence..."
          rows={4}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition resize-none placeholder:text-slate-400 leading-relaxed shadow-xs"
        />
      </div>

      {/* ERROR FEEDBACK */}
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-2.5">
          <AlertCircle size={14} className="shrink-0 text-red-500" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* SUCCESS STATUS */}
      {statusMsg && !error && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mt-2.5">
          <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
          <span className="font-medium">{statusMsg}</span>
        </div>
      )}

      {/* ACTION BUTTONS */}
      <div className="flex items-center justify-between mt-3.5 pt-3 border-t border-slate-100 gap-2">
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={busy}
          type="button"
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition-all active:scale-95 cursor-pointer shadow-xs ${
            recording
              ? 'bg-red-50 border-red-300 text-red-700 animate-pulse'
              : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
          }`}
        >
          {recording ? <Square size={13} className="text-red-600" /> : <Mic size={13} className="text-slate-600" />}
          <span>{recording ? 'Stop Dictating' : 'Dictate'}</span>
        </button>

        <button
          onClick={handleSubmit}
          disabled={busy || !text.trim()}
          type="button"
          className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-500/25 active:scale-95 transition-all cursor-pointer"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} className="text-blue-200" />}
          <span>{lastSubmittedText ? 'Update & Extract' : 'Extract & Add to Graph'}</span>
        </button>
      </div>
      </div>
    </div>
  )
}