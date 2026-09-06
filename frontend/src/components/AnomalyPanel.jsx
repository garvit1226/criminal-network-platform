import { useState } from 'react'
import { AlertTriangle, RefreshCw, Loader2, ShieldAlert, ArrowUpRight, Search, Zap } from 'lucide-react'

const SEVERITY_CONFIG = {
  high: {
    bg: 'bg-red-50/80 hover:bg-red-100/80',
    border: 'border-red-200/90 border-l-red-500',
    badge: 'bg-red-100/90 text-red-700 border-red-200',
    text: 'text-red-700',
  },
  medium: {
    bg: 'bg-amber-50/80 hover:bg-amber-100/80',
    border: 'border-amber-200/90 border-l-amber-500',
    badge: 'bg-amber-100/90 text-amber-800 border-amber-200',
    text: 'text-amber-700',
  },
  low: {
    bg: 'bg-sky-50/80 hover:bg-sky-100/80',
    border: 'border-sky-200/90 border-l-sky-500',
    badge: 'bg-sky-100/90 text-sky-700 border-sky-200',
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
    <div className="group relative bg-[#F1F5F9] rounded-2xl border border-slate-300/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] flex flex-col flex-1 h-full min-h-[340px] overflow-hidden transition-all duration-300 ease-out hover:border-amber-500 hover:shadow-[0_14px_38px_-6px_rgba(245,158,11,0.22)] hover:-translate-y-0.5">
      {/* Top Accent Gradient Line */}
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 opacity-80 group-hover:opacity-100 transition-opacity" />

      {/* HEADER */}
      <div className="p-3.5 border-b border-slate-200/90 bg-slate-200/40 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-gradient-to-br from-amber-50 to-orange-50/80 rounded-xl text-amber-600 border border-amber-200/60 shadow-xs group-hover:scale-105 transition-transform">
            <ShieldAlert size={17} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">Threat & Anomaly Radar</h2>
              {safeAlerts.length > 0 ? (
                <span className="relative flex items-center gap-1 text-[10px] font-extrabold bg-red-100 text-red-700 rounded-full px-2 py-0.5 border border-red-200 shadow-xs">
                  <span className="animate-ping w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                  {safeAlerts.length} Flagged
                </span>
              ) : (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/70">
                  SCANNER
                </span>
              )}
            </div>

          </div>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 border border-slate-200/80 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-xs"
        >
          {loading ? <Loader2 size={12} className="animate-spin text-amber-600" /> : <RefreshCw size={12} className="text-slate-600" />}
          <span>Scan Rules</span>
        </button>
      </div>

      {/* FILTER BAR */}
      {safeAlerts.length > 0 && (
        <div className="px-3.5 py-2 bg-slate-200/30 border-b border-slate-200/80 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSelectedSeverity('ALL')}
              className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold transition-all cursor-pointer ${
                selectedSeverity === 'ALL'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              All ({safeAlerts.length})
            </button>
            {highCount > 0 && (
              <button
                onClick={() => setSelectedSeverity(selectedSeverity === 'high' ? 'ALL' : 'high')}
                className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold transition-all cursor-pointer ${
                  selectedSeverity === 'high'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                }`}
              >
                High ({highCount})
              </button>
            )}
            {medCount > 0 && (
              <button
                onClick={() => setSelectedSeverity(selectedSeverity === 'medium' ? 'ALL' : 'medium')}
                className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold transition-all cursor-pointer ${
                  selectedSeverity === 'medium'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                }`}
              >
                Med ({medCount})
              </button>
            )}
          </div>

          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-2 text-slate-400" />
            <input
              type="text"
              placeholder="Search alerts..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-28 text-[11px] pl-7 pr-2 py-1 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-xs"
            />
          </div>
        </div>
      )}

      {/* ALERTS LIST (FLEX-EXPANDED) */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
        {safeAlerts.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center">
            <div className="w-10 h-10 rounded-2xl bg-amber-50/70 border border-amber-100 flex items-center justify-center mb-2 text-amber-500">
              <Zap size={20} />
            </div>
            <p className="text-xs font-bold text-slate-700">No active anomalies detected</p>
            <p className="text-[11px] text-slate-400 max-w-[220px] mt-1">
              Ingest an incident report or click Scan Rules to execute threat detection algorithms.
            </p>
          </div>
        )}

        {filteredAlerts.map((a, i) => {
          const style = SEVERITY_CONFIG[a.severity] || SEVERITY_CONFIG.low
          const involvedCount = a.involved_node_ids?.length || 0

          return (
            <div
              key={i}
              className={`group/item rounded-xl border border-l-4 p-2.5 text-xs transition-all cursor-pointer shadow-xs hover:shadow-sm hover:scale-[1.01] ${style.border} ${style.bg}`}
              onClick={() => handleAlertClick(a)}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  {a.rule_name}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className={`uppercase text-[9px] font-extrabold tracking-wider px-1.5 py-0.5 rounded-md border ${style.badge}`}>
                    {a.severity}
                  </span>
                  <ArrowUpRight size={13} className="text-slate-400 group-hover/item:text-amber-600 transition-transform group-hover/item:translate-x-0.5 group-hover/item:-translate-y-0.5" />
                </div>
              </div>
              <p className="text-slate-600 leading-snug text-[11px]">{a.description}</p>

              {involvedCount > 0 && (
                <div className="mt-2 pt-1.5 border-t border-black/5 flex items-center justify-between text-[10px] text-slate-500">
                  <span className="truncate max-w-[170px] font-medium">
                    
                  </span>
                  <span className="text-amber-700 font-bold group-hover/item:underline flex items-center gap-0.5">
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