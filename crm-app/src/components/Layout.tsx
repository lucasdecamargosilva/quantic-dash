import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import logoProvouLevouClaro from "../assets/provou-levou-logo-claro.png";
import logoProvouLevouEscuro from "../assets/provou-levou-logo-escuro.png";

const NAV_ITEMS = [
  {
    to: "/",
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
  {
    to: "/pipeline",
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
    to: "/objecoes",
    label: "Objeções",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 1l2.4 4.6L15 6.3l-3.5 3.4.8 4.8L8 12.2 3.7 14.5l.8-4.8L1 6.3l4.6-.7L8 1z" />
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
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("quantic-crm-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  const closeNav = () => setNavOpen(false);
  const logoProvouLevou = theme === "light" ? logoProvouLevouClaro : logoProvouLevouEscuro;
  // Compensa diferença de aspect ratio entre os dois PNGs (claro 5.73:1, escuro 3.78:1)
  // pra que o "provou levou." apareça do mesmo tamanho visual em ambos os temas.
  const logoSize =
    theme === "light"
      ? { sidebar: "h-8", topBar: "h-6", footer: "h-5" }
      : { sidebar: "h-11", topBar: "h-8", footer: "h-7" };

  return (
    <div className="flex h-screen text-text" style={{ background: "transparent" }}>
      {/* Backdrop do drawer (apenas mobile, quando aberto) */}
      {navOpen && (
        <div
          aria-hidden="true"
          onClick={closeNav}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}

      {/* Sidebar — padrão Quantic (glass + gradient border + left accent no active)
          Desktop: coluna fixa 250px. Mobile: drawer deslizante. */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[250px] flex flex-col transition-transform duration-200 lg:relative lg:z-auto lg:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
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
          <img
            src={logoProvouLevou}
            alt="Provou Levou"
            className={`flex-1 min-w-0 ${logoSize.sidebar} object-contain object-left`}
          />
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
              onClick={closeNav}
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
        {/* Top bar mobile (hambúrguer) — oculta no desktop */}
        <div
          className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-14"
          style={{
            background: "var(--color-sidebar)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderBottom: "1px solid var(--color-sidebar-border)",
          }}
        >
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Abrir menu"
            className="flex items-center justify-center w-9 h-9 rounded-md flex-shrink-0"
            style={{ border: "1px solid var(--color-edge-subtle)", color: "var(--color-sub)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <img src={logoProvouLevou} alt="Provou Levou" className={`${logoSize.topBar} object-contain`} />
        </div>
        <Outlet />
        {/* Rodapé do sistema com o logo */}
        <footer className="py-6 px-4 lg:px-8 flex items-center justify-center">
          <img src={logoProvouLevou} alt="Provou Levou" className={`${logoSize.footer} object-contain opacity-50`} />
        </footer>
      </main>
    </div>
  );
}
