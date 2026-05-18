import { useEffect, useState } from "react";

// Cards de quebra de objeção: cada um tem o gatilho (o que o cliente fala/sente)
// e a resposta pronta pra copiar e colar no atendimento.
//
// As respostas defaults vivem aqui no código (DEFAULTS abaixo). Edições do
// usuário ficam persistidas em localStorage por id, então mudanças sobrevivem
// recarregamento mas são locais ao browser. "Restaurar padrão" zera a edição
// e volta pro texto original do código.
//
// Pra adicionar um card novo permanente: empurrar mais um objeto em DEFAULTS.

interface Objecao {
  id: string;
  gatilho: string;
  contexto?: string;
  resposta: string;
}

const DEFAULTS: Objecao[] = [
  {
    id: "aquecimento",
    gatilho: "Aquecimento / Reabordagem",
    contexto:
      "Mensagem curta pra reabrir conversa com lead morno (já provocado antes mas não respondeu). Direto ao ponto: oferta gratuita + CTA.",
    resposta: `Boa noite, tudo bem? Bora instalar os 7 dias grátis de provador?`,
  },
  {
    id: "sem-interesse",
    gatilho: "Lead respondeu 'sem interesse no momento'",
    contexto:
      "Quando o lead recusa educadamente, não force reversão (queima ponte). Aceita, deixa 1 dado forte na cabeça (case Cacifé +22% YoY, +R$100k atribuídos) e reforça a barreira-zero (7 dias grátis, sem cartão). Lead morno hoje pode lembrar daqui 2-3 meses.",
    resposta: `Boa noite, [nome]! Respeito totalmente. 🙏

Antes de encerrar, queria só deixar um dado pra você ter como referência: a Cacifé Brand instalou nosso provador em março. Comparando o mesmo período do ano anterior (Abril vs Abril), o faturamento por dia cresceu +22%, e mais de R$ 100 mil em vendas vieram direto de clientes que usaram o provador antes de comprar.

Quando fizer sentido pra sua loja, fica o convite: 7 dias grátis pra testar, sem cartão e com instalação em poucos minutos.

Qualquer coisa estou por aqui. Obrigado pela atenção!`,
  },
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

const STORAGE_KEY = "quantic-crm-objecoes-edits";

function loadEdits(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveEdits(edits: Record<string, string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
  } catch {
    // localStorage cheio ou bloqueado — segue sem persistir
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
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

interface CardProps {
  objecao: Objecao;
  isEdited: boolean;
  onSave: (id: string, novaResposta: string) => void;
  onReset: (id: string) => void;
}

function Card({ objecao, isEdited, onSave, onReset }: CardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(objecao.resposta);

  // Mantém draft sincronizado se a resposta externa mudar (ex: reset)
  useEffect(() => {
    if (!editing) setDraft(objecao.resposta);
  }, [objecao.resposta, editing]);

  const startEdit = () => {
    setDraft(objecao.resposta);
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(objecao.resposta);
    setEditing(false);
  };

  const saveEdit = () => {
    onSave(objecao.id, draft);
    setEditing(false);
  };

  return (
    <article
      className="rounded-lg overflow-hidden"
      style={{
        background: "var(--color-panel)",
        border: "1px solid var(--color-edge-subtle)",
      }}
    >
      <header
        className="px-5 py-3 flex items-start justify-between gap-3"
        style={{ borderBottom: "1px solid var(--color-edge-subtle)" }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[10px] font-bold tracking-widest uppercase"
              style={{ color: "var(--color-violet)" }}
            >
              Objeção
            </span>
            {isEdited && (
              <span
                className="text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded"
                style={{
                  background: "rgba(245, 158, 11, 0.15)",
                  color: "var(--color-amber)",
                }}
                title="Resposta foi editada (salva no seu browser)"
              >
                editado
              </span>
            )}
          </div>
          <h2 className="text-[15px] font-semibold text-bright leading-snug">
            {objecao.gatilho}
          </h2>
          {objecao.contexto && (
            <p className="text-[12px] text-muted mt-1.5 leading-relaxed">
              {objecao.contexto}
            </p>
          )}
        </div>
        {!editing && (
          <button
            onClick={startEdit}
            title="Editar resposta"
            className="flex items-center justify-center w-8 h-8 rounded-md transition-all flex-shrink-0"
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
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 2l3 3-8 8H3v-3l8-8z" />
              <path d="M9 4l3 3" />
            </svg>
          </button>
        )}
      </header>

      <div className="p-5">
        {editing ? (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full text-[13px] leading-relaxed font-sans"
              style={{
                color: "var(--color-text)",
                background: "var(--color-surface)",
                padding: "14px 16px",
                borderRadius: "8px",
                border: "1px solid var(--color-violet)",
                fontFamily: "inherit",
                minHeight: "180px",
                resize: "vertical",
                outline: "none",
                boxShadow: "0 0 0 3px var(--color-violet-wash)",
              }}
              autoFocus
            />
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                onClick={cancelEdit}
                className="px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all"
                style={{
                  background: "transparent",
                  color: "var(--color-muted)",
                  border: "1px solid var(--color-edge-subtle)",
                }}
              >
                Cancelar
              </button>
              <div className="flex items-center gap-2">
                {isEdited && (
                  <button
                    onClick={() => {
                      onReset(objecao.id);
                      setEditing(false);
                    }}
                    className="px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all"
                    style={{
                      background: "transparent",
                      color: "var(--color-amber)",
                      border: "1px solid rgba(245, 158, 11, 0.3)",
                    }}
                    title="Volta pro texto original (descarta sua edição salva)"
                  >
                    Restaurar padrão
                  </button>
                )}
                <button
                  onClick={saveEdit}
                  disabled={draft === objecao.resposta}
                  className="px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all"
                  style={{
                    background: draft === objecao.resposta ? "var(--color-edge-subtle)" : "var(--color-violet)",
                    color: draft === objecao.resposta ? "var(--color-muted)" : "white",
                    border: "1px solid transparent",
                    cursor: draft === objecao.resposta ? "not-allowed" : "pointer",
                  }}
                >
                  Salvar
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
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
              {objecao.resposta}
            </pre>
            <div className="mt-3 flex justify-end">
              <CopyButton text={objecao.resposta} />
            </div>
          </>
        )}
      </div>
    </article>
  );
}

export default function Objecoes() {
  const [edits, setEdits] = useState<Record<string, string>>(() => loadEdits());

  const handleSave = (id: string, novaResposta: string) => {
    const next = { ...edits, [id]: novaResposta };
    setEdits(next);
    saveEdits(next);
  };

  const handleReset = (id: string) => {
    const next = { ...edits };
    delete next[id];
    setEdits(next);
    saveEdits(next);
  };

  const objecoes = DEFAULTS.map((o) => ({
    ...o,
    resposta: edits[o.id] ?? o.resposta,
  }));

  return (
    <div className="p-6 sm:p-8 max-w-[1100px] mx-auto">
      <header className="mb-6">
        <h1 className="text-[24px] font-bold tracking-tight text-bright">
          Quebra de Objeções
        </h1>
        <p className="text-[13px] text-muted mt-1">
          Respostas prontas pras objeções mais comuns. Clica no lápis pra editar, em copiar pra colar no atendimento. Edições ficam salvas no seu browser.
        </p>
      </header>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {objecoes.map((o) => (
          <Card
            key={o.id}
            objecao={o}
            isEdited={edits[o.id] !== undefined}
            onSave={handleSave}
            onReset={handleReset}
          />
        ))}
      </div>
    </div>
  );
}
