"""
LEITOR do WhatsApp — lê as conversas (via Uazapi), entende o ponto de quem RESPONDEU
e enfileira o rascunho na Fila de Aprovação (nada é enviado sem o OK do Lucas).

Espelha o leitor_instagram.py, mas puxa as conversas do Uazapi em vez do browser.
Pra cada chat cujo ÚLTIMO texto é do LEAD (não meu), roda o classificador → atualiza a
etapa no CRM → se a ação pede resposta e há rascunho, insere em `disparos_pendentes`.

⚠️ Precisa de UAZAPI_URL/UAZAPI_TOKEN (config.py ou env) e GEMINI_API_KEY (senão cai nas regras).
⚠️ O endpoint de LEITURA do Uazapi pode variar por versão — a função buscar_conversas()
   está isolada e documentada pra você ajustar (POST /chat/find). Roda na sua máquina.

USO:
  python leitor_whatsapp.py --dry-run
  python leitor_whatsapp.py --limite 50
"""
import argparse
import os
import re

try:
    import certifi
    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
    os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())
except ImportError:
    pass
try:
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass

import requests
from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY
from classificar_conversa import classificar

# UAZAPI vem do config.py (na máquina do Lucas) ou do env como fallback
try:
    from config import UAZAPI_URL, UAZAPI_TOKEN
except Exception:
    UAZAPI_URL = os.getenv("UAZAPI_URL", "")
    UAZAPI_TOKEN = os.getenv("UAZAPI_TOKEN", "")

ACOES_QUE_ENFILEIRAM = ("mandar_isca", "responder", "reativar")


def norm(p):
    d = re.sub(r"\D", "", str(p or ""))
    if d.startswith("55") and len(d) > 11:
        d = d[2:]
    if d.startswith("0"):
        d = d[1:]
    return d[-9:] if len(d) >= 9 else d


def buscar_conversas(limite=100):
    """
    Retorna [{numero, ultimo_texto, do_lead(bool), nome}] das conversas recentes.
    ⚠️ AJUSTE AQUI conforme a API da sua Uazapi. Assumo POST /chat/find retornando
    chats com o lastMessage (texto + fromMe). Se a sua instância usar outro endpoint
    (ex.: /message/find, /chats), troque só esta função — o resto do fluxo é agnóstico.
    """
    r = requests.post(
        f"{UAZAPI_URL.rstrip('/')}/chat/find",
        headers={"token": UAZAPI_TOKEN, "Content-Type": "application/json"},
        json={"limit": limite, "sort": "-messageTimestamp"},
        timeout=40,
    )
    r.raise_for_status()
    data = r.json()
    chats = data.get("chats") or data.get("data") or (data if isinstance(data, list) else [])
    out = []
    for c in chats:
        # tolerante a formatos diferentes de payload
        numero = c.get("number") or c.get("id") or c.get("chatid") or c.get("wa_chatid") or ""
        numero = str(numero).split("@")[0]
        lm = c.get("lastMessage") or c.get("last_message") or {}
        texto = (lm.get("text") or lm.get("body") or c.get("lastMessageText") or c.get("preview") or "").strip()
        from_me = bool(lm.get("fromMe", c.get("fromMe", False)))
        nome = c.get("name") or c.get("contactName") or c.get("pushName") or ""
        if numero and texto:
            out.append({"numero": numero, "ultimo_texto": texto, "do_lead": not from_me, "nome": nome})
    return out


def achar_lead(sb, numero):
    n = norm(numero)
    if len(n) < 8:
        return None
    # casa por whatsapp ou telefone (últimos 8, formato varia)
    for campo in ("whatsapp", "telefone"):
        r = sb.table("leads").select("*").ilike(campo, f"%{n[-8:]}%").limit(1).execute()
        if r.data:
            return r.data[0]
    return None


def ja_na_fila(sb, lead_id):
    r = sb.table("disparos_pendentes").select("id").eq("lead_id", lead_id).in_("status", ["pendente", "aprovado"]).limit(1).execute()
    return bool(r.data)


def enfileirar(sb, lead, r, texto_lead):
    row = {
        "lead_id": lead["id"], "instagram": lead.get("instagram"),
        "nome_loja": lead.get("nome_loja") or lead.get("instagram"),
        "canal": "whatsapp", "destino": lead.get("whatsapp") or lead.get("telefone"),
        "tipo": "resposta", "motivo": f"Leitor WA: lead {r['ponto']} — \"{texto_lead[:50]}\"",
        "texto": r.get("rascunho") or "", "status_lead_atual": lead["status"],
        "proximo_status": r.get("status_crm"), "status": "pendente", "criado_por": "leitor-wa",
    }
    sb.table("disparos_pendentes").insert(row).execute()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limite", type=int, default=100)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not UAZAPI_URL or not UAZAPI_TOKEN:
        print("ERRO: UAZAPI_URL/UAZAPI_TOKEN não configurados (config.py ou env).")
        return
    if not os.getenv("GEMINI_API_KEY"):
        print("AVISO: sem GEMINI_API_KEY — cérebro no modo REGRAS.")
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    try:
        conversas = buscar_conversas(args.limite)
    except Exception as e:
        print(f"ERRO ao ler conversas do Uazapi: {e}\n(ajuste a função buscar_conversas() pro endpoint da sua instância)")
        return
    print(f"{len(conversas)} conversas lidas do WhatsApp.\n")

    atual = enfileirados = pulados = 0
    for c in conversas:
        if not c["do_lead"]:
            continue  # último foi meu → não respondeu ainda
        lead = achar_lead(sb, c["numero"])
        if not lead:
            pulados += 1
            continue
        r = classificar([{"de": "lead", "texto": c["ultimo_texto"]}], lead)
        print(f"[{c['numero']}] {c.get('nome','')}: \"{c['ultimo_texto'][:40]}\" → {r['ponto']}/{r['proxima_acao']} [{r['fonte']}]")
        if args.dry_run:
            continue
        if r.get("status_crm") and r["status_crm"] != lead["status"]:
            try:
                sb.table("leads").update({"status": r["status_crm"]}).eq("id", lead["id"]).execute()
                atual += 1
            except Exception as e:
                print(f"    (falha update: {str(e)[:50]})")
        if r["proxima_acao"] in ACOES_QUE_ENFILEIRAM and r.get("rascunho") and not ja_na_fila(sb, lead["id"]):
            try:
                enfileirar(sb, lead, r, c["ultimo_texto"])
                enfileirados += 1
                print("    ✓ rascunho na fila")
            except Exception as e:
                print(f"    (não enfileirou: {str(e)[:60]})")

    print(f"\n=== Leitor WhatsApp ===\nEtapas atualizadas: {atual} | Rascunhos enfileirados: {enfileirados} | Sem match: {pulados}")


if __name__ == "__main__":
    main()
