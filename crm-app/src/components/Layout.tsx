import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";

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

type Theme = "dark" | "light";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = localStorage.getItem("quantic-crm-theme") as Theme | null;
  if (saved === "light" || saved === "dark") return saved;
  return "dark";
}

export default function Layout() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("quantic-crm-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <div className="flex h-screen text-text" style={{ background: "transparent" }}>
      {/* Sidebar — padrão Quantic (glass + gradient border + left accent no active) */}
      <aside
        className="w-[250px] flex flex-col relative"
        style={{
          background: "var(--color-sidebar)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRight: "1px solid var(--color-sidebar-border)",
        }}
      >
        {/* Gradient line na borda direita (purple → cyan) */}
        <div
          aria-hidden="true"
          className="absolute top-0 right-0 w-px h-full pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, var(--color-violet), transparent 30%, transparent 70%, var(--color-cyan))",
            opacity: 0.3,
          }}
        />

        {/* Brand header */}
        <div
          className="flex items-center gap-3 px-5 h-[72px]"
          style={{ borderBottom: "1px solid var(--color-sidebar-border)" }}
        >
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, var(--color-violet), var(--color-violet-deep))",
              boxShadow: "0 0 12px var(--color-active-glow)",
            }}
          >
            <span className="text-white text-[11px] font-black tracking-tighter">PL</span>
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-bold tracking-tight leading-none text-bright">
              Prospector
            </p>
            <p className="text-[9px] mt-1 tracking-widest uppercase font-bold" style={{ color: "var(--color-cyan)", opacity: 0.8 }}>
              Provou Levou
            </p>
          </div>
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Mudar para modo claro" : "Mudar para modo escuro"}
            className="flex items-center justify-center w-8 h-8 rounded-md transition-all"
            style={{
              background: "transparent",
              border: "1px solid var(--color-edge-subtle)",
              color: "var(--color-muted)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--color-active-bg)";
              e.currentTarget.style.color = "var(--color-violet)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--color-muted)";
            }}
          >
            {theme === "dark" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
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
                    : "border-l-transparent hover:border-l-[var(--color-violet-light)]"
                }`
              }
              style={({ isActive }) =>
                isActive
                  ? {
                      background: "var(--color-active-bg)",
                      color: "var(--color-bright)",
                      boxShadow: "inset 0 0 20px var(--color-violet-wash)",
                    }
                  : { color: "var(--color-muted)" }
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    style={{
                      color: isActive ? "var(--color-violet)" : "currentColor",
                      filter: isActive ? "drop-shadow(0 0 4px var(--color-active-glow))" : "none",
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
            color: "var(--color-cyan)",
            border: "1px solid rgba(6, 182, 212, 0.18)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(6, 182, 212, 0.14)";
            e.currentTarget.style.borderColor = "rgba(6, 182, 212, 0.3)";
            e.currentTarget.style.color = "var(--color-bright)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(6, 182, 212, 0.06)";
            e.currentTarget.style.borderColor = "rgba(6, 182, 212, 0.18)";
            e.currentTarget.style.color = "var(--color-cyan)";
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
