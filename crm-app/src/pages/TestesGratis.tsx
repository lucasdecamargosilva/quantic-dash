import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { applyCustomLeadStatuses } from "../lib/lead-status";
import type { Lead } from "../types";
import LeadModal from "../components/LeadModal";

type Filter = "todos" | "ativos" | "expirados" | "sem-data";
const day = 86400000;
const formatDate = (value: string) => new Date(value + "T12:00:00Z").toLocaleDateString("pt-BR", { timeZone: "UTC" });

export default function TestesGratis() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filter, setFilter] = useState<Filter>("todos");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [today, setToday] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
  async function load() {
    setLoading(true); setError("");
    try {
      const rows: Lead[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("leads").select("*").in("status", ["testando", "teste_catalogo_7_dias"])
          .order("id").range(offset, offset + 999);
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      const normalized = await applyCustomLeadStatuses(rows);
      setLeads(normalized.filter(l => ["testando", "teste_catalogo_7_dias"].includes(l.status)));
      setToday(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
    } catch { setError("Não foi possível carregar os testes. Clique em Atualizar para tentar novamente."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    load();
    const refresh = () => { if (!document.hidden) load(); };
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, []);
  const rows = leads.map(lead => {
    const start = lead.teste_gratis_em;
    const end = start ? new Date(Date.parse(start + "T00:00:00Z") + 7 * day).toISOString().slice(0, 10) : null;
    const remaining = end ? Math.round((Date.parse(end) - Date.parse(today)) / day) : null;
    const category: Filter = remaining === null ? "sem-data" : remaining <= 0 ? "expirados" : "ativos";
    return { lead, start, end, remaining, category };
  }).sort((a, b) => (a.end ?? "9999").localeCompare(b.end ?? "9999"));
  const visible = rows.filter(row => (filter === "todos" || filter === row.category) &&
    `${row.lead.nome_loja ?? ""} ${row.lead.telefone ?? ""}`.toLowerCase().includes(query.toLowerCase().trim()));
  const tabs: [Filter, string][] = [["todos", "Todos"], ["expirados", "Expirados · oferecer plano"], ["ativos", "Em andamento"], ["sem-data", "Sem data"]];
  return <div className="p-4 lg:p-8">
    <div className="flex justify-between items-start gap-4 mb-6">
      <div><h1 className="text-2xl font-bold text-bright">Clientes em teste grátis</h1>
        <p className="text-sm text-dim mt-2">Acompanhe os 7 dias de teste e quem já está na hora de receber uma oferta de plano.</p></div>
      <button onClick={load} disabled={loading} className="bg-violet text-white rounded-lg px-4 py-2 text-sm">Atualizar</button>
    </div>
    <div className="flex flex-wrap gap-2 mb-4">{tabs.map(([key, label]) => <button key={key} onClick={() => setFilter(key)}
      className={`rounded-lg px-3 py-2 text-sm border ${filter === key ? "bg-violet text-white border-violet" : "bg-surface text-sub border-edge-subtle"}`}>
      {label} · {key === "todos" ? rows.length : rows.filter(r => r.category === key).length}</button>)}</div>
    <input type="search" aria-label="Buscar cliente" placeholder="Buscar por nome ou telefone" value={query} onChange={e => setQuery(e.target.value)}
      className="w-full max-w-md mb-5 bg-surface border border-edge-subtle rounded-lg px-3 py-2 text-sm" />
    {error && <p role="alert" className="text-rose mb-4">{error}</p>}
    {loading ? <p className="text-dim">Carregando clientes…</p> : <div className="overflow-x-auto border border-edge-subtle rounded-xl">
      <table className="w-full text-sm text-left"><thead className="bg-surface text-dim"><tr>
        <th className="p-3">Cliente</th><th className="p-3">Início</th><th className="p-3">Fim do teste</th><th className="p-3">Situação</th><th className="p-3">Ação</th>
      </tr></thead><tbody>{visible.map(({ lead, start, end, remaining, category }) => <tr key={lead.id} className="border-t border-edge-subtle">
        <td className="p-3"><strong className="text-bright">{lead.nome_loja || lead.instagram}</strong><div className="text-xs text-dim mt-1">{lead.telefone || "Telefone não informado"}</div></td>
        <td className="p-3 whitespace-nowrap">{start ? formatDate(start) : "Não informada"}</td>
        <td className="p-3 whitespace-nowrap">{end ? formatDate(end) : "—"}</td>
        <td className={`p-3 ${category === "expirados" ? "text-rose" : category === "ativos" ? "text-cyan" : "text-dim"}`}>
          {remaining === null ? "Cadastre a data de início" : remaining <= 0 ? (remaining === 0 ? "Expirou hoje · oferecer plano" : `Expirou há ${-remaining} dia(s) · oferecer plano`) : `Restam ${remaining} dia(s)`}</td>
        <td className="p-3"><button className="text-violet-light underline whitespace-nowrap" onClick={() => setSelected(lead.id)}>Abrir oportunidade</button></td>
      </tr>)}</tbody></table>
      {!visible.length && <p className="p-6 text-dim">Nenhum cliente encontrado neste filtro.</p>}
    </div>}
    <p className="mt-4 text-xs text-dim">O prazo termina 7 dias após a entrada no teste. Clientes sem data ficam separados até o preenchimento.</p>
    {selected && <LeadModal leadId={selected} onClose={() => setSelected(null)} onUpdated={load} />}
  </div>;
}
