// Data/hora + alarme das Tarefas (compartilhado entre a tela e o vigia global do Layout).

export const AVISOS: { min: number; label: string }[] = [
  { min: 0, label: "Na hora" },
  { min: 15, label: "15 min antes" },
  { min: 30, label: "30 min antes" },
  { min: 60, label: "1 h antes" },
  { min: 120, label: "2 h antes" },
  { min: 1440, label: "1 dia antes" },
];

export function avisoLabel(min: number | null | undefined) {
  if (min === null || min === undefined) return "";
  const pre = AVISOS.find(a => a.min === min);
  if (pre) return pre.label.toLowerCase();
  if (min % 1440 === 0) return `${min / 1440} dia${min === 1440 ? "" : "s"} antes`;
  if (min % 60 === 0) return `${min / 60} h antes`;
  return `${min} min antes`;
}

/** "05/11 · 10:30" (ou só "05/11"). */
export function quandoLabel(prazo: string | null | undefined, hora?: string | null) {
  if (!prazo) return "";
  const [, m, d] = prazo.split("-");
  return `${d}/${m}${hora ? " · " + hora : ""}`;
}

/** Bipe curto gerado na hora (Web Audio), sem arquivo externo. */
export function tocarBipe() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    void ctx.resume?.();
    const notas = [880, 1175, 880, 1175];
    notas.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      const t0 = ctx.currentTime + i * 0.22;
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(t0); o.stop(t0 + 0.2);
    });
    setTimeout(() => { void ctx.close(); }, 1500);
  } catch { /* navegador sem áudio: segue só com o aviso visual */ }
}

export const notificacaoSuportada = () => typeof window !== "undefined" && "Notification" in window;
