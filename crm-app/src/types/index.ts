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
  pais: Pais;
  fonte_oportunidade: string | null;
  telefone: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export type Categoria = "oculos" | "roupa";

export type Pais = "BR" | "PT";

export const PAISES: Pais[] = ["BR", "PT"];

export const PAIS_LABELS: Record<Pais, string> = {
  BR: "Brasil",
  PT: "Portugal",
};

export const PAIS_FLAG: Record<Pais, string> = {
  BR: "🇧🇷",
  PT: "🇵🇹",
};

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
  "TikTok",
  "Indicação",
  "Site",
  "Prospecção Ativa",
  "WhatsApp",
  "Meta",
  "Evento",
  "Outro",
] as const;

export type LeadStatus =
  | "novo"
  | "novo_tiktok"
  | "dm_enviada"
  | "mensagem_1"
  | "mensagem_2"
  | "mensagem_3"
  | "meta"
  | "email_a_enviar"
  | "email_enviado"
  | "respondeu"
  | "atendimento_ia"
  | "lead_coletado"
  | "fotos_enviadas"
  | "stand_by"
  | "reuniao_agendada"
  | "testando"
  | "interessado"
  | "fechou"
  | "sem_site"
  | "parou_responder"
  | "perdida"
  | "descartado";

export const LEAD_STATUSES: LeadStatus[] = [
  "novo",
  "novo_tiktok",
  "dm_enviada",
  "mensagem_1",
  "mensagem_2",
  "mensagem_3",
  "meta",
  "email_a_enviar",
  "email_enviado",
  "respondeu",
  "atendimento_ia",
  "fotos_enviadas",
  "interessado",
  "stand_by",
  "reuniao_agendada",
  "testando",
  "fechou",
  "sem_site",
  "parou_responder",
  "perdida",
  "descartado",
];

// Status "quentes" — leads prontos pra avançar (usado em Top Responsáveis e Desempenho do Time)
export const HOT_STATUSES: LeadStatus[] = ["interessado", "reuniao_agendada", "testando"];

export const PIPELINE_STATUSES: LeadStatus[] = [
  "novo",
  "novo_tiktok",
  "dm_enviada",
  "mensagem_1",
  "mensagem_2",
  "mensagem_3",
  "atendimento_ia",
  "meta",
  "email_a_enviar",
  "email_enviado",
  "respondeu",
  "fotos_enviadas",
  "interessado",
  "reuniao_agendada",
  "testando",
  "fechou",
  "stand_by",
  "sem_site",
  "parou_responder",
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
  novo: "Novo Instagram",
  novo_tiktok: "Novo TikTok",
  dm_enviada: "DM Enviada",
  mensagem_1: "Mensagem 1",
  mensagem_2: "Mensagem 2",
  mensagem_3: "Mensagem 3",
  meta: "Meta",
  email_a_enviar: "Email a Enviar",
  email_enviado: "Email Enviado",
  respondeu: "Respondeu",
  atendimento_ia: "Atendimento com IA",
  lead_coletado: "Lead Coletado",
  fotos_enviadas: "Fotos Enviadas",
  stand_by: "Stand By",
  reuniao_agendada: "Reunião Agendada",
  testando: "Testando",
  interessado: "Interessado",
  fechou: "Fechou",
  sem_site: "Sem Site",
  parou_responder: "Parou de Responder",
  perdida: "Perdida",
  descartado: "Descartado",
};

export const STATUS_COLORS: Record<LeadStatus, { bg: string; text: string; dot: string }> = {
  novo: { bg: "bg-violet/10", text: "text-violet-light", dot: "bg-violet" },
  novo_tiktok: { bg: "bg-rose/10", text: "text-rose", dot: "bg-rose" },
  dm_enviada: { bg: "bg-cyan/10", text: "text-cyan", dot: "bg-cyan" },
  mensagem_1: { bg: "bg-cyan/10", text: "text-cyan-light", dot: "bg-cyan-light" },
  mensagem_2: { bg: "bg-cyan/10", text: "text-cyan-light", dot: "bg-cyan-light" },
  mensagem_3: { bg: "bg-violet/10", text: "text-violet-light", dot: "bg-violet-light" },
  meta: { bg: "bg-cyan/10", text: "text-cyan", dot: "bg-cyan" },
  email_a_enviar: { bg: "bg-amber/10", text: "text-amber", dot: "bg-amber" },
  email_enviado: { bg: "bg-pink/10", text: "text-pink", dot: "bg-pink" },
  respondeu: { bg: "bg-amber/10", text: "text-amber", dot: "bg-amber" },
  atendimento_ia: { bg: "bg-violet/10", text: "text-violet-light", dot: "bg-violet" },
  lead_coletado: { bg: "bg-pink/10", text: "text-pink", dot: "bg-pink" },
  fotos_enviadas: { bg: "bg-cyan/10", text: "text-cyan-light", dot: "bg-cyan-light" },
  stand_by: { bg: "bg-muted/10", text: "text-muted", dot: "bg-muted" },
  reuniao_agendada: { bg: "bg-emerald/10", text: "text-emerald", dot: "bg-emerald" },
  testando: { bg: "bg-amber/10", text: "text-amber", dot: "bg-amber" },
  interessado: { bg: "bg-rose/10", text: "text-rose", dot: "bg-rose" },
  fechou: { bg: "bg-emerald/10", text: "text-emerald", dot: "bg-emerald" },
  sem_site: { bg: "bg-yellow/10", text: "text-yellow", dot: "bg-yellow" },
  parou_responder: { bg: "bg-stone/10", text: "text-stone", dot: "bg-stone" },
  perdida: { bg: "bg-orange/10", text: "text-orange", dot: "bg-orange" },
  descartado: { bg: "bg-dim/10", text: "text-dim", dot: "bg-dim" },
};

export const STATUS_HEX: Record<LeadStatus, string> = {
  novo: "#8b5cf6",
  novo_tiktok: "#FE2C55",
  dm_enviada: "#06b6d4",
  mensagem_1: "#38bdf8",
  mensagem_2: "#818cf8",
  mensagem_3: "#c084fc",
  meta: "#1877F2",
  email_a_enviar: "#fb923c",
  email_enviado: "#d946ef",
  respondeu: "#f59e0b",
  atendimento_ia: "#a855f7",
  lead_coletado: "#ec4899",
  fotos_enviadas: "#3b82f6",
  stand_by: "#94a3b8",
  reuniao_agendada: "#14b8a6",
  testando: "#84cc16",
  interessado: "#f43f5e",
  fechou: "#10b981",
  sem_site: "#eab308",
  parou_responder: "#78716c",
  perdida: "#f97316",
  descartado: "#52525b",
};
