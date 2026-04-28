"""
Envia mensagens de follow-up automatico pra leads parados na cadência:
  dm_enviada      → envia "Mensagem 1" (lembrete leve)        → status passa a mensagem_1
  mensagem_1      → envia "Mensagem 2" (prova social)          → status passa a mensagem_2
  mensagem_2      → envia "Mensagem 3" (foco no resultado)     → status passa a mensagem_3

REGRAS:
- Nunca envia 2 mensagens pra mesmo lead no mesmo dia (checa interacoes do dia)
- Reutiliza a sessao salva pelo enviar_dm.py (precisa ter rodado --login antes)
- Reutiliza a funcao enviar_dm() para evitar duplicar codigo de UI

USO:
  python enviar_follow_up.py --limite 10                      # roda
  python enviar_follow_up.py --limite 10 --intervalo 2        # 2 min entre cada
  python enviar_follow_up.py --limite 10 --cdp                # usa Chrome aberto
  python enviar_follow_up.py --dry-run --limite 5             # simula sem enviar

  python enviar_follow_up.py --apenas-status mensagem_1       # filtra
"""

import argparse
import os
import time
import random
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright
from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY
from enviar_dm import enviar_dm, SESSION_DIR


# === Mensagens da cadência ===
MENSAGENS = {
    # Disparada quando o lead está em "dm_enviada" → vira "mensagem_1"
    "dm_enviada": (
        "Oi! Tudo bem? Vi que minha mensagem talvez tenha passado batido. "
        "Posso mandar aquele teste do provador com os óculos/peças de vocês?"
    ),

    # Disparada quando o lead está em "mensagem_1" → vira "mensagem_2"
    "mensagem_1": (
        "Ei, deixei aqui dois clientes que já implementaram pra você dar uma olhada na prática:\n\n"
        "👉 cacifebrand.com.br\n"
        "👉 califabrand.com.br\n\n"
        "É só clicar em qualquer produto e em \"Provar em mim\". Faz sentido testarmos no site de vocês?"
    ),

    # Disparada quando o lead está em "mensagem_2" → vira "mensagem_3"
    "mensagem_2": (
        "Oi! Só pra reforçar: as marcas que estão usando o provador estão tendo até 15% mais conversão. "
        "Se quiser ver na prática, é só responder aqui que eu mando o teste."
    ),
}

# Status atual → próximo status após enviar follow-up
PROXIMO_STATUS = {
    "dm_enviada": "mensagem_1",
    "mensagem_1": "mensagem_2",
    "mensagem_2": "mensagem_3",
}

# Rótulo "humano" pra log
ROTULO = {
    "dm_enviada": "Mensagem 1 (lembrete leve)",
    "mensagem_1": "Mensagem 2 (prova social)",
    "mensagem_2": "Mensagem 3 (foco no resultado)",
}


def teve_mensagem_hoje(sb, lead_id: str) -> bool:
    """Checa se o lead recebeu qualquer DM/follow-up hoje (UTC)."""
    hoje = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    res = (
        sb.table("interacoes")
        .select("id, created_at, tipo")
        .eq("lead_id", lead_id)
        .in_("tipo", ["dm_enviada", "follow_up"])
        .gte("created_at", hoje + "T00:00:00")
        .lte("created_at", hoje + "T23:59:59")
        .limit(1)
        .execute()
    )
    return bool(res.data)


def avancar_lead(sb, lead_id: str, status_atual: str, conteudo: str):
    """Atualiza status e registra interação."""
    novo_status = PROXIMO_STATUS[status_atual]
    sb.table("leads").update({"status": novo_status}).eq("id", lead_id).execute()
    sb.table("interacoes").insert({
        "lead_id": lead_id,
        "tipo": "follow_up",
        "conteudo": conteudo,
    }).execute()
    return novo_status


