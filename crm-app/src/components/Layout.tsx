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
    <div className="flex h-screen text-text" style={{ background: "transparent" }}>
      {/* Sidebar — padrão Quantic (glass + gradient border + left accent no active) */}
      <aside
        className="w-[250px] flex flex-col relative"
        style={{
          background: "rgba(8, 10, 18, 0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRight: "1px solid rgba(255, 255, 255, 0.04)",
        }}
      >
        {/* Gradient line na borda direita (purple → cyan) */}
        <div
          aria-hidden="true"
          className="absolute top-0 right-0 w-px h-full pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, rgba(139, 92, 246, 0.2), transparent 30%, transparent 70%, rgba(6, 182, 212, 0.15))",
          }}
        />

        {/* Brand header */}
        <div
          className="flex items-center gap-3 px-5 h-[72px]"
          style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}
        >
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
              boxShadow: "0 0 12px rgba(139, 92, 246, 0.3)",
            }}
          >
            <span className="text-white text-[11px] font-black tracking-tighter">PL</span>
          </div>
          <div>
            <p className="text-[13px] font-bold tracking-tight leading-none" style={{ color: "rgba(255, 255, 255, 0.95)" }}>
              Prospector
            </p>
            <p className="text-[9px] mt-1 tracking-widest uppercase font-bold" style={{ color: "#22d3ee", opacity: 0.7 }}>
              Provou Levou
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-[9px] rounded-md text-[13px] font-medium transition-all duration-150 border-l-2 ${
                  isActive
                    ? "border-l-[var(--color-violet)]"
                    : "border-l-transparent hover:border-l-[rgba(139,92,246,0.4)]"
                }`
              }
              style={({ isActive }) =>
                isActive
                  ? {
                      background: "rgba(139, 92, 246, 0.08)",
                      color: "rgba(255, 255, 255, 0.95)",
                      boxShadow: "inset 0 0 20px rgba(139, 92, 246, 0.04)",
                    }
                  : { color: "rgba(255, 255, 255, 0.55)" }
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    style={{
                      color: isActive ? "#8b5cf6" : "currentColor",
                      filter: isActive ? "drop-shadow(0 0 4px rgba(139, 92, 246, 0.4))" : "none",
                      display: "inline-flex",
                    }}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Voltar para Financeiro */}
        <a
          href="/custos.html"
          className="mx-3 mb-3 flex items-center justify-center gap-2 px-3 py-2.5 rounded-md text-[12px] font-semibold transition-all"
          style={{
            background: "rgba(6, 182, 212, 0.06)",
            color: "#22d3ee",
            border: "1px solid rgba(6, 182, 212, 0.18)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(6, 182, 212, 0.12)";
            e.currentTarget.style.borderColor = "rgba(6, 182, 212, 0.3)";
            e.currentTarget.style.color = "rgba(255, 255, 255, 0.95)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(6, 182, 212, 0.06)";
            e.currentTarget.style.borderColor = "rgba(6, 182, 212, 0.18)";
            e.currentTarget.style.color = "#22d3ee";
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M10 4L6 8l4 4" />
          </svg>
          Voltar para Financeiro
        </a>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto relative">
        <Outlet />
      </main>
    </div>
  );
}
