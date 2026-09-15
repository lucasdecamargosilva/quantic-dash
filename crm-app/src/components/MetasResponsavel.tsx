import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Row = { id: string; responsavel: string | null; status: string; teste_gratis_em: string | null; updated_at: string };
// Shared, versioned initial targets approved for Dione. No defaults for other owners.
const GOALS: Record<string, { weeklyTrials: number; monthlyClosed: number }> = {
  dione: { weeklyTrials: 25, monthlyClosed: 5 },
};
const localDay = (date = new Date()) => date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const shift = (day: string, n: number) => new Date(Date.parse(day + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const label = (day: string) => day.split("-").reverse().join("/");
const ownerKey = (name: string) => name.trim().toLocaleLowerCase("pt-BR");

export default function MetasResponsavel({ month }: { month: string }) {
  const [owner, setOwner] = useState("Dione");
  const [weekDay, setWeekDay] = useState(localDay);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  async function load() {
    setBusy(true); setError("");
    try {
      const result: Row[] = [];
      for (let offset = 0; ; offset += 1000) {
        const r = await supabase.from("leads").select("id,responsavel,status,teste_gratis_em,updated_at").order("id").range(offset, offset + 999);
        if (r.error) throw r.error;
        result.push(...r.data);
        if (r.data.length < 1000) break;
      }
      setRows(result);
    } catch { setError("Não foi possível carregar os resultados. Tente atualizar."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  const start = shift(weekDay, -((new Date(weekDay + "T12:00:00Z").getUTCDay() + 6) % 7));
  const end = shift(start, 6);
  const selected = rows.filter(r => ownerKey(r.responsavel || "") === ownerKey(owner));
  const trials = selected.filter(r => r.teste_gratis_em && r.teste_gratis_em >= start && r.teste_gratis_em <= end).length;
  const closed = selected.filter(r => r.status === "fechou" && r.updated_at && localDay(new Date(r.updated_at)).slice(0, 7) === month).length;
  const goal = GOALS[ownerKey(owner)];
  const owners = [...new Set(["Dione", ...rows.map(r => r.responsavel?.trim()).filter((r): r is string => !!r)])].sort((a,b) => a.localeCompare(b));
  const cards = [
    { title: "Testes grátis na semana", value: trials, goal: goal?.weeklyTrials, period: `${label(start)} a ${label(end)} · segunda a domingo`, unit: "testes" },
    { title: "Fechamentos no mês · provisório", value: closed, goal: goal?.monthlyClosed, period: `Mês ${month.split("-").reverse().join("/")}`, unit: "clientes" },
  ];
  return <section className="my-6 rounded-2xl border border-violet/20 bg-raised p-5 sm:p-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h2 className="text-xl font-bold text-bright">Metas por responsável</h2><p className="mt-1 text-sm text-muted">Resultados individuais · horário de São Paulo</p></div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm text-sub">Responsável<select aria-label="Responsável das metas" value={owner} onChange={e => setOwner(e.target.value)} className="min-h-11 rounded-lg border border-edge bg-surface px-3 text-text">{owners.map(name => <option key={name}>{name}</option>)}</select></label>
        <label className="grid gap-1 text-sm text-sub">Semana da data<input aria-label="Semana das metas" type="date" value={weekDay} onChange={e => { if(e.target.value) setWeekDay(e.target.value); }} className="min-h-11 rounded-lg border border-edge bg-surface px-3 text-text"/></label>
        <button disabled={busy} onClick={load} className="min-h-11 rounded-lg border border-edge px-4 text-sm text-sub disabled:opacity-50">{busy ? "Atualizando…" : "Atualizar resultados"}</button>
      </div>
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-rose">{error}</p>}
    <div className="mt-5 grid gap-4 md:grid-cols-2">{cards.map(card => <article key={card.title} className="rounded-xl border border-edge bg-surface p-5">
      <h3 className="text-base font-semibold text-bright">{card.title}</h3><p className="mt-1 text-sm text-muted">{card.period}</p>
      <p className="mt-4 text-4xl font-bold text-violet-light">{busy || error ? "—" : card.value}<span className="ml-2 text-base font-normal text-muted">{card.goal ? `/ ${card.goal} ${card.unit}` : card.unit}</span></p>
      {card.goal ? <><div role="progressbar" aria-label={card.title} aria-valuemin={0} aria-valuemax={card.goal} aria-valuenow={Math.min(card.value,card.goal)} className="mt-4 h-2.5 overflow-hidden rounded-full bg-panel"><div className="h-full rounded-full bg-violet" style={{width: `${busy || error ? 0 : Math.min(100,card.value/card.goal*100)}%`}}/></div><p className="mt-2 text-sm text-muted">{busy || error ? "Aguardando dados" : `${Math.round(card.value/card.goal*100)}% da meta · faltam ${Math.max(0,card.goal-card.value)} ${card.unit}`}</p></> : <p className="mt-3 text-sm text-muted">Meta não definida para este responsável.</p>}
    </article>)}</div>
    <p className="mt-4 text-sm leading-relaxed text-muted">Os testes usam a data de início registrada, incluindo leads que já saíram da etapa. A atribuição considera o responsável atual. Fechamentos são os leads em “Fechou”, usando a última atualização: o CRM ainda não registra uma data própria de fechamento, por isso esse resultado mensal é provisório e não confirma pagamentos.</p>
    <p className="mt-2 text-sm text-muted">O mês é selecionado no topo da página. As metas de Dione são compartilhadas pela equipe: 25 testes por semana e 5 clientes por mês.</p>
  </section>;
}
