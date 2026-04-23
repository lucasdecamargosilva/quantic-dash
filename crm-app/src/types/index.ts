export interface Lead {
  id: string;
  instagram: string;
  nome_loja: string | null;
  site: string | null;
  seguidores: number;
  tem_provador: boolean;
  status: LeadStatus;
  notas: string;
  ponto_positivo: boolean;
  responsavel: string | null;
  created_at: string;
  updated_at: string;
}

export type LeadStatus =
  | "novo"
  | "dm_enviada"
  | "respondeu"
  | "lead_coletado"
  | "interessado"
  | "fechou"
  | "descartado";

export const LEAD_STATUSES: LeadStatus[] = [
  "novo",
  "dm_enviada",
  "respondeu",
  "lead_coletado",
  "interessado",
  "fechou",
  "descartado",
];

export const PIPELINE_STATUSES: LeadStatus[] = [
  "novo",
  "dm_enviada",
  "respondeu",
  "lead_coletado",
  "interessado",
  "fechou",
];

export interface Interacao {
  id: string;
  lead_id: string;
  tipo: InteracaoTipo;
  conteudo: string;
  created_at: string;
}

export type InteracaoTipo = "dm_enviada" | "resposta" | "follow_up" | "nota";

export const INTERACAO_TIPOS: InteracaoTipo[] = [
  "dm_enviada",
  "resposta",
  "follow_up",
  "nota",
];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  novo: "Novo",
  dm_enviada: "DM Enviada",
  respondeu: "Respondeu",
  lead_coletado: "Lead Coletado",
  interessado: "Interessado",
  fechou: "Fechou",
  descartado: "Descartado",
};

export const STATUS_COLORS: Record<LeadStatus, { bg: string; text: string; dot: string }> = {
  novo: { bg: "bg-violet/10", text: "text-violet-light", dot: "bg-violet" },
  dm_enviada: { bg: "bg-cyan/10", text: "text-cyan", dot: "bg-cyan" },
  respondeu: { bg: "bg-amber/10", text: "text-amber", dot: "bg-amber" },
  lead_coletado: { bg: "bg-pink/10", text: "text-pink", dot: "bg-pink" },
  interessado: { bg: "bg-rose/10", text: "text-rose", dot: "bg-rose" },
  fechou: { bg: "bg-emerald/10", text: "text-emerald", dot: "bg-emerald" },
  descartado: { bg: "bg-dim/10", text: "text-dim", dot: "bg-dim" },
};

export const STATUS_HEX: Record<LeadStatus, string> = {
  novo: "#8b5cf6",
  dm_enviada: "#06b6d4",
  respondeu: "#f59e0b",
  lead_coletado: "#ec4899",
  interessado: "#f43f5e",
  fechou: "#10b981",
  descartado: "#52525b",
};
