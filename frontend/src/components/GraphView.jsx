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

// BALANCED, CLEAN NODE SIZES
const NODE_SIZES = {
  PERSON: 38,
  ORG: 26,
  LOCATION: 26,
  PHONE: 26,
  ACCOUNT: 26,
  VEHICLE: 26,
  AMOUNT: 26,
  DATE: 26,
}

// Helper to compute space occupied by a relationship
export function getRelationshipSpace(relType) {
  const text = String(relType || 'RELATES').trim()
  const labelWidth = Math.max(55, text.length * 8 + 26)
  const labelHeight = 26
  // Total span required between node surfaces for label + arrow + clearance
  const minSpan = labelWidth + 70
  return {
    label: text,
    labelWidth,
    labelHeight,
    minSpan,
  }
}

// ==========================================================
// COMPACT, BALANCED GRAPH LAYOUT
//
// 1. Distance between connected entities is dynamically assumed by
//    the space occupied by their relationship label + node bounds.
// 2. Shared entities are arched perpendicularly away from the direct
//    corridor between suspects so the relation name is NEVER overlapped!
// ==========================================================
function calculateOriginalPositions(nodes, edges, width = 850, height = 600) {
  const positions = {}

  if (!nodes || !nodes.length) return positions

  const kindOf = (node) =>
    String(node?.label || node?.data?.('kind') || 'ENTITY').toUpperCase()

  const people = nodes.filter(
    (node) => kindOf(node) === 'PERSON'
  )

  const entities = nodes.filter(
    (node) => kindOf(node) !== 'PERSON'
  )

  // ---------------------------------------------------------
  // 1. WIDESCREEN-ALIGNED GRID GEOMETRY
  // Adapts column count to match the 1.8:1 - 2:1 landscape graph container
  // ---------------------------------------------------------
  const peopleCount = people.length
  let cols
  if (peopleCount <= 1) {
    cols = 1
  } else if (peopleCount === 2) {
    cols = 2
  } else if (peopleCount === 3) {
    cols = 3
  } else if (peopleCount <= 6) {
    cols = 3
  } else if (peopleCount <= 10) {
    cols = 4
  } else if (peopleCount <= 16) {
    cols = 5
  } else {
    cols = 6
  }

  const rows = Math.ceil(Math.max(1, peopleCount) / cols)

  // ---------------------------------------------------------
  // 2. RELATIONSHIP-AWARE PERSON-TO-PERSON SPACING
  // Distance between connected suspects is directly assumed by the
  // space occupied by their relationship label + clearance
  // ---------------------------------------------------------
  let maxDirectRelWidth = 60
  edges.forEach((e) => {
    const isSourcePerson = people.some((p) => String(p.id) === String(e.source))
    const isTargetPerson = people.some((p) => String(p.id) === String(e.target))
    if (isSourcePerson && isTargetPerson) {
      const relSpace = getRelationshipSpace(e.type)
      if (relSpace.labelWidth > maxDirectRelWidth) {
        maxDirectRelWidth = relSpace.labelWidth
      }
    }
  })

  let personSpacingX
  let personSpacingY

  if (peopleCount <= 2) {
    // Generous breathing room between 2 suspects assuming relationship space
    personSpacingX = Math.max(400, maxDirectRelWidth + 240)
    personSpacingY = 250
  } else if (peopleCount === 3) {
    personSpacingX = Math.max(360, maxDirectRelWidth + 220)
    personSpacingY = 240
  } else if (peopleCount <= 6) {
    personSpacingX = Math.max(340, maxDirectRelWidth + 200)
    personSpacingY = 230
  } else if (peopleCount <= 10) {
    personSpacingX = Math.max(320, maxDirectRelWidth + 180)
    personSpacingY = 225
  } else {
    // 11+ people: balanced ~310px x 220px
    personSpacingX = Math.max(310, maxDirectRelWidth + 160)
    personSpacingY = 220
  }

  const marginX = 140
  const marginY = 110

  const gridW = cols <= 1 ? 0 : (cols - 1) * personSpacingX
  const gridH = rows <= 1 ? 0 : (rows - 1) * personSpacingY

  const W = Math.max(width || 850, gridW + marginX * 2)
  const H = Math.max(height || 600, gridH + marginY * 2)

  // Perfectly center the suspect constellation in the workspace
  const startX = (W - gridW) / 2
  const startY = (H - gridH) / 2 - 10

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

      const node = nodes.find((n) => String(n.id) === other)
      if (node && kindOf(node) === 'PERSON') {
        result.push(other)
      }
    })

    return [...new Set(result)]
  }

  // ---------------------------------------------------------
  // 1. POSITION PERSON NODES (Evenly spaced & centered)
  // ---------------------------------------------------------
  if (people.length > 0) {
    people.forEach((person, index) => {
      const row = Math.floor(index / cols)
      const col = index % cols

      positions[String(person.id)] = {
        x: cols === 1 ? W / 2 : startX + col * personSpacingX,
        y: rows === 1 ? H / 2 - 10 : startY + row * personSpacingY,
      }
    })
  }

  // ---------------------------------------------------------
  // 2. GROUP ENTITIES BY PERSON
  // ---------------------------------------------------------
  const personSatellites = new Map()
  people.forEach((p) => personSatellites.set(String(p.id), []))

  const multiPersonEntities = []
  const isolatedEntities = []

  entities.forEach((entity) => {
    const connectedPeople = getConnectedPeople(String(entity.id))
    if (connectedPeople.length === 1) {
      const pId = connectedPeople[0]
      if (personSatellites.has(pId)) {
        personSatellites.get(pId).push(entity)
      } else {
        isolatedEntities.push(entity)
      }
    } else if (connectedPeople.length > 1) {
      multiPersonEntities.push({ entity, connectedPeople })
    } else {
      isolatedEntities.push(entity)
    }
  })

  // ---------------------------------------------------------
  // 3. RADIAL SATELLITE PLACEMENT
  // Distance from suspect is ASSUMED BY THE SPACE OCCUPIED BY
  // THE RELATIONSHIP LABEL (so the relation name never clips)
  // ---------------------------------------------------------
  personSatellites.forEach((satellites, personId) => {
    const personPos = positions[personId]
    if (!personPos) return

    const count = satellites.length
    if (count === 0) return

    // Collect angles to other connected people to avoid pointing satellites into person-person corridors
    const neighborPersonAngles = []
    edges.forEach((e) => {
      let otherId = null
      if (String(e.source) === personId) otherId = String(e.target)
      else if (String(e.target) === personId) otherId = String(e.source)

      if (otherId && people.some((p) => String(p.id) === otherId)) {
        const nPos = positions[otherId]
        if (nPos) {
          neighborPersonAngles.push(Math.atan2(nPos.y - personPos.y, nPos.x - personPos.x))
        }
      }
    })

    satellites.forEach((satEntity, idx) => {
      // Find the specific edge connecting this satellite to the person
      const edge = edges.find(
        (e) =>
          (String(e.source) === personId && String(e.target) === String(satEntity.id)) ||
          (String(e.target) === personId && String(e.source) === String(satEntity.id))
      )
      const relSpace = getRelationshipSpace(edge?.type)

      // Radius is directly proportional to relationship space
      const baseRadius = Math.max(105, 34 + relSpace.labelWidth * 0.72 + (count > 5 && idx % 2 === 1 ? 24 : 10))

      let angle = (idx / count) * 2 * Math.PI - Math.PI / 2

      // If angle is pointing along a corridor between this person and another suspect, deflect it
      for (const nAngle of neighborPersonAngles) {
        let diff = Math.abs(angle - nAngle)
        while (diff > Math.PI) diff = Math.abs(diff - 2 * Math.PI)
        if (diff < 0.45) {
          angle += 0.52 // Deflect out of the person-to-person corridor
        }
      }

      const x = personPos.x + Math.cos(angle) * baseRadius
      const y = personPos.y + Math.sin(angle) * (baseRadius * 0.88)

      positions[String(satEntity.id)] = { x, y }
    })
  })

  // ---------------------------------------------------------
  // 4. MULTI-PERSON CONNECTED ENTITIES
  // ARCHED PERPENDICULARLY AWAY from the direct person-person line
  // so the relation name in between is NEVER overlapped by an entity!
  // ---------------------------------------------------------
  multiPersonEntities.forEach(({ entity, connectedPeople }, idx) => {
    const points = connectedPeople
      .map((id) => positions[id])
      .filter(Boolean)

    if (points.length === 0) {
      positions[String(entity.id)] = { x: W / 2, y: H / 2 }
      return
    }

    if (points.length === 1) {
      positions[String(entity.id)] = { x: points[0].x, y: points[0].y + 120 }
      return
    }

    const pA = points[0]
    const pB = points[1]
    const mx = (pA.x + pB.x) / 2
    const my = (pA.y + pB.y) / 2

    const dx = pB.x - pA.x
    const dy = pB.y - pA.y
    const len = Math.hypot(dx, dy) || 1

    // Perpendicular unit vector to the line connecting Person A and Person B
    const nx = -dy / len
    const ny = dx / len

    // Alternate above and below the line with generous clearance (100px - 145px)
    const side = idx % 2 === 0 ? 1 : -1
    const offsetDist = 100 + (Math.floor(idx / 2) * 32)

    positions[String(entity.id)] = {
      x: mx + nx * offsetDist * side,
      y: my + ny * offsetDist * side,
    }
  })

  // ---------------------------------------------------------
  // 5. ISOLATED ENTITIES
  // Placed in a neat row comfortably below all suspect constellations
  // ---------------------------------------------------------
  if (isolatedEntities.length > 0) {
    const maxPersonY = Object.values(positions).reduce(
      (max, p) => Math.max(max, p.y),
      startY
    )
    const isoCols = Math.min(isolatedEntities.length, 6)
    const isoSpacingX = 140
    const isoGridW = (isoCols - 1) * isoSpacingX
    const isoStartX = (W - isoGridW) / 2
    const isoBaseY = maxPersonY + 115

    isolatedEntities.forEach((entity, idx) => {
      const col = idx % isoCols
      const row = Math.floor(idx / isoCols)

      positions[String(entity.id)] = {
        x: isoCols <= 1 ? W / 2 : isoStartX + col * isoSpacingX,
        y: isoBaseY + row * 55,
      }
    })
  }

  return positions
}

