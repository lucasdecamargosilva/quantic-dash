import type { Lead, LeadStatus } from "../types";
import { STATUS_HEX, STATUS_LABELS, PIPELINE_STATUSES } from "../types";

interface Props {
  leads: Lead[];
}

interface Stats {
  nome: string;
  total: number;
  byStatus: Record<LeadStatus, number>;
  dm_enviada: number;
  respondeu: number;
  interessado: number;
  fechou: number;
  taxa_resposta: number;
  taxa_conversao: number;
  score: number;
}

export default function DesempenhoResponsaveis({ leads }: Props) {
  const byResp = leads.reduce((acc, l) => {
    const key = l.responsavel?.trim() || "— Sem responsavel";
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

      const dm_enviada = items.filter((l) => ["dm_enviada", "respondeu", "lead_coletado", "interessado", "fechou"].includes(l.status)).length;
      const respondeu = items.filter((l) => ["respondeu", "lead_coletado", "interessado", "fechou"].includes(l.status)).length;
      const interessado = items.filter((l) => ["interessado", "fechou"].includes(l.status)).length;
      const fechou = items.filter((l) => l.status === "fechou").length;

      const taxa_resposta = dm_enviada > 0 ? (respondeu / dm_enviada) * 100 : 0;
      const taxa_fechamento = dm_enviada > 0 ? (fechou / dm_enviada) * 100 : 0;
      const taxa_conversao = items.length > 0 ? (interessado / items.length) * 100 : 0;
      const volumeScore = Math.min(items.length / 50, 1) * 100;
      const score = Math.round(taxa_resposta * 0.4 + taxa_fechamento * 0.4 + volumeScore * 0.2);

      return { nome, total: items.length, byStatus, dm_enviada, respondeu, interessado, fechou, taxa_resposta, taxa_conversao, score };
    })
    .sort((a, b) => b.score - a.score);

  if (stats.length === 0) return null;

  return (
    <section className="bg-base border-t border-edge-subtle px-8 py-8">
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
    <article className="bg-surface/40 border border-edge-subtle rounded-xl px-5 py-4 hover:bg-surface/70 transition-colors">
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

        {/* Metricas + Score */}
        <div className="flex items-baseline gap-5 shrink-0">
          <MiniStat label="Resp" value={`${s.taxa_resposta.toFixed(0)}%`} />
          <MiniStat label="Conv" value={`${s.taxa_conversao.toFixed(0)}%`} />
          <MiniStat
            label="Fechou"
            value={s.fechou}
            highlight={s.fechou > 0}
          />
          <div className="pl-5 border-l border-edge-subtle ml-1">
            <p className="text-[28px] font-extrabold text-violet-light leading-none tabular-nums">
              {s.score}
            </p>
            <p className="text-[9px] text-dim uppercase tracking-[0.2em] mt-1">Score</p>
          </div>
        </div>
      </div>
    </article>
  );
}

function MiniStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div className="text-center">
      <p className={`font-display text-base font-black tabular-nums leading-none ${highlight ? "text-emerald" : "text-sub"}`}>
        {value}
      </p>
      <p className="text-[9px] text-dim uppercase tracking-[0.2em] mt-1.5">{label}</p>
    </div>
  );
}
