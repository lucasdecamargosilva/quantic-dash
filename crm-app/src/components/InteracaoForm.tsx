import { useState } from "react";
import { INTERACAO_TIPOS } from "../types";
import type { InteracaoTipo, LeadStatus } from "../types";
import { supabase } from "../lib/supabase";

const TIPO_LABELS: Record<InteracaoTipo, string> = {
  dm_enviada: "DM Enviada",
  resposta: "Resposta",
  follow_up: "Follow-up",
  nota: "Nota",
};

const AUTO_STATUS: Partial<Record<InteracaoTipo, LeadStatus>> = {
  dm_enviada: "dm_enviada",
  resposta: "respondeu",
};

interface Props {
  leadId: string;
  onSaved: () => void;
}

export default function InteracaoForm({ leadId, onSaved }: Props) {
  const [tipo, setTipo] = useState<InteracaoTipo>("dm_enviada");
  const [conteudo, setConteudo] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!conteudo.trim()) return;
    setSaving(true);

    await supabase.from("interacoes").insert({ lead_id: leadId, tipo, conteudo: conteudo.trim() });

    const newStatus = AUTO_STATUS[tipo];
    if (newStatus) {
      await supabase.from("leads").update({ status: newStatus }).eq("id", leadId);
    }

    setConteudo("");
    setSaving(false);
    onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-end">
      <select
        value={tipo}
        onChange={(e) => setTipo(e.target.value as InteracaoTipo)}
        className="bg-surface border border-edge-subtle rounded-lg px-2.5 py-2 text-xs text-sub focus:outline-none focus:border-violet/30 transition-all"
      >
        {INTERACAO_TIPOS.map((t) => <option key={t} value={t}>{TIPO_LABELS[t]}</option>)}
      </select>
      <input
        type="text"
        value={conteudo}
        onChange={(e) => setConteudo(e.target.value)}
        placeholder="Descreva..."
        className="flex-1 bg-surface border border-edge-subtle rounded-lg px-3 py-2 text-xs text-text placeholder:text-dim/50 focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 transition-all"
      />
      <button
        type="submit"
        disabled={saving || !conteudo.trim()}
        className="bg-violet hover:bg-violet-deep disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all"
      >
        {saving ? "..." : "Salvar"}
      </button>
    </form>
  );
}
