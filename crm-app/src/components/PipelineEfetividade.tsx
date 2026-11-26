// 25/11/2026 (Lucas): efetividade do comercial no pipeline — quem está esperando resposta nossa,
// quem ficou sem follow-up, quem parou, conversão e o mesmo recorte por responsável.
// Usa só o que o pipeline já carrega: quem mandou a última mensagem (ultimo_de) e quando (ultimo_ts).
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from "recharts";

export type EfLead = { chatid: string; crmId?: string; nome: string; fone: string; status: string; responsavel: string | null;
  ultimo_ts: number | null; ultimo_de?: string | null; venda?: { plano: string; valor_centavos: number } | null };
type Stage = { label: string; value: string; color: string };

const FECHADAS = new Set(["CONVERTIDO", "PERDIDO", "_ocultos"]);
const FORA = new Set(["STAND-BY"]);
const DIA = 86400000;
const BUCKETS = [
  { key: "esperando", label: "Esperando nossa resposta", color: "#7c3aed" },
  { key: "emdia", label: "Em dia (até 3 dias)", color: "#10b981" },
  { key: "semfollow", label: "Sem follow-up (3 a 7 dias)", color: "#f59e0b" },
  { key: "parado", label: "Parado (+7 dias)", color: "#ef4444" },
] as const;
type BucketKey = typeof BUCKETS[number]["key"];

