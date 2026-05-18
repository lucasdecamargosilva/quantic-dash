import { useState } from "react";

// Cards de quebra de objeção: cada um tem o gatilho (o que o cliente fala/sente)
// e a resposta pronta pra copiar e colar no atendimento.
// Pra adicionar: só empurrar mais um objeto no array OBJECOES.

interface Objecao {
  id: string;
  gatilho: string;
  contexto?: string;
  resposta: string;
}

const OBJECOES: Objecao[] = [
  {
    id: "valor",
    gatilho: "Achei caro / Quanto custa?",
    contexto:
      "Use antes ou logo depois de mandar os planos. Ancora no ROI antes do número e fecha com 7 dias grátis.",
    resposta: `Antes de mandar os valores, deixa eu te dar um número rápido:

Lojas de moda no Brasil convertem em média 1,9%. Com o provador virtual essa taxa sobe pra até 15% — e isso a gente já viu acontecer nas nossas lojas (Cacifé, Mariana Cardoso e outras).

O que isso significa na prática: pra cada R$ 10 mil que sua loja já fatura por mês, o provador adiciona em média R$ 1,2k a R$ 1,5k em vendas novas (vendas que não aconteceriam sem ele).

E como eu sei que você só vai acreditar quando ver com os seus clientes, damos 7 dias grátis pra você testar na loja!`,
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback se clipboard API não estiver disponível
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  return (
    <button
      onClick={handle}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all"
      style={{
        background: copied ? "rgba(16, 185, 129, 0.12)" : "var(--color-active-bg)",
        color: copied ? "var(--color-emerald)" : "var(--color-violet)",
        border: `1px solid ${copied ? "rgba(16, 185, 129, 0.3)" : "var(--color-edge-subtle)"}`,
      }}
    >
      {copied ? (
        <>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8l3 3 7-7" />
          </svg>
          Copiado!
        </>
      ) : (
        <>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="5" y="5" width="9" height="9" rx="1.5" />
            <path d="M3 11V3a1 1 0 0 1 1-1h8" />
          </svg>
          Copiar resposta
        </>
      )}
    </button>
  );
}

export default function Objecoes() {
  return (
    <div className="p-6 sm:p-8 max-w-[1100px] mx-auto">
      <header className="mb-6">
        <h1 className="text-[24px] font-bold tracking-tight text-bright">
          Quebra de Objeções
        </h1>
        <p className="text-[13px] text-muted mt-1">
          Respostas prontas pras objeções mais comuns. Clica em copiar e cola direto no atendimento.
        </p>
      </header>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {OBJECOES.map((o) => (
          <article
            key={o.id}
            className="rounded-lg overflow-hidden"
            style={{
              background: "var(--color-panel)",
              border: "1px solid var(--color-edge-subtle)",
            }}
          >
            <header
              className="px-5 py-3"
              style={{ borderBottom: "1px solid var(--color-edge-subtle)" }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-[10px] font-bold tracking-widest uppercase"
                  style={{ color: "var(--color-violet)" }}
                >
                  Objeção
                </span>
              </div>
              <h2 className="text-[15px] font-semibold text-bright leading-snug">
                {o.gatilho}
              </h2>
              {o.contexto && (
                <p className="text-[12px] text-muted mt-1.5 leading-relaxed">
                  {o.contexto}
                </p>
              )}
            </header>

            <div className="p-5">
              <pre
                className="text-[13px] leading-relaxed whitespace-pre-wrap font-sans"
                style={{
                  color: "var(--color-text)",
                  background: "var(--color-surface)",
                  padding: "14px 16px",
                  borderRadius: "8px",
                  border: "1px solid var(--color-edge-subtle)",
                  fontFamily: "inherit",
                }}
              >
                {o.resposta}
              </pre>
              <div className="mt-3 flex justify-end">
                <CopyButton text={o.resposta} />
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
