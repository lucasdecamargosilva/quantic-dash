import { useEffect, useRef, useState, type JSX } from "react";
import { useGoalConfig } from "../components/SharedGoals";

// Assistente IA do comercial: conversa sobre o negócio, o funil e os catálogos.
// O backend (pl-atendimento/assistente.py) só enxerga o retrato que a função
// crm_ia_contexto do Supabase devolve — sem telefone, e-mail ou faturamento de lojista.
// A conversa também é gravada no servidor (assistente_log) para o Lucas acompanhar
// na aba "Conversas da equipe".

type Destinatario = { chatid: string; nome: string | null; status: string | null; responsavel: string | null };
type Disparo = { destinatarios: number; itens: Destinatario[]; texto: string; sem_conversa_no_whatsapp?: number; cortados_pelo_limite?: number };
type Msg = { de: "eu" | "ia"; texto: string; disparo?: Disparo | null };
type Envio = { estado: string; total?: number; enviados?: number; falhas?: number; erro?: string };

const STORAGE_KEY = "quantic-crm-assistente";
const CONVERSA_KEY = "quantic-crm-assistente-conversa";
const novaConversaId = () => (crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2));
function conversaAtual(): string {
  try {
    const id = localStorage.getItem(CONVERSA_KEY) || novaConversaId();
    localStorage.setItem(CONVERSA_KEY, id);
    return id;
  } catch { return novaConversaId(); }
}
const SUGESTOES = [
  { i: "⏰", t: "Quais leads em teste eu devo cobrar hoje?" },
  { i: "📈", t: "Quem está provando bem e já dá pra propor pacote?" },
  { i: "💬", t: "Como respondo um lojista que achou caro?" },
  { i: "📣", t: "Prepara um disparo pros leads em teste há mais de 7 dias" },
];

function carrega(): Msg[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as Msg[]; } catch { return []; }
}

const IconeCopiar = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
);
const IconeOk = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
);
const Brilho = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.1 5.4 5.4 2.1-5.4 2.1L12 17.5l-2.1-5.4L4.5 10l5.4-2.1z" /><path d="M18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" opacity=".7" /></svg>
);

function Copiar({ texto, rotulo = false }: { texto: string; rotulo?: boolean }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" title="Copiar" aria-label="Copiar"
      onClick={() => { void navigator.clipboard.writeText(texto).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }); }}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${ok ? "text-emerald" : "text-muted hover:bg-active-bg hover:text-violet-light"}`}>
      {ok ? <IconeOk /> : <IconeCopiar />}{rotulo && (ok ? "Copiado" : "Copiar")}
    </button>
  );
}

function AvatarIA({ grande = false }: { grande?: boolean }) {
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full text-white shadow-[0_0_24px_-6px_var(--color-active-glow)] ${grande ? "h-14 w-14" : "h-8 w-8"}`}
      style={{ background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 55%, #06b6d4 140%)" }}>
      <Brilho size={grande ? 26 : 15} />
    </div>
  );
}

// Markdown leve: títulos, listas (- / 1.), citação, blocos ``` copiáveis, **negrito**, `código`.
function Inline({ texto }: { texto: string }) {
  return <>{texto.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4 ? <strong key={i} className="font-semibold text-bright">{p.slice(2, -2)}</strong>
      : p.startsWith("`") && p.endsWith("`") && p.length > 2 ? <code key={i} className="rounded-md bg-active-bg px-1.5 py-0.5 text-[12.5px] text-violet-light">{p.slice(1, -1)}</code>
        : p)}</>;
}

