"use client";

import { useEffect, useState } from "react";

/**
 * Gate de auth que reusa a session do Supabase do dashboard quantic-dash.
 * Como /fotos roda no mesmo domínio (crm.quanticsolutions.com.br), o
 * localStorage é compartilhado com login.html / custos.html / etc.
 *
 * Se não tem session válida, redireciona pra /login.html (página do dashboard).
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "authed">("loading");

  useEffect(() => {
    try {
      const hasValidSession = Object.keys(localStorage).some((k) => {
        if (!k.startsWith("sb-") || !k.endsWith("-auth-token")) return false;
        try {
          const v = JSON.parse(localStorage.getItem(k) || "null");
          if (!v?.access_token) return false;
          // Se tem expires_at, valida; senão assume válido (token sem expiração não é comum mas trata)
          if (v.expires_at) return v.expires_at * 1000 > Date.now();
          return true;
        } catch {
          return false;
        }
      });

      if (hasValidSession) {
        setState("authed");
      } else {
        window.location.href = "/login.html";
      }
    } catch {
      window.location.href = "/login.html";
    }
  }, []);

  if (state === "loading") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily:
            "var(--font-helvetica), -apple-system, system-ui, sans-serif",
          color: "var(--text-soft, #999)",
          background: "var(--bg, #fff)",
        }}
      >
        <span style={{ fontSize: 14, letterSpacing: "0.05em" }}>
          Verificando autenticação…
        </span>
      </div>
    );
  }

  return <>{children}</>;
}
