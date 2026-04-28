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
  categoria: Categoria;
  fonte_oportunidade: string | null;
  telefone: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export type Categoria = "oculos" | "roupa";

export const CATEGORIAS: Categoria[] = ["oculos", "roupa"];

export const CATEGORIA_LABELS: Record<Categoria, string> = {
  oculos: "Óculos",
  roupa: "Roupa",
};

export const CATEGORIA_HEX: Record<Categoria, string> = {
  oculos: "#8b5cf6",
  roupa: "#ec4899",
};

// Fontes de oportunidade (para dropdown)
export const FONTES_OPORTUNIDADE = [
  "Instagram",
  "Indicação",
  "Site",
  "Prospecção Ativa",
  "WhatsApp",
  "Evento",
  "Outro",
] as const;

export type LeadStatus =
  | "novo"
  | "dm_enviada"
  | "mensagem_1"
  | "mensagem_2"
  | "mensagem_3"
  | "respondeu"
  | "lead_coletado"
  | "fotos_enviadas"
  | "stand_by"
  | "reuniao_agendada"
  | "testando"
  | "interessado"
  | "fechou"
  | "perdida"
  | "descartado";

export const LEAD_STATUSES: LeadStatus[] = [
  "novo",
  "dm_enviada",
  "mensagem_1",
  "mensagem_2",
  "mensagem_3",
  "respondeu",
  "lead_coletado",
  "fotos_enviadas",
  "interessado",
  "stand_by",
  "reuniao_agendada",
  "testando",
  "fechou",
  "perdida",
  "descartado",
];

export const PIPELINE_STATUSES: LeadStatus[] = [
  "novo",
  "dm_enviada",
  "mensagem_1",
  "mensagem_2",
  "mensagem_3",
  "respondeu",
  "lead_coletado",
  "fotos_enviadas",
  "interessado",
  "stand_by",
  "reuniao_agendada",
  "testando",
  "fechou",
  "perdida",
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
  mensagem_1: "Mensagem 1",
  mensagem_2: "Mensagem 2",
  mensagem_3: "Mensagem 3",
  respondeu: "Respondeu",
  lead_coletado: "Lead Coletado",
  fotos_enviadas: "Fotos Enviadas",
  stand_by: "Stand By",
  reuniao_agendada: "Reunião Agendada",
  testando: "Testando",
  interessado: "Interessado",
  fechou: "Fechou",
  perdida: "Perdida",
  descartado: "Descartado",
};

export const STATUS_COLORS: Record<LeadStatus, { bg: string; text: string; dot: string }> = {
  novo: { bg: "bg-violet/10", text: "text-violet-light", dot: "bg-violet" },
  dm_enviada: { bg: "bg-cyan/10", text: "text-cyan", dot: "bg-cyan" },
  mensagem_1: { bg: "bg-cyan/10", text: "text-cyan-light", dot: "bg-cyan-light" },
  mensagem_2: { bg: "bg-cyan/10", text: "text-cyan-light", dot: "bg-cyan-light" },
  mensagem_3: { bg: "bg-violet/10", text: "text-violet-light", dot: "bg-violet-light" },
  respondeu: { bg: "bg-amber/10", text: "text-amber", dot: "bg-amber" },
  lead_coletado: { bg: "bg-pink/10", text: "text-pink", dot: "bg-pink" },
  fotos_enviadas: { bg: "bg-cyan/10", text: "text-cyan-light", dot: "bg-cyan-light" },
  stand_by: { bg: "bg-muted/10", text: "text-muted", dot: "bg-muted" },
  reuniao_agendada: { bg: "bg-emerald/10", text: "text-emerald", dot: "bg-emerald" },
  testando: { bg: "bg-amber/10", text: "text-amber", dot: "bg-amber" },
  interessado: { bg: "bg-rose/10", text: "text-rose", dot: "bg-rose" },
  fechou: { bg: "bg-emerald/10", text: "text-emerald", dot: "bg-emerald" },
  perdida: { bg: "bg-orange/10", text: "text-orange", dot: "bg-orange" },
  descartado: { bg: "bg-dim/10", text: "text-dim", dot: "bg-dim" },
};

export const STATUS_HEX: Record<LeadStatus, string> = {
  novo: "#8b5cf6",
  dm_enviada: "#06b6d4",
  mensagem_1: "#38bdf8",
  mensagem_2: "#818cf8",
  mensagem_3: "#c084fc",
  respondeu: "#f59e0b",
  lead_coletado: "#ec4899",
  fotos_enviadas: "#3b82f6",
  stand_by: "#94a3b8",
  reuniao_agendada: "#14b8a6",
  testando: "#84cc16",
  interessado: "#f43f5e",
  fechou: "#10b981",
  perdida: "#f97316",
  descartado: "#52525b",
};
