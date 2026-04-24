import argparse
import os
import time
import random
from playwright.sync_api import sync_playwright
from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY

SESSION_DIR = os.path.join(os.path.dirname(__file__), "instagram_session")

# Mensagens indexadas por (idioma, categoria)
MENSAGENS = {
    ("pt", "oculos"): """Oi! Tudo bem?

Estava olhando a loja de vocês e percebi que ainda não têm provador virtual de óculos.

Nós da @provoulevouapp somos um provador virtual que permite o cliente experimentar os óculos pela câmera do celular, direto no site. Nossos clientes estão vendo um aumento de até 13% na conversão.

Posso mandar um teste que fizemos com alguns óculos da loja de vocês?""",

    ("pt", "roupa"): """Oi! Tudo bem?

Estava olhando a loja de vocês e percebi que ainda não têm provador virtual.

Nós da @provoulevouapp somos um provador virtual que permite o cliente experimentar as peças pela câmera do celular, direto no site. Nossos clientes estão vendo um aumento de até 13% na conversão.

Posso mandar um teste que fizemos com algumas peças da loja de vocês?""",

    ("en", "oculos"): """Hey! Saw your store and noticed you don't have a virtual try-on yet.

We built a try-on tool that lets customers try glasses through their phone camera directly on your site — our customers see up to a 13% lift in conversion.

Mind if I send a quick demo using a few of your frames?""",

    ("en", "roupa"): """Hey! Saw your store and noticed you don't have a virtual try-on yet.

We built a try-on tool that lets customers try your pieces through their phone camera directly on your site — our customers see up to a 13% lift in conversion.

Mind if I send a quick demo using some of your pieces?""",

    ("es", "oculos"): """¡Hola! ¿Qué tal?

Estaba viendo tu tienda y noté que todavía no tienen probador virtual de lentes.

Somos un probador virtual que permite al cliente probar los lentes con la cámara del celular, directo en el sitio web. Nuestros clientes están viendo un aumento de hasta 13% en la conversión.

¿Puedo enviarte una prueba que hicimos con algunos lentes de tu tienda?""",

    ("es", "roupa"): """¡Hola! ¿Qué tal?

Estaba viendo tu tienda y noté que todavía no tienen probador virtual.

Somos un probador virtual que permite al cliente probar las prendas con la cámara del celular, directo en el sitio web. Nuestros clientes están viendo un aumento de hasta 13% en la conversión.

¿Puedo enviarte una prueba que hicimos con algunas prendas de tu tienda?""",
}


def escolher_mensagem(idioma: str, categoria: str) -> str:
    return MENSAGENS.get((idioma, categoria)) or MENSAGENS[("pt", "oculos")]


