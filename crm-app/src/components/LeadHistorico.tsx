import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

// Linha do tempo do lead (vem de /api/lead/historico no painel): quando o
// catálogo nasceu, quando mandamos acesso/cobrança/proposta, provas e notas.
type Evento = { quando: string; tipo: string; titulo: string; detalhe: string; onde: string };
type Historico = {
  resumo: {
    catalogo_criado: string | null; catalogo_link: string | null; acesso_enviado: string | null;
    ultima_cobranca: string | null; provas: number; ultima_prova: string | null;
    ultima_fala_cliente: { quando: string; texto: string; onde: string } | null;
  };
  grupo: { chatid: string; nome: string } | null;
  fone: string | null;
  catalogo_whatsapp: string | null;
  eventos: Evento[];
};

const COR: Record<string, string> = {
  catalogo: "#8b5cf6", acesso: "#06b6d4", grupo: "#06b6d4", prova: "#10b981", plano: "#10b981",
  cobranca_cadastro: "#f59e0b", cobranca_prazo: "#f97316", proposta: "#a855f7", pagamento: "#22c55e",
  nota: "#94a3b8", lead: "#94a3b8", contato: "#38bdf8", resposta: "#38bdf8",
};

function fone(v: string | null) {
  const d = String(v || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

export default function LeadHistorico({ chatid, crmId }: { chatid?: string; crmId?: string }) {
  const [h, setH] = useState<Historico | null>(null);
  const [erro, setErro] = useState("");
  const [tudo, setTudo] = useState(false);

  useEffect(() => {
    let vivo = true;
    setH(null); setErro(""); setTudo(false);
    const q = new URLSearchParams();
    if (chatid && chatid.endsWith("@s.whatsapp.net")) q.set("chatid", chatid);
    if (crmId) q.set("crm_id", crmId);
    fetch("/api/lead/historico?" + q.toString())
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(new Error(d.erro || "Falha ao carregar o histórico."))))
      .then(d => { if (vivo) setH(d); })
      .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : "Falha ao carregar o histórico."); });
    return () => { vivo = false; };
  }, [chatid, crmId]);

  if (erro) return <p className="lead-hist-vazio">{erro}</p>;
  if (!h) return <p className="lead-hist-vazio">Carregando histórico…</p>;
  const r = h.resumo;
  const eventos = tudo ? h.eventos : h.eventos.slice(0, 8);

  return (
    <section className="lead-hist" aria-label="Histórico do lead">
      <div className="lead-hist-grupo">
        <span>Grupo do WhatsApp</span>
        {h.grupo
          ? <Link to={`/atendimento?chatid=${encodeURIComponent(h.grupo.chatid)}`}><b>{h.grupo.nome}</b> →</Link>
          : <b className="lead-hist-falta">Sem grupo vinculado</b>}
        <small>
          Lojista: {fone(h.fone) || "—"}
          {h.catalogo_whatsapp && fone(h.catalogo_whatsapp) !== fone(h.fone) ? ` · WhatsApp do catálogo: ${fone(h.catalogo_whatsapp)}` : ""}
        </small>
      </div>

      <dl className="lead-hist-resumo">
        <div><dt>Catálogo criado</dt><dd>{r.catalogo_criado?.slice(0, 10) || "—"}</dd></div>
        <div><dt>Acesso enviado</dt><dd>{r.acesso_enviado?.slice(0, 10) || "—"}</dd></div>
        <div><dt>Última cobrança</dt><dd>{r.ultima_cobranca?.slice(0, 10) || "nunca"}</dd></div>
        <div><dt>Provas no grupo</dt><dd>{r.provas}{r.ultima_prova ? ` · última ${r.ultima_prova.slice(0, 5)}` : ""}</dd></div>
      </dl>
      {r.catalogo_link && <a className="lead-hist-link" href={"https://" + r.catalogo_link} target="_blank" rel="noreferrer">{r.catalogo_link}</a>}
      {r.ultima_fala_cliente && (
        <p className="lead-hist-fala"><span>Última fala do cliente · {r.ultima_fala_cliente.quando} · {r.ultima_fala_cliente.onde}</span>
          “{r.ultima_fala_cliente.texto || "[mídia]"}”</p>
      )}

      <h3>Linha do tempo</h3>
      {!h.eventos.length && <p className="lead-hist-vazio">Nada registrado ainda.</p>}
      <ol className="lead-hist-lista">
        {eventos.map((e, i) => (
          <li key={i}>
            <i style={{ background: COR[e.tipo] || "#94a3b8" }} />
            <div>
              <b>{e.titulo}</b>
              <small>{e.quando}{e.onde ? ` · ${e.onde}` : ""}</small>
              {e.detalhe && <p>{e.detalhe}</p>}
            </div>
          </li>
        ))}
      </ol>
      {h.eventos.length > 8 && (
        <button type="button" className="lead-hist-mais" onClick={() => setTudo(v => !v)}>
          {tudo ? "Mostrar menos" : `Ver tudo (${h.eventos.length})`}
        </button>
      )}
    </section>
  );
}
