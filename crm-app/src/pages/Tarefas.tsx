import { useEffect, useMemo, useState } from "react";
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { saoPauloDay } from "../lib/period";

// Quadro de tarefas pessoais (A fazer → Em progresso → Feito). O servidor só devolve
// as do login: o Lucas vê as dele, a Dione as dela.
type Prioridade = "baixa" | "normal" | "alta";
type Estado = "a_fazer" | "em_progresso" | "feito";
type Tarefa = {
  id: string; titulo: string; notas: string; prazo: string | null; prioridade: Prioridade;
  feita: number; estado: Estado | null; criada_em: string; feita_em: string | null;
};
type Rascunho = { id?: string; titulo: string; notas: string; prazo: string; prioridade: Prioridade; estado?: Estado };

const VAZIO: Rascunho = { titulo: "", notas: "", prazo: "", prioridade: "normal" };
const COLUNAS: { id: Estado; label: string; cor: string }[] = [
  { id: "a_fazer", label: "A fazer", cor: "#94a3b8" },
  { id: "em_progresso", label: "Em progresso", cor: "#f59e0b" },
  { id: "feito", label: "Feito", cor: "#10b981" },
];
const PRIO: Record<Prioridade, { label: string; cls: string; peso: number }> = {
  alta: { label: "Alta", cls: "bg-rose/10 text-rose", peso: 0 },
  normal: { label: "Normal", cls: "bg-violet/10 text-violet-light", peso: 1 },
  baixa: { label: "Baixa", cls: "bg-muted/10 text-muted", peso: 2 },
};
const dataBR = (d: string) => d.split("-").reverse().join("/");
const estadoDe = (t: Tarefa): Estado => t.estado || (t.feita ? "feito" : "a_fazer");
const campo = "rounded-lg border border-edge bg-raised px-3 py-2 text-sm text-bright outline-none focus:border-violet";

async function post(path: string, body: unknown) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erro || "Não foi possível salvar.");
  return d;
}

function Coluna({ id, children }: { id: Estado; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={`flex min-h-[320px] flex-col gap-2 rounded-xl border p-3 transition ${isOver ? "border-violet bg-active-bg" : "border-edge-subtle bg-surface"}`}>{children}</div>;
}

function Cartao({ t, hoje, onAbrir }: { t: Tarefa; hoje: string; onAbrir: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: t.id, data: { t } });
  const estado = estadoDe(t);
  const atrasada = estado !== "feito" && !!t.prazo && t.prazo < hoje;
  const deHoje = estado !== "feito" && t.prazo === hoje;
  return (
    <button ref={setNodeRef} {...attributes} {...listeners} type="button" onClick={() => { if (!isDragging) onAbrir(); }}
      style={{ opacity: isDragging ? 0.3 : 1, transform: transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined }}
      className="w-full cursor-grab rounded-lg border border-edge-subtle bg-raised p-3 text-left hover:border-violet active:cursor-grabbing">
      <span className={`block text-sm font-medium ${estado === "feito" ? "text-muted line-through" : "text-bright"}`}>{t.titulo}</span>
      {t.notas && <span className="mt-1 line-clamp-3 block whitespace-pre-wrap text-xs text-muted">{t.notas}</span>}
      <span className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        <span className={`rounded px-2 py-0.5 ${PRIO[t.prioridade]?.cls || PRIO.normal.cls}`}>{PRIO[t.prioridade]?.label || "Normal"}</span>
        {t.prazo && <span className={`rounded px-2 py-0.5 ${atrasada ? "bg-rose/10 text-rose" : deHoje ? "bg-amber/10 text-amber" : "bg-muted/10 text-muted"}`}>
          {atrasada ? "Atrasada · " : deHoje ? "Hoje · " : ""}{dataBR(t.prazo)}</span>}
      </span>
    </button>
  );
}

