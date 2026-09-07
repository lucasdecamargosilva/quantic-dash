import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Store = {
  id: string;
  name: string | null;
  company: string | null;
  plan: string | null;
  status: string | null;
  valor_personalizado: number | string | null;
};

type Payment = {
  store_id: string;
  tipo: string | null;
  valor: number | string;
  data_pagamento: string;
  descricao: string | null;
};

type Goal = {
  clientes: number;
  mrr: number;
  recebimentos: number;
};

type CustomerSummary = {
  store: Store;
  firstPayment: Payment | null;
  paymentsInPeriod: Payment[];
  periodTotal: number;
  periodMonthly: number;
  periodExtras: number;
  lifetimeTotal: number;
  lifetimeCount: number;
  lastPayment: Payment;
  newInPeriod: boolean;
  mrr: number;
};

const DEFAULT_GOAL: Goal = { clientes: 60, mrr: 5000, recebimentos: 5000 };

const PLAN_VALUES: Record<string, number> = {
  Starter: 97,
  Inicial: 197,
  Médio: 397,
  Premium: 797,
  "Ultra Power": 2200,
  Essencial: 97,
  Crescimento: 147,
  Acelerador: 347,
  Performance: 547,
  Escala: 997,
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${date.slice(0, 10)}T12:00:00`));
}

function valueOf(payment: Payment) {
  return Number(payment.valor) || 0;
}

function isMonthly(payment: Payment) {
  return String(payment.tipo || "").toLowerCase() === "mensalidade";
}

function storeName(store: Store) {
  return store.company || store.name || "Cliente sem nome";
}

function monthlyValue(store: Store, firstPayment: Payment | null) {
  const custom = Number(store.valor_personalizado);
  if (custom > 0) return custom;
  return PLAN_VALUES[store.plan || ""] || (firstPayment ? valueOf(firstPayment) : 0);
}

function pct(value: number, goal: number) {
  if (goal <= 0) return value > 0 ? 100 : 0;
  return (value / goal) * 100;
}

function localGoalKey(month: string) {
  return `quantic-crm-goal-${month}`;
}

function readLocalGoal(month: string): Goal {
  try {
    const saved = JSON.parse(localStorage.getItem(localGoalKey(month)) || "null");
    if (saved) return {
      clientes: Math.max(0, Number(saved.clientes) || 0),
      mrr: Math.max(0, Number(saved.mrr) || 0),
      recebimentos: Math.max(0, Number(saved.recebimentos) || 0),
    };
  } catch { /* armazenamento local indisponível */ }
  return DEFAULT_GOAL;
}

function MetricCard({ label, value, detail, tone = "violet" }: { label: string; value: string; detail: string; tone?: "violet" | "emerald" | "cyan" | "amber" }) {
  const colors = {
    violet: "var(--color-violet)",
    emerald: "var(--color-emerald)",
    cyan: "var(--color-cyan)",
    amber: "var(--color-amber)",
  };
  return (
    <article className="card-lift rounded-xl border border-edge-subtle bg-raised/70 p-5 relative overflow-hidden">
      <span className="absolute top-0 left-0 h-[2px] w-full opacity-70" style={{ background: `linear-gradient(90deg, ${colors[tone]}, transparent)` }} />
      <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-dim">{label}</p>
      <p className="mt-3 text-[25px] font-bold tracking-tight text-bright tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] text-muted">{detail}</p>
    </article>
  );
}

function Progress({ label, value, goal, kind }: { label: string; value: number; goal: number; kind: "count" | "money" }) {
  const percent = pct(value, goal);
  const remaining = Math.max(0, goal - value);
  const remainingText = kind === "money" ? money.format(remaining) : `${remaining} cliente${remaining === 1 ? "" : "s"}`;
  return (
    <article className="rounded-xl border border-edge-subtle bg-raised/60 p-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[12px] font-semibold text-sub">{label}</p>
        <strong className="text-[12px] text-violet-light tabular-nums">{percent.toFixed(0)}%</strong>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
        <span className="block h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, percent)}%`, background: "linear-gradient(90deg, var(--color-violet), var(--color-cyan))" }} />
      </div>
      <p className="mt-2 text-[10px] text-dim">
        {goal <= 0 ? "Defina uma meta para acompanhar." : value >= goal ? "Meta alcançada." : `Faltam ${remainingText}.`}
      </p>
    </article>
  );
}

