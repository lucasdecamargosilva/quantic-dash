import type { Lead, LeadStatus } from "../types";
import { STATUS_HEX, STATUS_LABELS } from "../types";
import FonteLogo from "./FonteLogo";

interface Props {
  status: LeadStatus;
  leads: Lead[];
  onClose: () => void;
}

// Popup que lista os leads de uma etapa específica do pipeline.
// Usado tanto na Dashboard ("Total de Leads por Etapa") quanto no Pipeline.
export default function LeadsPorEtapaModal({ status, leads, onClose }: Props) {
  const leadsDoStage = leads
    .filter((l) => l.status === status)
    .sort((a, b) => (a.nome_loja || a.instagram).localeCompare(b.nome_loja || b.instagram));

  return (
    <div
      className="fixed inset-0 bg-base/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-raised border border-edge rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-raised border-b border-edge-subtle px-5 py-4 flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold text-bright flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: STATUS_HEX[status] }}
              />
              <span className="truncate">{STATUS_LABELS[status]}</span>
            </h2>
            <p className="text-[10px] text-dim mt-0.5">
              {leadsDoStage.length} lead{leadsDoStage.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="w-8 h-8 rounded-md flex items-center justify-center text-dim hover:text-bright hover:bg-surface/60 transition-colors shrink-0"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-2.5">
          {leadsDoStage.length === 0 && (
            <p className="text-dim text-xs text-center py-8">Nenhum lead nesta etapa.</p>
          )}
          {leadsDoStage.map((l) => (
            <div
              key={l.id}
              className="flex items-start gap-3 pb-2.5 border-b border-edge-subtle/50 last:border-b-0 last:pb-0"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[13px] font-semibold text-bright truncate flex-1 min-w-0">
                    {l.nome_loja || `@${l.instagram}`}
                  </p>
                  <FonteLogo fonte={l.fonte_oportunidade} />
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-dim flex-wrap">
                  <span className="text-dim">@{l.instagram}</span>
                  <span className="text-dim/40">·</span>
                  <span className="text-sub">
                    {l.responsavel?.trim() || "— Sem responsável"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
