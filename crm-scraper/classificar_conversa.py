"""
Classificador de conversa (o "cérebro" do Leitor).

Dado o histórico de mensagens com um lead, decide O PONTO em que o lead está e
qual a PRÓXIMA AÇÃO. Usa Gemini se GEMINI_API_KEY estiver no ambiente; senão, cai
num fallback por regras CONSERVADOR (na dúvida → 'escalar', nunca inventa ação).

Nada aqui envia mensagem — só decide. A ação vira um rascunho na Fila de Aprovação.

PONTOS possíveis:
  sem_resposta | respondeu_neutro | interessado | pediu_teste | pediu_preco |
  objecao | negativo | ja_cliente

PRÓXIMA AÇÃO:
  mandar_isca | responder | reativar | aguardar | descartar | escalar

Uso como módulo:
  from classificar_conversa import classificar
  r = classificar(mensagens, lead)   # mensagens = [{"de":"lead"|"eu","texto":...}], lead = {...}

Teste rápido:
  python classificar_conversa.py --teste
"""

import os
import json
import re

PONTOS = ["sem_resposta", "respondeu_neutro", "interessado", "pediu_teste",
          "pediu_preco", "objecao", "negativo", "ja_cliente"]
ACOES = ["mandar_isca", "responder", "reativar", "aguardar", "descartar", "escalar"]

# ponto -> (status_crm sugerido, ação default)
PONTO_MAP = {
    "sem_resposta":     ("dm_enviada",   "aguardar"),
    "respondeu_neutro": ("respondeu",    "escalar"),
    "interessado":      ("interessado",  "responder"),
    "pediu_teste":      ("interessado",  "mandar_isca"),
    "pediu_preco":      ("interessado",  "responder"),
    "objecao":          ("stand_by",     "responder"),
    "negativo":         ("perdida",      "descartar"),
    "ja_cliente":       ("fechou",       "escalar"),
}


def _ultimo_do_lead(mensagens):
    for m in reversed(mensagens or []):
        if (m.get("de") or "").lower() in ("lead", "cliente", "them", "in"):
            return m.get("texto") or ""
    return ""


def _fallback_regras(mensagens, lead):
    """Classificador por regras — conservador. Não sabe? Escala pro humano."""
    txt = _ultimo_do_lead(mensagens).lower().strip()
    if not txt:
        return _resultado("sem_resposta", 0.9, None, "Sem resposta do lead ainda.")
    def tem(*ps): return any(p in txt for p in ps)
    if tem("não tenho interesse", "nao tenho interesse", "não quero", "nao quero",
           "para de", "pare de", "sair da lista", "descadastr", "spam"):
        return _resultado("negativo", 0.8, None, "Lead sinalizou desinteresse.")
    if tem("quanto custa", "qual o valor", "qual valor", "preço", "preco", "quanto é", "quanto fica", "mensalidade", "planos"):
        return _resultado("pediu_preco", 0.75, None, "Lead perguntou preço/planos.")
    if tem("pode mandar", "manda", "quero ver", "manda aí", "manda ai", "envia", "quero o teste", "pode enviar", "gostaria de ver"):
        return _resultado("pediu_teste", 0.7, None, "Lead pediu/aceitou o teste — mandar a isca.")
    if tem("já uso", "ja uso", "já tenho", "ja tenho", "já sou cliente", "ja sou cliente", "já contratei"):
        return _resultado("ja_cliente", 0.6, None, "Lead diz que já usa/é cliente — conferir.")
    # respondeu algo, mas não deu pra ler a intenção com regra → humano decide
    return _resultado("respondeu_neutro", 0.4, None, "Respondeu, intenção não óbvia — escalar.")


def _resultado(ponto, confianca, rascunho, motivo):
    status_crm, acao = PONTO_MAP.get(ponto, ("respondeu", "escalar"))
    return {
        "ponto": ponto,
        "proxima_acao": acao,
        "status_crm": status_crm,
        "rascunho": rascunho,
        "confianca": round(float(confianca), 2),
        "motivo": motivo,
        "fonte": "regras",
    }


