import { useState } from "react";
import { supabase } from "../lib/supabase";

interface Props {
  leadId: string;
  onSaved: () => void;
}

export default function InteracaoForm({ leadId, onSaved }: Props) {
  const [conteudo, setConteudo] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!conteudo.trim()) return;
    setSaving(true);

    const agora = new Date().toISOString();

    // Registra a interacao como nota, marcando data/hora do envio
    await supabase.from("interacoes").insert({
      lead_id: leadId,
      tipo: "nota",
      conteudo: conteudo.trim(),
      created_at: agora,
    });

    // Marca a data/hora da atualizacao no proprio lead
    await supabase.from("leads").update({ updated_at: agora }).eq("id", leadId);

    setConteudo("");
    setSaving(false);
    onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-end">
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
