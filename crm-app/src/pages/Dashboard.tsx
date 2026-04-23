import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { LEAD_STATUSES, STATUS_LABELS, STATUS_HEX } from "../types";
import type { Lead, LeadStatus } from "../types";
import FunnelChart from "../components/FunnelChart";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { supabase.from("leads").select("*").then(({ data }) => { setLeads(data ?? []); setLoading(false); }); }, []);

  const counts = LEAD_STATUSES.reduce((acc, s) => { acc[s] = leads.filter((l) => l.status === s).length; return acc; }, {} as Record<LeadStatus, number>);

  const dmEnviadas = counts["dm_enviada"] + counts["respondeu"] + counts["interessado"] + counts["fechou"];
  const responderam = counts["respondeu"] + counts["interessado"] + counts["fechou"];
  const taxa = dmEnviadas > 0 ? ((responderam / dmEnviadas) * 100).toFixed(1) : "0";

  const weeklyData = Object.entries(
    leads.reduce((acc, l) => {
      const d = new Date(l.created_at);
      const ws = new Date(d); ws.setDate(d.getDate() - d.getDay());
      const k = ws.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([semana, total]) => ({ semana, total })).slice(-8);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-5 h-5 border-2 border-violet border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-[22px] font-bold text-bright tracking-tight">Dashboard</h1>
        <p className="text-dim text-xs mt-1.5 tracking-wide">Visao geral da prospeccao</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Total de Leads", value: leads.length, color: "#8b5cf6" },
          { label: "DMs Enviadas", value: dmEnviadas, color: "#06b6d4" },
          { label: "Taxa de Resposta", value: `${taxa}%`, color: "#10b981" },
        ].map((m, i) => (
          <div key={m.label} className="stagger-in bg-raised border border-edge-subtle rounded-xl p-5" style={{ animationDelay: `${i * 60}ms` }}>
            <p className="text-[10px] font-semibold text-dim uppercase tracking-widest">{m.label}</p>
            <p className="text-3xl font-bold mt-2 tabular-nums" style={{ color: m.color }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Status grid */}
      <div className="grid grid-cols-6 gap-2 mb-8">
        {LEAD_STATUSES.map((s, i) => (
          <div key={s} className="stagger-in bg-raised border border-edge-subtle rounded-lg p-3 text-center" style={{ animationDelay: `${180 + i * 30}ms` }}>
            <div className="w-2 h-2 rounded-full mx-auto mb-1.5" style={{ background: STATUS_HEX[s] }} />
            <p className="text-[9px] text-dim uppercase tracking-widest">{STATUS_LABELS[s]}</p>
            <p className="text-lg font-bold mt-0.5" style={{ color: STATUS_HEX[s] }}>{counts[s]}</p>
          </div>
        ))}
      </div>

      {/* Funnel */}
      <div className="bg-raised border border-edge-subtle rounded-xl p-6 mb-6">
        <p className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-4">Funil</p>
        <FunnelChart counts={counts} />
      </div>

      {/* Chart */}
      {weeklyData.length > 0 && (
        <div className="bg-raised border border-edge-subtle rounded-xl p-6">
          <p className="text-[10px] font-semibold text-dim uppercase tracking-widest mb-4">Leads por Semana</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeklyData}>
              <XAxis dataKey="semana" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10, fontFamily: "Sora" }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "rgba(12,14,23,0.95)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", fontSize: "11px", fontFamily: "Sora" }}
                labelStyle={{ color: "#71717a" }}
                itemStyle={{ color: "#a78bfa" }}
              />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {weeklyData.map((_, i) => (
                  <rect key={i} fill="url(#vGrad)" />
                ))}
              </Bar>
              <defs>
                <linearGradient id="vGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" />
                  <stop offset="100%" stopColor="#6d28d9" stopOpacity={0.5} />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
