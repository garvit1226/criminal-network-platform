import { useEffect, useState, useCallback } from 'react'
import { Users, GitBranch, AlertOctagon, FileStack } from 'lucide-react'
import Navbar from './components/Navbar'
import ReportInput from './components/ReportInput'
import GraphView from './components/GraphView'
import AnomalyPanel from './components/AnomalyPanel'
import StatCard from './components/StatCard'
import { checkHealth, getGraph, getNeighborhood, getAnomalies } from './services/api'

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
    refreshGraph()
    runScan()
    const interval = setInterval(() => {
      checkHealth().then(() => setApiOnline(true)).catch(() => setApiOnline(false))
    }, 15000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const personCount = fullGraph.nodes.filter((n) => n.label === 'PERSON').length

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
  // ==========================================================
  return (
    <div className="h-screen flex flex-col bg-slate-100/60 overflow-hidden">
      <Navbar apiOnline={apiOnline} />

      <main className="flex-1 overflow-y-auto p-5 max-w-[1700px] w-full mx-auto flex flex-col gap-4">
        {/* STATS CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="People in graph" value={personCount} icon={Users} />
          <StatCard label="Total entities" value={fullGraph.nodes.length} icon={FileStack} accent="text-violet-600" />
          <StatCard label="Relationships" value={fullGraph.edges.length} icon={GitBranch} accent="text-emerald-600" />
          <StatCard label="Open alerts" value={alerts.length} icon={AlertOctagon} accent="text-red-600" />
        </div>

        {/* 2-COLUMN MAIN WORKSPACE */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-[620px]">
          {/* LEFT COLUMN (col-span-4): Report Input (Top) + Anomaly Panel (Bottom) */}
          <div className="lg:col-span-4 flex flex-col gap-4 h-full min-h-[580px]">
            <ReportInput
              caseId={caseId}
              setCaseId={setCaseId}
              onIngested={handleIngested}
            />
            <AnomalyPanel
              alerts={alerts}
              onRefresh={runScan}
              loading={scanning}
              onFocusNode={handleNodeSelect}
            />
          </div>

          {/* RIGHT COLUMN (col-span-8): Expanded Graph View */}
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
