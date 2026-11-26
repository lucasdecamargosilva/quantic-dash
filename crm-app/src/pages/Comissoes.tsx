import { useEffect, useMemo, useState, type FormEvent } from "react";

type Situacao = "a_receber" | "paga";
type Item = {
  chatid: string; cliente: string; fone: string | null; responsavel: string | null; plano: string;
  mensalidade_centavos: number; comissao_centavos: number; fechado_em: string;
  cliente_pagou_em: string | null; comissao_paga_em: string | null; situacao: Situacao;
  loja_situacao?: LojaSit | null; loja_vencimento?: string | null;
};
type LojaSit = "ativo" | "vencido" | "pausado" | "teste" | "inativo";
type Mov = { id?: number; data: string; tipo: string; descricao: string; entrada_centavos: number; saida_centavos: number; saldo_centavos: number };
type Resp = { pct: number; canEdit: boolean; usuario: string; itens: Item[]; totais: Record<Situacao, number> & { adiantado?: number; saldo?: number }; extrato?: Mov[] };

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (v: string | null) => v ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

const SIT: Record<Situacao, { label: string; cls: string; hint: string }> = {
  a_receber: { label: "A receber", cls: "bg-cyan/10 text-cyan", hint: "Cliente pagou — comissão liberada" },
  paga: { label: "Paga", cls: "bg-emerald/10 text-emerald", hint: "Comissão já paga ao vendedor" },
};

const LOJA: Record<LojaSit, { label: string; cls: string }> = {
  ativo: { label: "Ativo", cls: "bg-emerald/10 text-emerald" },
  vencido: { label: "Vencido", cls: "bg-amber/10 text-amber" },
  pausado: { label: "Pausado", cls: "bg-rose/10 text-rose" },
  teste: { label: "Em teste", cls: "bg-cyan/10 text-cyan" },
  inativo: { label: "Inativo", cls: "bg-rose/10 text-rose" },
};
const dia = (v?: string | null) => v ? v.slice(8, 10) + "/" + v.slice(5, 7) : "";