// ==========================================================
// COLLISION RESOLUTION: SHIFT NON-PERSON NODES ON COLLISION
// ==========================================================
// PERSON nodes are priority anchor nodes (suspects).
// When any 2 nodes collide:
// - If one is PERSON and one is NON-PERSON: the NON-PERSON node is shifted away!
// - If both are NON-PERSON: one non-person node (or stationary one) is shifted away!
// - PERSON nodes remain anchored in place.
// ==========================================================

export const isPersonNode = (node) => {
  if (!node) return false
  const kind = node.data
    ? (node.data('kind') || node.data('entityType') || '')
    : (node.label || node.kind || '')
  return String(kind).toUpperCase() === 'PERSON'
}

export const getNodeBoundingBox = (node, padding = 8) => {
  const pos = node.position()
  const isPerson = isPersonNode(node)
  const defaultRadius = isPerson ? 20 : 14
  const defaultHeight = isPerson ? 44 : 34
  const defaultWidth = isPerson ? 75 : 60

  let bb = null
  try {
    bb = node.boundingBox({
      includeLabels: true,
      includeOverlays: false,
    })
  } catch {
    bb = null
  }

  const hasValidBb = bb && Number.isFinite(bb.x1) && Number.isFinite(bb.x2) && bb.w > 0

  const x1 = (hasValidBb ? Math.min(bb.x1, pos.x - defaultRadius) : pos.x - defaultWidth / 2) - padding
  const x2 = (hasValidBb ? Math.max(bb.x2, pos.x + defaultRadius) : pos.x + defaultWidth / 2) + padding
  const y1 = (hasValidBb ? Math.min(bb.y1, pos.y - defaultRadius) : pos.y - defaultRadius) - padding
  const y2 = (hasValidBb ? Math.max(bb.y2, pos.y + defaultHeight) : pos.y + defaultRadius) + padding

  return {
    x1,
    y1,
    x2,
    y2,
    width: x2 - x1,
    height: y2 - y1,
    cx: (x1 + x2) / 2,
    cy: (y1 + y2) / 2,
    pos,
  }
}

