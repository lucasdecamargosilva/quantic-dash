"""
Prepara a FILA DE APROVAÇÃO (não envia nada).

Varre os leads parados na cadência (dm_enviada / mensagem_1 / mensagem_2), monta o
follow-up que SERIA enviado e enfileira em `disparos_pendentes` (status='pendente').
O Lucas aprova na tela /aprovacao.html; depois `enviar_aprovados.py` dispara só os aprovados.

Regras:
- Não enfileira quem já recebeu mensagem hoje (interacoes do dia).
- Não enfileira quem já tem disparo aberto na fila (pendente/aprovado) — índice único cobre.
- Reaproveita os textos da cadência de `enviar_follow_up.py` (fonte única).

USO:
  python preparar_fila.py                 # enfileira todos os elegíveis
  python preparar_fila.py --limite 20
  python preparar_fila.py --dry-run
"""

import argparse
import os

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

from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY
from enviar_follow_up import MENSAGENS, PROXIMO_STATUS, ROTULO, teve_mensagem_hoje

TIPO_POR_STATUS = {"dm_enviada": "msg-1", "mensagem_1": "msg-2", "mensagem_2": "msg-3"}


def ja_tem_na_fila(sb, lead_id: str) -> bool:
    res = (
        sb.table("disparos_pendentes")
        .select("id")
        .eq("lead_id", lead_id)
        .in_("status", ["pendente", "aprovado"])
        .limit(1)
        .execute()
    )
    return bool(res.data)


def main():
    ap = argparse.ArgumentParser(description="Enfileira follow-ups na Fila de Aprovação (não envia).")
    ap.add_argument("--limite", type=int, default=0, help="Máximo a enfileirar (0 = todos)")
    ap.add_argument("--dry-run", action="store_true", help="Só mostra o que enfileiraria")
    args = ap.parse_args()

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERRO: SUPABASE_URL/SUPABASE_KEY não definidos no .env")
        return
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    alvo = ["dm_enviada", "mensagem_1", "mensagem_2"]
    res = sb.table("leads").select("*").in_("status", alvo).order("updated_at").execute()
    leads = res.data or []
    print(f"{len(leads)} leads na cadência (dm_enviada/mensagem_1/mensagem_2)\n")

    enfileirados = 0
    for lead in leads:
        if args.limite and enfileirados >= args.limite:
            break
        st = lead["status"]
        ig = lead.get("instagram") or ""
        loja = lead.get("nome_loja") or ig
        if teve_mensagem_hoje(sb, lead["id"]):
            continue
        if ja_tem_na_fila(sb, lead["id"]):
            continue
        texto = MENSAGENS[st]
        row = {
            "lead_id": lead["id"],
            "instagram": ig,
            "nome_loja": loja,
            "canal": "instagram",
            "destino": "@" + ig if ig else None,
            "tipo": TIPO_POR_STATUS[st],
            "motivo": "Follow-up: " + ROTULO[st],
            "texto": texto,
            "status_lead_atual": st,
            "proximo_status": PROXIMO_STATUS[st],
            "status": "pendente",
            "criado_por": "agente-cadencia",
        }
        if args.dry_run:
            print(f"  [{TIPO_POR_STATUS[st]}] @{ig} ({loja}) → {ROTULO[st]}")
            enfileirados += 1
            continue
        try:
            sb.table("disparos_pendentes").insert(row).execute()
            enfileirados += 1
            print(f"  ✓ enfileirado @{ig} — {ROTULO[st]}")
        except Exception as e:
            # índice único (lead já na fila) ou instabilidade → só loga e segue
            print(f"  ⏭  @{ig} não enfileirado: {str(e)[:70]}")

    print(f"\n{'(dry-run) ' if args.dry_run else ''}{enfileirados} disparo(s) na fila de aprovação.")
    if not args.dry_run and enfileirados:
        print("Aprove em: http://localhost:3000/aprovacao.html")


if __name__ == "__main__":
    main()