function BlocoTexto({ texto }: { texto: string }) {
  const linhas = texto.split("\n");
  const out: JSX.Element[] = [];
  let k = 0;
  for (let n = 0; n < linhas.length;) {
    const l = linhas[n];
    if (!l.trim()) { n++; continue; }
    const tit = l.match(/^#{1,4}\s+(.*)/);
    if (tit) { out.push(<h3 key={k++} className="pt-1 text-[15px] font-semibold text-bright"><Inline texto={tit[1]} /></h3>); n++; continue; }
    if (/^\s*>\s?/.test(l)) {
      const q: string[] = [];
      while (n < linhas.length && /^\s*>\s?/.test(linhas[n])) q.push(linhas[n++].replace(/^\s*>\s?/, ""));
      out.push(<blockquote key={k++} className="border-l-2 border-violet/60 pl-3 italic text-sub"><Inline texto={q.join("\n")} /></blockquote>);
      continue;
    }
    const ord = /^\s*\d+[.)]\s+/, bul = /^\s*[-*•]\s+/;
    if (ord.test(l) || bul.test(l)) {
      const ehOrd = ord.test(l); const itens: string[] = [];
      while (n < linhas.length && (ord.test(linhas[n]) || bul.test(linhas[n]) || (/^\s{2,}\S/.test(linhas[n]) && itens.length))) {
        const x = linhas[n++];
        if (ord.test(x) || bul.test(x)) itens.push(x.replace(ord, "").replace(bul, ""));
        else itens[itens.length - 1] += "\n" + x.trim();
      }
      const Tag = ehOrd ? "ol" : "ul";
      out.push(<Tag key={k++} className={`space-y-1.5 pl-5 ${ehOrd ? "list-decimal" : "list-disc"} marker:text-violet-light`}>
        {itens.map((t, m) => <li key={m} className="whitespace-pre-wrap pl-1"><Inline texto={t} /></li>)}</Tag>);
      continue;
    }
    const p: string[] = [];
    while (n < linhas.length && linhas[n].trim() && !/^#{1,4}\s/.test(linhas[n]) && !ord.test(linhas[n]) && !bul.test(linhas[n]) && !/^\s*>/.test(linhas[n])) p.push(linhas[n++]);
    out.push(<p key={k++} className="whitespace-pre-wrap"><Inline texto={p.join("\n")} /></p>);
  }
  return <>{out}</>;
}

function Resposta({ texto }: { texto: string }) {
  const partes = texto.split(/```[a-zA-Z]*\n?/);
  return (
    <div className="space-y-3 text-[14px] leading-relaxed text-text">
      {partes.map((p, i) => i % 2 ? (
        <div key={i} className="overflow-hidden rounded-xl border border-edge bg-surface">
          <div className="flex items-center justify-between border-b border-edge-subtle px-3 py-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Mensagem</span>
            <Copiar texto={p.trim()} rotulo />
          </div>
          <p className="whitespace-pre-wrap px-3.5 py-3 text-[13.5px] text-bright">{p.trim()}</p>
        </div>
      ) : p.trim() ? <BlocoTexto key={i} texto={p} /> : null)}
    </div>
  );
}

function Pensando() {
  return (
    <div className="flex items-start gap-3">
      <AvatarIA />
      <div className="flex items-center gap-1.5 rounded-2xl bg-raised px-4 py-3.5 ring-1 ring-edge-subtle">
        {[0, 1, 2].map(d => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-light" style={{ animationDelay: `${d * 140}ms` }} />)}
        <span className="ml-2 text-xs text-muted">consultando o CRM…</span>
      </div>
    </div>
  );
}

function BolhaEu({ texto, rodape }: { texto: string; rodape?: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-[14px] leading-relaxed text-white shadow-[0_8px_24px_-12px_rgba(124,58,237,.7)]"
        style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}>
        {rodape && <div className="mb-0.5 text-[10.5px] font-medium text-white/70">{rodape}</div>}
        <p className="whitespace-pre-wrap">{texto}</p>
      </div>
    </div>
  );
}

function BolhaIA({ children, copiar }: { children: React.ReactNode; copiar?: string }) {
  return (
    <div className="group flex items-start gap-3">
      <AvatarIA />
      <div className="min-w-0 flex-1 pt-1">
        {children}
        {copiar && <div className="mt-1.5 -ml-2 flex opacity-0 transition-opacity group-hover:opacity-100"><Copiar texto={copiar} rotulo /></div>}
      </div>
    </div>
  );
}

// Cartão do disparo preparado pela IA. Nada sai sem o clique aqui; o envio usa o mesmo
// /api/disparo do painel (instância Quantic 4714) com pausa de 10–20 s entre contatos.
function CartaoDisparo({ d }: { d: Disparo }) {
  const [itens, setItens] = useState(d.itens);
  const [texto, setTexto] = useState(d.texto);
  const [aberto, setAberto] = useState(false);
  const [envio, setEnvio] = useState<Envio | null>(null);
  const [erro, setErro] = useState("");

  async function disparar() {
    if (!itens.length || !texto.trim()) return;
    if (!window.confirm(`Enviar esta mensagem para ${itens.length} conversa${itens.length === 1 ? "" : "s"} pelo WhatsApp 4714?`)) return;
    setErro("");
    try {
      const r = await fetch("/api/disparo", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatids: itens.map(i => i.chatid), texto, origem: "assistente" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.eid) throw new Error(j.erro || `Falha ao iniciar o disparo (HTTP ${r.status}).`);
      setEnvio({ estado: "enviando", total: itens.length, enviados: 0, falhas: 0 });
      const t = setInterval(async () => {
        try {
          const s: Envio = await (await fetch("/api/envio?eid=" + j.eid, { cache: "no-store" })).json();
          setEnvio(s);
          if (s.estado !== "enviando") clearInterval(t);
        } catch { /* tenta de novo no próximo ciclo */ }
      }, 4000);
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao disparar."); }
  }

  const travado = !!envio;
  const pct = envio?.total ? Math.round(((envio.enviados ?? 0) + (envio.falhas ?? 0)) / envio.total * 100) : 0;
  const ini = (n: string | null) => (n || "?").trim().split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase();
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-violet/30 bg-raised shadow-[0_12px_40px_-20px_var(--color-active-glow)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-edge-subtle px-4 py-3" style={{ background: "linear-gradient(90deg, rgba(139,92,246,.12), transparent)" }}>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald/15 text-emerald">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .6l-.4.5-.3.4c-.1.1-.2.3-.1.5.6 1 1.3 1.7 2.2 2.3.8.5 1.3.6 1.5.5l.6-.7c.2-.3.4-.2.6-.1l1.9.9c.2.1.4.2.4.3.1.2.1.7-.1 1.3z" /></svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-bright">Disparo pronto para {itens.length} conversa{itens.length === 1 ? "" : "s"}</p>
          <p className="text-[11.5px] text-muted">WhatsApp Quantic 4714 · pausa de 10–20 s entre contatos</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {!!d.sem_conversa_no_whatsapp && <span className="rounded-full bg-amber/10 px-2 py-0.5 text-[11px] text-amber">{d.sem_conversa_no_whatsapp} sem WhatsApp</span>}
          {!!d.cortados_pelo_limite && <span className="rounded-full bg-amber/10 px-2 py-0.5 text-[11px] text-amber">{d.cortados_pelo_limite} acima de 100</span>}
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {itens.slice(0, 6).map(i => (
                <span key={i.chatid} title={i.nome || ""} className="flex h-7 w-7 items-center justify-center rounded-full bg-panel text-[10px] font-semibold text-sub ring-2 ring-raised">{ini(i.nome)}</span>
              ))}
              {itens.length > 6 && <span className="flex h-7 w-7 items-center justify-center rounded-full bg-active-bg text-[10px] font-semibold text-violet-light ring-2 ring-raised">+{itens.length - 6}</span>}
            </div>
            <button type="button" onClick={() => setAberto(v => !v)} className="ml-auto text-xs font-medium text-violet-light hover:underline">{aberto ? "Esconder lista" : "Ver e editar lista"}</button>
          </div>
          {aberto && (
            <ul className="mt-2 max-h-56 divide-y divide-edge-subtle overflow-y-auto rounded-xl border border-edge-subtle">
              {itens.map(i => (
                <li key={i.chatid} className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-panel text-[9.5px] font-semibold text-sub">{ini(i.nome)}</span>
                  <span className="flex-1 truncate text-bright">{i.nome || i.chatid.split("@")[0]}</span>
                  {i.status && <span className="rounded-full bg-active-bg px-2 py-0.5 text-[10.5px] text-violet-light">{i.status}</span>}
                  {i.responsavel && <span className="text-[11px] text-muted">{i.responsavel}</span>}
                  {!travado && <button type="button" onClick={() => setItens(itens.filter(x => x.chatid !== i.chatid))} className="rounded-md p-1 text-muted hover:bg-rose/10 hover:text-rose" aria-label="Tirar da lista">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-edge bg-surface focus-within:border-violet/60">
          <textarea value={texto} onChange={e => setTexto(e.target.value)} disabled={travado} rows={4} maxLength={4096}
            className="w-full resize-none bg-transparent px-3.5 py-3 text-[13.5px] leading-relaxed text-bright outline-none disabled:opacity-70" />
          <p className="border-t border-edge-subtle px-3.5 py-1.5 text-[11px] text-muted"><code className="text-violet-light">{"{nome}"}</code> vira o primeiro nome · uma linha só com <code className="text-violet-light">---</code> separa em duas mensagens</p>
        </div>

        {erro && <p role="alert" className="text-xs text-rose">{erro}</p>}
        {envio ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[13px]">
              <span className={envio.estado === "ok" ? "font-medium text-emerald" : envio.estado === "enviando" ? "text-sub" : "font-medium text-amber"}>
                {envio.estado === "enviando" ? "Enviando…" : envio.estado === "ok" ? "Disparo concluído" : "Terminou com falhas"}</span>
              <span className="tabular-nums text-muted">{envio.enviados ?? 0}/{envio.total ?? itens.length}{envio.falhas ? ` · ${envio.falhas} falha(s)` : ""}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-panel">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(pct, 4)}%`, background: envio.falhas ? "var(--color-amber)" : "linear-gradient(90deg,#8b5cf6,#10b981)" }} />
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => void disparar()} disabled={!itens.length || !texto.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></svg>
            Disparar para {itens.length} conversa{itens.length === 1 ? "" : "s"}
          </button>
        )}
      </div>
    </div>
  );
}

