import { useEffect, useMemo, useState } from "react";
import { saoPauloDay } from "../lib/period";

// Tarefas pessoais: o servidor só devolve as do login (Lucas vê as dele, Dione as dela).
type Prioridade = "baixa" | "normal" | "alta";
type Tarefa = {
  id: string; titulo: string; notas: string; prazo: string | null; prioridade: Prioridade;
  feita: number; criada_em: string; feita_em: string | null;
};
type Rascunho = { id?: string; titulo: string; notas: string; prazo: string; prioridade: Prioridade };

const VAZIO: Rascunho = { titulo: "", notas: "", prazo: "", prioridade: "normal" };
const PRIO: Record<Prioridade, { label: string; cls: string }> = {
  alta: { label: "Alta", cls: "bg-rose/10 text-rose" },
  normal: { label: "Normal", cls: "bg-violet/10 text-violet-light" },
  baixa: { label: "Baixa", cls: "bg-muted/10 text-muted" },
};
const dataBR = (d: string) => d.split("-").reverse().join("/");

async function post(path: string, body: unknown) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erro || "Não foi possível salvar.");
  return d;
}

export default function Tarefas() {
  const [dono, setDono] = useState("");
  const [lista, setLista] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nova, setNova] = useState<Rascunho>(VAZIO);
  const [editando, setEditando] = useState<Rascunho | null>(null);
  const [aba, setAba] = useState<"pendentes" | "feitas">("pendentes");
  const [salvando, setSalvando] = useState(false);
  const hoje = saoPauloDay();

  async function load() {
    try {
      const r = await fetch("/api/tarefas", { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.erro || (r.status === 401 ? "Entre no Atendimento para ver suas tarefas." : "Falha ao carregar as tarefas."));
      setDono(d.dono); setLista(d.tarefas || []); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao carregar as tarefas."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function salvar(t: Rascunho & { feita?: boolean }, limpar?: () => void) {
    setSalvando(true);
    try { await post("/api/tarefas/salvar", t); limpar?.(); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar."); }
    finally { setSalvando(false); }
  }
  async function excluir(t: Tarefa) {
    if (!window.confirm(`Excluir a tarefa "${t.titulo}"?`)) return;
    try { await post("/api/tarefas/excluir", { id: t.id }); setEditando(null); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Falha ao excluir."); }
  }
  const alterna = (t: Tarefa) => salvar({ id: t.id, titulo: t.titulo, notas: t.notas || "", prazo: t.prazo || "", prioridade: t.prioridade, feita: !t.feita });

  const pendentes = useMemo(() => lista.filter(t => !t.feita), [lista]);
  const feitas = useMemo(() => lista.filter(t => t.feita), [lista]);
  const atrasadas = pendentes.filter(t => t.prazo && t.prazo < hoje).length;
  const paraHoje = pendentes.filter(t => t.prazo === hoje).length;
  const mostrar = aba === "pendentes" ? pendentes : feitas;

  const campo = "rounded-lg border border-edge bg-raised px-3 py-2 text-sm text-bright outline-none focus:border-violet";

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold text-bright">Tarefas</h1>
        <p className="mt-1 text-sm text-muted">{dono ? `Suas tarefas e anotações, ${dono}. Só você vê esta lista.` : "Suas tarefas e anotações."}</p>
      </header>

      {error && <div role="alert" className="rounded-lg border border-rose/40 px-4 py-3 text-sm text-rose">{error}</div>}

      <section className="grid grid-cols-3 gap-3">
        {[["Pendentes", pendentes.length, "text-bright"], ["Para hoje", paraHoje, "text-amber"], ["Atrasadas", atrasadas, "text-rose"]].map(([l, n, c]) => (
          <div key={l as string} className="rounded-xl border border-edge-subtle bg-raised p-4">
            <span className="text-xs text-muted">{l}</span>
            <strong className={`mt-1 block text-2xl tabular-nums ${c}`}>{n}</strong>
          </div>
        ))}
      </section>

      <form className="space-y-3 rounded-xl border border-edge-subtle bg-raised p-4"
        onSubmit={e => { e.preventDefault(); void salvar(nova, () => setNova(VAZIO)); }}>
        <input className={campo + " w-full"} placeholder="Nova tarefa — ex.: cobrar cadastro da RedLux" maxLength={200}
          value={nova.titulo} onChange={e => setNova({ ...nova, titulo: e.target.value })} />
        <textarea className={campo + " w-full"} rows={2} placeholder="Anotações (opcional)" maxLength={5000}
          value={nova.notas} onChange={e => setNova({ ...nova, notas: e.target.value })} />
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs text-muted">Prazo
            <input type="date" className={campo} value={nova.prazo} onChange={e => setNova({ ...nova, prazo: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-muted">Prioridade
            <select className={campo} value={nova.prioridade} onChange={e => setNova({ ...nova, prioridade: e.target.value as Prioridade })}>
              <option value="alta">Alta</option><option value="normal">Normal</option><option value="baixa">Baixa</option>
            </select>
          </label>
          <button type="submit" disabled={salvando || !nova.titulo.trim()}
            className="ml-auto rounded-lg bg-violet px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {salvando ? "Salvando…" : "Adicionar tarefa"}
          </button>
        </div>
      </form>

      <div className="flex gap-2 text-sm">
        {(["pendentes", "feitas"] as const).map(a => (
          <button key={a} onClick={() => setAba(a)} aria-pressed={aba === a}
            className={`rounded-full border px-4 py-1.5 ${aba === a ? "border-violet bg-violet text-white" : "border-edge text-muted"}`}>
            {a === "pendentes" ? `Pendentes (${pendentes.length})` : `Feitas (${feitas.length})`}
          </button>
        ))}
      </div>

      <section className="space-y-2">
        {loading ? <p className="text-sm text-muted">Carregando…</p> :
          !mostrar.length ? <p className="rounded-xl border border-dashed border-edge p-6 text-center text-sm text-muted">
            {aba === "pendentes" ? "Nenhuma tarefa pendente. 🎉" : "Nenhuma tarefa concluída ainda."}</p> :
          mostrar.map(t => editando?.id === t.id ? (
            <form key={t.id} className="space-y-3 rounded-xl border border-violet bg-raised p-4"
              onSubmit={e => { e.preventDefault(); void salvar(editando, () => setEditando(null)); }}>
              <input className={campo + " w-full"} maxLength={200} value={editando.titulo}
                onChange={e => setEditando({ ...editando, titulo: e.target.value })} />
              <textarea className={campo + " w-full"} rows={4} maxLength={5000} placeholder="Anotações" value={editando.notas}
                onChange={e => setEditando({ ...editando, notas: e.target.value })} />
              <div className="flex flex-wrap items-end gap-3">
                <input type="date" className={campo} value={editando.prazo} onChange={e => setEditando({ ...editando, prazo: e.target.value })} />
                <select className={campo} value={editando.prioridade} onChange={e => setEditando({ ...editando, prioridade: e.target.value as Prioridade })}>
                  <option value="alta">Alta</option><option value="normal">Normal</option><option value="baixa">Baixa</option>
                </select>
                <button type="button" onClick={() => void excluir(t)} className="text-sm text-rose">Excluir</button>
                <div className="ml-auto flex gap-2">
                  <button type="button" onClick={() => setEditando(null)} className="rounded-lg border border-edge px-4 py-2 text-sm text-muted">Cancelar</button>
                  <button type="submit" disabled={salvando || !editando.titulo.trim()} className="rounded-lg bg-violet px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Salvar</button>
                </div>
              </div>
            </form>
          ) : (
            <article key={t.id} className="flex gap-3 rounded-xl border border-edge-subtle bg-raised p-4">
              <input type="checkbox" aria-label={t.feita ? "Marcar como pendente" : "Marcar como feita"} checked={!!t.feita}
                onChange={() => void alterna(t)} className="mt-1 h-4 w-4 shrink-0 accent-violet" />
              <button type="button" className="min-w-0 flex-1 text-left"
                onClick={() => setEditando({ id: t.id, titulo: t.titulo, notas: t.notas || "", prazo: t.prazo || "", prioridade: t.prioridade })}>
                <span className={`block text-sm font-medium ${t.feita ? "text-muted line-through" : "text-bright"}`}>{t.titulo}</span>
                {t.notas && <span className="mt-1 block whitespace-pre-wrap text-xs text-muted">{t.notas}</span>}
                <span className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  <span className={`rounded px-2 py-0.5 ${PRIO[t.prioridade]?.cls || PRIO.normal.cls}`}>{PRIO[t.prioridade]?.label || "Normal"}</span>
                  {t.prazo && <span className={`rounded px-2 py-0.5 ${!t.feita && t.prazo < hoje ? "bg-rose/10 text-rose" : !t.feita && t.prazo === hoje ? "bg-amber/10 text-amber" : "bg-muted/10 text-muted"}`}>
                    {!t.feita && t.prazo < hoje ? "Atrasada · " : !t.feita && t.prazo === hoje ? "Hoje · " : "Prazo "}{dataBR(t.prazo)}</span>}
                  {t.feita && t.feita_em && <span className="rounded bg-emerald/10 px-2 py-0.5 text-emerald">Feita em {new Date(t.feita_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>}
                </span>
              </button>
            </article>
          ))}
      </section>
    </div>
  );
}
