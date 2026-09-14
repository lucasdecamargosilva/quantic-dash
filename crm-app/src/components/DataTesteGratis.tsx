import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function DataTesteGratis({ leadId, value, onSaved }: {
  leadId: string; value?: string | null; onSaved?: () => void;
}) {
  const [date, setDate] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setDate(value ?? ""); setError(""); }, [leadId, value]);
  async function save() {
    if (date === (value ?? "")) return;
    setSaving(true); setError("");
    try {
      const { error } = await supabase.from("leads").update({ teste_gratis_em: date || null }).eq("id", leadId);
      if (error) throw error;
      onSaved?.();
    } catch { setError("Não foi possível salvar a data. Tente novamente."); }
    finally { setSaving(false); }
  }
  return <div className="mb-5">
    <label className="text-xs text-dim block mb-2" htmlFor={`teste-${leadId}`}>Entrada no teste grátis</label>
    <input id={`teste-${leadId}`} type="date" value={date} disabled={saving}
      onChange={e => setDate(e.target.value)} onBlur={save}
      className="bg-surface border border-edge-subtle rounded-lg px-3 py-2 text-sm text-text" />
    <p className="text-xs text-dim mt-1">{saving ? "Salvando…" : "Registrada automaticamente ao entrar no teste. Você pode ajustar a data."}</p>
    {error && <p role="alert" className="text-xs text-rose mt-1">{error} <button onClick={save}>Tentar novamente</button></p>}
  </div>;
}
