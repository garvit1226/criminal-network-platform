import { useEffect, useRef } from 'react'
import cytoscape from 'cytoscape'
import { Network } from 'lucide-react'

const LABEL_COLORS = {
  PERSON: '#2563EB',
  ORG: '#7C3AED',
  LOCATION: '#059669',
  PHONE: '#EA580C',
  ACCOUNT: '#DB2777',
  VEHICLE: '#0D9488',
  AMOUNT: '#CA8A04',
  DATE: '#64748B',
}

const NODE_SIZES = {
  PERSON: 58,
  ORG: 52,
  LOCATION: 48,
  PHONE: 44,
  ACCOUNT: 44,
  VEHICLE: 44,
  AMOUNT: 44,
  DATE: 44,
}

export default function GraphView({
  graphData,
  onNodeSelect,
  selectedNodeId,
}) {
  const containerRef = useRef(null)
  const cyRef = useRef(null)

  const nodes = graphData?.nodes || []
  const edges = graphData?.edges || []

  useEffect(() => {
    if (!containerRef.current) return

    // Destroy previous Cytoscape instance
    if (cyRef.current) {
      cyRef.current.destroy()
      cyRef.current = null
    }

    // ==========================================================
    // ELEMENTS
    // ==========================================================

    const elements = [
      ...nodes.map((node) => ({
        data: {
          id: String(node.id),
          label: node.name || 'Unknown',
          kind: node.label || 'ENTITY',
        },
      })),

      ...edges.map((edge, index) => ({
        data: {
          id: String(edge.id || `edge-${index}`),
          source: String(edge.source),
          target: String(edge.target),
          label: edge.type || 'RELATES',
        },
      })),
    ]

    // ==========================================================
    // CYTOSCAPE
    // ==========================================================

    const cy = cytoscape({
      container: containerRef.current,

      elements,

      style: [

        // ======================================================
        // NODES
        // ======================================================

        {
          selector: 'node',

          style: {
            'background-color': (ele) =>
              LABEL_COLORS[ele.data('kind')] || '#94A3B8',

            width: (ele) =>
              NODE_SIZES[ele.data('kind')] || 46,

            height: (ele) =>
              NODE_SIZES[ele.data('kind')] || 46,

            label: 'data(label)',

            color: '#0F172A',

            'font-family': 'Inter, Arial, sans-serif',

            'font-size': 12,

            'font-weight': 600,

            'text-valign': 'bottom',

            'text-halign': 'center',

            'text-margin-y': 9,

            'text-max-width': 120,

            'text-wrap': 'ellipsis',

            'border-width': 3,

            'border-color': '#FFFFFF',

            'overlay-opacity': 0,

            'z-index': 10,
          },
        },

        // ======================================================
        // PERSON
        // ======================================================

        {
          selector: 'node[kind="PERSON"]',

          style: {
            'font-size': 13,
            'font-weight': 700,
          },
        },

        // ======================================================
        // NON-PERSON ENTITY LABEL
        // ======================================================

        {
          selector:
            'node[kind="PHONE"], node[kind="ACCOUNT"], node[kind="VEHICLE"], node[kind="AMOUNT"], node[kind="DATE"], node[kind="LOCATION"], node[kind="ORG"]',

          style: {
            'font-size': 11,
            'font-weight': 600,
          },
        },

        // ======================================================
        // SELECTED NODE
        // ======================================================

        {
          selector: 'node:selected',

          style: {
            'border-width': 5,

            'border-color': '#111827',

            'overlay-color': '#2563EB',

            'overlay-opacity': 0.15,

            'overlay-padding': 10,

            'z-index': 30,
          },
        },

        // ======================================================
        // NORMAL EDGES
        // ======================================================

        {
          selector: 'edge',

          style: {
            width: 2,

            'line-color': '#CBD5E1',

            'target-arrow-color': '#94A3B8',

            'target-arrow-shape': 'triangle',

            'curve-style': 'bezier',

            // IMPORTANT:
            // Don't display every label permanently.
            // This is what keeps the graph readable.

            label: '',

            'overlay-opacity': 0,

            'z-index': 1,
          },
        },

        // ======================================================
        // HOVER EDGE
        // ======================================================

        {
          selector: 'edge.edge-hover',

          style: {
            width: 3,

            'line-color': '#334155',

            'target-arrow-color': '#334155',

            label: 'data(label)',

            'font-family': 'Inter, Arial, sans-serif',

            'font-size': 11,

            'font-weight': 700,

            color: '#0F172A',

            'text-rotation': 'autorotate',

            'text-background-color': '#FFFFFF',

            'text-background-opacity': 1,

            'text-background-padding': 5,

            'text-border-width': 1,

            'text-border-color': '#CBD5E1',

            'z-index': 20,
          },
        },

        // ======================================================
        // ACTIVE EDGE
        // ======================================================

        {
          selector: 'edge.active',

          style: {
            width: 3,

            'line-color': '#475569',

            'target-arrow-color': '#475569',

            opacity: 1,
          },
        },

        // ======================================================
        // DIMMED NODE
        // ======================================================

        {
          selector: 'node.dimmed',

          style: {
            opacity: 0.18,
          },
        },

        // ======================================================
        // DIMMED EDGE
        // ======================================================

        {
          selector: 'edge.dimmed',

          style: {
            opacity: 0.1,
          },
        },
      ],

      // ========================================================
      // LAYOUT
      // ========================================================

      layout: {
        name: 'cose',

        animate: false,

        fit: true,

        padding: 80,

        nodeRepulsion: 9000,

        idealEdgeLength: 150,

        edgeElasticity: 0.25,

        nestingFactor: 0.8,

        gravity: 0.25,

        numIter: 1000,

        initialEnergyOnIncremental: 200,

        randomize: true,

        componentSpacing: 120,

        nodeOverlap: 20,
      },

      wheelSensitivity: 0.18,

      minZoom: 0.35,

      maxZoom: 2.5,
    })

    // ==========================================================
    // NODE CLICK
    // ==========================================================

    cy.on('tap', 'node', (event) => {
      const node = event.target

      onNodeSelect?.(node.id())

      cy.nodes().removeClass('dimmed')

      cy.edges().removeClass('dimmed active')

      const neighborhood = node.closedNeighborhood()

      const connectedEdges = node.connectedEdges()

      cy.nodes()
        .not(neighborhood)
        .addClass('dimmed')

      connectedEdges.addClass('active')
    })

    // ==========================================================
    // EDGE HOVER
    // ==========================================================

    cy.on('mouseover', 'edge', (event) => {
      event.target.addClass('edge-hover')
    })

    cy.on('mouseout', 'edge', (event) => {
      event.target.removeClass('edge-hover')
    })

    // ==========================================================
    // NODE HOVER
    // ==========================================================

    cy.on('mouseover', 'node', (event) => {
      event.target
        .connectedEdges()
        .addClass('edge-hover')
    })

    cy.on('mouseout', 'node', (event) => {
      event.target
        .connectedEdges()
        .removeClass('edge-hover')
    })

    // ==========================================================
    // CLICK EMPTY SPACE
    // ==========================================================

    cy.on('tap', (event) => {
      if (event.target === cy) {
        cy.nodes().removeClass('dimmed')

        cy.edges()
          .removeClass('dimmed active')

        onNodeSelect?.(null)
      }
    })

    // ==========================================================
    // SAVE INSTANCE
    // ==========================================================

    cyRef.current = cy

    // ==========================================================
    // CLEANUP
    // ==========================================================

    return () => {
      cy.destroy()
      cyRef.current = null
    }

  }, [graphData, onNodeSelect])

  // ============================================================
  // SELECTED NODE
  // ============================================================

  useEffect(() => {
    if (!cyRef.current) return

    const cy = cyRef.current

    cy.nodes().unselect()

    cy.nodes().removeClass('dimmed')

    cy.edges().removeClass('dimmed active')

    if (!selectedNodeId) return

    const node =
      cy.getElementById(String(selectedNodeId))

    if (!node || node.length === 0) return

    node.select()

    const neighborhood =
      node.closedNeighborhood()

    const connectedEdges =
      node.connectedEdges()

    cy.nodes()
      .not(neighborhood)
      .addClass('dimmed')

    connectedEdges.addClass('active')

    cy.animate({
      center: {
        eles: node,
      },

      zoom: Math.min(
        Math.max(cy.zoom(), 1),
        1.6
      ),

      duration: 400,
    })

  }, [selectedNodeId])

  // ============================================================
  // UI
  // ============================================================

  return (
    <div className="relative bg-panel rounded-xl border border-line shadow-card flex flex-col h-full">

      {/* HEADER */}

      <div className="flex items-center justify-between px-5 py-3 border-b border-line">

        <div className="flex items-center gap-2">

          <Network
            size={16}
            className="text-brand-600"
          />

          <h2 className="text-sm font-semibold text-ink">
            Network graph
          </h2>

        </div>

        {/* LEGEND */}

        <div className="flex items-center gap-3 text-[10px] text-muted flex-wrap">

          {Object.entries(LABEL_COLORS).map(
            ([label, color]) => (

              <span
                key={label}
                className="flex items-center gap-1"
              >

                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    backgroundColor: color,
                  }}
                />

                {label}

              </span>

            )
          )}

        </div>

      </div>

      {/* GRAPH */}

      <div
        ref={containerRef}
        className="flex-1 min-h-[420px]"
      />

      {/* EMPTY */}

      {nodes.length === 0 && (

        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted pointer-events-none">

          Submit a report to see the network graph

        </div>

      )}

      {/* TIP */}

      {nodes.length > 0 && (

        <div className="absolute bottom-3 left-4 text-[10px] text-muted pointer-events-none">

          Click an entity to focus its network • Hover a relationship to inspect it

        </div>

      )}

    </div>
  )
}