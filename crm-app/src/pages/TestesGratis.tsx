import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { applyCustomLeadStatuses } from "../lib/lead-status";
import type { Lead } from "../types";
import LeadModal from "../components/LeadModal";

type Filter = "todos" | "ativos" | "expirados" | "sem-crm";
type IconName = "users" | "clock" | "alert" | "search" | "refresh" | "arrow" | "store" | "target" | "chart" | "spark" | "check";

type Store = {
  id: string; name: string | null; company: string | null; email: string | null; phone: string | null;
  status: string | null; platform: string | null; implementation_date: string | null; created_at: string;
};
type AdRow = { dia: string; ad_name: string | null; leads: number | string | null; spend: number | string | null };
type Payment = { store_id: string; tipo: string | null; data_pagamento: string; valor: number | string | null };
type LeadRecord = Lead & { whatsapp?: string | null; plataforma?: string | null };
type TrialRow = { key: string; name: string; phone: string; email: string; platform: string; start: string | null; end: string | null; remaining: number | null; progress: number; lead: LeadRecord | null };

const DAY = 86400000;
const TRIAL_STATUSES = ["testando", "teste_catalogo_7_dias"];
const formatDate = (value: string) => new Date(value + "T12:00:00Z").toLocaleDateString("pt-BR", { timeZone: "UTC" });
const dateOnly = (value?: string | null) => value ? value.slice(0, 10) : null;
const shiftDate = (value: string, amount: number) => new Date(Date.parse(value + "T00:00:00Z") + amount * DAY).toISOString().slice(0, 10);
const normalize = (value?: string | null) => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const normalizeEmail = (value?: string | null) => (value || "").trim().toLowerCase();
const normalizePhone = (value?: string | null) => {
  let digits = (value || "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  if (digits.startsWith("55") && digits.length === 13 && digits[4] === "9") digits = digits.slice(0, 4) + digits.slice(5);
  return digits;
};
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const pct = (value: number, total: number) => total ? value / total * 100 : 0;
const roundFive = (value: number) => Math.max(5, Math.ceil(value / 5) * 5);

function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    alert: <><path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    refresh: <><path d="M20 6v5h-5M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 9M5.5 15A7 7 0 0 0 18 17.5l2-2.5"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    store: <><path d="M3 9 5 3h14l2 6M5 13v8h14v-8M9 21v-6h6v6"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/></>,
    target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    spark: <><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3ZM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></>,
    check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>{paths[name]}</svg>;
}

function Bar({ value, max, tone = "violet" }: { value: number; max: number; tone?: "violet" | "cyan" }) {
  return <div className="h-1.5 overflow-hidden rounded-full bg-panel"><span className={`block h-full rounded-full ${tone === "cyan" ? "bg-cyan" : "bg-violet"}`} style={{ width: `${max ? Math.max(3, value / max * 100) : 0}%` }}/></div>;
}

