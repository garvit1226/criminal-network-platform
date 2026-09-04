import { LogOut } from 'lucide-react'

export default function Navbar({ onLogout }) {
  function handleLogout() {
    if (onLogout) {
      onLogout()
    } else {
      window.location.href = '/login'
    }
  }

  return (
    <header
      className="relative h-16 shrink-0 px-6 flex items-center justify-between overflow-hidden z-20 shadow-[0_1px_4px_0_rgba(0,0,0,0.02)]"
      style={{
        background: 'linear-gradient(90deg, #F0F6FF 0%, #FAFAF9 35%, #FFFDF5 65%, #F5F3FF 100%)',
      }}
    >
      {/* Delicate minimal light ambient glow blobs complementing our 3 card themes */}
      <div
        className="pointer-events-none absolute -top-8 -left-8 w-44 h-44 rounded-full blur-2xl opacity-40"
        style={{ background: 'radial-gradient(circle, #93C5FD 0%, transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full blur-2xl opacity-30"
        style={{ background: 'radial-gradient(circle, #FDE68A 0%, transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute -top-8 -right-8 w-44 h-44 rounded-full blur-2xl opacity-35"
        style={{ background: 'radial-gradient(circle, #C4B5FD 0%, transparent 70%)' }}
      />

      {/* Brand Logo - clean typography matching reference screenshot */}
      <div className="relative z-10 select-none">
        <h1 className="text-xl font-bold leading-tight tracking-tight">
          <span className="text-slate-900">vigil</span>
          <span className="text-blue-600">NODE</span>
        </h1>
        <p className="text-[10px] font-semibold text-slate-400 tracking-[0.16em] leading-tight mt-0.5">
          INTELLIGENCE PLATFORM
        </p>
      </div>

      {/* Right side controls - Backend connected removed, Log Out button styled with minimal light hover */}
      <div className="relative z-10 flex items-center gap-3">
        <button
          onClick={handleLogout}
          className="group relative flex items-center gap-1.5 text-xs font-semibold text-slate-600 px-3.5 py-1.5 rounded-lg border border-slate-200/80 bg-white/80 hover:bg-white hover:text-red-600 hover:border-red-200 hover:shadow-xs active:scale-95 transition-all duration-200 cursor-pointer"
        >
          <LogOut
            size={14}
            strokeWidth={2}
            className="transition-transform duration-200 group-hover:translate-x-0.5"
          />
          <span>Log Out</span>
        </button>
      </div>

      {/* Subtle minimal light multi-tone bottom dividing border complementing theme */}
      <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-blue-400/40 via-amber-300/35 to-violet-400/40" />
    </header>
  )
}