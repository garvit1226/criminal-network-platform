import { AlertTriangle, RefreshCw, Loader2 } from 'lucide-react'

const SEVERITY_STYLE = {
  high: 'bg-red-50 border-red-200 text-red-700',
  medium: 'bg-amber-50 border-amber-200 text-amber-700',
  low: 'bg-sky-50 border-sky-200 text-sky-700',
}

export default function AnomalyPanel({ alerts, onRefresh, loading, onFocusNode }) {
  return (
    <div className="bg-panel rounded-xl border border-line shadow-card p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-600" />
          <h2 className="text-sm font-semibold text-ink">Anomaly alerts</h2>
          {alerts.length > 0 && (
            <span className="text-[10px] font-semibold bg-red-100 text-red-700 rounded-full px-2 py-0.5">
              {alerts.length}
            </span>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Run scan
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {alerts.length === 0 && (
          <p className="text-xs text-muted">No anomalies flagged yet. Run a scan after adding reports.</p>
        )}
        {alerts.map((a, i) => (
          <div
            key={i}
            className={`rounded-lg border px-3 py-2 text-xs cursor-pointer hover:brightness-95 transition ${SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.low}`}
            onClick={() => onFocusNode?.(a.involved_node_ids?.[0])}
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="font-semibold">{a.rule_name}</span>
              <span className="uppercase text-[9px] font-bold tracking-wide">{a.severity}</span>
            </div>
            <p className="leading-snug">{a.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
