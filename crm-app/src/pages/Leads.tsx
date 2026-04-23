import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { LEAD_STATUSES, STATUS_LABELS } from "../types";
import type { Lead, LeadStatus } from "../types";
import StatusBadge from "../components/StatusBadge";
import LeadModal from "../components/LeadModal";
import NovoLeadModal from "../components/NovoLeadModal";

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filtroStatus, setFiltroStatus] = useState<LeadStatus | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNovo, setShowNovo] = useState(false);

  useEffect(() => { fetchLeads(); }, [filtroStatus]);

  async function fetchLeads() {
    setLoading(true);
    let query = supabase.from("leads").select("*").order("created_at", { ascending: false });
    if (filtroStatus !== "todos") query = query.eq("status", filtroStatus);
    const { data } = await query;
    setLeads(data ?? []);
    setLoading(false);
  }

  async function updateStatus(id: string, status: LeadStatus) {
    await supabase.from("leads").update({ status }).eq("id", id);
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
  }

  const filtered = leads.filter((l) => {
    const t = busca.toLowerCase();
    return l.instagram.toLowerCase().includes(t) || (l.nome_loja ?? "").toLowerCase().includes(t);
  });

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-serif text-3xl text-bright italic tracking-tight">Leads</h1>
          <p className="text-dim text-xs mt-1.5 tracking-wide">{leads.length} coletados</p>
        </div>
        <button
          onClick={() => setShowNovo(true)}
          className="flex items-center gap-2 bg-violet hover:bg-violet-deep text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Novo lead
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full bg-surface border border-edge-subtle rounded-lg pl-9 pr-3 py-2 text-xs text-text placeholder:text-dim focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 transition-all"
          />
        </div>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value as LeadStatus | "todos")}
          className="bg-surface border border-edge-subtle rounded-lg px-3 py-2 text-xs text-sub focus:outline-none focus:border-violet/30 transition-all"
        >
          <option value="todos">Todos</option>
          {LEAD_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-5 h-5 border-2 border-violet border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-raised border border-edge-subtle rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-edge text-dim uppercase tracking-widest text-[10px]">
                <th className="font-semibold text-left px-5 py-3">Loja</th>
                <th className="font-semibold text-left px-5 py-3">Instagram</th>
                <th className="font-semibold text-left px-5 py-3">Site</th>
                <th className="font-semibold text-left px-5 py-3">Seg.</th>
                <th className="font-semibold text-left px-5 py-3">Status</th>
                <th className="font-semibold text-left px-5 py-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead, i) => (
                <tr
                  key={lead.id}
                  onClick={() => setSelectedId(lead.id)}
                  className="stagger-in border-b border-edge-subtle/60 hover:bg-surface/80 cursor-pointer transition-colors group"
                  style={{ animationDelay: `${i * 20}ms` }}
                >
                  <td className="px-5 py-3 font-medium text-bright text-[13px]">{lead.nome_loja ?? "—"}</td>
                  <td className="px-5 py-3 text-muted">@{lead.instagram}</td>
                  <td className="px-5 py-3">
                    {lead.site ? (
                      <a
                        href={lead.site}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-violet-light hover:text-violet hover:underline underline-offset-2 transition-colors"
                      >
                        {new URL(lead.site).hostname}
                      </a>
                    ) : <span className="text-dim">—</span>}
                  </td>
                  <td className="px-5 py-3 text-muted tabular-nums">{lead.seguidores.toLocaleString("pt-BR")}</td>
                  <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                    <StatusBadge status={lead.status} onChange={(s) => updateStatus(lead.id, s)} />
                  </td>
                  <td className="px-5 py-3 text-dim">{new Date(lead.created_at).toLocaleDateString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-16">
              <p className="text-dim text-xs">Nenhum lead encontrado.</p>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {selectedId && (
        <LeadModal
          leadId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={fetchLeads}
        />
      )}
      {showNovo && (
        <NovoLeadModal
          onClose={() => setShowNovo(false)}
          onCreated={fetchLeads}
        />
      )}
    </div>
  );
}