export default function Tarefas() {
  const [dono, setDono] = useState("");
  const [lista, setLista] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nova, setNova] = useState<Rascunho>(VAZIO);
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Rascunho | null>(null);
  const [arrastando, setArrastando] = useState<Tarefa | null>(null);
  const [salvando, setSalvando] = useState(false);
  const hoje = saoPauloDay();
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }));

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

  async function salvar(t: Rascunho, depois?: () => void) {
    setSalvando(true);
    try { await post("/api/tarefas/salvar", t); depois?.(); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar."); }
    finally { setSalvando(false); }
  }
  async function excluir(id: string, titulo: string) {
    if (!window.confirm(`Excluir a tarefa "${titulo}"?`)) return;
    try { await post("/api/tarefas/excluir", { id }); setEditando(null); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Falha ao excluir."); }
  }

  async function soltar(e: DragEndEvent) {
    setArrastando(null);
    const t = e.active.data.current?.t as Tarefa | undefined, alvo = e.over?.id as Estado | undefined;
    if (!t || !alvo || estadoDe(t) === alvo) return;
    // move na tela na hora; se o servidor recusar, o load() devolve ao lugar
    setLista(l => l.map(x => x.id === t.id ? { ...x, estado: alvo, feita: alvo === "feito" ? 1 : 0 } : x));
    try { await post("/api/tarefas/salvar", { id: t.id, titulo: t.titulo, notas: t.notas || "", prazo: t.prazo || "", prioridade: t.prioridade, estado: alvo }); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao mover."); }
    await load();
  }

  const porColuna = useMemo(() => {
    const ordem = (a: Tarefa, b: Tarefa) => (a.prazo || "9999").localeCompare(b.prazo || "9999") ||
      (PRIO[a.prioridade]?.peso ?? 1) - (PRIO[b.prioridade]?.peso ?? 1);
    return Object.fromEntries(COLUNAS.map(c => [c.id, lista.filter(t => estadoDe(t) === c.id).sort(c.id === "feito"
      ? (a, b) => (b.feita_em || "").localeCompare(a.feita_em || "") : ordem)])) as Record<Estado, Tarefa[]>;
  }, [lista]);
  const abertas = lista.filter(t => estadoDe(t) !== "feito");
  const atrasadas = abertas.filter(t => t.prazo && t.prazo < hoje).length;
  const paraHoje = abertas.filter(t => t.prazo === hoje).length;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-bright">Tarefas</h1>
          <p className="mt-1 text-sm text-muted">{dono ? `Seu quadro, ${dono}. Arraste os cartões entre as colunas. Só você vê.` : "Seu quadro de tarefas."}</p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-full bg-amber/10 px-3 py-1 text-amber">{paraHoje} para hoje</span>
          <span className="rounded-full bg-rose/10 px-3 py-1 text-rose">{atrasadas} atrasada{atrasadas === 1 ? "" : "s"}</span>
        </div>
      </header>

      {error && <div role="alert" className="rounded-lg border border-rose/40 px-4 py-3 text-sm text-rose">{error}</div>}

      {criando ? (
        <form className="space-y-3 rounded-xl border border-violet bg-raised p-4"
          onSubmit={e => { e.preventDefault(); void salvar(nova, () => { setNova(VAZIO); setCriando(false); }); }}>
          <input autoFocus className={campo + " w-full"} placeholder="O que precisa ser feito? — ex.: cobrar cadastro da RedLux" maxLength={200}
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
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => { setCriando(false); setNova(VAZIO); }} className="rounded-lg border border-edge px-4 py-2 text-sm text-muted">Cancelar</button>
              <button type="submit" disabled={salvando || !nova.titulo.trim()} className="rounded-lg bg-violet px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {salvando ? "Salvando…" : "Criar tarefa"}</button>
            </div>
          </div>
        </form>
      ) : (
        <button onClick={() => setCriando(true)} className="rounded-lg bg-violet px-5 py-2.5 text-sm font-semibold text-white">+ Nova tarefa</button>
      )}

      {loading ? <p className="text-sm text-muted">Carregando…</p> : (
        <DndContext sensors={sensors} onDragStart={e => setArrastando((e.active.data.current?.t as Tarefa) || null)}
          onDragCancel={() => setArrastando(null)} onDragEnd={e => { void soltar(e); }}>
          <div className="grid gap-4 md:grid-cols-3">
            {COLUNAS.map(c => (
              <section key={c.id} aria-label={c.label}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-bright">
                  <i className="h-2 w-2 rounded-full" style={{ background: c.cor }} />{c.label}
                  <span className="ml-auto text-xs font-normal text-muted tabular-nums">{porColuna[c.id].length}</span>
                </h2>
                <Coluna id={c.id}>
                  {porColuna[c.id].map(t => (
                    <Cartao key={t.id} t={t} hoje={hoje}
                      onAbrir={() => setEditando({ id: t.id, titulo: t.titulo, notas: t.notas || "", prazo: t.prazo || "", prioridade: t.prioridade, estado: estadoDe(t) })} />
                  ))}
                  {!porColuna[c.id].length && <p className="m-auto text-center text-xs text-muted">
                    {c.id === "a_fazer" ? "Nada por fazer. Crie uma tarefa acima." : "Arraste um cartão pra cá."}</p>}
                </Coluna>
              </section>
            ))}
          </div>
          <DragOverlay>{arrastando && <div className="rounded-lg border border-violet bg-raised p-3 text-sm font-medium text-bright shadow-lg">{arrastando.titulo}</div>}</DragOverlay>
        </DndContext>
      )}

      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !salvando && setEditando(null)}>
          <form role="dialog" aria-modal="true" aria-label="Editar tarefa" onClick={e => e.stopPropagation()}
            className="w-full max-w-lg space-y-3 rounded-xl border border-edge bg-raised p-5"
            onSubmit={e => { e.preventDefault(); void salvar(editando, () => setEditando(null)); }}>
            <h2 className="text-lg font-semibold text-bright">Editar tarefa</h2>
            <input autoFocus className={campo + " w-full"} maxLength={200} value={editando.titulo}
              onChange={e => setEditando({ ...editando, titulo: e.target.value })} />
            <textarea className={campo + " w-full"} rows={6} maxLength={5000} placeholder="Anotações" value={editando.notas}
              onChange={e => setEditando({ ...editando, notas: e.target.value })} />
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-xs text-muted">Prazo
                <input type="date" className={campo} value={editando.prazo} onChange={e => setEditando({ ...editando, prazo: e.target.value })} />
              </label>
              <label className="grid gap-1 text-xs text-muted">Prioridade
                <select className={campo} value={editando.prioridade} onChange={e => setEditando({ ...editando, prioridade: e.target.value as Prioridade })}>
                  <option value="alta">Alta</option><option value="normal">Normal</option><option value="baixa">Baixa</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted">Coluna
                <select className={campo} value={editando.estado} onChange={e => setEditando({ ...editando, estado: e.target.value as Estado })}>
                  {COLUNAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button type="button" onClick={() => void excluir(editando.id!, editando.titulo)} className="text-sm text-rose">Excluir</button>
              <button type="button" onClick={() => setEditando(null)} className="ml-auto rounded-lg border border-edge px-4 py-2 text-sm text-muted">Cancelar</button>
              <button type="submit" disabled={salvando || !editando.titulo.trim()} className="rounded-lg bg-violet px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
