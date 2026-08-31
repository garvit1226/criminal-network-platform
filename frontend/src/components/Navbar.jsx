import { ShieldCheck, Circle } from 'lucide-react'

export default function Navbar({ apiOnline }) {
  return (
    <header className="h-16 shrink-0 border-b border-line bg-panel/80 backdrop-blur px-6 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
          <ShieldCheck size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-ink leading-tight">CaseWeb</h1>
          <p className="text-[11px] text-muted leading-tight">Criminal Network Analysis Platform</p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs font-medium">
        <Circle size={8} className={apiOnline ? 'fill-emerald-500 text-emerald-500' : 'fill-red-500 text-red-500'} />
        <span className={apiOnline ? 'text-emerald-700' : 'text-red-700'}>
          {apiOnline ? 'Backend connected' : 'Backend unreachable'}
        </span>
      </div>
    </header>
  )
}
