import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { LEAD_STATUSES, STATUS_LABELS, STATUS_HEX, CATEGORIA_LABELS, CATEGORIA_HEX } from "../types";
import type { Lead, LeadStatus, Categoria } from "../types";
import FunnelChart from "../components/FunnelChart";
import FonteLogo from "../components/FonteLogo";
import LeadsPorEtapaModal from "../components/LeadsPorEtapaModal";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

// Hook que detecta o tema atual via data-theme no html, atualizando reativamente
function useTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    (document.documentElement.getAttribute("data-theme") as "light" | "dark") || "dark"
  );
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setTheme((document.documentElement.getAttribute("data-theme") as "light" | "dark") || "dark");
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

const HOT_STATUSES: LeadStatus[] = ["interessado", "reuniao_agendada", "testando"];
const ACTIVE_STATUSES: LeadStatus[] = [
  "novo", "dm_enviada", "mensagem_1", "mensagem_2", "mensagem_3", "atendimento_ia",
  "meta", "email_a_enviar", "email_enviado",
  "respondeu", "fotos_enviadas",
  "stand_by", "interessado", "reuniao_agendada", "testando",
];

type LastInter = { conteudo: string; created_at: string };
type Atividade7d = { id: string; lead_id: string; conteudo: string; created_at: string; tipo: string };

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  // Mapa lead_id -> última interação registrada
  const [interacoesMap, setInteracoesMap] = useState<Record<string, LastInter>>({});
  // Atividades dos últimos 7 dias (popup)
  const [atividades7d, setAtividades7d] = useState<Atividade7d[]>([]);
  const [modalAtividadesOpen, setModalAtividadesOpen] = useState(false);
  // Etapa selecionada para o popup "leads por etapa"
  const [etapaSelecionada, setEtapaSelecionada] = useState<LeadStatus | null>(null);
  const theme = useTheme();
  const isLight = theme === "light";

  // Cores theme-aware pros gráficos do Recharts (que não suportam CSS vars)
  const tickColor = isLight ? "rgba(15, 23, 42, 0.7)" : "rgba(255, 255, 255, 0.5)";
  const tickColorBold = isLight ? "rgba(15, 23, 42, 0.85)" : "rgba(255, 255, 255, 0.7)";
  const axisLineColor = isLight ? "rgba(15, 23, 42, 0.1)" : "rgba(255, 255, 255, 0.08)";
  const tooltipBg = isLight ? "rgba(255, 255, 255, 0.97)" : "rgba(12, 14, 23, 0.95)";
  const tooltipBorder = isLight ? "rgba(15, 23, 42, 0.12)" : "rgba(255, 255, 255, 0.08)";
  const tooltipLabelColor = isLight ? "rgba(15, 23, 42, 0.6)" : "#71717a";
  const cursorFill = isLight ? "rgba(124, 58, 237, 0.06)" : "rgba(139, 92, 246, 0.06)";

  useEffect(() => {
    supabase.from("leads").select("*").then(({ data }) => {
      setLeads(data ?? []);
      setLoading(false);
    });
    // Busca as interações recentes e mantém só a última de cada lead
    supabase
      .from("interacoes")
      .select("lead_id, conteudo, created_at")
      .order("created_at", { ascending: false })
      .limit(800)
      .then(({ data }) => {
        const map: Record<string, LastInter> = {};
        (data ?? []).forEach((i: { lead_id: string; conteudo: string; created_at: string }) => {
          if (!map[i.lead_id]) map[i.lead_id] = { conteudo: i.conteudo, created_at: i.created_at };
        });
        setInteracoesMap(map);
      });
    // Atividades dos últimos 7 dias (para o popup)
    const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from("interacoes")
      .select("id, lead_id, conteudo, created_at, tipo")
      .gte("created_at", seteDiasAtras)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setAtividades7d((data ?? []) as Atividade7d[]);
      });
  }, []);

  // === Counts por status ===
  const counts = LEAD_STATUSES.reduce((acc, s) => {
    acc[s] = leads.filter((l) => l.status === s).length;
    return acc;
  }, {} as Record<LeadStatus, number>);

  // === KPIs principais ===
  const total = leads.length;
  const ativos = ACTIVE_STATUSES.reduce((sum, s) => sum + (counts[s] || 0), 0);
  const fechados = counts["fechou"] || 0;
  const perdidos = counts["perdida"] || 0;
  const descartados = counts["descartado"] || 0;
  const hot = HOT_STATUSES.reduce((sum, s) => sum + (counts[s] || 0), 0);

  // Funnel cumulativo: dms = todos que passaram por dm_enviada ou além
  const dmsAlcancadas = ["dm_enviada","mensagem_1","mensagem_2","mensagem_3","atendimento_ia","meta","email_a_enviar","email_enviado","respondeu","fotos_enviadas","interessado","stand_by","reuniao_agendada","testando","fechou","perdida"]
    .reduce((s, k) => s + (counts[k as LeadStatus] || 0), 0);
  const responderam = ["respondeu","fotos_enviadas","interessado","stand_by","reuniao_agendada","testando","fechou","perdida"]
    .reduce((s, k) => s + (counts[k as LeadStatus] || 0), 0);
  const taxaResposta = dmsAlcancadas > 0 ? ((responderam / dmsAlcancadas) * 100) : 0;
  const taxaFechamentoSobreDM = dmsAlcancadas > 0 ? ((fechados / dmsAlcancadas) * 100) : 0;
  const taxaFechamentoSobreInteresse = (counts.interessado + counts.reuniao_agendada + counts.testando + counts.fechou + counts.perdida) > 0
    ? (fechados / (counts.interessado + counts.reuniao_agendada + counts.testando + counts.fechou + counts.perdida)) * 100
    : 0;

  // === Categoria breakdown ===
  const porCategoria: Record<Categoria, number> = { oculos: 0, roupa: 0 };
  leads.forEach((l) => { if (l.categoria) porCategoria[l.categoria] = (porCategoria[l.categoria] || 0) + 1; });
  const categoriaData = (["oculos","roupa"] as Categoria[]).map((c) => ({
    name: CATEGORIA_LABELS[c],
    value: porCategoria[c] || 0,
    color: CATEGORIA_HEX[c],
  }));

  // === Performance por responsável ===
  const responsaveisMap: Record<string, { total: number; hot: number; fechou: number; perdida: number }> = {};
  leads.forEach((l) => {
    const key = l.responsavel?.trim() || "— Sem responsável";
    if (!responsaveisMap[key]) responsaveisMap[key] = { total: 0, hot: 0, fechou: 0, perdida: 0 };
    responsaveisMap[key].total++;
    if (HOT_STATUSES.includes(l.status)) responsaveisMap[key].hot++;
    if (l.status === "fechou") responsaveisMap[key].fechou++;
    if (l.status === "perdida") responsaveisMap[key].perdida++;
  });
  const responsaveisRanking = Object.entries(responsaveisMap)
    .map(([nome, v]) => ({
      nome, ...v,
      // Win rate: fechados sobre negócios já decididos (fechou + perdida)
      taxa: (v.fechou + v.perdida) > 0 ? (v.fechou / (v.fechou + v.perdida)) * 100 : 0,
    }))
    .sort((a, b) => b.taxa - a.taxa || b.fechou - a.fechou)
    .slice(0, 6);

  // === Fonte da oportunidade ===
  const fonteMap: Record<string, number> = {};
  leads.forEach((l) => {
    const f = l.fonte_oportunidade?.trim() || "Não informada";
    fonteMap[f] = (fonteMap[f] || 0) + 1;
  });
  const fonteData = Object.entries(fonteMap)
    .map(([fonte, count]) => ({ fonte, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 7);

  // === Tendência semanal ===
  const weeklyData = Object.entries(
    leads.reduce((acc, l) => {
      const d = new Date(l.created_at);
      const ws = new Date(d); ws.setDate(d.getDate() - d.getDay());
      const k = ws.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([semana, total]) => ({ semana, total })).slice(-12);

  // === Atividade recente (últimos 6 atualizados) ===
  const atividadeRecente = [...leads]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 6);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-5 h-5 border-2 border-violet border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-8">
        <h1 className="text-[22px] font-bold text-bright tracking-tight">Dashboard</h1>
        <p className="text-dim text-xs mt-1.5 tracking-wide">Visão geral da prospecção</p>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPI label="Total de Leads" value={total} color="#8b5cf6" sub={`${ativos} ativos`} delay={0} />
        <KPI label="Em Fase Quente" value={hot} color="#f43f5e" sub="Interessado · Reunião · Testando" delay={60} />
        <KPI label="Fechados" value={fechados} color="#10b981" sub={`${perdidos} perdidos · ${descartados} descartados`} delay={120} />
        <KPI label="Conversão DM → Fechou" value={`${taxaFechamentoSobreDM.toFixed(1)}%`} color="#22d3ee" sub={`${taxaResposta.toFixed(0)}% taxa de resposta`} delay={180} />
      </div>

      {/* Atividade recente — logo após os KPIs (em ambos mobile e desktop). Clique abre popup com 7 dias */}
      <button
        type="button"
        onClick={() => setModalAtividadesOpen(true)}
        className="w-full text-left bg-raised border border-edge-subtle rounded-xl p-5 lg:p-6 mb-6 transition-colors hover:border-violet/40 cursor-pointer"
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-semibold text-dim uppercase tracking-widest">Atividade recente</p>
          <span className="text-[9px] text-violet-light uppercase tracking-widest">Ver últimos 7 dias →</span>
        </div>
        <div className="space-y-2.5">
          {atividadeRecente.length === 0 && <p className="text-dim text-xs">Sem leads ainda.</p>}
          {atividadeRecente.map((l) => {
            const inter = interacoesMap[l.id];
            return (
              <div key={l.id} className="flex items-start gap-2 pb-2.5 border-b border-edge-subtle/50 last:border-b-0 last:pb-0">
                <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: STATUS_HEX[l.status] }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[12px] font-semibold text-bright truncate flex-1 min-w-0">{l.nome_loja || `@${l.instagram}`}</p>
                    <FonteLogo fonte={l.fonte_oportunidade} />
                    <span className="text-[9px] text-dim shrink-0 tabular-nums">
                      {new Date(l.updated_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-[10px] text-dim mt-0.5 truncate">
                    {inter?.conteudo || STATUS_LABELS[l.status]}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </button>

      {/* Total de Leads por Etapa — quadrinhos */}
      <p className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-3">Total de Leads por Etapa</p>
      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10 gap-2 mb-8">
        {LEAD_STATUSES.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => setEtapaSelecionada(s)}
            className="stagger-in bg-raised border border-edge-subtle rounded-lg p-3 text-center hover:border-violet/40 transition-colors cursor-pointer"
            style={{ animationDelay: `${240 + i * 25}ms` }}
          >
            <div className="w-2 h-2 rounded-full mx-auto mb-1.5" style={{ background: STATUS_HEX[s] }} />
            <p className="text-[8px] text-dim uppercase tracking-widest leading-tight min-h-[18px]">{STATUS_LABELS[s]}</p>
            <p className="text-base font-bold mt-1 tabular-nums" style={{ color: STATUS_HEX[s] }}>{counts[s] || 0}</p>
          </button>
        ))}
      </div>

      {/* Funil + Categoria */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 bg-raised border border-edge-subtle rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-semibold text-dim uppercase tracking-widest">Funil de conversão</p>
            <span className="text-[10px] text-dim">
              Conversão fim a fim: <span className="text-bright font-bold">{taxaFechamentoSobreDM.toFixed(1)}%</span>
            </span>
          </div>
          <FunnelChart counts={counts} />
          <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-edge-subtle">
            <MiniMetric label="Taxa de resposta" value={`${taxaResposta.toFixed(1)}%`} />
            <MiniMetric label="Interesse → Fechou" value={`${taxaFechamentoSobreInteresse.toFixed(1)}%`} />
            <MiniMetric label="Stand By" value={`${counts.stand_by || 0}`} sub="aguardando retomar" />
          </div>
        </div>
        <div className="bg-raised border border-edge-subtle rounded-xl p-6">
          <p className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-4">Categoria</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={categoriaData}
                dataKey="value"
                nameKey="name"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={3}
              >
                {categoriaData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: tooltipBg, backdropFilter: "blur(12px)", border: `1px solid ${tooltipBorder}`, borderRadius: "10px", fontSize: "11px", fontFamily: "Sora" }}
                itemStyle={{ color: isLight ? "#0f172a" : "#fff" }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {categoriaData.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                  <span className="text-sub">{d.name}</span>
                </span>
                <span className="font-bold tabular-nums" style={{ color: d.color }}>
                  {d.value} <span className="text-dim font-normal">({total > 0 ? ((d.value/total)*100).toFixed(0) : 0}%)</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Responsáveis + Fonte */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-raised border border-edge-subtle rounded-xl p-6">
          <p className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-4">Top responsáveis</p>
          <div className="space-y-2">
            {responsaveisRanking.length === 0 && (
              <p className="text-dim text-xs">Nenhum responsável atribuído ainda.</p>
            )}
            {responsaveisRanking.map((r, i) => (
              <div key={r.nome} className="flex items-center gap-3 text-xs py-1.5">
                <span className="text-dim font-bold w-5 text-right tabular-nums">{i + 1}</span>
                <span className="flex-1 text-bright font-medium truncate">{r.nome}</span>
                <span className="text-dim tabular-nums w-12 text-right">{r.total}</span>
                <span className="text-rose tabular-nums w-10 text-right">{r.hot}🔥</span>
                <span className="text-emerald tabular-nums w-10 text-right">{r.fechou}✓</span>
                <span className="text-emerald font-bold tabular-nums w-12 text-right">{r.taxa.toFixed(0)}%</span>
              </div>
            ))}
            {responsaveisRanking.length > 0 && (
              <div className="flex items-center gap-3 text-[9px] uppercase tracking-widest text-dim/60 pt-2 mt-2 border-t border-edge-subtle">
                <span className="w-5" />
                <span className="flex-1">Nome</span>
                <span className="w-12 text-right">Total</span>
                <span className="w-10 text-right">Quente</span>
                <span className="w-10 text-right">Fechou</span>
                <span className="w-12 text-right">Win %</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-raised border border-edge-subtle rounded-xl p-6">
          <p className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-4">Fonte da oportunidade</p>
          {fonteData.length === 0 ? (
            <p className="text-dim text-xs">Nenhuma fonte registrada.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={fonteData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="fonte" type="category" tick={{ fill: tickColorBold, fontSize: 11, fontFamily: "Sora" }} axisLine={false} tickLine={false} width={120} />
                <Tooltip
                  contentStyle={{ backgroundColor: tooltipBg, backdropFilter: "blur(12px)", border: `1px solid ${tooltipBorder}`, borderRadius: "10px", fontSize: "11px", fontFamily: "Sora" }}
                  itemStyle={{ color: isLight ? "#7c3aed" : "#a78bfa" }}
                  cursor={{ fill: cursorFill }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="url(#fGrad)" />
                <defs>
                  <linearGradient id="fGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Tendência semanal — linha inteira */}
      <div>
        <div className="bg-raised border border-edge-subtle rounded-xl p-6">
          <p className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-4">Leads novos por semana</p>
          {weeklyData.length === 0 ? (
            <p className="text-dim text-xs">Sem dados ainda.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weeklyData}>
                <XAxis dataKey="semana" tick={{ fill: tickColor, fontSize: 10, fontFamily: "Sora" }} axisLine={{ stroke: axisLineColor }} tickLine={false} />
                <YAxis tick={{ fill: tickColor, fontSize: 10, fontFamily: "Sora" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: tooltipBg, backdropFilter: "blur(12px)", border: `1px solid ${tooltipBorder}`, borderRadius: "10px", fontSize: "11px", fontFamily: "Sora" }}
                  labelStyle={{ color: tooltipLabelColor }}
                  itemStyle={{ color: isLight ? "#7c3aed" : "#a78bfa" }}
                  cursor={{ fill: cursorFill }}
                />
                <Bar dataKey="total" radius={[4, 4, 0, 0]} fill="url(#vGrad)" />
                <defs>
                  <linearGradient id="vGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#6d28d9" stopOpacity={0.5} />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

      </div>

      {/* Popup — leads de uma etapa */}
      {etapaSelecionada && (
        <LeadsPorEtapaModal
          status={etapaSelecionada}
          leads={leads}
          onClose={() => setEtapaSelecionada(null)}
        />
      )}

      {/* Popup — atividades dos últimos 7 dias */}
      {modalAtividadesOpen && (
        <div
          className="fixed inset-0 bg-base/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setModalAtividadesOpen(false)}
        >
          <div
            className="bg-raised border border-edge rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-raised border-b border-edge-subtle px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-bold text-bright">Atividades dos últimos 7 dias</h2>
                <p className="text-[10px] text-dim mt-0.5">{atividades7d.length} interaç{atividades7d.length === 1 ? "ão" : "ões"}</p>
              </div>
              <button
                onClick={() => setModalAtividadesOpen(false)}
                aria-label="Fechar"
                className="w-8 h-8 rounded-md flex items-center justify-center text-dim hover:text-bright hover:bg-surface/60 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-3">
              {atividades7d.length === 0 && (
                <p className="text-dim text-xs text-center py-8">Sem atividades nos últimos 7 dias.</p>
              )}
              {atividades7d.map((a) => {
                const lead = leads.find((l) => l.id === a.lead_id);
                if (!lead) return null;
                return (
                  <div key={a.id} className="flex items-start gap-2 pb-3 border-b border-edge-subtle/50 last:border-b-0 last:pb-0">
                    <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: STATUS_HEX[lead.status] }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[13px] font-semibold text-bright truncate flex-1 min-w-0">{lead.nome_loja || `@${lead.instagram}`}</p>
                        <FonteLogo fonte={lead.fonte_oportunidade} />
                        <span className="text-[10px] text-dim shrink-0 tabular-nums">
                          {new Date(a.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-[11px] text-sub mt-1 leading-relaxed">{a.conteudo}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// === Componentes auxiliares ===
function KPI({ label, value, color, sub, delay }: { label: string; value: number | string; color: string; sub?: string; delay?: number }) {
  return (
    <div className="stagger-in bg-raised border border-edge-subtle rounded-xl p-5" style={{ animationDelay: `${delay || 0}ms` }}>
      <p className="text-[10px] font-semibold text-dim uppercase tracking-widest">{label}</p>
      <p className="text-3xl font-bold mt-2 tabular-nums" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-dim mt-1.5 truncate">{sub}</p>}
    </div>
  );
}

function MiniMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[9px] font-bold text-dim uppercase tracking-widest">{label}</p>
      <p className="text-lg font-bold text-bright tabular-nums mt-1">{value}</p>
      {sub && <p className="text-[10px] text-dim">{sub}</p>}
    </div>
  );
}
