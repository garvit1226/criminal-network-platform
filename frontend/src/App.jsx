import { useEffect, useState, useCallback } from 'react'
import Navbar from './components/Navbar'
import ReportInput from './components/ReportInput'
import GraphView from './components/GraphView'
import AnomalyPanel from './components/AnomalyPanel'
import { checkHealth, getGraph, getAnomalies } from './services/api'

const EMPTY_GRAPH = { nodes: [], edges: [] }

export default function App() {
  const [apiOnline, setApiOnline] = useState(false)
  const [caseId, setCaseId] = useState('')
  const [fullGraph, setFullGraph] = useState(EMPTY_GRAPH)
  const [viewGraph, setViewGraph] = useState(EMPTY_GRAPH)
  const [selectedNode, setSelectedNode] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [scanning, setScanning] = useState(false)
  const [isGraphFullScreen, setIsGraphFullScreen] = useState(false)
  // Persist report title and narrative across fullscreen toggles
  const [persistReportTitle, setPersistReportTitle] = useState('')
  const [persistReportText, setPersistReportText] = useState('')

  const refreshGraph = useCallback(async () => {
    try {
      const data = await getGraph()
      setFullGraph(data || EMPTY_GRAPH)
      setViewGraph(data || EMPTY_GRAPH)
    } catch {
      /* backend offline */
    }
  }, [])

  useEffect(() => {
    checkHealth().then(() => setApiOnline(true)).catch(() => setApiOnline(false))
    const interval = setInterval(() => {
      checkHealth().then(() => setApiOnline(true)).catch(() => setApiOnline(false))
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  // Listen for Escape key to exit full screen
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isGraphFullScreen) {
        setIsGraphFullScreen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isGraphFullScreen])

  function handleNodeSelect(nodeId) {
    setSelectedNode(nodeId)
  }

  function handleReset() {
    setFullGraph(EMPTY_GRAPH)
    setViewGraph(EMPTY_GRAPH)
    setSelectedNode(null)
    setAlerts([])
  }

  async function handleIngested() {
    await refreshGraph()
    await runScan()
  }

  async function runScan() {
    setScanning(true)
    try {
      const data = await getAnomalies()
      setAlerts(data || [])
    } catch {
      /* ignore -- backend offline */
    } finally {
      setScanning(false)
    }
  }

  // ==========================================================
  // FULL SCREEN VIEW: Covers 100% of the entire window
  // ==========================================================
  if (isGraphFullScreen) {
    return (
      <div className="fixed inset-0 z-50 w-screen h-screen bg-white flex flex-col overflow-hidden">
        <GraphView
          graphData={viewGraph}
          onNodeSelect={handleNodeSelect}
          selectedNodeId={selectedNode}
          isFullScreen={true}
          onToggleFullScreen={() => setIsGraphFullScreen(false)}
        />
      </div>
    )
  }

  // ==========================================================
  // NORMAL 2-COLUMN DASHBOARD VIEW
  // Crisp white theme with subtle ambient colors and dot grid
  // ==========================================================
  return (
    <div className="relative h-screen flex flex-col bg-[#F8FAFC] text-slate-800 overflow-auto bg-tech-grid">
      {/* Eye-Catchy Ambient Glow Orbs behind the cards (subtle, airy, light) */}
      <div
        className="pointer-events-none absolute -top-20 -left-20 w-[500px] h-[500px] rounded-full blur-[100px] opacity-40 z-0"
        style={{ background: 'radial-gradient(circle, #93C5FD 0%, transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute top-1/2 -left-10 w-[450px] h-[450px] rounded-full blur-[100px] opacity-30 z-0"
        style={{ background: 'radial-gradient(circle, #FDE68A 0%, transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute -bottom-20 right-10 w-[600px] h-[600px] rounded-full blur-[120px] opacity-35 z-0"
        style={{ background: 'radial-gradient(circle, #C4B5FD 0%, transparent 70%)' }}
      />

      {/* Modern Glassmorphic Navbar */}
      <Navbar apiOnline={apiOnline} />

      {/* Main Workspace Area */}
      <main className="relative z-10 flex-1 overflow-y-auto p-4 lg:p-5 max-w-[1760px] w-full mx-auto flex flex-col gap-4">
        {/* 2-COLUMN MAIN WORKSPACE */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-[620px]">
          {/* LEFT COLUMN (col-span-4): FIR Input (Top) + Anomaly Panel (Bottom) */}
          <div className="lg:col-span-4 flex flex-col gap-4 h-full min-h-[580px]">
            {/* 1. FIR / INCIDENT REPORT CARD (Highlights with Electric Blue border on hover) */}
            <ReportInput
              caseId={caseId}
              setCaseId={setCaseId}
              onIngested={handleIngested}
              onReset={handleReset}
              persistTitle={persistReportTitle}
              setPersistTitle={setPersistReportTitle}
              persistText={persistReportText}
              setPersistText={setPersistReportText}
            />

            {/* 2. ANOMALY & THREAT RADAR CARD (Highlights with Radiant Amber border on hover) */}
            <AnomalyPanel
              alerts={alerts}
              onRefresh={runScan}
              loading={scanning}
              onFocusNode={handleNodeSelect}
            />
          </div>

          {/* RIGHT COLUMN (col-span-8): Expanded Graph View */}
          {/* 3. INTELLIGENCE GRAPH CARD (Highlights with Violet/Indigo border on hover) */}
          <div className="lg:col-span-8 h-full min-h-[580px] flex flex-col">
            <GraphView
              graphData={viewGraph}
              onNodeSelect={handleNodeSelect}
              selectedNodeId={selectedNode}
              isFullScreen={false}
              onToggleFullScreen={() => setIsGraphFullScreen(true)}
            />
          </div>
        </div>
      </main>
    </div>
  )
}