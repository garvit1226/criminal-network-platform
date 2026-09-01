import { useEffect, useRef, useState } from 'react'
import cytoscape from 'cytoscape'
import { Network, ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCcw, Filter, LayoutGrid, Sparkles, Shrink } from 'lucide-react'

const LABEL_COLORS = {
  PERSON: '#2563EB',    // Vibrant Blue
  ORG: '#7C3AED',       // Deep Purple
  LOCATION: '#059669',  // Emerald Green
  PHONE: '#EA580C',     // Bright Orange
  ACCOUNT: '#DB2777',   // Magenta
  VEHICLE: '#0D9488',   // Teal
  AMOUNT: '#CA8A04',    // Golden Amber
  DATE: '#64748B',      // Slate
}

// LARGE, HIGH-VISIBILITY NODE SIZES
const NODE_SIZES = {
  PERSON: 74,
  ORG: 66,
  LOCATION: 62,
  PHONE: 58,
  ACCOUNT: 58,
  VEHICLE: 58,
  AMOUNT: 58,
  DATE: 58,
}

// ==========================================================
// CALCULATE CLEAN INITIAL POSITIONS (Original Form)
// ==========================================================
function calculateOriginalPositions(nodes, edges, width = 1200, height = 800) {
  const positions = {}
  const people = nodes.filter((n) => String(n.label || '').toUpperCase() === 'PERSON')
  const entities = nodes.filter((n) => String(n.label || '').toUpperCase() !== 'PERSON')

  const CENTER_X = width / 2
  const CENTER_Y = height / 2 - 20
  const PERSON_RADIUS = Math.max(200, Math.min(width, height) * 0.32)

  // 1. Arrange People in a clean center ring
  if (people.length === 1) {
    positions[String(people[0].id)] = { x: CENTER_X, y: CENTER_Y }
  } else if (people.length > 1) {
    people.forEach((person, index) => {
      const angle = (2 * Math.PI * index) / people.length - Math.PI / 2
      positions[String(person.id)] = {
        x: CENTER_X + PERSON_RADIUS * Math.cos(angle),
        y: CENTER_Y + PERSON_RADIUS * Math.sin(angle),
      }
    })
  } else if (nodes.length > 0) {
    // If no persons exist, distribute all nodes in a balanced ring
    nodes.forEach((n, index) => {
      const angle = (2 * Math.PI * index) / nodes.length - Math.PI / 2
      positions[String(n.id)] = {
        x: CENTER_X + (PERSON_RADIUS * 0.8) * Math.cos(angle),
        y: CENTER_Y + (PERSON_RADIUS * 0.8) * Math.sin(angle),
      }
    })
    return positions
  }

  // Find people connected to each entity
  const getConnectedPeople = (nodeId) => {
    const peopleMap = new Map()
    edges.forEach((edge) => {
      const source = String(edge.source)
      const target = String(edge.target)
      let otherId = null
      if (source === nodeId) otherId = target
      else if (target === nodeId) otherId = source

      if (!otherId || !positions[otherId]) return
      const otherNode = nodes.find((node) => String(node.id) === otherId)
      if (otherNode && String(otherNode.label || '').toUpperCase() === 'PERSON') {
        peopleMap.set(otherId, positions[otherId])
      }
    })
    return [...peopleMap.values()]
  }

  const personEntityCount = new Map()

  // 2. Position entities relative to connected people with generous spacing
  entities.forEach((entity, eIdx) => {
    const entityId = String(entity.id)
    const connectedPeople = getConnectedPeople(entityId)

    if (connectedPeople.length === 0) {
      // Isolated entity below
      const column = eIdx % 7
      const row = Math.floor(eIdx / 7)
      positions[entityId] = {
        x: Math.max(100, CENTER_X - 350) + column * 135,
        y: Math.min(height - 80, CENTER_Y + PERSON_RADIUS + 50) + row * 90,
      }
      return
    }

    if (connectedPeople.length >= 2) {
      // Shared entity: clean midpoint with radial spread
      const avgX = connectedPeople.reduce((sum, p) => sum + p.x, 0) / connectedPeople.length
      const avgY = connectedPeople.reduce((sum, p) => sum + p.y, 0) / connectedPeople.length

      const sharedIndex = entities
        .slice(0, eIdx)
        .filter((item) => getConnectedPeople(String(item.id)).length >= 2).length

      const offsetAngle = sharedIndex * 1.3
      const offsetRadius = 65 + (sharedIndex % 3) * 35

      positions[entityId] = {
        x: avgX + offsetRadius * Math.cos(offsetAngle),
        y: avgY + offsetRadius * Math.sin(offsetAngle),
      }
      return
    }

    // Single-person satellite entity
    const personPos = connectedPeople[0]
    const connectedPerson = people.find(
      (p) => positions[String(p.id)]?.x === personPos.x && positions[String(p.id)]?.y === personPos.y
    )

    const personId = connectedPerson ? String(connectedPerson.id) : null
    const count = personId ? personEntityCount.get(personId) || 0 : 0
    if (personId) personEntityCount.set(personId, count + 1)

    // Satellite ring around the person
    const slotAngle = count * (Math.PI / 3.2) - Math.PI / 2
    const ring = 125 + Math.floor(count / 6) * 60

    positions[entityId] = {
      x: personPos.x + ring * Math.cos(slotAngle),
      y: personPos.y + ring * Math.sin(slotAngle),
    }
  })

  return positions
}

