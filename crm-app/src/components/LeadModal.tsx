import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Lead, Interacao, LeadStatus } from "../types";
import { FONTES_OPORTUNIDADE } from "../types";
import StatusBadge from "./StatusBadge";
import InteracaoForm from "./InteracaoForm";

const TIPO_LABELS: Record<string, string> = {
  dm_enviada: "DM Enviada",
  resposta: "Resposta",
  follow_up: "Follow-up",
  nota: "Nota",
};

const TIPO_ACCENT: Record<string, string> = {
  dm_enviada: "text-cyan",
  resposta: "text-amber",
  follow_up: "text-violet-light",
  nota: "text-dim",
};

interface Props {
  leadId: string;
  onClose: () => void;
  onUpdated?: () => void;
}

export default function LeadModal({ leadId, onClose, onUpdated }: Props) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [interacoes, setInteracoes] = useState<Interacao[]>([]);
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLead();
    fetchInteracoes();
  }, [leadId]);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  async function fetchLead() {
    const { data } = await supabase.from("leads").select("*").eq("id", leadId).single();
    if (data) { setLead(data); setNotas(data.notas ?? ""); }
    setLoading(false);
  }

  async function fetchInteracoes() {
    const { data } = await supabase.from("interacoes").select("*").eq("lead_id", leadId).order("created_at", { ascending: false });
    setInteracoes(data ?? []);
  }

  async function updateStatus(status: LeadStatus) {
    await supabase.from("leads").update({ status }).eq("id", leadId);
    setLead((prev) => (prev ? { ...prev, status } : null));
    onUpdated?.();
  }

  async function salvarNotas() {
    await supabase.from("leads").update({ notas }).eq("id", leadId);
    onUpdated?.();
  }

  async function deletarLead() {
    if (!confirm("Tem certeza que quer deletar esse lead?")) return;
    await supabase.from("interacoes").delete().eq("lead_id", leadId);
    await supabase.from("leads").delete().eq("id", leadId);
    onUpdated?.();
    onClose();
  }

  async function togglePontoPositivo() {
    if (!lead) return;
    const novo = !lead.ponto_positivo;
    await supabase.from("leads").update({ ponto_positivo: novo }).eq("id", leadId);
    setLead({ ...lead, ponto_positivo: novo });
    onUpdated?.();
  }

  async function salvarResponsavel(resp: string) {
    const valor = resp.trim() || null;
    await supabase.from("leads").update({ responsavel: valor }).eq("id", leadId);
    setLead((prev) => (prev ? { ...prev, responsavel: valor } : null));
    onUpdated?.();
  }

  async function salvarFonte(fonte: string) {
    const valor = fonte || null;
    await supabase.from("leads").update({ fonte_oportunidade: valor }).eq("id", leadId);
    setLead((prev) => (prev ? { ...prev, fonte_oportunidade: valor } : null));
    onUpdated?.();
  }

  async function salvarTelefone(tel: string) {
    const valor = tel.trim() || null;
    await supabase.from("leads").update({ telefone: valor }).eq("id", leadId);
    setLead((prev) => (prev ? { ...prev, telefone: valor } : null));
    onUpdated?.();
  }

  async function salvarEmail(mail: string) {
    const valor = mail.trim() || null;
    await supabase.from("leads").update({ email: valor }).eq("id", leadId);
    setLead((prev) => (prev ? { ...prev, email: valor } : null));
    onUpdated?.();
  }

  async function salvarInstagram(valor: string, inputEl: HTMLInputElement) {
    const handle = valor.trim().replace(/^@/, "").toLowerCase();
    if (!handle) {
      // não deixa salvar vazio — @ é NOT NULL no banco
      inputEl.value = lead?.instagram ?? "";
      return;
    }
    if (handle === lead?.instagram) return;
    const { error } = await supabase.from("leads").update({ instagram: handle }).eq("id", leadId);
    if (error) {
      // 23505 = violação de unique (handle já existe)
      if (error.code === "23505") alert("Esse @ já está em outra oportunidade.");
      else alert("Erro: " + error.message);
      inputEl.value = lead?.instagram ?? "";
      return;
    }
    setLead((prev) => (prev ? { ...prev, instagram: handle } : null));
    onUpdated?.();
  }

  return (
    <div
      className="fixed inset-0 bg-base/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-raised border border-edge rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-5 h-5 border-2 border-violet border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !lead ? (
          <div className="p-20 text-center">
            <p className="text-dim text-sm">Lead nao encontrado.</p>
          </div>
        ) : (
          <div className="p-6">
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-5 right-5 text-dim hover:text-bright text-2xl leading-none z-10"
            >
              ×
            </button>

            {/* Header */}
            <div className="flex items-start justify-between mb-5 pr-8">
              <div>
                <h2 className="text-[18px] font-bold text-bright tracking-tight">
                  {lead.nome_loja || `@${lead.instagram}`}
                </h2>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-muted text-xs">@{lead.instagram}</span>
                  <span className="text-edge text-xs">/</span>
                  <span className="text-muted text-xs tabular-nums">
                    {lead.seguidores.toLocaleString("pt-BR")} seguidores
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePontoPositivo}
                  title={lead.ponto_positivo ? "Remover ponto positivo" : "Marcar como ponto positivo"}
                  className={`p-1.5 rounded-lg transition-all ${
                    lead.ponto_positivo
                      ? "bg-emerald/20 text-emerald hover:bg-emerald/30"
                      : "text-dim hover:text-emerald hover:bg-emerald/10"
                  }`}
                >
                  <svg className="w-4 h-4" fill={lead.ponto_positivo ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <StatusBadge status={lead.status} onChange={updateStatus} />
                <button
                  onClick={deletarLead}
                  className="text-dim hover:text-rose text-xs p-1.5 rounded-lg hover:bg-rose/10 transition-all"
                  title="Deletar lead"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 mb-6">
              <a
                href={`https://instagram.com/${lead.instagram}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 bg-surface border border-edge-subtle hover:border-edge text-xs font-medium text-sub hover:text-bright px-3.5 py-2 rounded-lg transition-all"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                Instagram
              </a>
              {lead.site && (
                <a
                  href={lead.site}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 bg-surface border border-edge-subtle hover:border-edge text-xs font-medium text-sub hover:text-bright px-3.5 py-2 rounded-lg transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                  Site
                </a>
              )}
            </div>

            {/* Dados da oportunidade */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-2 block">@ Instagram</label>
                <input
                  type="text"
                  defaultValue={lead.instagram}
                  onBlur={(e) => salvarInstagram(e.target.value, e.target)}
                  placeholder="@loja"
                  className="w-full bg-surface border border-edge-subtle rounded-lg px-3.5 py-2.5 text-xs text-text placeholder:text-dim/50 focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-2 block">Responsavel</label>
                <input
                  type="text"
                  defaultValue={lead.responsavel ?? ""}
                  onBlur={(e) => salvarResponsavel(e.target.value)}
                  placeholder="Nome"
                  className="w-full bg-surface border border-edge-subtle rounded-lg px-3.5 py-2.5 text-xs text-text placeholder:text-dim/50 focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-2 block">Fonte da oportunidade</label>
                <select
                  value={lead.fonte_oportunidade ?? ""}
                  onChange={(e) => salvarFonte(e.target.value)}
                  className="w-full bg-surface border border-edge-subtle rounded-lg px-3.5 py-2.5 text-xs text-sub focus:outline-none focus:border-violet/30 transition-all"
                >
                  <option value="">— Selecione —</option>
                  {FONTES_OPORTUNIDADE.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-2 block">Telefone</label>
                <input
                  type="tel"
                  defaultValue={lead.telefone ?? ""}
                  onBlur={(e) => salvarTelefone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full bg-surface border border-edge-subtle rounded-lg px-3.5 py-2.5 text-xs text-text placeholder:text-dim/50 focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 transition-all"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-2 block">Email</label>
                <input
                  type="email"
                  defaultValue={lead.email ?? ""}
                  onBlur={(e) => salvarEmail(e.target.value)}
                  placeholder="loja@email.com"
                  className="w-full bg-surface border border-edge-subtle rounded-lg px-3.5 py-2.5 text-xs text-text placeholder:text-dim/50 focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 transition-all"
                />
              </div>
            </div>

            {/* Notas */}
            <div className="mb-6">
              <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-2 block">Notas</label>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                onBlur={salvarNotas}
                placeholder="Adicione notas..."
                rows={2}
                className="w-full bg-surface border border-edge-subtle rounded-lg px-3.5 py-2.5 text-xs text-text placeholder:text-dim/50 focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 resize-none transition-all"
              />
            </div>

            {/* Interacoes */}
            <div>
              <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-3 block">Interacoes</label>
              <InteracaoForm leadId={lead.id} onSaved={() => { fetchLead(); fetchInteracoes(); onUpdated?.(); }} />

              <div className="mt-4 space-y-1 max-h-64 overflow-y-auto">
                {interacoes.map((int) => (
                  <div
                    key={int.id}
                    className="flex items-start gap-3 py-2.5 border-b border-edge-subtle/40 last:border-0"
                  >
                    <div className="mt-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-edge" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-semibold ${TIPO_ACCENT[int.tipo] ?? "text-dim"}`}>
                          {TIPO_LABELS[int.tipo] ?? int.tipo}
                        </span>
                        <span className="text-[10px] text-dim">
                          {new Date(int.created_at).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-xs text-sub mt-0.5 leading-relaxed">{int.conteudo}</p>
                    </div>
                  </div>
                ))}
                {interacoes.length === 0 && (
                  <p className="text-dim text-xs py-4 text-center">Nenhuma interacao.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
