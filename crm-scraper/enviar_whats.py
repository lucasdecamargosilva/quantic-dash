"""
Envia mensagens via WhatsApp (Uazapi) para leads do CRM.

Pega leads com status 'novo' que tenham campo whatsapp preenchido,
envia a mensagem certa baseado em (idioma, categoria), e atualiza
status pra 'dm_enviada' (reusa o mesmo status do disparo de IG).
"""
import argparse
import random
import time
import requests
from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY, UAZAPI_URL, UAZAPI_TOKEN


# Mensagens (mesmo dict do enviar_dm.py, mas centralizado aqui pra independencia)
MENSAGENS = {
    ("pt", "oculos"): """Oi! Tudo bem?

Estava olhando a loja de vocês e percebi que ainda não têm provador virtual de óculos.

Nós da @provoulevouapp somos um provador virtual que permite o cliente experimentar os óculos pela câmera do celular, direto no site. Nossos clientes estão vendo um aumento de até 13% na conversão.

Posso mandar um teste que fizemos com alguns óculos da loja de vocês?""",

    ("pt", "roupa"): """Oi! Tudo bem?

Estava olhando a loja de vocês e percebi que ainda não têm provador virtual.

Nós da @provoulevouapp somos um provador virtual que permite o cliente experimentar as peças pela câmera do celular, direto no site. Nossos clientes estão vendo um aumento de até 13% na conversão.

Posso mandar um teste que fizemos com algumas peças da loja de vocês?""",
}


def escolher_mensagem(idioma: str, categoria: str) -> str:
    return MENSAGENS.get((idioma, categoria)) or MENSAGENS[("pt", "oculos")]


def enviar_uazapi(numero: str, texto: str) -> tuple[bool, str]:
    """Envia mensagem via Uazapi. Retorna (sucesso, mensagem_erro_se_falha)."""
    try:
        r = requests.post(
            f"{UAZAPI_URL.rstrip('/')}/send/text",
            headers={
                "token": UAZAPI_TOKEN,
                "Content-Type": "application/json",
            },
            json={
                "number": numero,
                "text": texto,
            },
            timeout=30,
        )
        if r.status_code in (200, 201):
            return (True, "")
        return (False, f"HTTP {r.status_code}: {r.text[:200]}")
    except Exception as e:
        return (False, f"{type(e).__name__}: {e}")


def registrar_no_crm(sb, lead_id: str, numero: str):
    """Atualiza status + cria interacao."""
    sb.table("leads").update({"status": "dm_enviada"}).eq("id", lead_id).execute()
    sb.table("interacoes").insert({
        "lead_id": lead_id,
        "tipo": "dm_enviada",
        "conteudo": f"Mensagem WhatsApp enviada para {numero}",
    }).execute()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limite", type=int, default=10)
    parser.add_argument("--intervalo", type=int, default=1, help="minutos entre envios")
    parser.add_argument("--categoria", choices=["oculos", "roupa", "all"], default="all")
    parser.add_argument("--dry-run", action="store_true", help="So mostra quem receberia, sem enviar")
    args = parser.parse_args()

    if not UAZAPI_TOKEN:
        print("ERRO: UAZAPI_TOKEN nao definido no .env")
        return
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERRO: SUPABASE creds nao definidas")
        return

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Busca leads novos com telefone OU whatsapp
    q = sb.table("leads").select("*").eq("status", "novo")
    if args.categoria != "all":
        q = q.eq("categoria", args.categoria)
    result = q.order("created_at").execute()
    todos = result.data or []

    # Filtra: tem telefone ou whatsapp
    leads = [l for l in todos if (l.get("telefone") or l.get("whatsapp"))][:args.limite]

    if not leads:
        print("Nenhum lead com status 'novo' e telefone/whatsapp encontrado.")
        return

    print(f"\n{'='*50}")
    print(f"  ENVIO WHATSAPP — {len(leads)} leads")
    print(f"  Intervalo: {args.intervalo} min")
    print(f"  Tempo estimado: ~{len(leads) * args.intervalo} min")
    if args.dry_run:
        print("  *** DRY-RUN ATIVO — nao envia de verdade ***")
    print(f"{'='*50}\n")

    enviados = 0
    falhas = 0

    for i, lead in enumerate(leads):
        username = lead["instagram"]
        numero = lead.get("telefone") or lead.get("whatsapp")
        categoria = lead.get("categoria", "oculos")
        nome = lead.get("nome_loja") or username

        print(f"[{i+1}/{len(leads)}] {nome} ({numero}) — {categoria}")

        if args.dry_run:
            print(f"  [DRY] enviaria mensagem")
            enviados += 1
        else:
            mensagem = escolher_mensagem("pt", categoria)
            ok, erro = enviar_uazapi(numero, mensagem)
            if ok:
                registrar_no_crm(sb, lead["id"], numero)
                print(f"  ENVIADO -> CRM atualizado: dm_enviada")
                enviados += 1
            else:
                print(f"  ERRO: {erro}")
                falhas += 1

        if i < len(leads) - 1 and args.intervalo > 0:
            espera = args.intervalo * 60 + random.randint(-10, 10)
            espera = max(espera, 5)
            print(f"\n  Aguardando {espera}s...\n")
            time.sleep(espera)

    print(f"\n{'='*50}")
    print(f"  RESULTADO: {enviados} enviadas, {falhas} falhas")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    main()
