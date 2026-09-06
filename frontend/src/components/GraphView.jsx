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
// PERSON nodes are plain circles, just bigger than everything else.
// Every other entity kind is a fixed 36px circle.
const PERSON_NODE_HEIGHT = 42
const ENTITY_NODE_SIZE = 36

const NODE_SIZES = {
  PERSON: PERSON_NODE_HEIGHT,
  ORG: ENTITY_NODE_SIZE,
  LOCATION: ENTITY_NODE_SIZE,
  PHONE: ENTITY_NODE_SIZE,
  ACCOUNT: ENTITY_NODE_SIZE,
  VEHICLE: ENTITY_NODE_SIZE,
  AMOUNT: ENTITY_NODE_SIZE,
  DATE: ENTITY_NODE_SIZE,
}

// ==========================================================
// COLLISION-SAFE GRAPH LAYOUT
//
// STEP 1 — PERSON nodes are placed evenly around the rim of an
// OVAL (ellipse) that fills the graph window, so the ring of
// suspects/witnesses forms the visual backbone of the graph.
//
// STEP 2 — every other entity is then placed near its connected
// PERSON node(s): pushed outward along that person's own spot on
// the oval if it belongs to one person, or at the midpoint if it
// belongs to several. Unconnected entities fall into a row below.
//
// The whole thing is calculated in a larger virtual coordinate
// space than the visible canvas; Cytoscape fits that space into
// the graph window afterwards, so nothing gets squeezed back
// together to make room.
// ==========================================================
function calculateOriginalPositions(nodes, edges, width = 1200, height = 780) {
  const positions = {}

  if (!nodes.length) return positions

  const kindOf = (node) =>
    String(node?.label || 'ENTITY').toUpperCase()

  const people = nodes.filter(
    (node) => kindOf(node) === 'PERSON'
  )

  const entities = nodes.filter(
    (node) => kindOf(node) !== 'PERSON'
  )

  // ---------------------------------------------------------
  // SAFETY MARGINS
  // ---------------------------------------------------------

  const marginX = 110
  const marginY = 95

  // ---------------------------------------------------------
  // FIND PERSON CONNECTIONS
  // ---------------------------------------------------------

  const getConnectedPeople = (entityId) => {
    const result = []

    edges.forEach((edge) => {
      const source = String(edge.source)
      const target = String(edge.target)

      let other = null

      if (source === entityId) {
        other = target
      } else if (target === entityId) {
        other = source
      }

      if (!other) return

      const node = nodes.find(
        (n) => String(n.id) === other
      )

      if (node && kindOf(node) === 'PERSON') {
        result.push(other)
      }
    })

    return [...new Set(result)]
  }

  // ---------------------------------------------------------
  // 1. PERSON NODES — evenly spaced around an OVAL ring
  // ---------------------------------------------------------

  const n = people.length

  // Minimum centre-to-centre distance between two adjacent people
  // on the ring. Generous enough for the 42px circle PLUS its name
  // label underneath PLUS the entities that will fan out from it —
  // but no more than that, so the graph doesn't balloon in size.
  const MIN_PERSON_SPACING = 170

  let ovalRadiusX = 0
  let ovalRadiusY = 0

  if (n > 1) {
    // Radius of a plain circle of n evenly-spaced points whose
    // adjacent chord length is at least MIN_PERSON_SPACING.
    const baseRadius = MIN_PERSON_SPACING / (2 * Math.sin(Math.PI / n))

    // Stretch that circle into a landscape OVAL (wider than tall)
    // to suit a typical rectangular graph window — a mild stretch,
    // not an exaggerated one.
    ovalRadiusX = Math.max(baseRadius * 1.15, (width - marginX * 2) / 2)
    ovalRadiusY = Math.max(baseRadius * 0.72, (height - marginY * 2) / 2)
  }

  const W = n > 1
    ? ovalRadiusX * 2 + marginX * 2
    : Math.max(width, 700)

  const H = n > 1
    ? ovalRadiusY * 2 + marginY * 2
    : Math.max(height, 500)

  const ovalCenterX = W / 2
  const ovalCenterY = H / 2

  if (n === 1) {
    positions[String(people[0].id)] = { x: ovalCenterX, y: ovalCenterY }
  } else if (n > 1) {
    people.forEach((person, index) => {
      // Start at the top (-90°) and go clockwise around the oval.
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / n

      positions[String(person.id)] = {
        x: ovalCenterX + ovalRadiusX * Math.cos(angle),
        y: ovalCenterY + ovalRadiusY * Math.sin(angle),
      }
    })
  }

  // ---------------------------------------------------------
  // 2. ENTITY NODES
  //
  // Entities are placed near their connected PERSON node(s).
  // ---------------------------------------------------------

  const entityCounters = new Map()

  // Entities that connect the SAME set of people (e.g. two different
  // "state" or "vehicle" entities both linking the same two suspects)
  // all want to sit at the same midpoint. Group them up front so they
  // can be spaced evenly around that midpoint instead of colliding.
  const multiPersonGroups = new Map()

  entities.forEach((entity) => {
    const cp = getConnectedPeople(String(entity.id))
    if (cp.length > 1) {
      const key = [...cp].sort().join('|')
      if (!multiPersonGroups.has(key)) multiPersonGroups.set(key, [])
      multiPersonGroups.get(key).push(String(entity.id))
    }
  })

  entities.forEach((entity) => {
    const entityId = String(entity.id)

    const connectedPeople =
      getConnectedPeople(entityId)

    let x
    let y

    // -------------------------------------------------------
    // ENTITY CONNECTED TO ONE PERSON
    // Push it OUTWARD from the oval, through that person's own
    // position, and fan multiple entities sideways along the
    // tangent so they don't stack directly on top of each other.
    // -------------------------------------------------------

    if (connectedPeople.length === 1) {
      const personId = connectedPeople[0]
      const personPos = positions[personId]

      const count =
        entityCounters.get(personId) || 0

      entityCounters.set(
        personId,
        count + 1
      )

      // Outward unit vector from the oval's centre through the person.
      let dirX = personPos.x - ovalCenterX
      let dirY = personPos.y - ovalCenterY
      const dirLen = Math.hypot(dirX, dirY) || 1
      dirX /= dirLen
      dirY /= dirLen

      // Fall back to "downward" when there's no ring to radiate from
      // (a single, centred person).
      if (n <= 1) {
        dirX = 0
        dirY = 1
      }

      // Tangent (perpendicular) vector, used to fan entities sideways.
      const perpX = -dirY
      const perpY = dirX

      const slot = count % 2          // left / right lane — fewer per
                                       // ring means more room per label
      const ring = Math.floor(count / 2) // pushed further out each lap

      const radialDist =
        PERSON_NODE_HEIGHT / 2 +
        ENTITY_NODE_SIZE +
        62 +
        ring * 105

      const lateralOffset = (slot === 0 ? -1 : 1) * (ENTITY_NODE_SIZE + 88)

      x =
        personPos.x +
        dirX * radialDist +
        perpX * lateralOffset

      y =
        personPos.y +
        dirY * radialDist +
        perpY * lateralOffset
    }

    // -------------------------------------------------------
    // ENTITY CONNECTED TO MULTIPLE PEOPLE
    // Put it between the people.
    // -------------------------------------------------------

    else if (connectedPeople.length > 1) {
      const points = connectedPeople
        .map((id) => positions[id])
        .filter(Boolean)

      const centerX =
        points.reduce(
          (sum, p) => sum + p.x,
          0
        ) / points.length

      const centerY =
        points.reduce(
          (sum, p) => sum + p.y,
          0
        ) / points.length

      // Evenly fan out entities that share this exact same group of
      // connected people, so they never start out stacked on the
      // same spot.
      const groupKey = [...connectedPeople].sort().join('|')
      const group = multiPersonGroups.get(groupKey) || [entityId]
      const groupSize = group.length
      const indexInGroup = Math.max(group.indexOf(entityId), 0)

      const slot = indexInGroup % 4
      const ring = Math.floor(indexInGroup / 4)

      const angle =
        groupSize > 1
          ? (slot * 2 * Math.PI) / Math.min(groupSize, 4)
          : 0

      const radius = ENTITY_NODE_SIZE + 90 + ring * 100

      x =
        centerX +
        Math.cos(angle) * radius

      y =
        centerY +
        Math.sin(angle) * radius
    }

    // -------------------------------------------------------
    // ISOLATED ENTITY
    // -------------------------------------------------------

    else {
      const index =
        entities.indexOf(entity)

      const cols = 5

      const col = index % cols
      const row = Math.floor(index / cols)

      x =
        marginX +
        col * ((W - marginX * 2) / (cols - 1))

      y =
        H - 55 -
        row * 55
    }

    // -------------------------------------------------------
    // KEEP ENTITY INSIDE THE VIRTUAL GRAPH AREA
    // -------------------------------------------------------

    x = Math.max(
      45,
      Math.min(W - 45, x)
    )

    y = Math.max(
      45,
      Math.min(H - 45, y)
    )

    positions[entityId] = {
      x,
      y,
    }
  })

  return positions
}

