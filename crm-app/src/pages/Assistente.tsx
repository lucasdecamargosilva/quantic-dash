import { useEffect, useRef, useState } from "react";

// Assistente IA do comercial: conversa sobre o negócio, o funil e os catálogos.
// O backend (pl-atendimento/assistente.py) só enxerga o retrato que a função
// crm_ia_contexto do Supabase devolve — sem telefone, e-mail ou faturamento de lojista.
// A conversa fica só neste navegador (localStorage).

type Msg = { de: "eu" | "ia"; texto: string };

const STORAGE_KEY = "quantic-crm-assistente";
const SUGESTOES = [
  "Quais leads em teste eu devo cobrar hoje?",
  "Quem está provando bem e já dá pra propor pacote?",
  "Como respondo um lojista que achou caro?",
  "Explica a diferença entre Provou Catálogo e o provador no site",
];

function carrega(): Msg[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as Msg[]; } catch { return []; }
}

function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" onClick={() => { void navigator.clipboard.writeText(texto).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }); }}
      className="rounded-md border border-edge-subtle px-2 py-0.5 text-[11px] font-semibold text-violet hover:bg-active-bg">
      {ok ? "Copiado!" : "Copiar"}
    </button>
  );
}

// Markdown mínimo: blocos ``` viram caixa copiável; **negrito** e `código` inline.
function Inline({ texto }: { texto: string }) {
  return <>{texto.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="text-bright">{p.slice(2, -2)}</strong>
      : p.startsWith("`") && p.endsWith("`") ? <code key={i} className="rounded bg-active-bg px-1 text-[12px]">{p.slice(1, -1)}</code>
        : p)}</>;
}

function Resposta({ texto }: { texto: string }) {
  const partes = texto.split(/```[a-z]*\n?/);
  return (
    <div className="space-y-2">
      {partes.map((p, i) => i % 2 ? (
        <div key={i} className="rounded-lg border border-edge-subtle bg-active-bg p-3">
          <div className="mb-1 flex justify-end"><Copiar texto={p.trim()} /></div>
          <p className="whitespace-pre-wrap text-sm text-bright">{p.trim()}</p>
        </div>
      ) : p.trim() && (
        <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed"><Inline texto={p.replace(/^\n+|\n+$/g, "")} /></p>
      ))}
    </div>
  );
}

export default function Assistente() {
  const [msgs, setMsgs] = useState<Msg[]>(carrega);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState("");
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-40))); } catch { /* segue sem salvar */ }
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, pensando]);

  async function enviar(pergunta: string) {
    const q = pergunta.trim();
    if (!q || pensando) return;
    const nova = [...msgs, { de: "eu" as const, texto: q }];
    setMsgs(nova); setTexto(""); setErro(""); setPensando(true);
    try {
      const r = await fetch("/api/assistente", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagens: nova }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.resposta) throw new Error(d.erro || "Não consegui responder agora. Tente de novo.");
      setMsgs([...nova, { de: "ia", texto: d.resposta }]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao falar com a IA.");
    } finally { setPensando(false); }
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3 pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-bright">Assistente IA</h1>
          <p className="mt-1 text-sm text-muted">Pergunte sobre a Provou Levou, os planos, o funil e os catálogos em teste. Os dados são do CRM de agora.</p>
        </div>
        {msgs.length > 0 && <button onClick={() => { setMsgs([]); setErro(""); }} className="rounded-lg border border-edge px-3 py-1.5 text-xs text-muted hover:text-bright">Nova conversa</button>}
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {!msgs.length && (
          <div className="grid gap-2 sm:grid-cols-2">
            {SUGESTOES.map(s => (
              <button key={s} onClick={() => void enviar(s)} className="rounded-xl border border-edge-subtle bg-raised p-3 text-left text-sm text-sub hover:border-violet hover:text-bright">{s}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => m.de === "eu" ? (
          <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-violet px-4 py-2.5 text-sm text-white">{m.texto}</div>
        ) : (
          <div key={i} className="max-w-[92%] rounded-2xl rounded-bl-sm border border-edge-subtle bg-raised px-4 py-3 text-sub">
            <Resposta texto={m.texto} />
            <div className="mt-2 flex justify-end"><Copiar texto={m.texto} /></div>
          </div>
        ))}
        {pensando && <div className="w-fit rounded-2xl border border-edge-subtle bg-raised px-4 py-3 text-sm text-muted">Pensando…</div>}
        {erro && <div role="alert" className="rounded-lg border border-rose/40 px-4 py-3 text-sm text-rose">{erro}</div>}
        <div ref={fim} />
      </div>

      <form onSubmit={e => { e.preventDefault(); void enviar(texto); }} className="flex items-end gap-2 border-t border-edge-subtle pt-3">
        <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2} maxLength={4000}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(texto); } }}
          placeholder="Escreva sua pergunta… (Enter envia, Shift+Enter quebra linha)"
          className="flex-1 resize-none rounded-lg border border-edge bg-raised px-3 py-2 text-sm text-bright outline-none focus:border-violet" />
        <button type="submit" disabled={pensando || !texto.trim()} className="rounded-lg bg-violet px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Enviar</button>
      </form>
    </div>
  );
}
