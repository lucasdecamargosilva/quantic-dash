import { useCallback, useEffect, useRef, useState } from "react";
import { avisoLabel, notificacaoSuportada, quandoLabel, tocarBipe } from "../lib/tarefas-aviso";

// Vigia global dos alarmes das Tarefas: roda em qualquer página do CRM enquanto ele estiver
// aberto. O servidor devolve os avisos vencidos (até 24 h) e já os marca como disparados,
// então duas abas abertas não tocam o mesmo aviso.
type Aviso = { id: string; titulo: string; notas: string; prazo: string; hora: string; aviso_min: number | null };
const INTERVALO = 30_000;
export const EVENTO_CHECAR = "pl-tarefas-checar";

export default function AlarmeTarefas() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const parado = useRef(false);

  const checar = useCallback(async () => {
    if (parado.current) return;
    try {
      const r = await fetch("/api/tarefas/avisos", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (r.status === 401 || r.status === 403) { parado.current = true; return; } // login sem quadro de tarefas
      if (!r.ok) return;
      const d = await r.json().catch(() => ({}));
      const novos: Aviso[] = d.avisos || [];
      if (!novos.length) return;
      setAvisos(a => [...a.filter(x => !novos.some(n => n.id === x.id)), ...novos]);
      tocarBipe();
      if (notificacaoSuportada() && Notification.permission === "granted") {
        for (const t of novos) {
          try {
            const n = new Notification("Tarefa: " + t.titulo, { body: quandoLabel(t.prazo, t.hora) + (t.notas ? " — " + t.notas.slice(0, 120) : ""), tag: "pl-tarefa-" + t.id });
            n.onclick = () => { window.focus(); n.close(); };
          } catch { /* alguns navegadores só notificam via service worker */ }
        }
      }
    } catch { /* sem rede: tenta no próximo ciclo */ }
  }, []);

  useEffect(() => {
    void checar();
    const id = window.setInterval(() => { void checar(); }, INTERVALO);
    const agora = () => { parado.current = false; void checar(); };
    const visivel = () => { if (document.visibilityState === "visible") void checar(); };
    window.addEventListener(EVENTO_CHECAR, agora);
    document.addEventListener("visibilitychange", visivel);
    return () => { window.clearInterval(id); window.removeEventListener(EVENTO_CHECAR, agora); document.removeEventListener("visibilitychange", visivel); };
  }, [checar]);

  const fechar = (id: string) => setAvisos(a => a.filter(x => x.id !== id));
  async function adiar(id: string) {
    fechar(id);
    try {
      await fetch("/api/tarefas/adiar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, minutos: 10 }) });
    } catch { /* se falhar, o aviso já foi mostrado; segue */ }
  }

  if (!avisos.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2" aria-live="assertive">
      {avisos.map(t => (
        <div key={t.id} role="alertdialog" aria-label={"Lembrete: " + t.titulo}
          className="rounded-xl border border-violet bg-raised p-4 shadow-2xl" style={{ boxShadow: "0 10px 40px var(--color-active-glow)" }}>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-lg" aria-hidden>🔔</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-light">Lembrete de tarefa</p>
              <p className="mt-1 break-words text-sm font-semibold text-bright">{t.titulo}</p>
              <p className="mt-1 text-xs text-muted">📅 {quandoLabel(t.prazo, t.hora)}{t.aviso_min ? ` · 🔔 ${avisoLabel(t.aviso_min)}` : ""}</p>
              {t.notas && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted">{t.notas}</p>}
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => void adiar(t.id)} className="rounded-lg border border-edge px-3 py-1.5 text-sm text-muted hover:text-bright">Adiar 10 min</button>
            <button type="button" onClick={() => fechar(t.id)} className="rounded-lg bg-violet px-4 py-1.5 text-sm font-semibold text-white">Ok</button>
          </div>
        </div>
      ))}
    </div>
  );
}
