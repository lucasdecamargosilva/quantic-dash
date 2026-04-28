import { STATUS_LABELS, STATUS_HEX } from "../types";
import type { LeadStatus } from "../types";

// Funil — etapas em sequência. Stand By é lateral (não conta no funil principal).
// Cada etapa mostra o COUNT CUMULATIVO (todos que passaram por essa etapa ou além).
const FUNNEL_STEPS: LeadStatus[] = [
  "dm_enviada",
  "mensagem_1",
  "mensagem_2",
  "mensagem_3",
  "respondeu",
  "fotos_enviadas",
  "interessado",
  "reuniao_agendada",
  "testando",
  "fechou",
];

// Lista cumulativa: todos os status DEPOIS desta etapa (incluindo perdida)
// porque "perdida" também passou pela etapa
const STAGES_AFTER: Record<LeadStatus, LeadStatus[]> = {
  novo: [],
  lead_coletado: [],
  descartado: [],
  dm_enviada: ["mensagem_1", "mensagem_2", "mensagem_3", "respondeu", "fotos_enviadas", "interessado", "stand_by", "reuniao_agendada", "testando", "fechou", "perdida"],
  mensagem_1: ["mensagem_2", "mensagem_3", "respondeu", "fotos_enviadas", "interessado", "stand_by", "reuniao_agendada", "testando", "fechou", "perdida"],
  mensagem_2: ["mensagem_3", "respondeu", "fotos_enviadas", "interessado", "stand_by", "reuniao_agendada", "testando", "fechou", "perdida"],
  mensagem_3: ["respondeu", "fotos_enviadas", "interessado", "stand_by", "reuniao_agendada", "testando", "fechou", "perdida"],
  respondeu: ["fotos_enviadas", "interessado", "stand_by", "reuniao_agendada", "testando", "fechou", "perdida"],
  fotos_enviadas: ["interessado", "stand_by", "reuniao_agendada", "testando", "fechou", "perdida"],
  interessado: ["stand_by", "reuniao_agendada", "testando", "fechou", "perdida"],
  stand_by: ["reuniao_agendada", "testando", "fechou", "perdida"],
  reuniao_agendada: ["testando", "fechou", "perdida"],
  testando: ["fechou", "perdida"],
  fechou: [],
  perdida: [],
};

interface Props {
  counts: Record<LeadStatus, number>;
}

function cumulativeCount(step: LeadStatus, counts: Record<LeadStatus, number>) {
  return (counts[step] || 0) + STAGES_AFTER[step].reduce((a, s) => a + (counts[s] || 0), 0);
}

export default function FunnelChart({ counts }: Props) {
  const stepData = FUNNEL_STEPS.map((step) => ({
    step,
    cumulative: cumulativeCount(step, counts),
    inStep: counts[step] || 0,
  }));

  const top = stepData[0]?.cumulative || 1;

  return (
    <div className="space-y-2">
      {stepData.map((d, i) => {
        const pct = Math.max((d.cumulative / top) * 100, 4);
        const hex = STATUS_HEX[d.step];
        const prev = i > 0 ? stepData[i - 1].cumulative : null;
        const conversion = prev != null && prev > 0 ? (d.cumulative / prev) * 100 : null;
        const dropPct = prev != null && prev > 0 ? ((prev - d.cumulative) / prev) * 100 : null;

        return (
          <div key={d.step} className="stagger-in" style={{ animationDelay: `${i * 40}ms` }}>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-semibold text-dim uppercase tracking-wider w-32 text-right shrink-0">
                {STATUS_LABELS[d.step]}
              </span>
              <div className="flex-1 h-7 bg-surface rounded overflow-hidden relative">
                <div
                  className="h-full rounded flex items-center px-3 transition-all duration-700 ease-out"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${hex}55, ${hex})`,
                  }}
                >
                  <span className="text-[11px] font-bold text-white tabular-nums">{d.cumulative}</span>
                </div>
              </div>
              <span className="text-[10px] tabular-nums w-20 shrink-0" style={{ color: hex }}>
                {conversion != null ? `${conversion.toFixed(0)}%` : ""}
              </span>
            </div>
            {dropPct != null && dropPct > 0 && (
              <div className="flex items-center gap-3 mt-0.5 mb-1">
                <span className="w-32 shrink-0" />
                <span className="text-[9px] text-rose/80 tabular-nums">↓ -{dropPct.toFixed(0)}% drop-off</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