def cmd_login():
    """Abre o navegador para voce logar manualmente. Salva a sessao em disco."""
    print("\nAbrindo Instagram para login manual...")
    print("Faca login normalmente e depois FECHE o navegador.\n")

    with sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(
            SESSION_DIR,
            headless=False,
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        page = browser.pages[0] if browser.pages else browser.new_page()
        page.goto("https://www.instagram.com/", wait_until="networkidle")

        print("Aguardando voce fechar o navegador...")
        try:
            # Espera o usuario fechar o navegador
            page.wait_for_event("close", timeout=0)
        except:
            pass

        browser.close()

    print("\nSessao salva! Agora pode rodar: python enviar_dm.py --limite 5")


def enviar_dm(page, username: str, mensagem: str) -> bool:
    """Envia DM para um usuario."""
    try:
        print(f"  Abrindo perfil @{username}...")

        # Vai direto para o perfil
        page.goto(f"https://www.instagram.com/{username}/", timeout=15000)
        time.sleep(2)

        # Dispensa popups
        try:
            not_now = page.locator("button:has-text('Agora não'), button:has-text('Not Now'), button:has-text('Not now')")
            if not_now.count() > 0:
                not_now.first.click()
                time.sleep(2)
        except:
            pass

        # Clica em "Enviar mensagem" / "Message"
        msg_btn = page.locator("div[role='button']:has-text('Enviar mensagem'), div[role='button']:has-text('Message'), div[role='button']:has-text('Mensaje'), div[role='button']:has-text('Mandar mensagem'), button:has-text('Enviar mensagem'), button:has-text('Message'), button:has-text('Mensaje')")
        if msg_btn.count() == 0:
            print(f"  Botao 'Enviar mensagem' nao encontrado para @{username}")
            return False

        try:
            msg_btn.first.click(timeout=10000)
        except:
            print(f"  Nao conseguiu clicar no botao de mensagem")
            return False
        time.sleep(5)

        # Dispensa popup de notificacoes se aparecer
        try:
            not_now = page.locator("button:has-text('Agora não'), button:has-text('Not Now'), button:has-text('Not now')")
            if not_now.count() > 0:
                not_now.first.click()
                time.sleep(2)
        except:
            pass

        # Espera explicita pelo campo de texto aparecer
        textarea = page.locator("div[role='textbox'], textarea[placeholder]")
        try:
            textarea.first.wait_for(state="visible", timeout=10000)
        except:
            print(f"  Campo de texto nao apareceu para @{username}")
            return False

        if textarea.count() == 0:
            print(f"  Campo de texto nao encontrado para @{username}")
            return False

        textarea.first.click()
        time.sleep(0.5)

        # Digita linha por linha para parecer humano
        linhas = [l for l in mensagem.split("\n")]
        for i, linha in enumerate(linhas):
            if linha.strip():
                textarea.first.type(linha, delay=random.randint(20, 50))
            # Shift+Enter para quebra de linha (exceto na ultima)
            if i < len(linhas) - 1:
                page.keyboard.press("Shift+Enter")
                time.sleep(0.2)

        time.sleep(1)

        # Tenta clicar no botao de enviar
        send_btn = page.locator("div[role='button'] svg[aria-label='Enviar'], div[role='button'] svg[aria-label='Send'], button svg[aria-label='Enviar'], button svg[aria-label='Send']")
        if send_btn.count() > 0:
            send_btn.first.click()
        else:
            # Fallback: tenta Enter
            page.keyboard.press("Enter")

        time.sleep(3)

        print(f"  DM enviada para @{username}!")
        return True

    except Exception as e:
        print(f"  ERRO ao enviar DM para @{username}: {e}")
        return False


def registrar_no_crm(sb, lead_id: str):
    """Registra a DM enviada no CRM."""
    sb.table("leads").update({"status": "dm_enviada"}).eq("id", lead_id).execute()
    sb.table("interacoes").insert({
        "lead_id": lead_id,
        "tipo": "dm_enviada",
        "conteudo": "DM de prospeccao enviada automaticamente",
    }).execute()


def cmd_enviar(args):
    """Envia DMs usando a sessao salva."""
    if not os.path.exists(SESSION_DIR):
        print("ERRO: Sessao nao encontrada. Rode primeiro: python enviar_dm.py --login")
        return

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERRO: SUPABASE_URL e SUPABASE_KEY nao definidos no .env")
        return

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    result = sb.table("leads").select("*").eq("status", "novo").order("created_at").execute()
    all_leads = result.data or []

    leads = [l for l in all_leads if l.get("site") and l["site"].strip()][:args.limite]

    if not leads:
        print("Nenhum lead com status 'novo' e site encontrado.")
        return

    print(f"\n{'='*50}")
    print(f"  ENVIO DE DMs — {len(leads)} leads")
    print(f"  Intervalo: {args.intervalo} min entre cada")
    print(f"  Tempo estimado: ~{len(leads) * args.intervalo} min")
    print(f"{'='*50}\n")

    with sync_playwright() as p:
        if args.cdp:
            # Conecta no Chrome real ja aberto (com --remote-debugging-port=9222)
            print("Conectando ao Chrome existente via CDP...")
            browser_conn = p.chromium.connect_over_cdp("http://localhost:9222")
            browser = browser_conn.contexts[0] if browser_conn.contexts else browser_conn.new_context()
            # Pega uma aba do Instagram ou cria uma nova
            pages = browser.pages
            instagram_page = None
            for pg in pages:
                try:
                    if "instagram.com" in pg.url:
                        instagram_page = pg
                        break
                except: pass
            page = instagram_page if instagram_page else browser.new_page()
            print(f"Aba Instagram: {page.url}")
        else:
            browser = p.chromium.launch_persistent_context(
                SESSION_DIR,
                headless=args.headless,
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            )
            page = browser.pages[0] if browser.pages else browser.new_page()

        enviados = 0
        falhas = 0

        for i, lead in enumerate(leads):
            username = lead["instagram"]
            print(f"[{i+1}/{len(leads)}] @{username} — {lead.get('nome_loja', '')}")

            # Recria page se foi fechada
            try:
                page.url  # testa se page ainda existe
            except:
                print("  Recriando pagina...")
                page = browser.new_page()

            # Sempre PT por enquanto
            categoria = lead.get("categoria", "oculos")
            mensagem = escolher_mensagem("pt", categoria)
            sucesso = enviar_dm(page, username, mensagem)

            if sucesso:
                registrar_no_crm(sb, lead["id"])
                enviados += 1
                print(f"  -> CRM atualizado: dm_enviada")
            else:
                falhas += 1

            # Intervalo entre DMs (exceto na ultima)
            if i < len(leads) - 1 and args.intervalo > 0:
                espera = args.intervalo * 60 + random.randint(-15, 15)
                espera = max(espera, 5)
                print(f"\n  Aguardando {espera//60}m{espera%60}s...\n")
                time.sleep(espera)

        if not args.cdp:
            browser.close()

    print(f"\n{'='*50}")
    print(f"  RESULTADO: {enviados} enviadas, {falhas} falhas")
    print(f"{'='*50}\n")


def main():
    parser = argparse.ArgumentParser(description="Envia DMs para leads do pipeline")
    parser.add_argument("--login", action="store_true", help="Abrir navegador para login manual (fazer 1x)")
    parser.add_argument("--limite", type=int, default=5, help="Quantidade de DMs (default: 5)")
    parser.add_argument("--intervalo", type=int, default=1, help="Minutos entre cada DM (default: 1)")
    parser.add_argument("--headless", action="store_true", help="Rodar sem abrir navegador")
    parser.add_argument("--cdp", action="store_true", help="Conectar ao Chrome existente via CDP (porta 9222)")
    args = parser.parse_args()

    if args.login:
        cmd_login()
    else:
        cmd_enviar(args)


if __name__ == "__main__":
    main()
