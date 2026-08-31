import { SlidersHorizontal, X } from 'lucide-react'

export default function FilterPanel({ selectedNode, depth, setDepth, onClear, nodes }) {
  const node = nodes.find((n) => n.id === selectedNode)

  return (
    <div className="bg-panel rounded-xl border border-line shadow-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <SlidersHorizontal size={16} className="text-brand-600" />
        <h2 className="text-sm font-semibold text-ink">Relationship filter</h2>
      </div>

      {node ? (
        <>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-muted">Focused on</p>
              <p className="text-sm font-semibold text-ink">{node.name}</p>
            </div>
            <button onClick={onClear} className="text-muted hover:text-ink">
              <X size={16} />
            </button>
          </div>

          <label className="block text-xs font-medium text-muted mb-1">
            Show indirect relations up to {depth} level{depth > 1 ? 's' : ''}
          </label>
          <input
            type="range"
            min={1}
            max={5}
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="w-full accent-brand-600"
          />
          <div className="flex justify-between text-[10px] text-muted mt-1">
            <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted">
          Click any node in the graph to inspect its direct and indirect connections, up to 3+ levels away.
        </p>
      )}
    </div>
  )
}
