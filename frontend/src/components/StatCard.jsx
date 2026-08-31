export default function StatCard({ label, value, icon: Icon, accent = 'text-brand-600' }) {
  return (
    <div className="bg-panel rounded-xl border border-line shadow-card px-4 py-3 flex items-center gap-3">
      {Icon && (
        <div className={`w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center ${accent}`}>
          <Icon size={16} />
        </div>
      )}
      <div>
        <p className="text-lg font-semibold text-ink leading-tight">{value}</p>
        <p className="text-[11px] text-muted leading-tight">{label}</p>
      </div>
    </div>
  )
}
