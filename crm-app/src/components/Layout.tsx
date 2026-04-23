import { NavLink, Outlet } from "react-router-dom";

const NAV_ITEMS = [
  {
    to: "/",
    label: "Pipeline",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="2" width="4" height="12" rx="1" />
        <rect x="6" y="5" width="4" height="9" rx="1" />
        <rect x="11" y="8" width="4" height="6" rx="1" />
      </svg>
    ),
  },
  {
    to: "/leads",
    label: "Leads",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="5" r="3" />
        <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      </svg>
    ),
  },
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1" width="6" height="6" rx="1.5" />
        <rect x="9" y="1" width="6" height="3" rx="1.5" />
        <rect x="9" y="6" width="6" height="9" rx="1.5" />
        <rect x="1" y="9" width="6" height="6" rx="1.5" />
      </svg>
    ),
  },
];

export default function Layout() {
  return (
    <div className="flex h-screen bg-base text-text">
      {/* Sidebar */}
      <aside className="w-[220px] border-r border-edge-subtle flex flex-col bg-raised">
        {/* Brand */}
        <div className="px-5 pt-6 pb-8">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-violet flex items-center justify-center">
              <span className="text-white text-xs font-black tracking-tighter">PL</span>
            </div>
            <div>
              <p className="text-sm font-bold text-bright tracking-tight leading-none">Prospector</p>
              <p className="text-[10px] text-dim mt-0.5 tracking-wide uppercase">Provou Levou</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-violet/10 text-violet-light"
                    : "text-muted hover:text-sub hover:bg-surface"
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 mx-3 mb-3 rounded-lg bg-surface border border-edge-subtle">
          <p className="text-[11px] text-dim leading-relaxed">
            Limite recomendado: 10-20 DMs por dia.
          </p>
        </div>

        {/* Voltar para Financeiro */}
        <a
          href="/"
          className="mx-3 mb-3 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[12px] font-semibold bg-violet/10 text-violet-light border border-violet/20 hover:bg-violet/20 transition-all"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M10 4L6 8l4 4" />
          </svg>
          Voltar para Financeiro
        </a>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto relative">
        {/* Top ambient light */}
        <div
          className="fixed top-0 right-[15%] w-[500px] h-[300px] pointer-events-none opacity-[0.03]"
          style={{ background: "radial-gradient(ellipse, #8b5cf6, transparent 70%)" }}
        />
        <Outlet />
      </main>
    </div>
  );
}