type ConversaResumo = { conversa_id: string; usuario: string; inicio: number; ultima: number; perguntas: number; disparos: number; primeira: string };
type Turno = { usuario: string; pergunta: string; resposta: string; disparo_n: number; ts: number };
const dataHora = (ts: number) => new Date(ts * 1000).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const nomeUsuario = (u: string) => (u === "dione" ? "Dione" : u === "lucas" ? "Lucas" : u);

// Só aparece pro Lucas (o servidor também recusa qualquer outro login).
function ConversasEquipe() {
  const [lista, setLista] = useState<ConversaResumo[]>([]);
  const [filtro, setFiltro] = useState("dione");
  const [aberta, setAberta] = useState<string | null>(null);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  async function carrega() {
    setCarregando(true); setErro("");
    try {
      const r = await fetch("/api/assistente/conversas", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro || `HTTP ${r.status}`);
      setLista(d.itens || []);
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao carregar."); } finally { setCarregando(false); }
  }
  useEffect(() => { void carrega(); }, []);
  useEffect(() => {
    if (!aberta) return;
    void fetch("/api/assistente/conversa?id=" + encodeURIComponent(aberta), { cache: "no-store" })
      .then(r => r.json()).then(d => setTurnos(d.itens || [])).catch(() => setTurnos([]));
  }, [aberta]);

  const visiveis = lista.filter(c => !filtro || c.usuario === filtro);
  return (
    <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[300px_1fr]">
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-edge-subtle bg-raised">
        <div className="flex items-center gap-2 border-b border-edge-subtle p-2.5">
          <div className="flex rounded-lg bg-surface p-0.5 text-xs">
            {[["dione", "Dione"], ["lucas", "Lucas"], ["", "Todos"]].map(([v, r]) => (
              <button key={v} onClick={() => setFiltro(v)} className={`rounded-md px-2.5 py-1 ${filtro === v ? "bg-violet text-white" : "text-muted hover:text-bright"}`}>{r}</button>
            ))}
          </div>
          <button onClick={() => void carrega()} title="Atualizar" className="ml-auto rounded-md p-1.5 text-muted hover:bg-active-bg hover:text-violet-light">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {carregando && <p className="p-4 text-xs text-muted">Carregando…</p>}
          {erro && <p role="alert" className="p-4 text-xs text-rose">{erro}</p>}
          {!carregando && !erro && !visiveis.length && <p className="p-4 text-xs text-muted">Nenhuma conversa ainda.</p>}
          {visiveis.map(c => (
            <button key={c.conversa_id + c.usuario} onClick={() => setAberta(c.conversa_id)}
              className={`block w-full border-l-2 px-3.5 py-3 text-left transition-colors hover:bg-active-bg ${aberta === c.conversa_id ? "border-l-violet bg-active-bg" : "border-l-transparent"}`}>
              <div className="flex items-center gap-2 text-[11px] text-muted">
                <span className="font-semibold text-violet-light">{nomeUsuario(c.usuario)}</span>
                <span>{dataHora(c.ultima)}</span>
                <span className="ml-auto">{c.perguntas}×{c.disparos ? " · disparo" : ""}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-bright">{c.primeira}</p>
            </button>
          ))}
        </div>
      </aside>
      <section className="min-h-0 overflow-y-auto rounded-2xl border border-edge-subtle bg-base/40 p-5">
        {!aberta ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted"><AvatarIA grande />Escolha uma conversa ao lado.</div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {turnos.map((t, i) => (
              <div key={i} className="space-y-4">
                <BolhaEu texto={t.pergunta} rodape={`${nomeUsuario(t.usuario)} · ${dataHora(t.ts)}`} />
                <BolhaIA>
                  <Resposta texto={t.resposta} />
                  {t.disparo_n > 0 && <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber/10 px-2.5 py-1 text-xs text-amber">Preparou um disparo para {t.disparo_n} conversa{t.disparo_n === 1 ? "" : "s"}</p>}
                </BolhaIA>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function Assistente() {
  const [msgs, setMsgs] = useState<Msg[]>(carrega);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState("");
  const fim = useRef<HTMLDivElement>(null);
  const { canEdit: isLucas } = useGoalConfig();
  const [aba, setAba] = useState<"minha" | "equipe">("minha");
  const conversaId = useRef(conversaAtual());
  const caixa = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-40))); } catch { /* segue sem salvar */ }
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, pensando]);

  async function enviar(pergunta: string) {
    const q = pergunta.trim();
    if (!q || pensando) return;
    const nova = [...msgs, { de: "eu" as const, texto: q }];
    setMsgs(nova); setTexto(""); setErro(""); setPensando(true);
    if (caixa.current) caixa.current.style.height = "auto";
    try {
      const r = await fetch("/api/assistente", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagens: nova.map(m => ({ de: m.de, texto: m.texto })), conversa_id: conversaId.current }),
      });
      const bruto = await r.text();
      let d: { resposta?: string; erro?: string; error?: string; disparo?: Disparo | null } = {};
      try { d = JSON.parse(bruto); } catch { /* resposta não-JSON (ex.: 502 do proxy) */ }
      if (r.status === 401) throw new Error("Sua sessão expirou. Recarregue a página e entre de novo.");
      if (!r.ok || !d.resposta) throw new Error(d.erro || d.error ||
        `Não consegui responder agora (HTTP ${r.status}${bruto ? ": " + bruto.replace(/<[^>]*>/g, " ").trim().slice(0, 120) : ""}). Tente de novo.`);
      setMsgs([...nova, { de: "ia", texto: d.resposta, disparo: d.disparo || null }]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao falar com a IA.");
    } finally { setPensando(false); }
  }

  const novaConversa = () => {
    setMsgs([]); setErro("");
    conversaId.current = novaConversaId();
    try { localStorage.setItem(CONVERSA_KEY, conversaId.current); } catch { /* segue */ }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-edge-subtle px-4 py-3 sm:px-6">
        <AvatarIA />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-tight text-bright">Assistente IA</p>
          <p className="truncate text-xs text-muted">Dados do CRM em tempo real · prepara disparos no WhatsApp</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isLucas && (
            <div className="flex rounded-lg bg-raised p-0.5 text-xs ring-1 ring-edge-subtle">
              {(["minha", "equipe"] as const).map(a => (
                <button key={a} onClick={() => setAba(a)} className={`rounded-md px-3 py-1.5 transition-colors ${aba === a ? "bg-violet text-white" : "text-muted hover:text-bright"}`}>
                  {a === "minha" ? "Minha conversa" : "Conversas da equipe"}</button>
              ))}
            </div>
          )}
          {aba === "minha" && msgs.length > 0 && (
            <button onClick={novaConversa} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted ring-1 ring-edge-subtle hover:bg-active-bg hover:text-bright">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>Nova conversa</button>
          )}
        </div>
      </header>

      {aba === "equipe" ? <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6"><ConversasEquipe /></div> : <>
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl space-y-7 px-4 py-6 sm:px-6">
            {!msgs.length && (
              <div className="flex flex-col items-center pt-[8vh] text-center">
                <AvatarIA grande />
                <p className="mt-4 text-2xl font-semibold text-bright">Como posso ajudar hoje?</p>
                <p className="mt-1.5 max-w-md text-sm text-muted">Pergunte sobre leads, etapas, planos fechados e catálogos — ou peça pra preparar um disparo.</p>
                <div className="mt-8 grid w-full gap-2.5 sm:grid-cols-2">
                  {SUGESTOES.map(s => (
                    <button key={s.t} onClick={() => void enviar(s.t)}
                      className="group flex items-start gap-3 rounded-2xl bg-raised p-3.5 text-left ring-1 ring-edge-subtle transition hover:-translate-y-0.5 hover:ring-violet/50">
                      <span className="mt-0.5 text-lg leading-none">{s.i}</span>
                      <span className="text-[13px] leading-snug text-sub group-hover:text-bright">{s.t}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => m.de === "eu" ? <BolhaEu key={i} texto={m.texto} /> : (
              <BolhaIA key={i} copiar={m.texto}>
                <Resposta texto={m.texto} />
                {m.disparo && m.disparo.itens?.length > 0 && <CartaoDisparo d={m.disparo} />}
              </BolhaIA>
            ))}
            {pensando && <Pensando />}
            {erro && <div role="alert" className="flex items-start gap-2 rounded-xl bg-rose/10 px-4 py-3 text-sm text-rose ring-1 ring-rose/30">
              <svg className="mt-0.5 shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>{erro}</div>}
            <div ref={fim} />
          </div>
        </div>

        <div className="px-4 pb-4 sm:px-6 sm:pb-5">
          <form onSubmit={e => { e.preventDefault(); void enviar(texto); }}
            className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl bg-raised p-2 pl-4 ring-1 ring-edge shadow-[0_10px_40px_-20px_rgba(0,0,0,.6)] transition focus-within:ring-violet/60">
            <textarea ref={caixa} value={texto} rows={1} maxLength={4000}
              onChange={e => { setTexto(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px"; }}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(texto); } }}
              placeholder="Pergunte qualquer coisa sobre o CRM…"
              className="max-h-[200px] flex-1 resize-none bg-transparent py-2 text-[14px] leading-relaxed text-bright outline-none placeholder:text-dim" />
            <button type="submit" disabled={pensando || !texto.trim()} aria-label="Enviar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white transition hover:brightness-110 disabled:opacity-35"
              style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </button>
          </form>
          <p className="mx-auto mt-1.5 max-w-3xl text-center text-[11px] text-dim">Enter envia · Shift+Enter quebra linha · a IA pode errar, confira números importantes</p>
        </div>
      </>}
    </div>
  );
}