export default function GraphView({
  graphData,
  onNodeSelect,
  selectedNodeId,
  isFullScreen = false,
  onToggleFullScreen,
}) {
  const containerRef = useRef(null)
  const cyRef = useRef(null)
  const initialPositionsRef = useRef({})
  const [activeFilter, setActiveFilter] = useState('ALL')
  const [activeLayout, setActiveLayout] = useState('cose')
  const [isSpread, setIsSpread] = useState(false)

  const nodes = graphData?.nodes || []
  const edges = graphData?.edges || []

  // Auto-resize canvas whenever container size or fullscreen changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (cyRef.current) {
        cyRef.current.resize()
        if (!selectedNodeId) {
          cyRef.current.fit(undefined, isFullScreen ? 60 : 45)
        }
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [isFullScreen, selectedNodeId])

  // Helper to run chosen layout mode
  const runLayout = (layoutMode, spreadActive) => {
    if (!cyRef.current) return

    if (layoutMode === 'breadthfirst') {
      cyRef.current.layout({
        name: 'breadthfirst',
        animate: true,
        animationDuration: 650,
        fit: true,
        padding: 50,
        directed: false,
        circle: false,
        spacingFactor: spreadActive ? 2.4 : 1.4,
        avoidOverlap: true,
        roots: undefined,
      }).run()
      return
    }

    // Organic Physics (CoSE vs Original)
    if (spreadActive) {
      cyRef.current.layout({
        name: 'cose',
        animate: true,
        animationDuration: 700,
        fit: true,
        padding: 50,
        nodeRepulsion: (node) => (node.data('kind') === 'PERSON' ? 85000 : 52000),
        nodeOverlap: 40,
        idealEdgeLength: () => 180,
        edgeElasticity: () => 32,
        nestingFactor: 1.2,
        gravity: 0.08,
        numIter: 1000,
        initialTemp: 800,
        coolingFactor: 0.98,
        minTemp: 1.0,
        componentSpacing: 190,
      }).run()
    } else {
      cyRef.current.layout({
        name: 'preset',
        positions: (node) => initialPositionsRef.current[node.id()] || node.position(),
        animate: true,
        animationDuration: 650,
        fit: true,
        padding: 50,
        easing: 'ease-in-out-cubic',
      }).run()
    }
  }

  // Initialize and update Cytoscape instance
  useEffect(() => {
    if (!containerRef.current) return

    if (cyRef.current) {
      cyRef.current.destroy()
      cyRef.current = null
    }

    const rect = containerRef.current.getBoundingClientRect()
    const containerWidth = rect.width > 0 ? rect.width : (isFullScreen ? window.innerWidth : 900)
    const containerHeight = rect.height > 0 ? rect.height : (isFullScreen ? window.innerHeight : 650)

    // Compute and snapshot the exact original positions
    const origPositions = calculateOriginalPositions(nodes, edges, containerWidth, containerHeight)
    initialPositionsRef.current = origPositions
    setIsSpread(false)

    const elements = [
      ...nodes.map((node) => ({
        data: {
          id: String(node.id),
          label: node.name || 'Unknown',
          kind: String(node.label || 'ENTITY').toUpperCase(),
        },
        position: origPositions[String(node.id)] || {
          x: containerWidth / 2,
          y: containerHeight / 2,
        },
      })),
      ...edges.map((edge, index) => ({
        data: {
          id: String(edge.id || `edge-${edge.source}-${edge.target}-${index}`),
          source: String(edge.source),
          target: String(edge.target),
          label: edge.type || 'RELATES',
        },
      })),
    ]

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        // BASE NODE STYLE (BIGGER, CLEARER, READABLE)
        {
          selector: 'node',
          style: {
            'background-color': (ele) => LABEL_COLORS[ele.data('kind')] || '#94A3B8',
            width: (ele) => NODE_SIZES[ele.data('kind')] || 56,
            height: (ele) => NODE_SIZES[ele.data('kind')] || 56,
            label: 'data(label)',
            color: '#0F172A',
            'font-family': 'Inter, system-ui, -apple-system, sans-serif',
            'font-size': 13,
            'font-weight': 600,
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 8,
            'text-max-width': 130,
            'text-wrap': 'wrap',
            // HIGH-CONTRAST BADGE PILL BACKGROUND FOR NAKED-EYE READABILITY
            'text-background-color': '#FFFFFF',
            'text-background-opacity': 0.96,
            'text-background-padding': 4,
            'text-background-shape': 'roundrectangle',
            'text-border-width': 1,
            'text-border-color': '#CBD5E1',
            'text-border-opacity': 0.9,
            // CRISP NODE BORDER & SHADOW
            'border-width': 3.5,
            'border-color': '#FFFFFF',
            'shadow-blur': 10,
            'shadow-color': 'rgba(0,0,0,0.18)',
            'shadow-offset-y': 3,
            'overlay-opacity': 0,
            'z-index': 10,
            transition: 'all 0.25s ease',
          },
        },
        // KEY SUSPECT / PERSON NODE (LARGER & BOLDER)
        {
          selector: 'node[kind="PERSON"]',
          style: {
            'font-size': 14.5,
            'font-weight': 700,
            'border-width': 4.5,
            'border-color': '#FFFFFF',
            'text-border-color': '#93C5FD',
            'text-background-color': '#F8FAFC',
          },
        },
        // SELECTED NODE HIGHLIGHT
        {
          selector: 'node:selected',
          style: {
            'border-width': 5,
            'border-color': '#0F172A',
            'overlay-color': '#2563EB',
            'overlay-opacity': 0.2,
            'overlay-padding': 12,
            'z-index': 30,
          },
        },
        // ANOMALY FOCUS ALERT HIGHLIGHT
        {
          selector: 'node.anomaly-focused',
          style: {
            'border-width': 5.5,
            'border-color': '#DC2626',
            'overlay-color': '#EF4444',
            'overlay-opacity': 0.28,
            'overlay-padding': 14,
            'z-index': 40,
          },
        },
        // BASE EDGE STYLE
        {
          selector: 'edge',
          style: {
            width: 2.5,
            'line-color': '#CBD5E1',
            'target-arrow-color': '#94A3B8',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 1.2,
            'curve-style': 'bezier',
            'control-point-step-size': 40,
            label: '',
            'overlay-opacity': 0,
            'z-index': 1,
            transition: 'line-color 0.2s ease, width 0.2s ease',
          },
        },
        // HOVER EDGE (INSPECTOR LABEL)
        {
          selector: 'edge.edge-hover',
          style: {
            width: 4,
            'line-color': '#1E293B',
            'target-arrow-color': '#1E293B',
            label: 'data(label)',
            'font-family': 'Inter, system-ui, sans-serif',
            'font-size': 12,
            'font-weight': 700,
            color: '#0F172A',
            'text-rotation': 'autorotate',
            'text-background-color': '#FFFFFF',
            'text-background-opacity': 0.98,
            'text-background-padding': 5,
            'text-border-width': 1.5,
            'text-border-color': '#CBD5E1',
            'z-index': 25,
          },
        },
        // ACTIVE EDGE
        {
          selector: 'edge.active',
          style: {
            width: 3.5,
            'line-color': '#2563EB',
            'target-arrow-color': '#2563EB',
            opacity: 1,
          },
        },
        // DIMMED STATES FOR CLUSTER ISOLATION
        {
          selector: 'node.dimmed',
          style: { opacity: 0.15 },
        },
        {
          selector: 'edge.dimmed',
          style: { opacity: 0.05 },
        },
      ],
      layout: {
        name: 'preset',
        fit: true,
        padding: 50,
        animate: false,
      },
      wheelSensitivity: 0.2,
      minZoom: 0.2,
      maxZoom: 3,
    })

    // Interactions
    cy.on('tap', 'node', (event) => {
      const node = event.target
      onNodeSelect?.(node.id())
      cy.nodes().removeClass('dimmed anomaly-focused')
      cy.edges().removeClass('dimmed active')

      const neighborhood = node.closedNeighborhood()
      const connectedEdges = node.connectedEdges()
      cy.nodes().not(neighborhood).addClass('dimmed')
      connectedEdges.addClass('active')
    })

    cy.on('mouseover', 'edge', (event) => event.target.addClass('edge-hover'))
    cy.on('mouseout', 'edge', (event) => event.target.removeClass('edge-hover'))
    cy.on('mouseover', 'node', (event) => event.target.connectedEdges().addClass('edge-hover'))
    cy.on('mouseout', 'node', (event) => event.target.connectedEdges().removeClass('edge-hover'))

    cy.on('tap', (event) => {
      if (event.target === cy) {
        cy.nodes().removeClass('dimmed anomaly-focused')
        cy.edges().removeClass('dimmed active')
        onNodeSelect?.(null)
      }
    })

    const handleResize = () => cyRef.current?.resize()
    window.addEventListener('resize', handleResize)
    cyRef.current = cy

    return () => {
      window.removeEventListener('resize', handleResize)
      cy.destroy()
      cyRef.current = null
    }
  }, [graphData, onNodeSelect, isFullScreen])

  // ==========================================================
  // ROBUST ANOMALY FOCUS & ZOOM HANDLER
  // Matches by ID, Label/Name, or array of involved entities
  // ==========================================================
  useEffect(() => {
    if (!cyRef.current) return
    const cy = cyRef.current

    cy.nodes().unselect()
    cy.nodes().removeClass('dimmed anomaly-focused')
    cy.edges().removeClass('dimmed active')

    if (!selectedNodeId) return

    let targetNodes = cy.collection()
    const searchTargets = Array.isArray(selectedNodeId) ? selectedNodeId : [selectedNodeId]

    searchTargets.forEach((target) => {
      if (!target) return
      const strTarget = String(target).trim()

      // 1. Try matching by exact ID
      let matched = cy.getElementById(strTarget)

      // 2. If not found by ID, search by node label/name
      if (!matched || matched.length === 0) {
        matched = cy.nodes().filter((n) => {
          const lbl = String(n.data('label') || '').toLowerCase().trim()
          return lbl === strTarget.toLowerCase() || lbl.includes(strTarget.toLowerCase())
        })
      }

      if (matched && matched.length > 0) {
        targetNodes = targetNodes.union(matched)
      }
    })

    // If target nodes found, highlight and animate camera
    if (targetNodes.length > 0) {
      targetNodes.select()
      targetNodes.addClass('anomaly-focused')

      const neighborhood = targetNodes.closedNeighborhood()
      const connectedEdges = targetNodes.connectedEdges()

      // Dim everything else to isolate anomaly cluster
      cy.nodes().not(neighborhood).addClass('dimmed')
      connectedEdges.addClass('active')

      // Center and smoothly zoom camera onto the anomaly cluster
      if (targetNodes.length === 1) {
        cy.animate({
          center: { eles: targetNodes },
          zoom: 1.35,
          duration: 500,
          easing: 'ease-out-cubic',
        })
      } else {
        cy.animate({
          fit: {
            eles: neighborhood,
            padding: 70,
          },
          duration: 500,
          easing: 'ease-out-cubic',
        })
      }
    }
  }, [selectedNodeId])

  // Filter Entity Types
  useEffect(() => {
    if (!cyRef.current) return
    const cy = cyRef.current

    if (activeFilter === 'ALL') {
      cy.nodes().style('display', 'element')
      cy.edges().style('display', 'element')
    } else {
      cy.nodes().forEach((n) => {
        if (n.data('kind') === activeFilter || n.data('kind') === 'PERSON') {
          n.style('display', 'element')
        } else {
          n.style('display', 'none')
        }
      })
    }
  }, [activeFilter])

  // Toggle between Spread & Original
  const handleToggleSpread = () => {
    const nextSpread = !isSpread
    setIsSpread(nextSpread)
    runLayout(activeLayout, nextSpread)
  }

  // Handle Layout Mode Switch (Organic Physics vs Hierarchical Tree)
  const handleLayoutChange = (newLayout) => {
    setActiveLayout(newLayout)
    runLayout(newLayout, isSpread)
  }

  // Full Reset to default view & clear selection
  const handleFullReset = () => {
    if (!cyRef.current) return
    setIsSpread(false)
    setActiveLayout('cose')
    setActiveFilter('ALL')
    onNodeSelect?.(null)
    cyRef.current.nodes().removeClass('dimmed anomaly-focused').unselect()
    cyRef.current.edges().removeClass('dimmed active')
    runLayout('cose', false)
  }

  return (
    <div className={`relative bg-white flex flex-col w-full h-full ${isFullScreen ? 'rounded-none' : 'rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[580px]'}`}>
      {/* HEADER CONTROLS */}
      <div className="flex flex-wrap items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50/90 gap-2 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600 border border-blue-100">
            <Network size={18} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              Intelligence Network Graph
              {nodes.length > 0 && (
                <span className="text-[11px] font-medium text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                  {nodes.length} entities · {edges.length} links
                </span>
              )}
            </h2>
          </div>
        </div>

        {/* TOOLBAR */}
        <div className="flex items-center gap-2">
          {/* LAYOUT SELECTOR */}
          <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-slate-200 text-xs">
            <LayoutGrid size={12} className="text-slate-400" />
            <select
              value={activeLayout}
              onChange={(e) => handleLayoutChange(e.target.value)}
              className="bg-transparent text-xs font-medium text-slate-700 focus:outline-none cursor-pointer"
              title="Select Layout Structure"
            >
              <option value="cose">Organic Physics</option>
              <option value="breadthfirst">Hierarchical Tree</option>
            </select>
          </div>

          {/* FILTER DROPDOWN */}
          <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-slate-200 text-xs">
            <Filter size={12} className="text-slate-400" />
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="bg-transparent text-xs font-medium text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Types</option>
              {Object.keys(LABEL_COLORS).map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>

          <div className="h-4 w-[1px] bg-slate-200 mx-0.5" />

          {/* SPREAD / RESET TO ORIGINAL FORM BUTTON */}
          <button
            onClick={handleToggleSpread}
            title={isSpread ? 'Return nodes back to their exact original form' : 'Spread nodes out with high physics repulsion'}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
              isSpread
                ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
            }`}
          >
            {isSpread ? <Shrink size={13} /> : <Sparkles size={13} />}
            <span>{isSpread ? 'Reset Spacing' : 'Spread Nodes'}</span>
          </button>

          {/* ZOOM & VIEW CONTROLS */}
          <div className="flex items-center bg-white rounded-lg p-0.5 border border-slate-200">
            <button
              onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.25)}
              title="Zoom In"
              className="p-1 hover:bg-slate-100 rounded text-slate-600 transition cursor-pointer"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 0.8)}
              title="Zoom Out"
              className="p-1 hover:bg-slate-100 rounded text-slate-600 transition cursor-pointer"
            >
              <ZoomOut size={14} />
            </button>
            <button
              onClick={() => cyRef.current?.fit(undefined, 50)}
              title="Fit to Screen"
              className="p-1 hover:bg-slate-100 rounded text-slate-600 transition cursor-pointer"
            >
              <Maximize2 size={14} />
            </button>
            <button
              onClick={handleFullReset}
              title="Reset View to Original Form"
              className="p-1 hover:bg-slate-100 rounded text-slate-600 transition cursor-pointer"
            >
              <RotateCcw size={14} />
            </button>
          </div>

          <div className="h-4 w-[1px] bg-slate-200 mx-0.5" />

          {/* FULL SCREEN EXPAND / COLLAPSE BUTTON */}
          <button
            onClick={onToggleFullScreen}
            title={isFullScreen ? 'Exit Fullscreen (Esc)' : 'Expand Graph to Full Screen (Covers Entire Window)'}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
              isFullScreen
                ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 shadow-sm'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {isFullScreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            <span>{isFullScreen ? 'Exit Fullscreen' : 'Full Screen'}</span>
          </button>
        </div>
      </div>

      {/* GRAPH CANVAS */}
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', flex: 1 }}
        className="bg-slate-50/40 cursor-grab active:cursor-grabbing w-full h-full"
      />

      {/* FOOTER & LEGEND */}
      <div className="px-4 py-2.5 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between text-[11px] gap-2 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-semibold text-slate-400 text-[10px] uppercase">Legend:</span>
          {Object.entries(LABEL_COLORS).map(([label, color]) => (
            <span
              key={label}
              className="flex items-center gap-1 cursor-pointer hover:opacity-75"
              onClick={() => setActiveFilter(activeFilter === label ? 'ALL' : label)}
            >
              <span className="w-3 h-3 rounded-full shadow-xs" style={{ backgroundColor: color }} />
              <span className={`text-[11px] ${activeFilter === label ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
                {label}
              </span>
            </span>
          ))}
        </div>
        <div className="text-[10px] text-slate-400">
          {isFullScreen ? 'Full Window Mode Active (Press Esc to Exit)' : 'Click Full Screen for Full-Window Investigation'}
        </div>
      </div>
    </div>
  )
}