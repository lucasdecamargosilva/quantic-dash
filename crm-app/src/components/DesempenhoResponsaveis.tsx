import type { Lead, LeadStatus } from "../types";
import { STATUS_HEX, STATUS_LABELS, PIPELINE_STATUSES, HOT_STATUSES } from "../types";

interface Props {
  leads: Lead[];
}

interface Stats {
  nome: string;
  total: number;
  byStatus: Record<LeadStatus, number>;
  hot: number;
  fechou: number;
  perdida: number;
  taxa: number; // Win rate: fechou / (fechou + perdida) * 100
}

export default function DesempenhoResponsaveis({ leads }: Props) {
  // Só leads com responsável preenchido entram no quadro
  const leadsComResp = leads.filter((l) => (l.responsavel?.trim() || "").length > 0);

  const byResp = leadsComResp.reduce((acc, l) => {
    const key = l.responsavel!.trim();
    if (!acc[key]) acc[key] = [];
    acc[key].push(l);
    return acc;
  }, {} as Record<string, Lead[]>);

  const stats: Stats[] = Object.entries(byResp)
    .map(([nome, items]) => {
      const byStatus = PIPELINE_STATUSES.reduce((acc, s) => {
        acc[s] = items.filter((l) => l.status === s).length;
        return acc;
      }, {} as Record<LeadStatus, number>);

      const hot = items.filter((l) => HOT_STATUSES.includes(l.status)).length;
      const fechou = items.filter((l) => l.status === "fechou").length;
      const perdida = items.filter((l) => l.status === "perdida").length;
      const taxa = fechou + perdida > 0 ? (fechou / (fechou + perdida)) * 100 : 0;

      return { nome, total: items.length, byStatus, hot, fechou, perdida, taxa };
    })
    .sort((a, b) => b.taxa - a.taxa || b.fechou - a.fechou);

  if (stats.length === 0) return null;

  return (
    <section className="bg-base border-t border-edge-subtle px-4 lg:px-8 py-6 lg:py-8">
      {/* Header compacto */}
      <header className="flex items-end justify-between mb-5 pb-3 border-b border-edge-subtle">
        <div>
          <p className="text-[9px] text-dim uppercase tracking-[0.3em] mb-0.5">Sales Ops</p>
          <h3 className="text-[15px] font-bold text-bright tracking-tight uppercase">Desempenho do time</h3>
        </div>
        <p className="text-[9px] text-dim uppercase tracking-[0.3em]">
          {stats.length} responsa{stats.length !== 1 ? "veis" : "vel"}
        </p>
      </header>

      <div className="space-y-3">
        {stats.map((s, idx) => (
          <CompactRow key={s.nome} s={s} rank={idx + 1} />
        ))}
      </div>
    </section>
  );
}