export default function Metas() {
  const [month, setMonth] = useState(currentMonth);
  const [stores, setStores] = useState<Store[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [goal, setGoal] = useState<Goal>(() => readLocalGoal(currentMonth()));
  const [draft, setDraft] = useState<Goal>(goal);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      supabase.from("provou_levou_stores").select("id,name,company,plan,status,valor_personalizado"),
      supabase.from("pagamentos_clientes").select("store_id,tipo,valor,data_pagamento,descricao").order("data_pagamento", { ascending: true }),
    ]).then(([storesResult, paymentsResult]) => {
      if (!active) return;
      if (storesResult.error || paymentsResult.error) {
        setError(storesResult.error?.message || paymentsResult.error?.message || "Não foi possível carregar os dados.");
      } else {
        setStores((storesResult.data || []) as Store[]);
        setPayments((paymentsResult.data || []) as Payment[]);
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const fallback = readLocalGoal(month);
    setGoal(fallback);
    setDraft(fallback);
    setMessage("");
    supabase
      .from("crm_metas")
      .select("meta_clientes,meta_mrr,meta_recebimentos")
      .eq("periodo", month)
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return;
        const loaded = {
          clientes: Number(data.meta_clientes) || 0,
          mrr: Number(data.meta_mrr) || 0,
          recebimentos: Number(data.meta_recebimentos) || 0,
        };
        setGoal(loaded);
        setDraft(loaded);
        localStorage.setItem(localGoalKey(month), JSON.stringify(loaded));
      });
    return () => { active = false; };
  }, [month]);

  const summary = useMemo(() => {
    const storesById = new Map(stores.map((store) => [String(store.id), store]));
    const paymentsByStore = new Map<string, Payment[]>();
    payments.forEach((payment) => {
      const id = String(payment.store_id);
      const list = paymentsByStore.get(id) || [];
      list.push(payment);
      paymentsByStore.set(id, list);
    });

    const customers: CustomerSummary[] = [];
    paymentsByStore.forEach((history, id) => {
      const store = storesById.get(id);
      if (!store) return;
      const ordered = [...history].sort((a, b) => a.data_pagamento.localeCompare(b.data_pagamento));
      const firstPayment = ordered.find(isMonthly) || null;
      const paymentsInPeriod = ordered.filter((payment) => payment.data_pagamento.slice(0, 7) === month);
      if (!paymentsInPeriod.length) return;
      const periodTotal = paymentsInPeriod.reduce((sum, payment) => sum + valueOf(payment), 0);
      const periodMonthly = paymentsInPeriod.filter(isMonthly).reduce((sum, payment) => sum + valueOf(payment), 0);
      const lifetimeTotal = ordered.reduce((sum, payment) => sum + valueOf(payment), 0);
      customers.push({
        store,
        firstPayment,
        paymentsInPeriod,
        periodTotal,
        periodMonthly,
        periodExtras: periodTotal - periodMonthly,
        lifetimeTotal,
        lifetimeCount: ordered.length,
        lastPayment: ordered[ordered.length - 1],
        newInPeriod: firstPayment?.data_pagamento.slice(0, 7) === month,
        mrr: monthlyValue(store, firstPayment),
      });
    });

    customers.sort((a, b) => b.periodTotal - a.periodTotal);
    const closed = customers.filter((customer) => customer.newInPeriod).sort((a, b) => b.firstPayment!.data_pagamento.localeCompare(a.firstPayment!.data_pagamento));
    return {
      customers,
      closed,
      newMrr: closed.reduce((sum, customer) => sum + customer.mrr, 0),
      received: customers.reduce((sum, customer) => sum + customer.periodTotal, 0),
    };
  }, [month, payments, stores]);

  async function saveGoal(event: React.FormEvent) {
    event.preventDefault();
    const clean = {
      clientes: Math.max(0, Number(draft.clientes) || 0),
      mrr: Math.max(0, Number(draft.mrr) || 0),
      recebimentos: Math.max(0, Number(draft.recebimentos) || 0),
    };
    setSaving(true);
    setMessage("");
    localStorage.setItem(localGoalKey(month), JSON.stringify(clean));
    const { error: saveError } = await supabase.from("crm_metas").upsert({
      periodo: month,
      meta_clientes: clean.clientes,
      meta_mrr: clean.mrr,
      meta_recebimentos: clean.recebimentos,
      updated_at: new Date().toISOString(),
    }, { onConflict: "periodo" });
    setGoal(clean);
    setSaving(false);
    setMessage(saveError ? "Meta salva neste navegador; não foi possível sincronizar com o CRM." : "Meta salva no CRM.");
  }

  const ticket = summary.closed.length ? summary.newMrr / summary.closed.length : 0;

  return (
    <div className="min-h-full px-4 py-6 lg:px-8 lg:py-8">
      <header className="flex flex-col gap-5 border-b border-edge-subtle pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.3em] text-violet-light">Sales Ops</p>
          <h1 className="text-[26px] font-bold tracking-tight text-bright lg:text-[32px]">Metas comerciais</h1>
          <p className="mt-1 text-[12px] text-muted">Fechamentos, novo MRR e pagamentos confirmados no mesmo lugar.</p>
        </div>
        <label className="flex flex-col gap-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-dim">
          Período
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-lg border border-edge-subtle bg-surface px-3 py-2 text-[12px] font-medium normal-case tracking-normal text-text outline-none focus:border-violet/40" />
        </label>
      </header>

      <section className="mt-6 rounded-xl border border-edge-subtle bg-raised/70 p-5 lg:p-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(220px,.7fr)_minmax(620px,1.6fr)] xl:items-end">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-violet-light">Objetivo de {monthLabel(month)}</p>
            <h2 className="mt-2 text-[19px] font-bold text-bright">Defina onde quer chegar</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">Cada mês guarda sua própria meta e o realizado vem dos pagamentos cadastrados.</p>
          </div>
          <form onSubmit={saveGoal} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto] xl:items-end">
            {([
              ["clientes", "Clientes fechados", "number"],
              ["mrr", "Novo MRR (R$)", "number"],
              ["recebimentos", "Pagamentos (R$)", "number"],
            ] as const).map(([key, label, type]) => (
              <label key={key} className="flex flex-col gap-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-dim">
                {label}
                <input type={type} min="0" step={key === "clientes" ? "1" : "0.01"} value={draft[key]} onChange={(event) => setDraft((old) => ({ ...old, [key]: Number(event.target.value) }))} className="rounded-lg border border-edge-subtle bg-surface px-3 py-2.5 text-[12px] font-medium normal-case tracking-normal text-text outline-none focus:border-violet/40" />
              </label>
            ))}
            <button disabled={saving} className="rounded-lg bg-violet px-4 py-2.5 text-[11px] font-bold text-white transition hover:bg-violet-deep disabled:opacity-50">
              {saving ? "Salvando..." : "Salvar metas"}
            </button>
          </form>
        </div>
        {message && <p className="mt-3 text-right text-[10px] text-emerald">{message}</p>}
      </section>

      {error && <div className="mt-5 rounded-lg border border-rose/20 bg-rose/10 px-4 py-3 text-[11px] text-rose">Erro ao carregar os dados: {error}</div>}

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Clientes fechados" value={loading ? "—" : `${summary.closed.length} de ${goal.clientes}`} detail={`${pct(summary.closed.length, goal.clientes).toFixed(0)}% da meta`} tone="emerald" />
        <MetricCard label="Novo MRR fechado" value={loading ? "—" : money.format(summary.newMrr)} detail={`Meta: ${money.format(goal.mrr)}`} tone="violet" />
        <MetricCard label="Pagamentos no período" value={loading ? "—" : money.format(summary.received)} detail={`Meta: ${money.format(goal.recebimentos)}`} tone="cyan" />
        <MetricCard label="Ticket médio dos fechamentos" value={loading ? "—" : money.format(ticket)} detail="MRR médio por novo cliente" tone="amber" />
      </section>

      <section className="mt-3 grid gap-3 lg:grid-cols-3">
        <Progress label="Clientes" value={summary.closed.length} goal={goal.clientes} kind="count" />
        <Progress label="Novo MRR" value={summary.newMrr} goal={goal.mrr} kind="money" />
        <Progress label="Pagamentos" value={summary.received} goal={goal.recebimentos} kind="money" />
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-edge-subtle bg-raised/70">
        <div className="flex flex-col gap-2 border-b border-edge-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[14px] font-bold text-bright">Clientes fechados no período</h2>
            <p className="mt-0.5 text-[10px] text-dim">O fechamento é contado na primeira mensalidade registrada.</p>
          </div>
          <span className="w-fit rounded-full border border-emerald/20 bg-emerald/10 px-2.5 py-1 text-[10px] font-semibold text-emerald">{summary.closed.length} cliente{summary.closed.length === 1 ? "" : "s"}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead className="bg-surface/50 text-[9px] uppercase tracking-[0.16em] text-dim">
              <tr>{["Cliente", "Fechou em", "Plano", "Novo MRR", "Recebido no mês", "Total trazido", "Último pagamento"].map((label) => <th key={label} className="px-5 py-3 font-semibold">{label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-edge-subtle text-[11px]">
              {!loading && summary.closed.map((customer) => (
                <tr key={customer.store.id} className="transition hover:bg-surface/40">
                  <td className="px-5 py-3.5 font-semibold text-bright">{storeName(customer.store)}</td>
                  <td className="px-5 py-3.5 text-sub">{dateLabel(customer.firstPayment!.data_pagamento)}</td>
                  <td className="px-5 py-3.5 text-sub">{customer.store.plan || "—"}</td>
                  <td className="px-5 py-3.5 font-semibold text-violet-light tabular-nums">{money.format(customer.mrr)}</td>
                  <td className="px-5 py-3.5 text-sub tabular-nums">{money.format(customer.periodTotal)}</td>
                  <td className="px-5 py-3.5 font-semibold text-emerald tabular-nums">{money.format(customer.lifetimeTotal)}</td>
                  <td className="px-5 py-3.5 text-sub">{dateLabel(customer.lastPayment.data_pagamento)}</td>
                </tr>
              ))}
              {!loading && summary.closed.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-[11px] text-dim">Nenhum cliente teve a primeira mensalidade registrada neste mês.</td></tr>}
              {loading && <tr><td colSpan={7} className="px-5 py-10 text-center text-[11px] text-dim">Carregando fechamentos...</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-edge-subtle bg-raised/70">
        <div className="flex flex-col gap-2 border-b border-edge-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[14px] font-bold text-bright">Pagamentos por cliente</h2>
            <p className="mt-0.5 text-[10px] text-dim">Mensalidades e cobranças extras recebidas em {monthLabel(month)}.</p>
          </div>
          <span className="text-[13px] font-bold text-cyan tabular-nums">{money.format(summary.received)}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead className="bg-surface/50 text-[9px] uppercase tracking-[0.16em] text-dim">
              <tr>{["Cliente", "Situação", "Mensalidades", "Extras", "Recebido no mês", "Total trazido", "Pagamentos"].map((label) => <th key={label} className="px-5 py-3 font-semibold">{label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-edge-subtle text-[11px]">
              {!loading && summary.customers.map((customer) => (
                <tr key={customer.store.id} className="transition hover:bg-surface/40">
                  <td className="px-5 py-3.5 font-semibold text-bright">
                    <span className="inline-flex items-center gap-2">{storeName(customer.store)}{customer.newInPeriod && <small className="rounded-full bg-emerald/10 px-2 py-0.5 text-[8px] uppercase tracking-wider text-emerald">Novo</small>}</span>
                  </td>
                  <td className="px-5 py-3.5 text-sub">{customer.store.status || "—"}</td>
                  <td className="px-5 py-3.5 text-sub tabular-nums">{money.format(customer.periodMonthly)}</td>
                  <td className="px-5 py-3.5 text-sub tabular-nums">{money.format(customer.periodExtras)}</td>
                  <td className="px-5 py-3.5 font-semibold text-cyan tabular-nums">{money.format(customer.periodTotal)}</td>
                  <td className="px-5 py-3.5 text-emerald tabular-nums">{money.format(customer.lifetimeTotal)}</td>
                  <td className="px-5 py-3.5 text-sub tabular-nums">{customer.lifetimeCount}</td>
                </tr>
              ))}
              {!loading && summary.customers.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-[11px] text-dim">Nenhum pagamento registrado neste mês.</td></tr>}
              {loading && <tr><td colSpan={7} className="px-5 py-10 text-center text-[11px] text-dim">Carregando pagamentos...</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-4 text-[10px] leading-relaxed text-dim">Renovações de clientes antigos entram em pagamentos recebidos, mas não aumentam a quantidade de novos fechamentos.</p>
    </div>
  );
}