export const checkNodesCollide = (nodeA, nodeB, padding = 8) => {
  const boxA = getNodeBoundingBox(nodeA, padding)
  const boxB = getNodeBoundingBox(nodeB, padding)

  const overlapX = Math.min(boxA.x2, boxB.x2) - Math.max(boxA.x1, boxB.x1)
  const overlapY = Math.min(boxA.y2, boxB.y2) - Math.max(boxA.y1, boxB.y1)

  return {
    colliding: overlapX > 0 && overlapY > 0,
    overlapX,
    overlapY,
    boxA,
    boxB,
  }
}

/**
 * When 2 nodes collide, shift the non-person node away.
 * If one node is PERSON and other is NON-PERSON: shift the non-person node.
 * If both are NON-PERSON: shift the non-dragged / secondary non-person node.
 */
export const shiftNonPersonOnCollision = (nodeA, nodeB, draggedNode = null, padding = 8) => {
  const result = checkNodesCollide(nodeA, nodeB, padding)
  if (!result.colliding) return false

  const aPerson = isPersonNode(nodeA)
  const bPerson = isPersonNode(nodeB)

  // Two PERSON nodes are anchors
  if (aPerson && bPerson) return false

  let movingNode
  let fixedNode

  if (aPerson && !bPerson) {
    // nodeB is non-person -> shift nodeB
    movingNode = nodeB
    fixedNode = nodeA
  } else if (!aPerson && bPerson) {
    // nodeA is non-person -> shift nodeA
    movingNode = nodeA
    fixedNode = nodeB
  } else {
    // Both are NON-PERSON nodes
    if (draggedNode && draggedNode.id() === nodeA.id()) {
      movingNode = nodeB
      fixedNode = nodeA
    } else if (draggedNode && draggedNode.id() === nodeB.id()) {
      movingNode = nodeA
      fixedNode = nodeB
    } else {
      movingNode = nodeB
      fixedNode = nodeA
    }
  }

  const p = movingNode.position()
  const q = fixedNode.position()

  let dx = p.x - q.x
  let dy = p.y - q.y

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    const angle = (String(movingNode.id()).charCodeAt(0) || 1) * 2.399963
    dx = Math.cos(angle)
    dy = Math.sin(angle)
  }

  // Push just enough to clear overlap without throwing nodes far away
  const pushX = (dx >= 0 ? 1 : -1) * (result.overlapX + 6)
  const pushY = (dy >= 0 ? 1 : -1) * (result.overlapY + 6)

  if (result.overlapX <= result.overlapY) {
    movingNode.position({
      x: p.x + pushX,
      y: p.y,
    })
  } else {
    movingNode.position({
      x: p.x,
      y: p.y + pushY,
    })
  }

  return true
}