def _gemini(mensagens, lead):
    """Classifica via Gemini (JSON estrito). Retorna None se sem chave ou erro."""
    key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not key:
        return None
    import urllib.request, urllib.error
    model = os.getenv("GEMINI_MODEL_TEXT", "gemini-2.5-flash")
    convo = "\n".join(f"{'LEAD' if (m.get('de') or '').lower() in ('lead','cliente','them','in') else 'EU'}: {m.get('texto','')}" for m in (mensagens or []))
    prompt = (
        "Você é um SDR da Provou Levou (provador virtual de óculos/roupas para e-commerce). "
        "Está prospeccionando a loja abaixo por DM/WhatsApp. Leia a conversa e classifique O PONTO do lead e a PRÓXIMA AÇÃO.\n\n"
        f"Loja: {lead.get('nome_loja') or lead.get('instagram') or '(desconhecida)'}\n"
        f"Conversa (mais antiga em cima):\n{convo or '(sem mensagens)'}\n\n"
        "Responda SÓ um JSON com: "
        '{"ponto": um de ' + str(PONTOS) + ', '
        '"proxima_acao": um de ' + str(ACOES) + ', '
        '"rascunho": (se a ação for responder/mandar_isca/reativar, uma resposta curta, cordial e natural em pt-BR na voz de um SDR; senão null), '
        '"confianca": 0 a 1, "motivo": frase curta}. '
        "Regras: 'pediu_teste'→mandar_isca; 'pediu_preco'/'objecao'/'respondeu_neutro'→responder; "
        "'negativo'→descartar; 'ja_cliente'→escalar. Se não tiver certeza, use ponto 'respondeu_neutro' e acao 'escalar'."
    )
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    try:
        r = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                   headers={"Content-Type": "application/json"})
        resp = json.loads(urllib.request.urlopen(r, timeout=40).read())
        txt = resp["candidates"][0]["content"]["parts"][0]["text"]
        d = json.loads(txt)
        ponto = d.get("ponto") if d.get("ponto") in PONTOS else "respondeu_neutro"
        status_crm, acao_def = PONTO_MAP.get(ponto, ("respondeu", "escalar"))
        acao = d.get("proxima_acao") if d.get("proxima_acao") in ACOES else acao_def
        return {
            "ponto": ponto, "proxima_acao": acao, "status_crm": status_crm,
            "rascunho": d.get("rascunho"), "confianca": round(float(d.get("confianca", 0.5)), 2),
            "motivo": d.get("motivo") or "", "fonte": "gemini",
        }
    except Exception as e:
        print(f"   [classificador] Gemini falhou, usando regras: {str(e)[:80]}")
        return None


def classificar(mensagens, lead):
    """Retorna a decisão (dict). Tenta Gemini; cai pro fallback por regras."""
    return _gemini(mensagens, lead) or _fallback_regras(mensagens, lead)


def _teste():
    lead = {"nome_loja": "Ótica Exemplo", "instagram": "oticaexemplo"}
    casos = [
        [{"de": "eu", "texto": "Posso mandar um teste com os óculos de vocês?"}, {"de": "lead", "texto": "pode mandar sim, quero ver!"}],
        [{"de": "eu", "texto": "..."}, {"de": "lead", "texto": "quanto custa isso?"}],
        [{"de": "eu", "texto": "..."}, {"de": "lead", "texto": "não tenho interesse, obrigado"}],
        [{"de": "eu", "texto": "..."}, {"de": "lead", "texto": "já uso um provador aqui"}],
        [{"de": "eu", "texto": "..."}, {"de": "lead", "texto": "interessante, me conta mais"}],
        [{"de": "eu", "texto": "oi tudo bem?"}],
    ]
    for m in casos:
        r = classificar(m, lead)
        ult = _ultimo_do_lead(m) or "(sem resposta)"
        print(f"  '{ult[:40]}' → ponto={r['ponto']:16} acao={r['proxima_acao']:11} status={r['status_crm']:12} conf={r['confianca']} [{r['fonte']}]")


if __name__ == "__main__":
    import sys
    if "--teste" in sys.argv:
        _teste()
    else:
        print("Use: python classificar_conversa.py --teste")