def cmd_follow_up(args):
    if not args.dry_run and not os.path.exists(SESSION_DIR):
        print("ERRO: Sessao nao encontrada. Rode primeiro: python enviar_dm.py --login")
        return
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERRO: SUPABASE_URL/SUPABASE_KEY nao definidos no .env")
        return

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Filtra status alvo (dm_enviada, mensagem_1, mensagem_2) ou apenas o que veio em --apenas-status
    status_alvo = (
        [args.apenas_status]
        if args.apenas_status
        else ["dm_enviada", "mensagem_1", "mensagem_2"]
    )
    print(f"Buscando leads em: {', '.join(status_alvo)}")

    # Pega os leads, em ordem do mais antigo updated_at (quem está parado há mais tempo)
    res = (
        sb.table("leads")
        .select("*")
        .in_("status", status_alvo)
        .order("updated_at")
        .execute()
    )
    todos_leads = res.data or []
    print(f"{len(todos_leads)} leads encontrados nos status alvo.\n")

    # Filtra os que já receberam mensagem hoje
    elegiveis = []
    for lead in todos_leads:
        if teve_mensagem_hoje(sb, lead["id"]):
            print(f"  ⏭  @{lead['instagram']} já recebeu mensagem hoje — pulando")
            continue
        elegiveis.append(lead)

    if not elegiveis:
        print("\nNenhum lead elegível pra follow-up hoje.")
        return

    leads = elegiveis[: args.limite]
    print(f"\n{'='*60}")
    print(f"  FOLLOW-UP — {len(leads)} de {len(elegiveis)} elegíveis")
    print(f"  Intervalo: {args.intervalo} min entre cada")
    print(f"  Dry-run: {args.dry_run}")
    print(f"{'='*60}\n")

    if args.dry_run:
        for i, l in enumerate(leads, 1):
            label = ROTULO[l["status"]]
            print(f"[{i}/{len(leads)}] @{l['instagram']} ({l['status']}) → enviaria: {label}")
        return

    enviados = 0
    falhas = 0

    with sync_playwright() as p:
        if args.cdp:
            print("Conectando ao Chrome existente via CDP (porta 9222)...")
            browser_conn = p.chromium.connect_over_cdp("http://localhost:9222")
            browser = browser_conn.contexts[0] if browser_conn.contexts else browser_conn.new_context()
            pages = browser.pages
            instagram_page = None
            for pg in pages:
                try:
                    if "instagram.com" in pg.url:
                        instagram_page = pg
                        break
                except Exception:
                    pass
            page = instagram_page if instagram_page else browser.new_page()
            print(f"Aba Instagram: {page.url}\n")
        else:
            browser = p.chromium.launch_persistent_context(
                SESSION_DIR,
                headless=args.headless,
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            )
            page = browser.pages[0] if browser.pages else browser.new_page()

        for i, lead in enumerate(leads, 1):
            username = lead["instagram"]
            status_atual = lead["status"]
            mensagem = MENSAGENS[status_atual]
            label = ROTULO[status_atual]

            print(f"[{i}/{len(leads)}] @{username} — {lead.get('nome_loja', '')}")
            print(f"           Status: {status_atual} → enviando: {label}")

            # Recria page se foi fechada
            try:
                _ = page.url
            except Exception:
                print("           Recriando página...")
                page = browser.new_page()

            sucesso = enviar_dm(page, username, mensagem)

            if sucesso:
                novo = avancar_lead(sb, lead["id"], status_atual, label)
                enviados += 1
                print(f"           ✓ Status atualizado: {status_atual} → {novo}")
            else:
                falhas += 1
                print(f"           ✗ Falhou — status mantido como {status_atual}")

            # Intervalo entre envios (exceto no último)
            if i < len(leads) and args.intervalo > 0:
                espera = args.intervalo * 60 + random.randint(-15, 15)
                espera = max(espera, 5)
                print(f"\n           Aguardando {espera//60}m{espera%60}s...\n")
                time.sleep(espera)

        if not args.cdp:
            browser.close()

    print(f"\n{'='*60}")
    print(f"  RESULTADO: {enviados} enviadas, {falhas} falhas, {len(leads) - enviados - falhas} ignoradas")
    print(f"{'='*60}\n")


def main():
    parser = argparse.ArgumentParser(description="Envia follow-ups (Mensagem 1/2/3) pra leads parados.")
    parser.add_argument("--limite", type=int, default=10, help="Máximo de follow-ups por execução (default: 10)")
    parser.add_argument("--intervalo", type=int, default=2, help="Minutos entre cada envio (default: 2)")
    parser.add_argument("--headless", action="store_true", help="Rodar sem abrir navegador")
    parser.add_argument("--cdp", action="store_true", help="Conectar ao Chrome existente via CDP (porta 9222)")
    parser.add_argument("--dry-run", action="store_true", help="Simula sem enviar nada")
    parser.add_argument(
        "--apenas-status",
        choices=["dm_enviada", "mensagem_1", "mensagem_2"],
        help="Roda só pra leads num status específico",
    )
    args = parser.parse_args()
    cmd_follow_up(args)


if __name__ == "__main__":
    main()
