import { useState } from "react";
import MetasResponsavel from "../components/MetasResponsavel";
import { saoPauloDay } from "../lib/period";
import "./TestesGratis.css";
export default function Metas() {
  const [month,setMonth] = useState(() => saoPauloDay().slice(0,7));
  return <div className="trial-dashboard min-h-full p-4 sm:p-6 lg:p-8">
    <header className="flex flex-wrap items-end justify-between gap-5 rounded-2xl border border-violet/20 bg-gradient-to-br from-violet/10 to-raised p-6">
      <div><p className="text-sm font-semibold uppercase tracking-wider text-violet-light">Evolução comercial</p><h1 className="mt-2 text-3xl font-bold text-bright">Metas por responsável</h1><p className="mt-2 text-base text-muted">Cada conquista aproxima o time do próximo resultado.</p></div>
      <label className="grid gap-2 text-sm text-sub">Mês dos fechamentos<input aria-label="Mês dos fechamentos" type="month" value={month} onInput={e=>{if(e.currentTarget.value)setMonth(e.currentTarget.value)}} className="min-h-11 rounded-lg border border-edge bg-surface px-3 text-text"/></label>
    </header><MetasResponsavel month={month}/>
  </div>;
}
