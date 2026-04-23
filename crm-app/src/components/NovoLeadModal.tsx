import { useState } from "react";
import { supabase } from "../lib/supabase";
import { LEAD_STATUSES, STATUS_LABELS } from "../types";
import type { LeadStatus } from "../types";

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function NovoLeadModal({ onClose, onCreated }: Props) {
  const [instagram, setInstagram] = useState("");
  const [nomeLoja, setNomeLoja] = useState("");
  const [site, setSite] = useState("");
  const [seguidores, setSeguidores] = useState("");
  const [idioma, setIdioma] = useState<"pt" | "en" | "es">("pt");
  const [status, setStatus] = useState<LeadStatus>("novo");
  const [responsavel, setResponsavel] = useState("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    const handle = instagram.trim().replace(/^@/, "").toLowerCase();
    if (!handle) {
      setErro("Instagram é obrigatório");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("leads").insert({
      instagram: handle,
      nome_loja: nomeLoja.trim() || handle,
      site: site.trim(),
      seguidores: parseInt(seguidores) || 0,
      idioma,
      notas: notas.trim(),
      status,
      tem_provador: false,
      responsavel: responsavel.trim() || null,
    });

    setSaving(false);

    if (error) {
      setErro(error.code === "23505" ? "Esse @ já está no pipeline" : error.message);
      return;
    }

    onCreated();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-base/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-raised border border-edge rounded-2xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-[18px] font-bold text-bright tracking-tight">Novo lead</h2>
            <p className="text-dim text-xs mt-1">Adicione manualmente no pipeline</p>
          </div>
          <button onClick={onClose} className="text-dim hover:text-bright text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-1.5 block">Instagram *</label>
            <input
              type="text"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="@loja"
              autoFocus
              className="w-full bg-surface border border-edge-subtle rounded-lg px-3 py-2 text-sm text-text placeholder:text-dim/50 focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 transition-all"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-1.5 block">Nome da loja</label>
            <input
              type="text"
              value={nomeLoja}
              onChange={(e) => setNomeLoja(e.target.value)}
              placeholder="Loja Tal"
              className="w-full bg-surface border border-edge-subtle rounded-lg px-3 py-2 text-sm text-text placeholder:text-dim/50 focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 transition-all"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-1.5 block">Site</label>
            <input
              type="url"
              value={site}
              onChange={(e) => setSite(e.target.value)}
              placeholder="https://..."
              className="w-full bg-surface border border-edge-subtle rounded-lg px-3 py-2 text-sm text-text placeholder:text-dim/50 focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-1.5 block">Seguidores</label>
              <input
                type="number"
                value={seguidores}
                onChange={(e) => setSeguidores(e.target.value)}
                placeholder="0"
                min="0"
                className="w-full bg-surface border border-edge-subtle rounded-lg px-3 py-2 text-sm text-text placeholder:text-dim/50 focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-1.5 block">Idioma</label>
              <select
                value={idioma}
                onChange={(e) => setIdioma(e.target.value as "pt" | "en" | "es")}
                className="w-full bg-surface border border-edge-subtle rounded-lg px-3 py-2 text-sm text-sub focus:outline-none focus:border-violet/30 transition-all"
              >
                <option value="pt">Português</option>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-1.5 block">Status (etapa do pipeline)</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as LeadStatus)}
              className="w-full bg-surface border border-edge-subtle rounded-lg px-3 py-2 text-sm text-sub focus:outline-none focus:border-violet/30 transition-all"
            >
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-1.5 block">Responsavel</label>
            <input
              type="text"
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              placeholder="Nome do responsavel"
              className="w-full bg-surface border border-edge-subtle rounded-lg px-3 py-2 text-sm text-text placeholder:text-dim/50 focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 transition-all"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-1.5 block">Notas</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Opcional..."
              rows={2}
              className="w-full bg-surface border border-edge-subtle rounded-lg px-3 py-2 text-sm text-text placeholder:text-dim/50 focus:outline-none focus:border-violet/30 focus:ring-1 focus:ring-violet/10 transition-all resize-none"
            />
          </div>

          {erro && <p className="text-rose text-xs">{erro}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-surface hover:bg-edge text-sub text-sm font-medium px-4 py-2.5 rounded-lg transition-all border border-edge-subtle"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !instagram.trim()}
              className="flex-1 bg-violet hover:bg-violet-deep disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-all"
            >
              {saving ? "Salvando..." : "Adicionar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