export default function TestesGratis() {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [ads, setAds] = useState<AdRow[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [filter, setFilter] = useState<Filter>("todos");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [today, setToday] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));

  async function load() {
    setLoading(true); setError("");
    try {
      const currentToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const allLeads: LeadRecord[] = [];
      for (let offset = 0; ; offset += 1000) {
        const response = await supabase.from("leads").select("*").order("id").range(offset, offset + 999);
        if (response.error) throw response.error;
        allLeads.push(...(response.data ?? []));
        if (!response.data || response.data.length < 1000) break;
      }
      const cutoff30 = shiftDate(currentToday, -29);
      const [normalized, commercialResponse] = await Promise.all([
        applyCustomLeadStatuses(allLeads),
        fetch(`/api/commercial-insights?since=${encodeURIComponent(cutoff30)}`),
      ]);
      if (!commercialResponse.ok) throw new Error("Indicadores indisponíveis");
      const commercial = await commercialResponse.json();
      setLeads(normalized); setStores(commercial.stores ?? []); setAds(commercial.ads ?? []); setPayments(commercial.payments ?? []); setToday(currentToday);
    } catch { setError("Não foi possível carregar os indicadores. Clique em Atualizar para tentar novamente."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    const refresh = () => { if (!document.hidden) load(); };
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, []);

  const data = useMemo(() => {
    const cutoff7 = shiftDate(today, -6), cutoff30 = shiftDate(today, -29), monthStart = today.slice(0, 7) + "-01";
    const customTrials = leads.filter(lead => TRIAL_STATUSES.includes(lead.status));
    const phoneIndex = new Map<string, LeadRecord[]>(), emailIndex = new Map<string, LeadRecord[]>(), nameIndex = new Map<string, LeadRecord[]>();
    const put = (map: Map<string, LeadRecord[]>, key: string, lead: LeadRecord) => { if (key) map.set(key, [...(map.get(key) ?? []), lead]); };
    leads.forEach(lead => {
      put(phoneIndex, normalizePhone(lead.telefone), lead); put(phoneIndex, normalizePhone(lead.whatsapp), lead);
      put(emailIndex, normalizeEmail(lead.email), lead); put(nameIndex, normalize(lead.nome_loja), lead);
    });
    const usedLeads = new Set<string>();
    const realTrialStores = stores.filter(store => store.status === "Teste Gratuito" && !["provou levou", "provou catalogo loja teste"].includes(normalize(store.company || store.name)));
    const trialRows: TrialRow[] = realTrialStores.map(store => {
      const candidates = new Map<string, LeadRecord>();
      [phoneIndex.get(normalizePhone(store.phone)), emailIndex.get(normalizeEmail(store.email)), nameIndex.get(normalize(store.company || store.name))]
        .flatMap(items => items ?? []).forEach(lead => candidates.set(lead.id, lead));
      const matches = [...candidates.values()].sort((a, b) => Number(TRIAL_STATUSES.includes(b.status)) - Number(TRIAL_STATUSES.includes(a.status)) || b.created_at.localeCompare(a.created_at));
      const lead = matches[0] ?? null;
      if (lead) usedLeads.add(lead.id);
      const start = dateOnly(lead?.teste_gratis_em) || dateOnly(store.implementation_date) || dateOnly(store.created_at);
      const end = start ? shiftDate(start, 7) : null;
      const remaining = end ? Math.round((Date.parse(end) - Date.parse(today)) / DAY) : null;
      const elapsed = start ? Math.max(0, Math.round((Date.parse(today) - Date.parse(start)) / DAY)) : 0;
      return { key: "store-" + store.id, name: store.company || store.name || "Loja sem nome", phone: store.phone || lead?.telefone || "", email: store.email || lead?.email || "", platform: store.platform || lead?.plataforma || "", start, end, remaining, progress: Math.min(100, elapsed / 7 * 100), lead };
    });
    customTrials.filter(lead => !usedLeads.has(lead.id)).forEach(lead => {
      const start = dateOnly(lead.teste_gratis_em) || dateOnly(lead.created_at), end = start ? shiftDate(start, 7) : null;
      const remaining = end ? Math.round((Date.parse(end) - Date.parse(today)) / DAY) : null;
      const elapsed = start ? Math.max(0, Math.round((Date.parse(today) - Date.parse(start)) / DAY)) : 0;
      trialRows.push({ key: "lead-" + lead.id, name: lead.nome_loja || lead.instagram || "Lead sem nome", phone: lead.telefone || lead.whatsapp || "", email: lead.email || "", platform: lead.plataforma || "", start, end, remaining, progress: Math.min(100, elapsed / 7 * 100), lead });
    });
    trialRows.sort((a, b) => (a.end || "9999").localeCompare(b.end || "9999"));

    const trials7 = trialRows.filter(row => row.start && row.start >= cutoff7).length;
    const trials30 = trialRows.filter(row => row.start && row.start >= cutoff30).length;
    const trialsMonth = trialRows.filter(row => row.start && row.start >= monthStart).length;
    const firstPayments = new Map<string, Payment>();
    payments.filter(payment => (payment.tipo || "").toLowerCase() === "mensalidade").forEach(payment => { if (!firstPayments.has(payment.store_id)) firstPayments.set(payment.store_id, payment); });
    const first = [...firstPayments.values()];
    const closed7 = first.filter(payment => payment.data_pagamento >= cutoff7).length;
    const closed30 = first.filter(payment => payment.data_pagamento >= cutoff30).length;
    const leads30 = leads.filter(lead => dateOnly(lead.created_at)! >= cutoff30);
    const channelMap = new Map<string, number>();
    leads30.forEach(lead => { const key = lead.fonte_oportunidade || "Não informado"; channelMap.set(key, (channelMap.get(key) || 0) + 1); });
    const channels = [...channelMap].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
    const creativeMap = new Map<string, { leads: number; spend: number }>();
    ads.forEach(ad => { const name = ad.ad_name || "Sem nome"; const item = creativeMap.get(name) || { leads: 0, spend: 0 }; item.leads += Number(ad.leads) || 0; item.spend += Number(ad.spend) || 0; creativeMap.set(name, item); });
    const creatives = [...creativeMap].map(([name, item]) => ({ name, ...item })).sort((a, b) => b.leads - a.leads).slice(0, 6);
    const weeklyGoal = roundFive(Math.max(trials7, trials30 / 4.3));
    const monthlyGoal = weeklyGoal * 4;
    return { trialRows, trials7, trials30, trialsMonth, closed7, closed30, leads30: leads30.length, channels, creatives, weeklyGoal, monthlyGoal };
  }, [ads, leads, payments, stores, today]);

  const category = (row: TrialRow): Filter => !row.lead ? "sem-crm" : row.remaining !== null && row.remaining <= 0 ? "expirados" : "ativos";
  const count = (key: Filter) => key === "todos" ? data.trialRows.length : data.trialRows.filter(row => category(row) === key).length;
  const visible = data.trialRows.filter(row => (filter === "todos" || category(row) === filter) && `${row.name} ${row.phone} ${row.email}`.toLowerCase().includes(query.toLowerCase().trim()));
  const conversion30 = pct(data.closed30, data.trials30);
  const leadToTrial30 = pct(data.trials30, data.leads30);
  const maxChannel = data.channels[0]?.value || 1, maxCreative = data.creatives[0]?.leads || 1;
  const suggestedClients = Math.round(data.monthlyGoal * conversion30 / 100);
  const statusLabel = (row: TrialRow) => !row.lead ? "Fora do CRM" : row.remaining === null ? "Sem data" : row.remaining <= 0 ? row.remaining === 0 ? "Expira hoje" : `Expirou há ${-row.remaining}d` : `${row.remaining}d restantes`;
  const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  const summary: { key: Filter; label: string; icon: IconName; tone: string; box: string }[] = [
    { key: "todos", label: "Todos em teste", icon: "users", tone: "text-violet-light", box: "border-violet/20 bg-violet/10" },
    { key: "ativos", label: "Em andamento", icon: "clock", tone: "text-cyan", box: "border-cyan/20 bg-cyan/10" },
    { key: "expirados", label: "Expirados", icon: "alert", tone: "text-rose", box: "border-rose/20 bg-rose/10" },
    { key: "sem-crm", label: "Sem vínculo no CRM", icon: "store", tone: "text-amber", box: "border-amber/20 bg-amber/10" },
  ];

  return <div className="min-h-full px-4 py-6 lg:px-8 lg:py-8">
    <header className="relative overflow-hidden rounded-2xl border border-violet/15 bg-raised/80 px-5 py-6 lg:px-7">
      <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-violet/10 blur-3xl" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-violet/20 bg-violet/10 text-violet-light"><Icon name="chart" className="h-6 w-6" /></span><div><p className="mb-1 text-[9px] font-semibold uppercase tracking-[.28em] text-violet-light">Visão comercial</p><h1 className="text-2xl font-bold tracking-tight text-bright lg:text-[30px]">Aquisição, testes e conversão</h1><p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted">Veja de onde chegam os leads, quais criativos performam e quantos testes viram clientes pagos.</p></div></div>
        <button onClick={load} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-edge bg-surface px-4 py-2.5 text-xs font-semibold text-sub hover:border-violet/30 hover:text-bright disabled:opacity-50"><Icon name="refresh" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{loading ? "Atualizando" : "Atualizar dados"}</button></div>
    </header>

    {error && <p role="alert" className="mt-4 rounded-lg border border-rose/20 bg-rose/10 px-4 py-3 text-xs text-rose">{error}</p>}
    <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[{ label: "Leads recebidos", value: data.leads30, detail: "últimos 30 dias", icon: "users" as IconName, tone: "text-violet-light" }, { label: "Entraram em teste", value: data.trials7, detail: `${data.trials30} nos últimos 30 dias`, icon: "clock" as IconName, tone: "text-cyan" }, { label: "Novos clientes pagos", value: data.closed30, detail: `${data.closed7} nos últimos 7 dias`, icon: "check" as IconName, tone: "text-emerald" }, { label: "Conversão operacional", value: `${conversion30.toFixed(1)}%`, detail: "pagamentos ÷ testes em 30 dias", icon: "target" as IconName, tone: "text-amber" }].map(item => <article key={item.label} className="card-lift rounded-xl border border-edge-subtle bg-raised/70 p-5"><div className="flex items-center justify-between"><span className={`grid h-9 w-9 place-items-center rounded-lg border border-edge ${item.tone}`}><Icon name={item.icon}/></span><strong className={`text-2xl font-bold tabular-nums ${item.tone}`}>{loading ? "—" : item.value}</strong></div><p className="mt-3 text-xs font-semibold text-bright">{item.label}</p><p className="mt-1 text-[10px] text-dim">{item.detail}</p></article>)}
    </section>

    <section className="mt-5 grid gap-4 xl:grid-cols-[1.35fr_.9fr]">
      <article className="rounded-xl border border-edge-subtle bg-raised/70 p-5 lg:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[9px] font-semibold uppercase tracking-[.2em] text-violet-light">Funil dos últimos 30 dias</p><h2 className="mt-1 text-sm font-bold text-bright">Da entrada ao primeiro pagamento</h2></div><span className="rounded-full border border-cyan/20 bg-cyan/10 px-2.5 py-1 text-[10px] font-semibold text-cyan">{leadToTrial30.toFixed(1)}% dos leads testaram</span></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">{[{ label: "Leads", value: data.leads30, detail: "recebidos", tone: "text-violet-light" }, { label: "Testes", value: data.trials30, detail: "iniciados", tone: "text-cyan" }, { label: "Clientes", value: data.closed30, detail: "1º pagamento", tone: "text-emerald" }].map((item, index) => <div key={item.label} className="contents"><div className="rounded-xl border border-edge-subtle bg-surface/55 p-4 text-center"><p className={`text-2xl font-bold tabular-nums ${item.tone}`}>{item.value}</p><p className="mt-1 text-xs font-semibold text-bright">{item.label}</p><p className="mt-1 text-[9px] text-dim">{item.detail}</p></div>{index < 2 && <Icon name="arrow" className="mx-auto h-4 w-4 rotate-90 text-dim sm:rotate-0" />}</div>)}</div>
      </article>
      <article className="relative overflow-hidden rounded-xl border border-violet/20 bg-gradient-to-br from-violet/10 to-raised p-5 lg:p-6"><Icon name="spark" className="absolute right-5 top-5 h-5 w-5 text-violet-light"/><p className="text-[9px] font-semibold uppercase tracking-[.2em] text-violet-light">Meta sugerida pelo ritmo atual</p><div className="mt-4 flex items-end gap-2"><strong className="text-4xl font-bold text-bright">{data.weeklyGoal}</strong><span className="pb-1 text-xs text-muted">testes por semana</span></div><p className="mt-2 text-[11px] leading-relaxed text-muted">A equipe fez {data.trials7} testes nos últimos 7 dias. A meta mensal correspondente é <b className="text-bright">{data.monthlyGoal} testes</b>, com potencial de cerca de <b className="text-emerald">{suggestedClients} novos clientes</b> no ritmo atual de conversão.</p><div className="mt-4"><div className="mb-1.5 flex justify-between text-[9px] text-dim"><span>Realizado neste mês</span><span>{data.trialsMonth} de {data.monthlyGoal}</span></div><Bar value={data.trialsMonth} max={data.monthlyGoal}/></div></article>
    </section>

    <section className="mt-5 grid gap-4 xl:grid-cols-2">
      <article className="rounded-xl border border-edge-subtle bg-raised/70 p-5"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg border border-violet/20 bg-violet/10 text-violet-light"><Icon name="chart"/></span><div><h2 className="text-sm font-bold text-bright">Canais que mais trazem leads</h2><p className="text-[10px] text-dim">Leads cadastrados nos últimos 30 dias</p></div></div><div className="mt-5 space-y-4">{data.channels.map(item => <div key={item.name}><div className="mb-1.5 flex justify-between text-[11px]"><span className="font-medium text-sub">{item.name}</span><strong className="text-bright">{item.value}</strong></div><Bar value={item.value} max={maxChannel}/></div>)}</div></article>
      <article className="rounded-xl border border-edge-subtle bg-raised/70 p-5"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg border border-cyan/20 bg-cyan/10 text-cyan"><Icon name="spark"/></span><div><h2 className="text-sm font-bold text-bright">Criativos que mais geram leads</h2><p className="text-[10px] text-dim">Resultados informados pelo Meta Ads nos últimos 30 dias</p></div></div><div className="mt-5 space-y-4">{data.creatives.map(item => <div key={item.name}><div className="mb-1.5 flex items-center justify-between gap-3 text-[11px]"><span className="truncate font-medium text-sub" title={item.name}>{item.name}</span><span className="shrink-0"><b className="text-bright">{item.leads}</b><small className="ml-2 text-dim">CPL {money.format(item.leads ? item.spend / item.leads : 0)}</small></span></div><Bar value={item.leads} max={maxCreative} tone="cyan"/></div>)}{!data.creatives.length && <p className="py-6 text-center text-[11px] text-dim">Sem dados de criativos no período.</p>}</div></article>
    </section>

    <section className="mt-5 overflow-hidden rounded-xl border border-edge-subtle bg-raised/70"><div className="flex flex-col gap-4 border-b border-edge-subtle p-4 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-sm font-bold text-bright">Todos os clientes em teste grátis</h2><p className="mt-1 text-[10px] text-dim">Reúne os testes cadastrados nas lojas e no CRM.</p></div><label className="relative block w-full lg:w-80"><Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim"/><input type="search" aria-label="Buscar cliente" placeholder="Buscar nome, telefone ou e-mail" value={query} onChange={event => setQuery(event.target.value)} className="w-full rounded-lg border border-edge-subtle bg-surface py-2.5 pl-9 pr-3 text-xs outline-none placeholder:text-dim focus:border-violet/35"/></label></div>
      <div className="flex flex-wrap gap-2 border-b border-edge-subtle px-4 py-3">{summary.map(item => <button key={item.key} onClick={() => setFilter(item.key)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-semibold transition ${filter === item.key ? `${item.box} ${item.tone}` : "border-edge-subtle text-muted hover:bg-surface"}`}><Icon name={item.icon} className="h-3.5 w-3.5"/>{item.label}<b>{count(item.key)}</b></button>)}</div>
      {loading ? <div className="grid gap-3 p-4"><div className="h-16 animate-pulse rounded-lg bg-surface"/><div className="h-16 animate-pulse rounded-lg bg-surface"/></div> : <><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-left"><thead className="bg-surface/50 text-[9px] uppercase tracking-[.15em] text-dim"><tr><th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Período</th><th className="px-5 py-3">Progresso</th><th className="px-5 py-3">Situação</th><th className="px-5 py-3">Origem</th><th className="px-5 py-3 text-right">Ação</th></tr></thead><tbody className="divide-y divide-edge-subtle">{visible.map(row => <tr key={row.key} className="transition hover:bg-surface/35"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-violet/15 bg-violet/10 text-[10px] font-bold text-violet-light">{initials(row.name)}</span><div><strong className="text-xs text-bright">{row.name}</strong><p className="mt-1 text-[9px] text-dim">{row.phone || row.email || "Contato não informado"}</p></div></div></td><td className="px-5 py-4 text-[10px] text-sub">{row.start ? formatDate(row.start) : "—"}<span className="mx-2 text-dim">→</span>{row.end ? formatDate(row.end) : "—"}</td><td className="px-5 py-4"><div className="w-36"><div className="mb-1 flex justify-between text-[9px] text-dim"><span>7 dias</span><span>{Math.round(row.progress)}%</span></div><Bar value={row.progress} max={100} tone="cyan"/></div></td><td className="px-5 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-semibold ${!row.lead ? "border-amber/20 bg-amber/10 text-amber" : row.remaining !== null && row.remaining <= 0 ? "border-rose/20 bg-rose/10 text-rose" : "border-cyan/20 bg-cyan/10 text-cyan"}`}>{statusLabel(row)}</span></td><td className="px-5 py-4 text-[10px] capitalize text-muted">{row.platform || row.lead?.fonte_oportunidade || "—"}</td><td className="px-5 py-4 text-right">{row.lead ? <button onClick={() => setSelected(row.lead!.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-edge-subtle px-3 py-2 text-[10px] font-semibold text-violet-light hover:border-violet/30">Abrir <Icon name="arrow" className="h-3.5 w-3.5"/></button> : <span className="text-[9px] text-amber">Vinculação pendente</span>}</td></tr>)}</tbody></table></div>
        <div className="grid gap-3 p-3 md:hidden">{visible.map(row => <article key={row.key} className="rounded-xl border border-edge-subtle bg-surface/45 p-4"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-violet/10 text-[10px] font-bold text-violet-light">{initials(row.name)}</span><div className="min-w-0"><strong className="block truncate text-xs text-bright">{row.name}</strong><p className="mt-1 truncate text-[9px] text-dim">{row.phone || row.email || "Contato não informado"}</p></div></div><div className="mt-4 flex justify-between text-[10px]"><span className="text-dim">{row.start ? formatDate(row.start) : "Sem data"}</span><strong className={!row.lead ? "text-amber" : row.remaining !== null && row.remaining <= 0 ? "text-rose" : "text-cyan"}>{statusLabel(row)}</strong></div><div className="mt-2"><Bar value={row.progress} max={100} tone="cyan"/></div>{row.lead && <button onClick={() => setSelected(row.lead!.id)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-violet/20 bg-violet/5 px-3 py-2.5 text-[10px] font-semibold text-violet-light">Abrir oportunidade <Icon name="arrow" className="h-3.5 w-3.5"/></button>}</article>)}</div>
        {!visible.length && <div className="flex flex-col items-center px-6 py-14 text-center"><Icon name="search" className="h-6 w-6 text-dim"/><strong className="mt-3 text-xs text-sub">Nenhum cliente encontrado</strong></div>}</>}
    </section>
    {selected && <LeadModal leadId={selected} onClose={() => setSelected(null)} onUpdated={load}/>}
  </div>;
}
