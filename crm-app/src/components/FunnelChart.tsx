import { STATUS_LABELS, STATUS_HEX } from "../types";
import type { LeadStatus } from "../types";

const FUNNEL_STEPS: LeadStatus[] = ["novo", "dm_enviada", "respondeu", "interessado", "fechou"];

interface Props {
  counts: Record<LeadStatus, number>;
}

export default function FunnelChart({ counts }: Props) {
  const maxCount = Math.max(...FUNNEL_STEPS.map((s) => counts[s] || 0), 1);

  return (
    <div className="space-y-2.5">
      {FUNNEL_STEPS.map((step, i) => {
        const count = counts[step] || 0;
        const pct = Math.max((count / maxCount) * 100, 5);
        const hex = STATUS_HEX[step];

        return (
          <div key={step} className="flex items-center gap-3 stagger-in" style={{ animationDelay: `${i * 40}ms` }}>
            <span className="text-[10px] font-semibold text-dim uppercase tracking-wider w-24 text-right shrink-0">
              {STATUS_LABELS[step]}
            </span>
            <div className="flex-1 h-7 bg-surface rounded overflow-hidden">
              <div
                className="h-full rounded flex items-center px-3 transition-all duration-700 ease-out"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${hex}50, ${hex})`,
                }}
              >
                <span className="text-[11px] font-bold text-white/90 tabular-nums">{count}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
