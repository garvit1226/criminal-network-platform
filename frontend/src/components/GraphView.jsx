import { useEffect, useRef, useState } from 'react'
import cytoscape from 'cytoscape'
import { Network, ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCcw, Filter, LayoutGrid } from 'lucide-react'

const LABEL_COLORS = {
  PERSON: '#2563EB',    // Vibrant Blue
  ORG: '#7C3AED',       // Deep Purple
  LOCATION: '#800020',  // Burgundy
  PHONE: '#EA580C',     // Bright Orange
  ACCOUNT: '#DB2777',   // Magenta
  VEHICLE: '#0D9488',   // Teal
  AMOUNT: '#CA8A04',    // Golden Amber
  DATE: '#64748B',      // Slate
}

// LARGE, HIGH-VISIBILITY NODE SIZES
const NODE_SIZES = {
  PERSON: 75,
  ORG: 60,
  LOCATION: 60,
  PHONE: 60,
  ACCOUNT: 60,
  VEHICLE: 60,
  AMOUNT: 60,
  DATE: 60,
}

// ==========================================================
// CALCULATE CLEAN INITIAL POSITIONS (Original Form)
// ==========================================================
function calculateOriginalPositions(nodes, edges, width = 1200, height = 800) {
  const positions = {}

  const people = nodes.filter(
    (node) => String(node.label || '').toUpperCase() === 'PERSON'
  )

  const entities = nodes.filter(
    (node) => String(node.label || '').toUpperCase() !== 'PERSON'
  )

  const CENTER_X = 600
  const CENTER_Y = 330
  const PERSON_DISTANCE_X = 430
  const PERSON_DISTANCE_Y = 205

  // ----------------------------------------------------------
  // 1. PEOPLE FIRST
  // People positions are NEVER changed by collision correction.
  // ----------------------------------------------------------
  if (people.length === 1) {
    positions[String(people[0].id)] = {
      x: CENTER_X,
      y: CENTER_Y,
    }
  } else if (people.length > 1) {
    people.forEach((person, index) => {
      const angle =
        (2 * Math.PI * index) / people.length - Math.PI / 2

      positions[String(person.id)] = {
        x: CENTER_X + PERSON_DISTANCE_X * Math.cos(angle),
        y: CENTER_Y + PERSON_DISTANCE_Y * Math.sin(angle),
      }
    })
  }

  // ----------------------------------------------------------
  // Helper: find people directly connected to a node.
  // ----------------------------------------------------------
  const getConnectedPeople = (nodeId) => {
    const peopleMap = new Map()

    edges.forEach((edge) => {
      const source = String(edge.source)
      const target = String(edge.target)

      let otherId = null

      if (source === nodeId) {
        otherId = target
      } else if (target === nodeId) {
        otherId = source
      }

      if (!otherId || !positions[otherId]) return

      const otherNode = nodes.find(
        (node) => String(node.id) === otherId
      )

      if (
        otherNode &&
        String(otherNode.label || '').toUpperCase() === 'PERSON'
      ) {
        peopleMap.set(otherId, positions[otherId])
      }
    })

    return [...peopleMap.values()]
  }

  const personEntityCount = new Map()

  // ----------------------------------------------------------
  // COLLISION CORRECTION
  //
  // Only NON-PERSON nodes are moved.
  // People positions remain untouched.
  //
  // If an entity is too close to an existing node, move it
  // slightly outward until there is enough space.
  // ----------------------------------------------------------
  // ----------------------------------------------------------
// COLLISION CORRECTION
//
// Checks BOTH:
//   1. Node-to-node collision
//   2. Node/label collision
//
// PERSON nodes are never moved.
// Only NON-PERSON entities are shifted.
// ----------------------------------------------------------
const resolveEntityCollision = (entityId, originalPosition) => {
  let x = originalPosition.x
  let y = originalPosition.y

  const entity = nodes.find(
    (node) => String(node.id) === String(entityId)
  )

  if (!entity) return { x, y }

  const entityKind = String(entity.label || '').toUpperCase()

  // Node dimensions from NODE_SIZES above
  const entitySize = NODE_SIZES[entityKind] || 56
  const entityRadius = entitySize / 2

  // Cytoscape label settings:
  // text-max-width = 130
  // text-margin-y = 8
  const LABEL_WIDTH = 130
  const LABEL_HEIGHT = 24
  const LABEL_GAP = 8

  // Extra breathing room between objects
  const GAP = 12

  // ----------------------------------------------------------
  // Build the occupied rectangular area of a node + its label
  // ----------------------------------------------------------
  const getOccupiedBox = (node, pos) => {
    const kind = String(node.label || '').toUpperCase()
    const size = NODE_SIZES[kind] || 56
    const radius = size / 2

    // Node bounds
    const nodeLeft = pos.x - radius
    const nodeRight = pos.x + radius
    const nodeTop = pos.y - radius
    const nodeBottom = pos.y + radius

    // Label is BELOW the node
    const labelLeft = pos.x - LABEL_WIDTH / 2
    const labelRight = pos.x + LABEL_WIDTH / 2
    const labelTop = pos.y + radius + LABEL_GAP
    const labelBottom = labelTop + LABEL_HEIGHT

    return {
      left: Math.min(nodeLeft, labelLeft),
      right: Math.max(nodeRight, labelRight),
      top: nodeTop,
      bottom: Math.max(nodeBottom, labelBottom),
    }
  }

  // ----------------------------------------------------------
  // Check whether candidate position overlaps another node
  // OR its label.
  // ----------------------------------------------------------
  const hasCollision = (candidateX, candidateY) => {
    const candidateBox = getOccupiedBox(
      entity,
      { x: candidateX, y: candidateY }
    )

    for (const [otherId, otherPosition] of Object.entries(positions)) {
      if (otherId === entityId) continue

      const otherNode = nodes.find(
        (node) => String(node.id) === String(otherId)
      )

      if (!otherNode) continue

      const otherBox = getOccupiedBox(
        otherNode,
        otherPosition
      )

      // Add a small safety gap
      if (
        candidateBox.right + GAP > otherBox.left &&
        candidateBox.left - GAP < otherBox.right &&
        candidateBox.bottom + GAP > otherBox.top &&
        candidateBox.top - GAP < otherBox.bottom
      ) {
        return true
      }
    }

    return false
  }

  // ----------------------------------------------------------
  // Try several directions until we find a clear position.
  // The original position remains the preferred position.
  // ----------------------------------------------------------
  if (!hasCollision(x, y)) {
    return { x, y }
  }

  const directions = [
    { x: 1, y: 0 },     // right
    { x: -1, y: 0 },    // left
    { x: 0, y: 1 },     // down
    { x: 0, y: -1 },    // up
    { x: 1, y: 1 },     // bottom-right
    { x: -1, y: 1 },    // bottom-left
    { x: 1, y: -1 },    // top-right
    { x: -1, y: -1 },   // top-left
  ]

  // Gradually increase distance from the original position
  for (let distance = 25; distance <= 250; distance += 15) {
    for (const direction of directions) {
      const candidateX =
        originalPosition.x + direction.x * distance

      const candidateY =
        originalPosition.y + direction.y * distance

      if (!hasCollision(candidateX, candidateY)) {
        return {
          x: candidateX,
          y: candidateY,
        }
      }
    }
  }

  // Fallback if no completely clear position was found
  return { x, y }
}

  // ----------------------------------------------------------
  // 2. NON-PERSON ENTITIES
  // ----------------------------------------------------------
  entities.forEach((entity) => {
    const entityId = String(entity.id)
    const connectedPeople = getConnectedPeople(entityId)

    let proposedPosition

    // --------------------------------------------------------
    // ISOLATED ENTITY
    // --------------------------------------------------------
    if (connectedPeople.length === 0) {
      const column = entities.indexOf(entity) % 6
      const row = Math.floor(entities.indexOf(entity) / 6)

      proposedPosition = {
        x: 120 + column * 190,
        y: 585 + row * 90,
      }

      positions[entityId] =
        resolveEntityCollision(entityId, proposedPosition)

      return
    }

    // --------------------------------------------------------
    // SHARED ENTITY
    // Connected to multiple people -> place at their center.
    // --------------------------------------------------------
    if (connectedPeople.length >= 2) {
      const avgX =
        connectedPeople.reduce(
          (sum, point) => sum + point.x,
          0
        ) / connectedPeople.length

      const avgY =
        connectedPeople.reduce(
          (sum, point) => sum + point.y,
          0
        ) / connectedPeople.length

      const sharedIndex = entities
        .slice(0, entities.indexOf(entity))
        .filter(
          (item) =>
            getConnectedPeople(String(item.id)).length >= 2
        ).length

      const offsetAngle = sharedIndex * 0.9
      const offsetRadius = 82

      proposedPosition = {
        x: avgX + offsetRadius * Math.cos(offsetAngle),
        y: avgY + offsetRadius * Math.sin(offsetAngle),
      }

      positions[entityId] =
        resolveEntityCollision(entityId, proposedPosition)

      return
    }

    // --------------------------------------------------------
    // SINGLE-PERSON ENTITY
    // Place it around its connected person.
    // --------------------------------------------------------
    const personPosition = connectedPeople[0]

    const connectedPerson = people.find(
      (person) =>
        positions[String(person.id)]?.x === personPosition.x &&
        positions[String(person.id)]?.y === personPosition.y
    )

    const personId = connectedPerson
      ? String(connectedPerson.id)
      : null

    const count = personId
      ? personEntityCount.get(personId) || 0
      : 0

    if (personId) {
      personEntityCount.set(personId, count + 1)
    }

    const slotAngle =
      count * (Math.PI / 3) - Math.PI / 2

    const ring =
      145 + Math.floor(count / 6) * 75

    const ringX = ring * 1.30
    const ringY = ring * 0.88

    proposedPosition = {
      x:
        personPosition.x +
        ringX * Math.cos(slotAngle),

      y:
        personPosition.y +
        ringY * Math.sin(slotAngle),
    }

    // Only the entity is shifted if it collides.
    positions[entityId] =
      resolveEntityCollision(entityId, proposedPosition)
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

  const nodes = graphData?.nodes || []
  const edges = graphData?.edges || []
  const personCount = nodes.filter(
    (n) => String(n.label || '').toUpperCase() === 'PERSON'
  ).length

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
  const runLayout = (layoutMode) => {
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
        spacingFactor: 1.4,
        avoidOverlap: true,
        roots: undefined,
      }).run()
      return
    }

    // Organic Physics / Preset Layout
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

  // Handle Layout Mode Switch (Organic Physics vs Hierarchical Tree)
  const handleLayoutChange = (newLayout) => {
    if (!cyRef.current) return

    setActiveLayout(newLayout)

    // ==============================
    // HIERARCHICAL TREE
    // ==============================
    if (newLayout === 'breadthfirst') {
      runLayout('breadthfirst')
      return
    }

    // ==============================
    // ORGANIC PHYSICS
    // ==============================
    if (newLayout === 'cose') {
      const cy = cyRef.current

      // Get current graph/container dimensions
      const width = cy.width()
      const height = cy.height()

      // Recalculate the ORIGINAL smart positions
      const newOriginalPositions = calculateOriginalPositions(
        nodes,
        edges,
        width,
        height
      )

      // Save the newly calculated positions
      initialPositionsRef.current = newOriginalPositions

      // Apply those positions directly
      cy.nodes().forEach((node) => {
        const position = newOriginalPositions[node.id()]

        if (position) {
          node.position({
            x: position.x,
            y: position.y,
          })
        }
      })

      // Fit graph nicely inside the canvas
      cy.animate({
        fit: {
          eles: cy.elements(),
          padding: 50,
        },
        duration: 650,
        easing: 'ease-in-out-cubic',
      })

      return
    }
  }

  // Full Reset to default view & clear selection
  const handleFullReset = () => {
    if (!cyRef.current) return
    setActiveLayout('cose')
    setActiveFilter('ALL')
    onNodeSelect?.(null)
    cyRef.current.nodes().removeClass('dimmed anomaly-focused').unselect()
    cyRef.current.edges().removeClass('dimmed active')
    runLayout('cose')
  }

  return (
    <div
      className={`relative flex flex-col w-full h-full transition-all duration-300 ease-out ${
        isFullScreen
          ? 'rounded-none border-none shadow-none bg-[#F1F5F9]'
          : 'group rounded-2xl border border-slate-300/80 bg-[#F1F5F9] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] overflow-hidden min-h-[580px] hover:border-indigo-500 hover:shadow-[0_14px_38px_-6px_rgba(99,102,241,0.22)] hover:-translate-y-0.5'
      }`}
    >
      {/* Top Accent Gradient Line (Shown when not fullscreen) */}
      {!isFullScreen && (
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-400 opacity-80 group-hover:opacity-100 transition-opacity z-10" />
      )}

      {/* HEADER CONTROLS */}
      <div className="flex flex-wrap items-center justify-between px-5 py-3 border-b border-slate-200/90 bg-slate-200/40 gap-2 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-gradient-to-br from-indigo-50 to-violet-50/80 rounded-xl text-indigo-600 border border-indigo-200/60 shadow-xs group-hover:scale-105 transition-transform">
            <Network size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Intelligence Network Graph
              </h2>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200/80 shadow-xs flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  <span className="font-extrabold">{personCount}</span> {personCount === 1 ? 'Person' : 'Persons'}
                </span>
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200/80 shadow-xs flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  <span className="font-extrabold">{nodes.length}</span> Entities
                </span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/80 shadow-xs flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="font-extrabold">{edges.length}</span> Relations
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* TOOLBAR */}
        <div className="flex items-center gap-2">
          {/* LAYOUT SELECTOR */}
          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-xs text-xs">
            <LayoutGrid size={13} className="text-indigo-500" />
            <select
              value={activeLayout}
              onChange={(e) => handleLayoutChange(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
              title="Select Layout Structure"
            >
              <option value="cose">Organic Physics</option>
              <option value="breadthfirst">Hierarchical Tree</option>
            </select>
          </div>

          {/* FILTER DROPDOWN */}
          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-xs text-xs">
            <Filter size={13} className="text-indigo-500" />
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Types</option>
              {Object.keys(LABEL_COLORS).map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>



          {/* ZOOM & VIEW CONTROLS */}
          <div className="flex items-center bg-white rounded-xl p-0.5 border border-slate-200 shadow-xs">
            <button
              onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.25)}
              title="Zoom In"
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition cursor-pointer"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 0.8)}
              title="Zoom Out"
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition cursor-pointer"
            >
              <ZoomOut size={14} />
            </button>
            <button
              onClick={() => cyRef.current?.fit(undefined, 50)}
              title="Fit to Screen"
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition cursor-pointer"
            >
              <Maximize2 size={14} />
            </button>
            <button
              onClick={handleFullReset}
              title="Reset View to Original Form"
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition cursor-pointer"
            >
              <RotateCcw size={14} />
            </button>
          </div>

          <div className="h-5 w-[1px] bg-slate-200 mx-0.5" />

          {/* FULL SCREEN EXPAND / COLLAPSE BUTTON */}
          <button
            onClick={onToggleFullScreen}
            title={isFullScreen ? 'Exit Fullscreen (Esc)' : 'Expand Graph to Full Screen (Covers Entire Window)'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 cursor-pointer shadow-xs ${
              isFullScreen
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-600 hover:from-blue-700 hover:to-indigo-700 shadow-sm'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {isFullScreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            <span>{isFullScreen ? 'Exit Fullscreen' : 'Full Screen'}</span>
          </button>
        </div>
      </div>

      {/* GRAPH CANVAS WITH EMPTY STATE OVERLAY */}
      <div className="relative w-full h-full flex-1 overflow-hidden">
        <div
          ref={containerRef}
          style={{ width: '100%', height: '100%' }}
          className="bg-slate-50/30 cursor-grab active:cursor-grabbing w-full h-full"
        />

        {/* EMPTY STATE: Shown until a report is submitted */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-100/80 backdrop-blur-[2px] p-6 text-center select-none">
            <div className="w-16 h-16 rounded-3xl bg-white border border-slate-200/90 shadow-md flex items-center justify-center text-indigo-500 mb-4">
              <Network size={32} className="stroke-[1.75]" />
            </div>
            <h3 className="text-base font-bold text-slate-800 tracking-tight mb-1">
              Awaiting Incident Report
            </h3>
            <p className="text-xs text-slate-500 max-w-md leading-relaxed">
              No criminal network active yet. Submit an FIR or incident report narrative in the left panel to extract entities, analyze relationships, and generate the intelligence network graph.
            </p>
          </div>
        )}
      </div>

      {/* FOOTER & LEGEND */}
      <div className="px-5 py-2.5 border-t border-slate-200/90 bg-slate-100/90 flex flex-wrap items-center justify-between text-[11px] gap-2 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-extrabold text-slate-400 text-[10px] tracking-wider uppercase">Entity Legend:</span>
          {Object.entries(LABEL_COLORS).map(([label, color]) => (
            <span
              key={label}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md cursor-pointer transition-all ${
                activeFilter === label
                  ? 'bg-slate-100 shadow-xs ring-1 ring-slate-300'
                  : 'hover:bg-slate-50'
              }`}
              onClick={() => setActiveFilter(activeFilter === label ? 'ALL' : label)}
            >
              <span className="w-2.5 h-2.5 rounded-full shadow-xs" style={{ backgroundColor: color }} />
              <span className={`text-[11px] ${activeFilter === label ? 'font-bold text-slate-900' : 'font-medium text-slate-600'}`}>
                {label}
              </span>
            </span>
          ))}
        </div>
        <div className="text-[10.5px] font-medium text-slate-400">
          {isFullScreen ? 'Full Window Mode Active (Press Esc to Exit)' : 'Click Full Screen for Expanded Investigation'}
        </div>
      </div>
    </div>
  )
}