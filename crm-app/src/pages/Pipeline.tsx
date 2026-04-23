import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Lead, LeadStatus } from "../types";
import { PIPELINE_STATUSES, STATUS_LABELS, STATUS_HEX } from "../types";
import LeadModal from "../components/LeadModal";
import DesempenhoResponsaveis from "../components/DesempenhoResponsaveis";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";

// ===== Card (arrastável) =====
function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    data: { lead },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => {
        // Se estava arrastando, não dispara click
        if (isDragging) return;
        onClick();
      }}
      className={`relative overflow-hidden bg-surface border rounded-lg p-3 group transition-all duration-200 ${
        lead.ponto_positivo ? "border-emerald/40" : "border-edge-subtle"
      } ${
        isDragging
          ? "opacity-30 scale-95"
          : "cursor-grab active:cursor-grabbing hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40"
      }`}
    >
      {lead.ponto_positivo && <div className="absolute top-0 left-0 w-1 h-full bg-emerald" />}
      <div className="flex items-center gap-1.5">
        <p className="text-[13px] font-semibold text-bright truncate leading-snug flex-1">
          {lead.nome_loja || `@${lead.instagram}`}
        </p>
        {lead.ponto_positivo && (
          <svg className="w-3 h-3 text-emerald shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
          </svg>
        )}
      </div>
      <p className="text-[11px] text-dim mt-0.5 truncate">@{lead.instagram}</p>
      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-edge-subtle/60">
        <span className="text-[10px] text-dim font-medium tabular-nums">
          {lead.seguidores > 0 ? `${(lead.seguidores / 1000).toFixed(1)}k` : "—"}
        </span>
        <svg className="w-3 h-3 text-edge group-hover:text-violet transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}

// ===== Card fantasma (visual do overlay) =====
function CardOverlay({ lead }: { lead: Lead }) {
  return (
    <div
      className={`relative overflow-hidden bg-surface border rounded-lg p-3 shadow-2xl shadow-violet/40 ${
        lead.ponto_positivo ? "border-emerald/60" : "border-violet/50"
      }`}
      style={{
        transform: "rotate(-2deg)",
        boxShadow: "0 25px 50px -12px rgba(139, 92, 246, 0.6)",
      }}
    >
      {lead.ponto_positivo && <div className="absolute top-0 left-0 w-1 h-full bg-emerald" />}
      <div className="flex items-center gap-1.5">
        <p className="text-[13px] font-semibold text-bright truncate leading-snug flex-1">
          {lead.nome_loja || `@${lead.instagram}`}
        </p>
      </div>
      <p className="text-[11px] text-dim mt-0.5 truncate">@{lead.instagram}</p>
      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-edge-subtle/60">
        <span className="text-[10px] text-dim font-medium tabular-nums">
          {lead.seguidores > 0 ? `${(lead.seguidores / 1000).toFixed(1)}k` : "—"}
        </span>
      </div>
    </div>
  );
}

