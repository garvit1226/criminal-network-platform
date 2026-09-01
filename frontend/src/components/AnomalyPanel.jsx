import { useState } from 'react'
import { AlertTriangle, RefreshCw, Loader2, ShieldAlert, ArrowUpRight, Search } from 'lucide-react'

const SEVERITY_CONFIG = {
  high: {
    bg: 'bg-red-50/90 hover:bg-red-100/80',
    border: 'border-red-200 border-l-red-500',
    badge: 'bg-red-100 text-red-700 border-red-200',
    text: 'text-red-700',
  },
  medium: {
    bg: 'bg-amber-50/90 hover:bg-amber-100/80',
    border: 'border-amber-200 border-l-amber-500',
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    text: 'text-amber-700',
  },
  low: {
    bg: 'bg-sky-50/90 hover:bg-sky-100/80',
    border: 'border-sky-200 border-l-sky-500',
    badge: 'bg-sky-100 text-sky-700 border-sky-200',
    text: 'text-sky-700',
  },
}

export default function AnomalyPanel({ alerts = [], onRefresh, loading, onFocusNode }) {
  const [filterQuery, setFilterQuery] = useState('')
  const [selectedSeverity, setSelectedSeverity] = useState('ALL')

  const safeAlerts = Array.isArray(alerts) ? alerts : []
  const highCount = safeAlerts.filter((a) => a.severity === 'high').length
  const medCount = safeAlerts.filter((a) => a.severity === 'medium').length

  const filteredAlerts = safeAlerts.filter((a) => {
    const matchesSev = selectedSeverity === 'ALL' || a.severity === selectedSeverity
    const matchesSearch =
      !filterQuery ||
      a.rule_name?.toLowerCase().includes(filterQuery.toLowerCase()) ||
      a.description?.toLowerCase().includes(filterQuery.toLowerCase())
    return matchesSev && matchesSearch
  })

  // Trigger focus for all involved nodes or first target
  const handleAlertClick = (alert) => {
    if (alert.involved_node_ids && alert.involved_node_ids.length > 0) {
      onFocusNode?.(alert.involved_node_ids)
    } else if (alert.target) {
      onFocusNode?.(alert.target)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col flex-1 h-full min-h-[320px] overflow-hidden transition-all">
      {/* HEADER */}
      <div className="p-3.5 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-50 rounded-lg text-amber-600 border border-amber-100">
            <ShieldAlert size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Anomaly Alerts</h2>
              {safeAlerts.length > 0 && (
                <span className="text-[10px] font-bold bg-red-100 text-red-700 rounded-full px-2 py-0.2 border border-red-200">
                  {safeAlerts.length}
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition disabled:opacity-50 cursor-pointer"
        >
          {loading ? <Loader2 size={12} className="animate-spin text-blue-600" /> : <RefreshCw size={12} />}
          Scan Rules
        </button>
      </div>

      {/* FILTER BAR */}
      {safeAlerts.length > 0 && (
        <div className="px-3.5 py-2 bg-slate-50/50 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSelectedSeverity('ALL')}
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition cursor-pointer ${
                selectedSeverity === 'ALL'
                  ? 'bg-slate-800 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              All ({safeAlerts.length})
            </button>
            {highCount > 0 && (
              <button
                onClick={() => setSelectedSeverity(selectedSeverity === 'high' ? 'ALL' : 'high')}
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition cursor-pointer ${
                  selectedSeverity === 'high'
                    ? 'bg-red-600 text-white'
                    : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                }`}
              >
                High ({highCount})
              </button>
            )}
            {medCount > 0 && (
              <button
                onClick={() => setSelectedSeverity(selectedSeverity === 'medium' ? 'ALL' : 'medium')}
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition cursor-pointer ${
                  selectedSeverity === 'medium'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                }`}
              >
                Med ({medCount})
              </button>
            )}
          </div>

          <div className="relative">
            <Search size={11} className="absolute left-2 top-2 text-slate-400" />
            <input
              type="text"
              placeholder="Search..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-24 text-[11px] pl-6 pr-2 py-0.5 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      {/* ALERTS LIST (FLEX-EXPANDED) */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-2">
        {safeAlerts.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full py-10 text-center">
            <AlertTriangle size={24} className="text-slate-300 mb-1.5" />
            <p className="text-xs font-medium text-slate-600">No anomalies flagged yet</p>
            <p className="text-[11px] text-slate-400 max-w-[200px] mt-0.5">
              Submit reports or run scan to detect fraud patterns & ring activities.
            </p>
          </div>
        )}

        {filteredAlerts.map((a, i) => {
          const style = SEVERITY_CONFIG[a.severity] || SEVERITY_CONFIG.low
          const involvedCount = a.involved_node_ids?.length || 0

          return (
            <div
              key={i}
              className={`group rounded-lg border border-l-4 p-2.5 text-xs transition cursor-pointer shadow-xs ${style.border} ${style.bg}`}
              onClick={() => handleAlertClick(a)}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                  {a.rule_name}
                </span>
                <div className="flex items-center gap-1">
                  <span className={`uppercase text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded border ${style.badge}`}>
                    {a.severity}
                  </span>
                  <ArrowUpRight size={13} className="text-slate-400 group-hover:text-blue-600 transition" />
                </div>
              </div>
              <p className="text-slate-600 leading-snug text-[11px]">{a.description}</p>

              {involvedCount > 0 && (
                <div className="mt-1.5 pt-1 border-t border-black/5 flex items-center justify-between text-[10px] text-slate-500">
                  <span className="truncate max-w-[170px]">
                    Target: {a.involved_node_ids.slice(0, 2).join(', ')}{involvedCount > 2 ? ` +${involvedCount - 2}` : ''}
                  </span>
                  <span className="text-blue-600 font-semibold group-hover:underline flex items-center gap-0.5">
                    Focus Graph →
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}