import { useEffect, useState } from "react";
import { inPeriod, shiftDay } from "../lib/period";

type Values = {conversations:number|null;trials:number|null;closed:number|null};
export type Goals = Record<string,{weekly:Values;monthly:Values}>;
const empty = ():Values=>({conversations:null,trials:null,closed:null});
const labels = {conversations:"Conversas iniciadas",trials:"Clientes em teste grátis",closed:"Clientes convertidos"};
export function useGoalConfig() {
  const [goals,setGoals]=useState<Goals>({});
  const [canEdit,setCanEdit]=useState(false);
  const [message,setMessage]=useState("");
  useEffect(()=>{
    let active=true;
    async function refresh(){try{const r=await fetch("/api/metas/config");if(!r.ok)throw new Error();const d=await r.json();if(active){setGoals(d.goals);setCanEdit(d.canEdit===true);setMessage("")}}catch{if(active){setCanEdit(false);setMessage("Entre no Atendimento para acessar as metas compartilhadas.")}}}
    void refresh();const timer=window.setInterval(refresh,15000);window.addEventListener("focus",refresh);
    return ()=>{active=false;clearInterval(timer);window.removeEventListener("focus",refresh)};
  },[]);
  return {goals,setGoals,canEdit,message};
}
type Props={config:ReturnType<typeof useGoalConfig>;owner:string;today:string;leads:{responsavel:string|null;status:string;teste_gratis_em:string|null;updated_at:string}[];starts:{responsavel:string;dia:string;total:number}[]};
export default function SharedGoals({config,owner,today,leads,starts}:Props){
  const [editing,setEditing]=useState(false),[target,setTarget]=useState("Dione");
  const [draft,setDraft]=useState({weekly:empty(),monthly:empty()});
  const [saving,setSaving]=useState(false),[notice,setNotice]=useState("");
  const weekday=(new Date(today+"T12:00:00Z").getUTCDay()+6)%7;
  const weekStart=shiftDay(today,-weekday),weekEnd=shiftDay(weekStart,6);
  const monthStart=today.slice(0,7)+"-01";
  const monthEnd=new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7)),0)).toISOString().slice(0,10);
  const selected=owner==="Todos"?["Lucas","Dione"]:[owner];
  const key=(s:string)=>s.toLowerCase().trim();
  const mine=leads.filter(l=>selected.some(s=>key(s)===key(l.responsavel||"")));
  function begin(name:string){setTarget(name);setDraft(structuredClone(config.goals[name]||{weekly:empty(),monthly:empty()}));setNotice("");setEditing(true)}
  async function save(){setSaving(true);setNotice("");try{const r=await fetch("/api/metas/config",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({owner:target,goals:draft})});const d=await r.json();if(!r.ok)throw new Error(d.erro||"Não foi possível salvar.");config.setGoals(d.goals);setEditing(false);setNotice("Metas salvas e compartilhadas com a equipe.")}catch(e){setNotice(e instanceof Error?e.message:"Falha ao salvar.")}finally{setSaving(false)}}
  return <section className="mt-4 rounded-xl border border-edge-subtle bg-raised p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2>Metas semanais e mensais</h2><p className="mt-1 text-xs text-muted">Semana de segunda a domingo e mês atual · {owner}</p></div>{config.canEdit&&<button className="rounded-lg bg-violet px-4 py-2 text-sm text-white" onClick={()=>begin(owner==="Lucas"?"Lucas":"Dione")}>Definir metas</button>}</div>
    {config.message&&<p role="status" className="mt-2 text-xs text-amber">{config.message}</p>}
    {notice&&<p role="status" className="mt-2 text-sm text-sub">{notice}</p>}
    <div className="mt-3 grid gap-3 md:grid-cols-2">{([{period:"weekly",title:"Meta semanal",from:weekStart,to:weekEnd},{period:"monthly",title:"Meta mensal",from:monthStart,to:monthEnd}] as const).map(p=>{
      const actual:Values={conversations:starts.filter(s=>selected.some(n=>key(n)===key(s.responsavel))&&s.dia>=p.from&&s.dia<=p.to).reduce((n,s)=>n+s.total,0),trials:mine.filter(l=>inPeriod(l.teste_gratis_em,p.from,p.to)).length,closed:mine.filter(l=>l.status==="fechou"&&inPeriod(l.updated_at,p.from,p.to)).length};
      return <div key={p.period} className="rounded-xl border border-edge-subtle p-4"><h3 className="font-bold">{p.title}</h3><p className="mb-3 text-xs text-muted">{p.from.split("-").reverse().join("/")} a {p.to.split("-").reverse().join("/")}</p>{(Object.keys(labels) as (keyof Values)[]).map(k=>{const values=selected.map(n=>config.goals[n]?.[p.period][k]);const goal=values.every(v=>v!==null&&v!==undefined)?values.reduce<number>((n,v)=>n+(v||0),0):null;const done=actual[k]||0;return <div key={k} className="mt-3"><div className="flex justify-between gap-3 text-xs"><span>{labels[k]}</span><b>{done} / {goal??"A definir"}</b></div><div className="mt-2 h-1.5 rounded-full bg-panel"><div className="h-full rounded-full bg-violet" style={{width:goal?Math.min(100,done/goal*100)+"%":"0%"}}/></div></div>})}</div>
    })}</div>
    {editing&&config.canEdit&&<form className="mt-4 border-t border-edge-subtle pt-4" onSubmit={e=>{e.preventDefault();void save()}}><label className="text-sm">Responsável<select aria-label="Responsável da meta" className="ml-3 rounded-lg border border-edge-subtle bg-surface px-3" value={target} onChange={e=>begin(e.target.value)}><option>Dione</option><option>Lucas</option></select></label><div className="mt-3 grid gap-4 md:grid-cols-2">{(["weekly","monthly"] as const).map(period=><fieldset key={period}><legend className="mb-2 font-semibold">{period==="weekly"?"Semanal":"Mensal"}</legend>{(Object.keys(labels) as (keyof Values)[]).map(k=><label key={k} className="mb-2 flex items-center justify-between gap-3 text-xs">{labels[k]}<input aria-label={labels[k]+" "+(period==="weekly"?"semanal":"mensal")} type="number" min="0" max="1000000" step="1" placeholder="A definir" className="w-28 rounded-lg border border-edge-subtle bg-surface px-2" value={draft[period][k]??""} onChange={e=>setDraft({...draft,[period]:{...draft[period],[k]:e.target.value===""?null:Number(e.target.value)}})}/></label>)}</fieldset>)}</div><div className="mt-3 flex gap-2"><button disabled={saving} className="rounded-lg bg-violet px-4 py-2 text-sm text-white">{saving?"Salvando…":"Salvar metas"}</button><button type="button" className="rounded-lg border border-edge-subtle px-4 py-2 text-sm" onClick={()=>setEditing(false)}>Cancelar</button></div></form>}
  </section>;
}