/**
 * Resolves overlap between a non-person node and an edge's relationship label.
 * The relationship label lives at the midpoint between the source and target nodes.
 * If a non-person node overlaps this label space, deflect the non-person node
 * perpendicularly away from the edge line.
 */
export const shiftNonPersonFromEdgeLabel = (node, edge, padding = 12) => {
  if (isPersonNode(node)) return false

  const sourceNode = edge.source()
  const targetNode = edge.target()
  if (!sourceNode || !targetNode) return false

  // Do not shift an endpoint node away from its own edge
  if (node.id() === sourceNode.id() || node.id() === targetNode.id()) return false

  const sPos = sourceNode.position()
  const tPos = targetNode.position()

  const mx = (sPos.x + tPos.x) / 2
  const my = (sPos.y + tPos.y) / 2

  const relType = String(edge.data('label') || '').trim()
  const relWidth = Math.max(55, relType.length * 8 + 26)
  const relHeight = 28

  const labelBox = {
    x1: mx - relWidth / 2 - padding,
    x2: mx + relWidth / 2 + padding,
    y1: my - relHeight / 2 - padding,
    y2: my + relHeight / 2 + padding,
  }

  const nodeBox = getNodeBoundingBox(node, 4)

  const overlapX = Math.min(labelBox.x2, nodeBox.x2) - Math.max(labelBox.x1, nodeBox.x1)
  const overlapY = Math.min(labelBox.y2, nodeBox.y2) - Math.max(labelBox.y1, nodeBox.y1)

  if (overlapX <= 0 || overlapY <= 0) return false

  // Calculate perpendicular normal vector to the edge line
  const dx = tPos.x - sPos.x
  const dy = tPos.y - sPos.y
  const len = Math.hypot(dx, dy) || 1

  const nx = -dy / len
  const ny = dx / len

  const nPos = node.position()
  const cross = (nPos.x - sPos.x) * nx + (nPos.y - sPos.y) * ny
  const side = cross >= 0 ? 1 : -1

  node.position({
    x: nPos.x + nx * (overlapY + 16) * side,
    y: nPos.y + ny * (overlapY + 16) * side,
  })

  return true
}