// ==========================================================
// HARD NODE + LABEL COLLISION SOLVER
// ==========================================================
// PERSON nodes are fixed anchors (they never move).
// Non-PERSON nodes are pushed away until their full bounding
// box (circle + label pill) no longer overlaps any other
// node or label. A larger gap is used when the fixed node is
// a PERSON so entities never sit under a person name.
// ==========================================================

const isPersonNode = (node) =>
  String(node.data('kind') || '').toUpperCase() === 'PERSON'

const getCollisionBox = (node) =>
  node.boundingBox({
    includeLabels: true,
    includeOverlays: false,
  })

const boxesOverlap = (a, b, gap = 20) => {
  const overlapX =
    Math.min(a.x2, b.x2) -
    Math.max(a.x1, b.x1) +
    gap

  const overlapY =
    Math.min(a.y2, b.y2) -
    Math.max(a.y1, b.y1) +
    gap

  return {
    collision: overlapX > 0 && overlapY > 0,
    overlapX,
    overlapY,
  }
}

function resolveNodeCollisions(cy) {
  if (!cy) return

  const nodes = cy.nodes().filter((n) => n.visible())
  if (nodes.length < 2) return

  const GAP_NORMAL = 24
  const GAP_PERSON = 38   // extra clearance around person + its label

  // ---------- main separation (radial push) ----------
  for (let iteration = 0; iteration < 380; iteration++) {
    let collisionFound = false

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]

      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]

        const aPerson = isPersonNode(a)
        const bPerson = isPersonNode(b)

        // Persons are fixed anchors – never move them relative to each other
        if (aPerson && bPerson) continue

        const gap = (aPerson || bPerson) ? GAP_PERSON : GAP_NORMAL
        const result = boxesOverlap(
          getCollisionBox(a),
          getCollisionBox(b),
          gap
        )

        if (!result.collision) continue

        collisionFound = true

        // The non-person always moves; if both are non-person, move b
        const moving = aPerson ? b : bPerson ? a : b
        const fixed  = aPerson ? a : bPerson ? b : a

        const p = moving.position()
        const q = fixed.position()

        let dx = p.x - q.x
        let dy = p.y - q.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001

        if (dist < 1) {
          const angle = (i + j + iteration) * 2.399963
          dx = Math.cos(angle)
          dy = Math.sin(angle)
        } else {
          dx /= dist
          dy /= dist
        }

        // Push far enough to clear the overlap + a little extra
        const extra = (aPerson || bPerson) ? 20 : 12
        const push = Math.max(result.overlapX, result.overlapY) + extra

        moving.position({
          x: p.x + dx * push,
          y: p.y + dy * push,
        })
      }
    }

    if (!collisionFound) break
  }

  // ---------- final cleanup (slightly tighter gap) ----------
  for (let pass = 0; pass < 80; pass++) {
    let found = false

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]

      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]

        const aPerson = isPersonNode(a)
        const bPerson = isPersonNode(b)
        if (aPerson && bPerson) continue

        const gap = (aPerson || bPerson) ? 28 : 14
        const result = boxesOverlap(
          getCollisionBox(a),
          getCollisionBox(b),
          gap
        )

        if (!result.collision) continue

        found = true

        const moving = aPerson ? b : a
        const fixed  = aPerson ? a : b

        const p = moving.position()
        const q = fixed.position()

        let dx = p.x - q.x
        let dy = p.y - q.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001

        if (dist < 1) {
          const angle = (i + j + pass) * 2.399963
          dx = Math.cos(angle)
          dy = Math.sin(angle)
        } else {
          dx /= dist
          dy /= dist
        }

        const push = Math.max(result.overlapX, result.overlapY) +
          ((aPerson || bPerson) ? 18 : 12)

        moving.position({
          x: p.x + dx * push,
          y: p.y + dy * push,
        })
      }
    }

    if (!found) break
  }
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
          cyRef.current.fit(undefined, isFullScreen ? 90 : 80)
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

    // Organic Physics uses the collision-safe calculated positions.
    // Do not run another force layout here: a second force pass can
    // pull labels/nodes back together after our collision solver.
    cyRef.current.layout({
      name: 'preset',

      positions: (node) =>
        initialPositionsRef.current[node.id()] ||
        node.position(),

      animate: true,
      animationDuration: 500,

      fit: false,

      padding: 35,

      // Do not run another force simulation after our smart positions.
      avoidOverlap: false,

      easing: 'ease-in-out-cubic',
    }).run(() => {
      const cy = cyRef.current
      if (!cy) return

      // Wait for Cytoscape to render labels before measuring them.
      requestAnimationFrame(() => {
        resolveNodeCollisions(cy)

        // Fit with comfortable padding so the whole oval + labels
        // are visible without feeling cramped or overly zoomed-out.
        cy.fit(cy.nodes(), 80)

        // Verify once more after the camera transform.
        requestAnimationFrame(() => {
          resolveNodeCollisions(cy)
          cy.fit(cy.nodes(), 80)
        })
      })
    });
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
            shape: 'ellipse',
            width: (ele) => NODE_SIZES[ele.data('kind')] || ENTITY_NODE_SIZE,
            height: (ele) => NODE_SIZES[ele.data('kind')] || ENTITY_NODE_SIZE,
            label: 'data(label)',
            color: '#0F172A',
            'font-family': 'Inter, system-ui, -apple-system, sans-serif',
            'font-size': 11,
            'font-weight': 600,
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 7,
            'text-max-width': 190,
            'text-wrap': 'wrap',
            // HIGH-CONTRAST BADGE PILL BACKGROUND FOR NAKED-EYE READABILITY
            'text-background-color': '#FFFFFF',
            'text-background-opacity': 0.96,
            'text-background-padding': 3,
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
        // KEY SUSPECT / PERSON NODE — same circular shape as everything
        // else, just bigger (42px) and bolder, with its name in a pill
        // underneath like every other node.
        {
          selector: 'node[kind="PERSON"]',
          style: {
            'font-size': 13,
            'font-weight': 700,
            'border-width': 3.5,
            'border-color': '#FFFFFF',
            'text-border-color': '#93C5FD',
            'text-background-color': '#F8FAFC',
            'shadow-blur': 12,
            'shadow-color': 'rgba(37,99,235,0.3)',
            'z-index': 15,
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
        fit: false,
        padding: 35,
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
          zoom: 1.2,
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

      // Resolve node + label collisions before fitting.
      requestAnimationFrame(() => {
        resolveNodeCollisions(cy)

        cy.animate({
          fit: {
            eles: cy.nodes(),
            padding: 80,
          },
          duration: 500,
          easing: 'ease-in-out-cubic',
          complete: () => {
            requestAnimationFrame(() => {
              resolveNodeCollisions(cy)
              cy.fit(cy.nodes(), 80)
            })
          },
        })
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
              onClick={() => cyRef.current?.fit(undefined, 80)}
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