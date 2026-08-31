import { useEffect, useState, useCallback } from 'react'
import { Users, GitBranch, AlertOctagon, FileStack } from 'lucide-react'
import Navbar from './components/Navbar'
import ReportInput from './components/ReportInput'
import GraphView from './components/GraphView'
import FilterPanel from './components/FilterPanel'
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
  const [depth, setDepth] = useState(3)
  const [alerts, setAlerts] = useState([])
  const [scanning, setScanning] = useState(false)

  const refreshGraph = useCallback(async () => {
    try {
      const data = await getGraph()
      setFullGraph(data)
      if (!selectedNode) setViewGraph(data)
    } catch {
      /* backend offline -- surfaced via the health indicator */
    }
  }, [selectedNode])

  useEffect(() => {
    checkHealth().then(() => setApiOnline(true)).catch(() => setApiOnline(false))
    refreshGraph()
    const interval = setInterval(() => {
      checkHealth().then(() => setApiOnline(true)).catch(() => setApiOnline(false))
    }, 15000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleNodeSelect(nodeId) {
    setSelectedNode(nodeId)
    const sub = await getNeighborhood(nodeId, depth)
    setViewGraph(sub)
  }

  async function handleDepthChange(newDepth) {
    setDepth(newDepth)
    if (selectedNode) {
      const sub = await getNeighborhood(selectedNode, newDepth)
      setViewGraph(sub)
    }
  }

  function handleClearFilter() {
    setSelectedNode(null)
    setViewGraph(fullGraph)
  }

  async function handleIngested() {
    await refreshGraph()
  }

  async function runScan() {
    setScanning(true)
    try {
      const data = await getAnomalies()
      setAlerts(data)
    } catch {
      /* ignore -- backend offline */
    } finally {
      setScanning(false)
    }
  }

  const personCount = fullGraph.nodes.filter((n) => n.label === 'PERSON').length

  return (
    <div className="h-screen flex flex-col">
      <Navbar apiOnline={apiOnline} />

      <main className="flex-1 overflow-y-auto p-6 max-w-[1600px] w-full mx-auto">
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard label="People in graph" value={personCount} icon={Users} />
          <StatCard label="Total entities" value={fullGraph.nodes.length} icon={FileStack} accent="text-violet-600" />
          <StatCard label="Relationships" value={fullGraph.edges.length} icon={GitBranch} accent="text-emerald-600" />
          <StatCard label="Open alerts" value={alerts.length} icon={AlertOctagon} accent="text-red-600" />
        </div>

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-3 flex flex-col gap-4">
            <ReportInput caseId={caseId} setCaseId={setCaseId} onIngested={handleIngested} />
            <FilterPanel
              selectedNode={selectedNode}
              depth={depth}
              setDepth={handleDepthChange}
              onClear={handleClearFilter}
              nodes={fullGraph.nodes}
            />
          </div>

          <div className="col-span-6 min-h-[560px]">
            <GraphView graphData={viewGraph} onNodeSelect={handleNodeSelect} selectedNodeId={selectedNode} />
          </div>

          <div className="col-span-3 min-h-[560px]">
            <AnomalyPanel alerts={alerts} onRefresh={runScan} loading={scanning} onFocusNode={handleNodeSelect} />
          </div>
        </div>
      </main>
    </div>
  )
}
