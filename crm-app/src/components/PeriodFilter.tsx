import { saoPauloDay, shiftDay, dateLabel } from "../lib/period";
export default function PeriodFilter({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const today = saoPauloDay();
  const presets = [{ label: "7 dias", from: shiftDay(today, -6) }, { label: "30 dias", from: shiftDay(today, -29) }, { label: "Mês atual", from: today.slice(0,7) + "-01" }];
  return <section aria-label="Período dos indicadores" className="my-5 rounded-xl border border-edge bg-raised p-4">
    <div className="flex flex-wrap items-end gap-3">{presets.map(p => <button key={p.label} onClick={() => onChange(p.from,today)} aria-pressed={from===p.from&&to===today} className={`min-h-11 rounded-lg border px-4 text-sm ${from===p.from&&to===today ? "border-violet bg-violet/10 text-violet-light" : "border-edge text-sub"}`}>{p.label}</button>)}
      <label className="grid gap-1 text-sm text-sub">De<input aria-label="Data inicial" type="date" value={from} max={to} onInput={e=>{if(e.currentTarget.value && e.currentTarget.value<=to)onChange(e.currentTarget.value,to)}} className="min-h-11 rounded-lg border border-edge bg-surface px-3 text-text"/></label>
      <label className="grid gap-1 text-sm text-sub">Até<input aria-label="Data final" type="date" value={to} min={from} max={today} onInput={e=>{if(e.currentTarget.value && e.currentTarget.value>=from&&e.currentTarget.value<=today)onChange(from,e.currentTarget.value)}} className="min-h-11 rounded-lg border border-edge bg-surface px-3 text-text"/></label>
    </div><p className="mt-3 text-sm text-muted">{dateLabel(from)} a {dateLabel(to)} · São Paulo · dias inclusivos{to===today ? " · hoje parcial" : ""}</p>
  </section>;
}