// ===== Coluna (droppable) =====
function Column({
  status,
  items,
  children,
}: {
  status: LeadStatus;
  items: Lead[];
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const hex = STATUS_HEX[status];

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-[230px] flex flex-col border-r border-edge-subtle last:border-r-0 transition-all duration-200 ${
        isOver ? "bg-violet/[0.04]" : ""
      }`}
      style={isOver ? { boxShadow: "inset 0 0 0 1px rgba(139, 92, 246, 0.2)" } : {}}
    >
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: hex }} />
          <span className="text-xs font-semibold text-sub uppercase tracking-wider">
            {STATUS_LABELS[status]}
          </span>
        </div>
        <span className="text-[11px] font-bold text-dim tabular-nums">{items.length}</span>
      </div>
      <div className="mx-4 h-px mb-1" style={{ background: `linear-gradient(90deg, ${hex}40, transparent)` }} />

      <div className="flex-1 overflow-y-auto px-3 pb-3 pt-2 space-y-2">
        {children}
        {items.length === 0 && (
          <div
            className={`rounded-lg border-2 border-dashed py-10 text-center transition-all duration-200 ${
              isOver ? "border-violet/50 bg-violet/10 scale-[1.02]" : "border-edge-subtle"
            }`}
          >
            <p className={`text-[11px] ${isOver ? "text-violet-light font-semibold" : "text-dim"}`}>
              {isOver ? "Soltar aqui" : "Vazio"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Pipeline =====
export default function Pipeline() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [filtroResponsavel, setFiltroResponsavel] = useState<string>("__todos");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    fetchLeads();
  }, []);

  async function fetchLeads() {
    const { data } = await supabase.from("leads").select("*").order("updated_at", { ascending: false });
    setLeads(data ?? []);
    setLoading(false);
  }

  // Extrai responsáveis únicos dos leads (dinâmico)
  const responsaveisUnicos = Array.from(
    new Set(leads.map((l) => l.responsavel).filter((r): r is string => !!r && r.trim() !== ""))
  ).sort();

  // Aplica o filtro em todos os leads (antes do agrupamento por status)
  const leadsFiltrados = leads.filter((l) => {
    if (filtroResponsavel === "__todos") return true;
    if (filtroResponsavel === "__sem") return !l.responsavel;
    return l.responsavel === filtroResponsavel;
  });

  async function moveToStatus(leadId: string, newStatus: LeadStatus) {
    // Atualização otimista
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l)));
    await supabase.from("leads").update({ status: newStatus }).eq("id", leadId);
  }

  function handleDragStart(event: DragStartEvent) {
    const lead = leads.find((l) => l.id === event.active.id);
    if (lead) setActiveLead(lead);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveLead(null);
    if (!over) return;

    const leadId = active.id as string;
    const newStatus = over.id as LeadStatus;

    const lead = leads.find((l) => l.id === leadId);
    if (lead && lead.status !== newStatus) {
      moveToStatus(leadId, newStatus);
    }
  }

  const grouped = PIPELINE_STATUSES.reduce(
    (acc, s) => {
      acc[s] = leadsFiltrados.filter((l) => l.status === s);
      return acc;
    },
    {} as Record<LeadStatus, Lead[]>
  );

  const descartados = leadsFiltrados.filter((l) => l.status === "descartado");
  const totalActive = leadsFiltrados.length - descartados.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-5 h-5 border-2 border-violet border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col">
      {/* Header */}
      <div className="px-8 pt-7 pb-5 flex items-end justify-between border-b border-edge-subtle gap-6">
        <div>
          <h1 className="text-[22px] font-bold text-bright tracking-tight">Pipeline</h1>
          <p className="text-dim text-xs mt-1.5 tracking-wide">
            {totalActive} lead{totalActive !== 1 ? "s" : ""} ativo{totalActive !== 1 ? "s" : ""}
            {descartados.length > 0 && (
              <span className="text-dim/60">
                {" "}
                &middot; {descartados.length} descartado{descartados.length > 1 ? "s" : ""}
              </span>
            )}
            {filtroResponsavel !== "__todos" && (
              <span className="ml-2 text-violet-light">
                · filtrado por {filtroResponsavel === "__sem" ? "sem responsável" : filtroResponsavel}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-end gap-4">
          {/* Filtro de responsavel */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-dim uppercase tracking-widest">Responsável</label>
            <select
              value={filtroResponsavel}
              onChange={(e) => setFiltroResponsavel(e.target.value)}
              className="bg-surface border border-edge-subtle rounded-lg px-3 py-1.5 text-xs text-sub focus:outline-none focus:border-violet/30 transition-all min-w-[160px]"
            >
              <option value="__todos">Todos</option>
              <option value="__sem">Sem responsável</option>
              {responsaveisUnicos.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          {/* Contadores por status */}
          <div className="flex gap-4 mb-1">
            {PIPELINE_STATUSES.map((s) => (
              <div key={s} className="text-center">
                <p className="text-lg font-bold text-bright leading-none" style={{ color: STATUS_HEX[s] }}>
                  {grouped[s]?.length ?? 0}
                </p>
                <p className="text-[9px] text-dim uppercase tracking-widest mt-1">{STATUS_LABELS[s]}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Kanban com dnd-kit */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-0 overflow-x-auto pipeline-scroll" style={{ height: "calc(100vh - 220px)" }}>
          {PIPELINE_STATUSES.map((status) => (
            <Column key={status} status={status} items={grouped[status]}>
              {grouped[status].map((lead) => (
                <LeadCard key={lead.id} lead={lead} onClick={() => setSelectedId(lead.id)} />
              ))}
            </Column>
          ))}
        </div>

        <DragOverlay dropAnimation={{ duration: 250, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
          {activeLead ? <CardOverlay lead={activeLead} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Total de leads por etapa (acima do Desempenho) */}
      <div className="px-8 pt-8 pb-2">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-[13px] font-bold text-bright tracking-tight uppercase">
            Total de Leads por Etapa
          </h3>
          <span className="text-[11px] text-dim tabular-nums ml-auto">
            {totalActive} ativo{totalActive !== 1 ? "s" : ""}
          </span>
        </div>
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${PIPELINE_STATUSES.length}, 1fr)` }}
        >
          {PIPELINE_STATUSES.map((s) => {
            const n = grouped[s]?.length ?? 0;
            const pct = totalActive > 0 ? ((n / totalActive) * 100).toFixed(0) : "0";
            const hex = STATUS_HEX[s];
            return (
              <div
                key={s}
                className="relative overflow-hidden rounded-[14px] px-5 py-4"
                style={{
                  background: "rgba(12, 14, 23, 0.8)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                }}
              >
                <div
                  aria-hidden="true"
                  className="absolute top-0 left-0 right-0 h-px"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${hex}55, transparent)`,
                  }}
                />
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: hex }} />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-dim">
                    {STATUS_LABELS[s]}
                  </p>
                </div>
                <p className="text-3xl font-extrabold tabular-nums leading-none" style={{ color: hex }}>
                  {n}
                </p>
                <p className="text-[11px] text-dim tabular-nums mt-1.5">{pct}% do total</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Desempenho por responsavel */}
      <DesempenhoResponsaveis leads={leads} />

      {selectedId && (
        <LeadModal leadId={selectedId} onClose={() => setSelectedId(null)} onUpdated={fetchLeads} />
      )}
    </div>
  );
}