export default function Comissoes() {
  const [d, setD] = useState<Resp | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [resp, setResp] = useState("");
  const [sit, setSit] = useState<"" | Situacao>("");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [lData, setLData] = useState(hoje);
  const [lValor, setLValor] = useState("");
  const [lDesc, setLDesc] = useState("");

  async function lancar(e: FormEvent) {
    e.preventDefault();
    const centavos = Math.round(parseFloat(lValor.replace(/\./g, "").replace(",", ".")) * 100);
    if (!centavos || centavos <= 0) { setError("Informe um valor maior que zero."); return; }
    setSaving("lanc"); setError("");
    try {
      const r = await fetch("/api/comissoes/lancamento", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: lData, valor_centavos: centavos, descricao: lDesc, tipo: "adiantamento" }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.erro || "Não foi possível lançar."); }
      setLValor(""); setLDesc(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao lançar."); }
    finally { setSaving(null); }
  }

  async function excluir(m: Mov) {
    if (!m.id || !window.confirm(`Excluir o lançamento de ${brl(m.saida_centavos)}?`)) return;
    setSaving("ex" + m.id); setError("");
    try {
      const r = await fetch("/api/comissoes/lancamento/excluir", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.erro || "Não foi possível excluir."); }
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao excluir."); }
    finally { setSaving(null); }
  }

  async function load() {
    setError("");
    try {
      const r = await fetch("/api/comissoes", { credentials: "same-origin" });
      if (!r.ok) throw new Error(r.status === 401 ? "Entre no Atendimento para ver suas comissões." : "Não foi possível carregar as comissões.");
      setD(await r.json());
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function marcar(it: Item, campo: "cliente_pagou" | "comissao_paga", marcado: boolean) {
    setSaving(it.chatid + campo); setError("");
    try {
      const r = await fetch("/api/comissoes/marcar", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatid: it.chatid, campo, marcado }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.erro || "Não foi possível salvar."); }
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar."); }
    finally { setSaving(null); }
  }

  const responsaveis = useMemo(() => [...new Set((d?.itens || []).map(i => i.responsavel || "Sem responsável"))], [d]);
  const itens = (d?.itens || []).filter(i => (!resp || (i.responsavel || "Sem responsável") === resp) && (!sit || i.situacao === sit));
  const tot = itens.reduce((a, i) => { a[i.situacao] += i.comissao_centavos; return a; }, { a_receber: 0, paga: 0 } as Record<Situacao, number>);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-bright">Comissões</h1>
          <p className="mt-1 text-sm text-muted">
            {d ? `${d.pct}% sobre a 1ª mensalidade — só clientes que já pagaram.` : "Comissão do comercial por cliente que já pagou."}
            {d && " Mostrando as comissões da Dione."}
          </p>
        </div>
        <button onClick={() => { setLoading(true); void load(); }} className="rounded-lg border border-edge px-4 py-2 text-sm text-muted hover:text-bright">Atualizar</button>
      </header>

      {error && <div role="alert" className="rounded-lg border border-rose/40 px-4 py-3 text-sm text-rose">{error}</div>}

      <section className="grid gap-3 sm:grid-cols-4">
        {(["a_receber", "paga"] as Situacao[]).map(k => (
          <button key={k} onClick={() => setSit(sit === k ? "" : k)} aria-pressed={sit === k}
            className={`rounded-xl border p-4 text-left transition ${sit === k ? "border-violet bg-active-bg" : "border-edge-subtle bg-raised hover:border-edge"}`}>
            <span className="text-xs text-muted">{SIT[k].label}</span>
            <strong className="mt-1 block text-2xl tabular-nums text-bright">{brl(tot[k])}</strong>
            <span className="text-[11px] text-dim">{SIT[k].hint}</span>
          </button>
        ))}
        <div className="rounded-xl border border-edge-subtle bg-raised p-4">
          <span className="text-xs text-muted">Adiantado</span>
          <strong className="mt-1 block text-2xl tabular-nums text-amber">{brl(d?.totais.adiantado || 0)}</strong>
          <span className="text-[11px] text-dim">Descontado da comissão a receber</span>
        </div>
        <div className="rounded-xl border border-violet/40 bg-active-bg p-4">
          <span className="text-xs text-muted">Saldo a pagar</span>
          <strong className={`mt-1 block text-2xl tabular-nums ${(d?.totais.saldo || 0) < 0 ? "text-rose" : "text-bright"}`}>{brl(d?.totais.saldo || 0)}</strong>
          <span className="text-[11px] text-dim">A receber − adiantado</span>
        </div>
      </section>

      {d?.canEdit && responsaveis.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Responsável:</span>
          {["", ...responsaveis].map(r => (
            <button key={r || "todos"} onClick={() => setResp(r)} aria-pressed={resp === r}
              className={`rounded-full border px-3 py-1 ${resp === r ? "border-violet bg-violet text-white" : "border-edge text-muted"}`}>{r || "Todos"}</button>
          ))}
        </div>
      )}

      <section className="overflow-x-auto rounded-xl border border-edge-subtle bg-raised">
        {loading ? <p className="p-6 text-sm text-muted">Carregando…</p> :
          !itens.length ? <p className="p-6 text-sm text-muted">Nenhum cliente pagante{sit ? " nessa situação" : ""}. Para contar aqui, o cliente precisa estar em <b>Convertido</b> com o plano registrado e a 1ª mensalidade paga.</p> :
          <table className="w-full min-w-[860px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-edge-subtle">
                <th className="px-4 py-3 font-medium">Cliente</th>
                {d?.canEdit && <th className="px-4 py-3 font-medium">Responsável</th>}
                <th className="px-4 py-3 font-medium">Cliente ativo?</th>
                <th className="px-4 py-3 font-medium">Plano</th>
                <th className="px-4 py-3 text-right font-medium">Mensalidade</th>
                <th className="px-4 py-3 text-right font-medium">Comissão</th>
                <th className="px-4 py-3 font-medium">Fechado em</th>
                <th className="px-4 py-3 font-medium">Situação</th>
                {d?.canEdit && <th className="px-4 py-3 font-medium">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {itens.map(i => (
                <tr key={i.chatid} className="border-b border-edge-subtle last:border-0">
                  <td className="px-4 py-3"><strong className="block text-bright">{i.cliente}</strong><small className="text-dim">{i.fone}</small></td>
                  {d?.canEdit && <td className="px-4 py-3 text-muted">{i.responsavel || "Sem responsável"}</td>}
                  <td className="px-4 py-3">
                    {i.loja_situacao ? <>
                      <span className={`inline-block rounded-md px-2 py-1 text-xs font-medium ${LOJA[i.loja_situacao].cls}`}>{LOJA[i.loja_situacao].label}</span>
                      {i.loja_vencimento && i.loja_situacao !== "teste" && <small className="mt-1 block text-dim">{i.loja_situacao === "ativo" ? "vence" : "venceu"} {dia(i.loja_vencimento)}</small>}
                    </> : <span className="text-dim">—</span>}
                  </td>
                  <td className="px-4 py-3">{i.plano}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{brl(i.mensalidade_centavos)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-bright">{brl(i.comissao_centavos)}</td>
                  <td className="px-4 py-3 text-muted">{data(i.fechado_em)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-md px-2 py-1 text-xs font-medium ${SIT[i.situacao].cls}`}>{SIT[i.situacao].label}</span>
                    {i.situacao === "a_receber" && <small className="mt-1 block text-dim">cliente pagou {data(i.cliente_pagou_em)}</small>}
                    {i.situacao === "paga" && <small className="mt-1 block text-dim">paga em {data(i.comissao_paga_em)}</small>}
                  </td>
                  {d?.canEdit && (
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1.5">
                        <button disabled={!!saving || i.situacao === "paga"} onClick={() => void marcar(i, "cliente_pagou", !i.cliente_pagou_em)}
                          className="rounded-md border border-edge px-2.5 py-1 text-xs text-muted hover:text-bright disabled:opacity-40">
                          {i.cliente_pagou_em ? "Desfazer “cliente pagou”" : "Cliente pagou"}
                        </button>
                        <button disabled={!!saving || !i.cliente_pagou_em} onClick={() => void marcar(i, "comissao_paga", !i.comissao_paga_em)}
                          className="rounded-md border border-edge px-2.5 py-1 text-xs text-muted hover:text-bright disabled:opacity-40">
                          {i.comissao_paga_em ? "Desfazer “paga”" : "Comissão paga"}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>}
      </section>

      {d?.extrato && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-bright">Extrato</h2>
              <p className="text-sm text-muted">Fluxo de caixa da comissão: entra quando o cliente paga, sai quando a comissão é paga ou adiantada.</p>
            </div>
            {d.canEdit && (
              <form onSubmit={e => void lancar(e)} className="flex flex-wrap items-end gap-2 text-sm">
                <label className="flex flex-col gap-1 text-xs text-muted">Data
                  <input type="date" value={lData} max={hoje} onChange={e => setLData(e.target.value)} required
                    className="h-9 rounded-md border border-edge bg-raised px-2 text-sm text-bright" /></label>
                <label className="flex flex-col gap-1 text-xs text-muted">Valor (R$)
                  <input inputMode="decimal" placeholder="300,00" value={lValor} onChange={e => setLValor(e.target.value)} required
                    className="h-9 w-28 rounded-md border border-edge bg-raised px-2 text-sm text-bright" /></label>
                <label className="flex flex-col gap-1 text-xs text-muted">Descrição
                  <input placeholder="Ex.: adiantamento via PIX" value={lDesc} onChange={e => setLDesc(e.target.value)}
                    className="h-9 w-56 rounded-md border border-edge bg-raised px-2 text-sm text-bright" /></label>
                <button disabled={saving === "lanc"} className="h-9 rounded-md bg-violet px-4 text-sm font-medium text-white disabled:opacity-50">Lançar adiantamento</button>
              </form>
            )}
          </div>
          <div className="overflow-x-auto rounded-xl border border-edge-subtle bg-raised">
            {!d.extrato.length ? <p className="p-6 text-sm text-muted">Nenhuma movimentação ainda.</p> :
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr className="border-b border-edge-subtle">
                    <th className="px-4 py-3 font-medium">Data</th>
                    <th className="px-4 py-3 font-medium">Descrição</th>
                    <th className="px-4 py-3 text-right font-medium">Entrada</th>
                    <th className="px-4 py-3 text-right font-medium">Saída</th>
                    <th className="px-4 py-3 text-right font-medium">Saldo</th>
                    {d.canEdit && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {[...d.extrato].reverse().map((m, k) => (
                    <tr key={(m.id ?? "c") + "-" + k} className="border-b border-edge-subtle last:border-0">
                      <td className="px-4 py-2.5 text-muted">{data(m.data)}</td>
                      <td className="px-4 py-2.5 text-bright">{m.descricao}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-emerald">{m.entrada_centavos ? "+ " + brl(m.entrada_centavos) : ""}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-rose">{m.saida_centavos ? "− " + brl(m.saida_centavos) : ""}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-bright">{brl(m.saldo_centavos)}</td>
                      {d.canEdit && <td className="px-4 py-2.5 text-right">
                        {m.id && <button disabled={!!saving} onClick={() => void excluir(m)} className="text-xs text-dim hover:text-rose">Excluir</button>}
                      </td>}
                    </tr>
                  ))}
                </tbody>
              </table>}
          </div>
        </section>
      )}
    </div>
  );
}
