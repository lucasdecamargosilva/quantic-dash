import { useState, useRef, useEffect } from "react";
import { LEAD_STATUSES, STATUS_LABELS, STATUS_COLORS } from "../types";
import type { LeadStatus } from "../types";

interface Props {
  status: LeadStatus;
  onChange: (status: LeadStatus) => void;
}

export default function StatusBadge({ status, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const colors = STATUS_COLORS[status];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md cursor-pointer transition-all duration-150 hover:brightness-125 ${colors.bg} ${colors.text}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
        {STATUS_LABELS[status]}
      </button>
      {open && (
        <div className="absolute z-50 mt-1.5 bg-panel border border-edge rounded-lg shadow-2xl shadow-black/40 py-1 min-w-[150px]">
          {LEAD_STATUSES.map((s) => {
            const sc = STATUS_COLORS[s];
            return (
              <button
                key={s}
                onClick={() => { onChange(s); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors hover:bg-surface ${
                  s === status ? "text-bright font-semibold" : "text-sub"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sc.dot}`} />
                {STATUS_LABELS[s]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