export function resolveNodeCollisions(cy, draggedNode = null, maxIterations = 80) {
  if (!cy) return

  const nodes = cy.nodes().filter((n) => n.visible())
  if (nodes.length <= 1) return

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let collisionFound = false

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]

      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]

        if (shiftNonPersonOnCollision(a, b, draggedNode, 8)) {
          collisionFound = true
        }
      }
    }

    if (!collisionFound) break
  }

  // Edge label clearance sweep: ensure no entity overlaps any relationship label in between
  const visibleEdges = cy.edges().filter((e) => e.visible() && e.data('label'))
  if (visibleEdges.length > 0) {
    for (let pass = 0; pass < 12; pass++) {
      let edgeOverlapFound = false
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        if (isPersonNode(node)) continue

        for (let j = 0; j < visibleEdges.length; j++) {
          if (shiftNonPersonFromEdgeLabel(node, visibleEdges[j], 12)) {
            edgeOverlapFound = true
          }
        }
      }
      if (!edgeOverlapFound) break
    }
  }

  // Final verification sweep for tight clearances
  for (let pass = 0; pass < 15; pass++) {
    let collisionFound = false

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]

      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]

        if (shiftNonPersonOnCollision(a, b, draggedNode, 5)) {
          collisionFound = true
        }
      }
    }

    if (!collisionFound) break
  }
}

/**
 * Natural Camera Fitting:
 * Fits visible nodes cleanly into the container without extreme zoom-in or zoom-out.
 */
export function smartFit(cy, isFullScreen = false) {
  if (!cy || cy.destroyed()) return
  const visibleNodes = cy.nodes().filter((n) => n.visible())
  if (visibleNodes.length === 0) return

  const padding = isFullScreen ? 60 : 42
  cy.fit(visibleNodes, padding)

  if (cy.zoom() > 1.25) {
    cy.zoom(1.15)
    cy.center(visibleNodes)
  }
}

