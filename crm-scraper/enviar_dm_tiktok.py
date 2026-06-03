"""
Envia DMs de prospeccao para leads do TikTok (plataforma='tiktok') via Playwright.

Diferenca chave vs Instagram: muitas contas no TikTok so aceitam DM de quem elas
seguem. Quando o botao "Message" nao existe no perfil, a funcao retorna None
(sinal de "sem canal de DM") e o lead fica para o disparo por email cobrir
(coletar_emails.py + enviar_email.py ja pegam qualquer lead com site/email).

Reusa as mensagens (MENSAGENS / escolher_mensagem) e o registro no CRM do enviar_dm.py.

Uso:
    python enviar_dm_tiktok.py --login              # 1x: login manual, salva sessao
    python enviar_dm_tiktok.py --limite 5 --intervalo 2
"""
import argparse
import os
import time
import random

# Windows com antivirus/proxy fazendo SSL inspection: usa o cert store do sistema
try:
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass

from playwright.sync_api import sync_playwright
from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY
from enviar_dm import escolher_mensagem, dispensar_popup

SESSION_DIR = os.path.join(os.path.dirname(__file__), "tiktok_session")


def cmd_login():
    """Abre o navegador para voce logar manualmente no TikTok. Salva a sessao em disco."""
    print("\nAbrindo TikTok para login manual...")
    print("Faca login normalmente e depois FECHE o navegador.\n")

    with sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(
            SESSION_DIR,
            headless=False,
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        page = browser.pages[0] if browser.pages else browser.new_page()
        page.goto("https://www.tiktok.com/login", wait_until="domcontentloaded")

        print("Aguardando voce fechar o navegador...")
        try:
            page.wait_for_event("close", timeout=0)
        except:
            pass
        browser.close()

    print("\nSessao salva! Agora pode rodar: python enviar_dm_tiktok.py --limite 5")


def enviar_dm(page, username: str, mensagem: str):
    """
    Vai ao perfil, clica em 'Message' e envia a mensagem.

    Retorna:
        True  -> DM enviada
        False -> erro tecnico (perfil existe, mas algo falhou)
        None  -> perfil nao aceita DM (sem botao Message) -> deixar p/ email
    """
    try:
        page.goto(f"https://www.tiktok.com/@{username}", timeout=30000, wait_until="domcontentloaded")
        time.sleep(3)
        dispensar_popup(page)

        # Botao "Message" no perfil — so existe se a conta aceita DM de nao-seguidores
        msg_btn = page.locator(
            "[data-e2e='message-button'], "
            "button:has-text('Message'), button:has-text('Mensagem')"
        )
        if msg_btn.count() == 0:
            print(f"  @{username} nao tem botao de mensagem (DM bloqueada) -> email cobre")
            return None

        msg_btn.first.click()
        time.sleep(3)
        dispensar_popup(page)

        # Campo de texto da conversa (contenteditable)
        editor = page.locator(
            "[data-e2e='message-input-area'] div[contenteditable='true'], "
            "div[contenteditable='true'][role='textbox'], "
            "div[contenteditable='true']"
        )
        try:
            editor.first.wait_for(state="visible", timeout=10000)
        except:
            print(f"  Campo de conversa nao apareceu para @{username}")
            return False

        editor.first.click()
        time.sleep(0.5)

        # TikTok aceita texto com quebras de linha via Shift+Enter (Enter sozinho envia)
        linhas = mensagem.split("\n")
        for i, linha in enumerate(linhas):
            if linha.strip():
                editor.first.type(linha, delay=random.randint(20, 50))
            if i < len(linhas) - 1:
                page.keyboard.press("Shift+Enter")
                time.sleep(0.2)

        time.sleep(1)

        # Botao enviar (ou Enter como fallback)
        send_btn = page.locator(
            "[data-e2e='message-send'], "
            "[data-e2e='message-send-button'], "
            "svg[aria-label='Send'], svg[aria-label='Enviar']"
        )
        if send_btn.count() > 0:
            send_btn.first.click()
        else:
            page.keyboard.press("Enter")

        time.sleep(3)
        print(f"  DM enviada para @{username}!")
        return True

    except Exception as e:
        print(f"  ERRO ao enviar DM para @{username}: {e}")
        try:
            page.keyboard.press("Escape")
        except:
            pass
        return False


def registrar_no_crm(sb, lead_id: str, enviou: bool):
    """enviou=True -> dm_enviada; enviou=False -> marca sem_dm (deixa email cobrir)."""
    if enviou:
        sb.table("leads").update({"status": "dm_enviada"}).eq("id", lead_id).execute()
        sb.table("interacoes").insert({
            "lead_id": lead_id,
            "tipo": "dm_enviada",
            "conteudo": "DM de prospeccao (TikTok) enviada automaticamente",
        }).execute()
    else:
        # Sem canal de DM — registra nota e mantem 'novo' p/ o disparo de email pegar
        sb.table("interacoes").insert({
            "lead_id": lead_id,
            "tipo": "nota",
            "conteudo": "TikTok sem DM disponivel — direcionado para email",
        }).execute()


def cmd_enviar(args):
    if not os.path.exists(SESSION_DIR):
        print("ERRO: Sessao nao encontrada. Rode primeiro: python enviar_dm_tiktok.py --login")
        return
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERRO: SUPABASE_URL e SUPABASE_KEY nao definidos no .env")
        return

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    q = sb.table("leads").select("*").eq("plataforma", "tiktok").eq("status", "novo_tiktok").order("created_at")
    if args.categoria != "all":
        q = q.eq("categoria", args.categoria)
    all_leads = q.execute().data or []
    leads = [l for l in all_leads if l.get("instagram")][:args.limite]

    if not leads:
        print("Nenhum lead TikTok com status 'novo' encontrado.")
        return

    print(f"\n{'='*50}")
    print(f"  ENVIO DE DMs TIKTOK — {len(leads)} leads")
    print(f"  Intervalo: {args.intervalo} min entre cada")
    print(f"{'='*50}\n")

    with sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(
            SESSION_DIR,
            headless=args.headless,
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        page = browser.pages[0] if browser.pages else browser.new_page()

        enviados = 0
        sem_dm = 0
        falhas = 0

        for i, lead in enumerate(leads):
            username = lead["instagram"]
            print(f"[{i+1}/{len(leads)}] @{username} — {lead.get('nome_loja', '')}")

            try:
                page.url
            except:
                print("  Recriando pagina...")
                page = browser.new_page()

            categoria = lead.get("categoria", "oculos")
            mensagem = escolher_mensagem("pt", categoria)
            resultado = enviar_dm(page, username, mensagem)

            if resultado is True:
                registrar_no_crm(sb, lead["id"], True)
                enviados += 1
                print(f"  -> CRM atualizado: dm_enviada")
            elif resultado is None:
                registrar_no_crm(sb, lead["id"], False)
                sem_dm += 1
            else:
                falhas += 1

            if i < len(leads) - 1 and args.intervalo > 0:
                espera = args.intervalo * 60 + random.randint(-15, 15)
                espera = max(espera, 5)
                print(f"\n  Aguardando {espera//60}m{espera%60}s...\n")
                time.sleep(espera)

        browser.close()

    print(f"\n{'='*50}")
    print(f"  RESULTADO: {enviados} enviadas, {sem_dm} sem DM (-> email), {falhas} falhas")
    print(f"{'='*50}\n")


def main():
    parser = argparse.ArgumentParser(description="Envia DMs TikTok para leads do pipeline")
    parser.add_argument("--login", action="store_true", help="Abrir navegador para login manual (fazer 1x)")
    parser.add_argument("--limite", type=int, default=5, help="Quantidade de DMs (default: 5)")
    parser.add_argument("--intervalo", type=int, default=2, help="Minutos entre cada DM (default: 2)")
    parser.add_argument("--headless", action="store_true", help="Rodar sem abrir navegador")
    parser.add_argument("--categoria", choices=["oculos", "roupa", "all"], default="all")
    args = parser.parse_args()

    if args.login:
        cmd_login()
    else:
        cmd_enviar(args)


if __name__ == "__main__":
    main()