function CompactRow({ s, rank }: { s: Stats; rank: number }) {
  return (
    <>
      {/* Mobile — card empilhado (oculto no desktop) */}
      <article className="lg:hidden bg-surface/40 border border-edge-subtle rounded-xl p-4">
        <div className="flex items-start gap-3 mb-3">
          <span className="text-base font-bold text-dim tabular-nums leading-none mt-0.5">
            {String(rank).padStart(2, "0")}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold text-bright leading-tight truncate">{s.nome}</p>
            <p className="text-[10px] text-dim uppercase tracking-[0.2em] mt-0.5 font-medium tabular-nums">
              {s.total} leads
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[22px] font-extrabold text-emerald leading-none tabular-nums">
              {s.taxa.toFixed(0)}%
            </p>
            <p className="text-[9px] text-dim uppercase tracking-[0.2em] mt-0.5">Win</p>
          </div>
        </div>
        {/* Barra de funil colorida (representa toda a distribuição) */}
        <div className="flex h-[3px] w-full rounded-full overflow-hidden bg-edge-subtle/40 mb-3">
          {PIPELINE_STATUSES.map((status) => {
            const count = s.byStatus[status];
            if (count === 0) return null;
            const pct = (count / s.total) * 100;
            return (
              <div
                key={status}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${pct}%`, background: STATUS_HEX[status] }}
              />
            );
          })}
        </div>
        {/* Métricas — 3 colunas que cabem em qualquer celular */}
        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-edge-subtle/60">
          <MiniStat label="Quente" value={`${s.hot}🔥`} tone="rose" />
          <MiniStat label="Fechou" value={`${s.fechou}✓`} tone="emerald" highlight={s.fechou > 0} />
          <MiniStat label="Perdida" value={s.perdida} tone="orange" />
        </div>
      </article>

      {/* Desktop — layout original (oculto no mobile) */}
      <article className="hidden lg:block bg-surface/40 border border-edge-subtle rounded-xl px-5 py-4 hover:bg-surface/70 transition-colors">
      <div className="grid items-center gap-5" style={{ gridTemplateColumns: "auto minmax(140px, 1.2fr) minmax(220px, 2fr) auto" }}>
        {/* Rank */}
        <span className="text-lg font-bold text-dim tabular-nums w-7 text-right">
          {String(rank).padStart(2, "0")}
        </span>

        {/* Nome */}
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-bright leading-tight truncate">{s.nome}</p>
          <p className="text-[10px] text-dim uppercase tracking-[0.2em] mt-0.5 font-medium tabular-nums">
            {s.total} leads
          </p>
        </div>

        {/* Funil inline — numeros + barra */}
        <div>
          <div className="flex gap-3 items-baseline mb-1.5">
            {PIPELINE_STATUSES.map((status) => {
              const count = s.byStatus[status];
              const hex = STATUS_HEX[status];
              return (
                <div key={status} className="flex flex-col">
                  <span
                    className="font-display text-sm font-black tabular-nums leading-none"
                    style={{ color: count > 0 ? hex : "#2a2a30" }}
                  >
                    {count}
                  </span>
                  <span className="text-[8px] text-dim uppercase tracking-wider mt-1 font-medium">
                    {STATUS_LABELS[status].split(" ")[0]}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex h-[2px] w-full rounded-full overflow-hidden bg-edge-subtle/40 mt-2">
            {PIPELINE_STATUSES.map((status) => {
              const count = s.byStatus[status];
              if (count === 0) return null;
              const pct = (count / s.total) * 100;
              return (
                <div
                  key={status}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${pct}%`, background: STATUS_HEX[status] }}
                />
              );
            })}
          </div>
        </div>

        {/* Métricas (mesmas do Top Responsáveis) + Win % grande */}
        <div className="flex items-baseline gap-5 shrink-0">
          <MiniStat label="Quente" value={`${s.hot}🔥`} tone="rose" />
          <MiniStat label="Fechou" value={`${s.fechou}✓`} tone="emerald" highlight={s.fechou > 0} />
          <MiniStat label="Perdida" value={s.perdida} tone="orange" />
          <div className="pl-5 border-l border-edge-subtle ml-1">
            <p className="text-[28px] font-extrabold text-emerald leading-none tabular-nums">
              {s.taxa.toFixed(0)}%
            </p>
            <p className="text-[9px] text-dim uppercase tracking-[0.2em] mt-1">Win</p>
          </div>
        </div>
      </div>
    </article>
    </>
  );
}

function MiniStat({
  label,
  value,
  tone,
  highlight,
}: {
  label: string;
  value: number | string;
  tone?: "rose" | "emerald" | "orange";
  highlight?: boolean;
}) {
  const colorClass = highlight
    ? "text-emerald"
    : tone === "rose"
      ? "text-rose"
      : tone === "emerald"
        ? "text-emerald"
        : tone === "orange"
          ? "text-orange"
          : "text-sub";
  return (
    <div className="text-center">
      <p className={`font-display text-base font-black tabular-nums leading-none ${colorClass}`}>
        {value}
      </p>
      <p className="text-[9px] text-dim uppercase tracking-[0.2em] mt-1.5">{label}</p>
    </div>
  );
}