export default function GraphView({
  graphData,
  onNodeSelect,
  selectedNodeId,
  isFullScreen = false,
  onToggleFullScreen,
  onRefresh,
}) {
  const containerRef = useRef(null)
  const cyRef = useRef(null)
  const initialPositionsRef = useRef({})
  const pristinePositionsRef = useRef({})
  const [activeFilter, setActiveFilter] = useState('ALL')
  const [activeLayout, setActiveLayout] = useState('cose')
  const [isResetting, setIsResetting] = useState(false)

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
          smartFit(cyRef.current, isFullScreen)
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

        // Fit with readability protection
        smartFit(cy, isFullScreen)

        // Verify once more after the camera transform.
        requestAnimationFrame(() => {
          resolveNodeCollisions(cy)
          smartFit(cy, isFullScreen)
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
    initialPositionsRef.current = { ...origPositions }
    pristinePositionsRef.current = { ...origPositions }

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
        // BASE NODE STYLE (BALANCED, CRISP, LEGIBLE)
        {
          selector: 'node',
          style: {
            'background-color': (ele) => LABEL_COLORS[ele.data('kind')] || '#94A3B8',
            width: (ele) => NODE_SIZES[ele.data('kind')] || 26,
            height: (ele) => NODE_SIZES[ele.data('kind')] || 26,
            label: 'data(label)',
            color: '#0F172A',
            'font-family': 'Inter, system-ui, -apple-system, sans-serif',
            'font-size': 11,
            'font-weight': 600,
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 6,
            'text-max-width': 135,
            'text-wrap': 'wrap',
            'min-zoomed-font-size': 6,
            // HIGH-CONTRAST BADGE PILL BACKGROUND
            'text-background-color': '#FFFFFF',
            'text-background-opacity': 0.96,
            'text-background-padding': 3,
            'text-background-shape': 'roundrectangle',
            'text-border-width': 1,
            'text-border-color': '#CBD5E1',
            'text-border-opacity': 0.9,
            // CRISP NODE BORDER & SHADOW
            'border-width': 3,
            'border-color': '#FFFFFF',
            'shadow-blur': 10,
            'shadow-color': 'rgba(0,0,0,0.18)',
            'shadow-offset-y': 2,
            'overlay-opacity': 0,
            'z-index': 10,
            transition: 'all 0.25s ease',
          },
        },
        // KEY SUSPECT / PERSON NODE (BALANCED & PROMINENT)
        {
          selector: 'node[kind="PERSON"]',
          style: {
            'font-size': 12.5,
            'font-weight': 700,
            'border-width': 3.5,
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
            width: 2.8,
            'line-color': '#CBD5E1',
            'target-arrow-color': '#94A3B8',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 1.25,
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
            label: 'data(label)',
            'font-family': 'Inter, system-ui, sans-serif',
            'font-size': 11.5,
            'font-weight': 700,
            color: '#1E293B',
            'text-rotation': 'autorotate',
            'text-background-color': '#FFFFFF',
            'text-background-opacity': 0.98,
            'text-background-padding': 4,
            'text-background-shape': 'roundrectangle',
            'text-border-width': 1.5,
            'text-border-color': '#93C5FD',
            'z-index': 30,
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

    // REAL-TIME COLLISION SHIFTING DURING DRAG:
    // When 2 nodes collide:
    // - If dragged node is PERSON, any colliding NON-PERSON node is shifted away!
    // - If both are NON-PERSON, the other non-person node is shifted away!
    // - If dragged node overlaps any edge relationship label, it deflects away!
    cy.on('drag', 'node', (event) => {
      const draggedNode = event.target
      const visibleOthers = cy.nodes().filter((n) => n.visible() && n.id() !== draggedNode.id())

      visibleOthers.forEach((otherNode) => {
        const otherIsPerson = isPersonNode(otherNode)
        // If other node is non-person, shift it away from the dragged node upon collision
        if (!otherIsPerson) {
          shiftNonPersonOnCollision(draggedNode, otherNode, draggedNode, 14)
        }
      })

      // Ensure dragged node does not overlap any relationship label
      if (!isPersonNode(draggedNode)) {
        const visibleEdges = cy.edges().filter((e) => e.visible() && e.data('label'))
        visibleEdges.forEach((edge) => {
          shiftNonPersonFromEdgeLabel(draggedNode, edge, 12)
        })
      }
    })

    // DRAG RELEASE:
    // When user releases the node, resolve any remaining collisions
    // (e.g. if a non-person node was dropped on a person node, it gets shifted away to safety)
    cy.on('dragfree', 'node', (event) => {
      const draggedNode = event.target
      initialPositionsRef.current[draggedNode.id()] = draggedNode.position()

      resolveNodeCollisions(cy, null, 70)

      // Snapshot new positions for all nodes
      cy.nodes().forEach((n) => {
        initialPositionsRef.current[n.id()] = n.position()
      })
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

    // Run collision solver on initial load and fit
    requestAnimationFrame(() => {
      if (!cy || cy.destroyed()) return
      resolveNodeCollisions(cy)
      if (!selectedNodeId) {
        smartFit(cy, isFullScreen)
      }

      requestAnimationFrame(() => {
        if (!cy || cy.destroyed()) return
        resolveNodeCollisions(cy)
        smartFit(cy, isFullScreen)
        cy.nodes().forEach((n) => {
          const pos = { ...n.position() }
          initialPositionsRef.current[n.id()] = pos
          pristinePositionsRef.current[n.id()] = pos
        })
      })
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

    requestAnimationFrame(() => {
      if (!cy || cy.destroyed()) return
      resolveNodeCollisions(cy)
      if (!selectedNodeId) {
        smartFit(cy, isFullScreen)
      }
    })
  }, [activeFilter, isFullScreen, selectedNodeId])

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
            padding: 45,
          },
          duration: 500,
          easing: 'ease-in-out-cubic',
          complete: () => {
            requestAnimationFrame(() => {
              resolveNodeCollisions(cy)
              smartFit(cy, isFullScreen)
            })
          },
        })
      })

      return
    }
  }

  // Full Reset & Refresh: restores original starting node positions, relations, and camera framing
  const handleFullReset = () => {
    const cy = cyRef.current
    if (!cy || cy.destroyed()) return

    setIsResetting(true)
    setTimeout(() => setIsResetting(false), 700)

    // 1. Reset dropdown filters and layout state
    setActiveLayout('cose')
    setActiveFilter('ALL')
    onNodeSelect?.(null)

    // 2. Un-hide all nodes and edges (restore visibility if any filter was active)
    cy.nodes().style('display', 'element')
    cy.edges().style('display', 'element')

    // 3. Clear dimmed, focused, selected, and hover classes
    cy.nodes().removeClass('dimmed anomaly-focused').unselect()
    cy.edges().removeClass('dimmed active edge-hover')

    // 4. Retrieve or freshly compute the pristine starting positions
    const rect = containerRef.current?.getBoundingClientRect()
    const containerWidth = rect?.width > 0 ? rect.width : (isFullScreen ? window.innerWidth : 900)
    const containerHeight = rect?.height > 0 ? rect.height : (isFullScreen ? window.innerHeight : 650)

    let targetPositions = pristinePositionsRef.current
    if (!targetPositions || Object.keys(targetPositions).length === 0) {
      targetPositions = calculateOriginalPositions(nodes, edges, containerWidth, containerHeight)
      pristinePositionsRef.current = { ...targetPositions }
    }

    // Restore initialPositionsRef to the pristine starting positions
    initialPositionsRef.current = { ...targetPositions }

    // 5. Animate all nodes back to their starting positions smoothly
    const allNodes = cy.nodes()
    let remaining = allNodes.length

    if (remaining === 0) {
      smartFit(cy, isFullScreen)
    } else {
      allNodes.forEach((node) => {
        const targetPos = targetPositions[node.id()]
        if (targetPos) {
          node.animate({
            position: { x: targetPos.x, y: targetPos.y },
            duration: 500,
            easing: 'ease-in-out-cubic',
            complete: () => {
              remaining--
              if (remaining <= 0) {
                requestAnimationFrame(() => {
                  if (!cy || cy.destroyed()) return
                  resolveNodeCollisions(cy)
                  smartFit(cy, isFullScreen)
                })
              }
            },
          })
        } else {
          remaining--
        }
      })

      // Smoothly animate the camera to frame all elements cleanly
      cy.animate({
        fit: {
          eles: cy.nodes(),
          padding: isFullScreen ? 60 : 42,
        },
        duration: 500,
        easing: 'ease-in-out-cubic',
      })
    }

    // 6. If parent provided an onRefresh callback (e.g. refreshGraph), trigger it
    onRefresh?.()
  }

  return (
    <div
      className={`relative flex flex-col w-full h-full transition-all duration-300 ease-out ${
        isFullScreen
          ? 'rounded-none border-none shadow-none bg-[#F1F5F9]'
          : 'group rounded-2xl border border-slate-300/80 bg-[#F1F5F9] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] overflow-hidden min-h-[640px] hover:border-indigo-500 hover:shadow-[0_14px_38px_-6px_rgba(99,102,241,0.22)] hover:-translate-y-0.5'
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
              onClick={() => smartFit(cyRef.current, isFullScreen)}
              title="Fit to Screen"
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition cursor-pointer"
            >
              <Maximize2 size={14} />
            </button>
            <button
              onClick={handleFullReset}
              title="Reset & Refresh Graph to Original Layout"
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition active:scale-95 cursor-pointer"
            >
              <RotateCcw size={14} className={isResetting ? 'animate-spin text-indigo-600' : ''} />
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