function ms(t: number | null | undefined) { if (!t) return 0; return t > 1e11 ? t : t * 1000; }
function bucket(l: EfLead, agora: number): BucketKey {
  const idade = agora - ms(l.ultimo_ts);
  // lead falou por último: esperando resposta nossa — até 7 dias; depois disso o lead já esfriou e conta como parado
  if (l.ultimo_de === "lead" && ms(l.ultimo_ts) && idade <= 7 * DIA) return "esperando";
  if (!ms(l.ultimo_ts) || idade > 7 * DIA) return "parado";
  if (idade > 3 * DIA) return "semfollow";
  return "emdia";
}
function tempo(msIdade: number) {
  const h = Math.floor(msIdade / 3600000);
  if (h < 1) return "menos de 1 h";
  if (h < 24) return h + " h";
  const d = Math.floor(h / 24);
  return d === 1 ? "1 dia" : d + " dias";
}
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function PipelineEfetividade({ stages, visible, onOpen }: { stages: Stage[]; visible: EfLead[][]; onOpen: (l: EfLead, stage: string) => void }) {
  const agora = Date.now();
  const abertos: { l: EfLead; stage: Stage; b: BucketKey }[] = [];
  let convertidos = 0, perdidos = 0, receita = 0;
  const porEtapa = stages.map((s, i) => {
    const row: Record<string, number | string> = { label: s.label, esperando: 0, emdia: 0, semfollow: 0, parado: 0 };
    if (s.value === "CONVERTIDO") { convertidos += visible[i].length; visible[i].forEach(l => { receita += l.venda?.valor_centavos || 0; }); return null; }
    if (s.value === "PERDIDO") { perdidos += visible[i].length; return null; }
    if (FECHADAS.has(s.value) || FORA.has(s.value)) return null;
    for (const l of visible[i]) { const b = bucket(l, agora); (row[b] as number)++; abertos.push({ l, stage: s, b }); }
    return row;
  }).filter((r): r is Record<string, number | string> => !!r && (BUCKETS.some(b => (r[b.key] as number) > 0)));

  const conta = (k: BucketKey) => abertos.filter(a => a.b === k).length;
  const esperando = abertos.filter(a => a.b === "esperando");
  const maisAntigo = esperando.reduce((m, a) => Math.max(m, agora - ms(a.l.ultimo_ts)), 0);
  const fechados = convertidos + perdidos;
  const taxa = fechados ? Math.round(convertidos / fechados * 100) : 0;
  const emDiaPct = abertos.length ? Math.round(conta("emdia") / abertos.length * 100) : 0;

  const donos = ["Lucas", "Dione", ""].map(d => {
    const meus = abertos.filter(a => (a.l.responsavel || "") === d);
    const conv = stages.reduce((n, s, i) => n + (s.value === "CONVERTIDO" ? visible[i].filter(l => (l.responsavel || "") === d).length : 0), 0);
    const perd = stages.reduce((n, s, i) => n + (s.value === "PERDIDO" ? visible[i].filter(l => (l.responsavel || "") === d).length : 0), 0);
    const rec = stages.reduce((n, s, i) => n + (s.value === "CONVERTIDO" ? visible[i].filter(l => (l.responsavel || "") === d).reduce((x, l) => x + (l.venda?.valor_centavos || 0), 0) : 0), 0);
    const c = (k: BucketKey) => meus.filter(a => a.b === k).length;
    return { nome: d || "Sem responsável", ativos: meus.length, esperando: c("esperando"), semfollow: c("semfollow"), parado: c("parado"),
      emdia: meus.length ? Math.round(c("emdia") / meus.length * 100) : 0, conv, taxa: conv + perd ? Math.round(conv / (conv + perd) * 100) : 0, rec };
  }).filter(d => d.ativos || d.conv);

  const fila = abertos.filter(a => a.b !== "emdia")
    .sort((x, y) => { const p = (a: typeof x) => a.b === "esperando" ? 0 : a.b === "parado" ? 2 : 1; return p(x) - p(y) || ms(x.l.ultimo_ts) - ms(y.l.ultimo_ts); })
    .slice(0, 14);

  const kpis = [
    { t: "No funil agora", v: abertos.length.toLocaleString("pt-BR"), s: `${emDiaPct}% em dia`, tone: "" },
    { t: "Esperando nossa resposta", v: conta("esperando").toLocaleString("pt-BR"), s: esperando.length ? `mais antigo há ${tempo(maisAntigo)}` : "ninguém esperando", tone: conta("esperando") ? "roxo" : "" },
    { t: "Sem follow-up (3 a 7 dias)", v: conta("semfollow").toLocaleString("pt-BR"), s: "nós falamos por último", tone: conta("semfollow") ? "amarelo" : "" },
    { t: "Parados (+7 dias)", v: conta("parado").toLocaleString("pt-BR"), s: "sem mensagem há mais de 7 dias", tone: conta("parado") ? "vermelho" : "" },
    { t: "Convertidos", v: convertidos.toLocaleString("pt-BR"), s: receita ? `${brl(receita)}/mês em planos` : "no recorte atual", tone: "verde" },
    { t: "Taxa de fechamento", v: taxa + "%", s: `${convertidos} ganhos × ${perdidos} perdidos`, tone: "" },
  ];

  return <section className="pef">
    <header className="pef-head"><h3>Efetividade comercial</h3><span>Usa os filtros de cima (responsável, período e busca). Follow-up conta a partir da última mensagem da conversa.</span></header>
    <div className="pef-kpis">{kpis.map(k => <div key={k.t} className={"pef-kpi " + k.tone}><small>{k.t}</small><b>{k.v}</b><span>{k.s}</span></div>)}</div>
    <div className="pef-grid">
      <div className="chat-pipeline-chart"><h3>Situação do follow-up por etapa</h3>
        <ResponsiveContainer width="100%" height={Math.max(220, porEtapa.length * 38 + 70)}>
          <BarChart data={porEtapa} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }} barCategoryGap={8}>
            <CartesianGrid stroke="var(--color-edge-subtle)" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--color-muted)", fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="label" width={130} tick={{ fill: "var(--color-muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: "var(--color-active-bg)" }} contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-edge)", borderRadius: 8, fontSize: 11 }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            {BUCKETS.map((b, i) => <Bar key={b.key} dataKey={b.key} name={b.label} stackId="s" fill={b.color} radius={i === BUCKETS.length - 1 ? [0, 4, 4, 0] : 0} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="chat-pipeline-chart pef-fila"><h3>Precisa de atenção agora <span>{fila.length ? `${conta("esperando") + conta("semfollow") + conta("parado")} no total` : ""}</span></h3>
        {fila.length ? <ul>{fila.map(a => { const b = BUCKETS.find(x => x.key === a.b)!; return <li key={a.stage.value + (a.l.crmId || a.l.chatid)}>
          <button type="button" onClick={() => onOpen(a.l, a.stage.value)}>
            <i style={{ background: b.color }} />
            <span className="pef-nome"><b>{a.l.nome || a.l.fone}</b><small>{a.stage.label} · {a.l.responsavel || "sem responsável"}</small></span>
            <span className="pef-tempo">{a.b === "esperando" ? "esperando há " : a.l.ultimo_de === "lead" ? "sem resposta nossa há " : "sem retorno há "}{tempo(agora - ms(a.l.ultimo_ts))}</span>
          </button></li>; })}</ul>
          : <p className="chat-pipeline-empty">Tudo em dia por aqui.</p>}
      </div>
    </div>
    {donos.length > 0 && <div className="chat-pipeline-chart pef-donos"><h3>Por responsável</h3>
      <table><thead><tr><th>Responsável</th><th>No funil</th><th>Em dia</th><th>Esperando resposta</th><th>Sem follow-up</th><th>Parados</th><th>Convertidos</th><th>Fechamento</th><th>Planos</th></tr></thead>
        <tbody>{donos.map(d => <tr key={d.nome}><td><b>{d.nome}</b></td><td>{d.ativos}</td><td>{d.emdia}%</td>
          <td className={d.esperando ? "roxo" : ""}>{d.esperando}</td><td className={d.semfollow ? "amarelo" : ""}>{d.semfollow}</td><td className={d.parado ? "vermelho" : ""}>{d.parado}</td>
          <td>{d.conv}</td><td>{d.taxa}%</td><td>{d.rec ? brl(d.rec) : "—"}</td></tr>)}</tbody></table>
    </div>}
  </section>;
}
