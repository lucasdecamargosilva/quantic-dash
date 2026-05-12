"""
Envia follow-ups sequenciais para leads no pipeline.

Logica:
- Lead em status 'dm_enviada' ou 'email_enviado' -> manda Mensagem 1 -> move para 'mensagem_1'
- Lead em status 'mensagem_1' -> manda Mensagem 2 -> move para 'mensagem_2'
- Lead em status 'mensagem_2' -> manda Mensagem 3 -> move para 'mensagem_3'

Uso:
    python enviar_followup.py --etapa 1 --limite 30
    python enviar_followup.py --etapa 2 --limite 30
    python enviar_followup.py --etapa 3 --limite 30
"""
import argparse
import os
import random
import time
from playwright.sync_api import sync_playwright
from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY

SESSION_DIR = os.path.join(os.path.dirname(__file__), "instagram_session")

# Cada etapa tem mensagem propria + status de origem + status destino
ETAPAS = {
    1: {
        "mensagem": """Oi! Tudo bem? Vi que minha mensagem talvez tenha passado batido. Posso mandar aquele teste do provador com os óculos/peças de vocês?""",
        "status_origem": ["dm_enviada", "email_enviado"],
        "status_destino": "mensagem_1",
    },
    2: {
        "mensagem": """Ei, deixei aqui dois clientes que já implementaram pra você dar uma olhada na prática:

👉 cacifebrand.com.br
👉 califabrand.com.br

É só clicar em qualquer produto e em "Provar em mim". Faz sentido testarmos no site de vocês?""",
        "status_origem": ["mensagem_1"],
        "status_destino": "mensagem_2",
    },
    3: {
        "mensagem": """Oi! Só pra reforçar: as marcas que estão usando o provador estão tendo até 15% mais conversão. Se quiser ver na prática, é só responder aqui que eu mando o teste.""",
        "status_origem": ["mensagem_2"],
        "status_destino": "mensagem_3",
    },
}


def dispensar_popup(page):
    try:
        btn = page.locator("button:has-text('Agora não'), button:has-text('Not Now'), button:has-text('Not now')")
        if btn.count() > 0:
            btn.first.click()
            time.sleep(1.5)
    except:
        pass


def enviar_followup(page, username: str, mensagem: str) -> bool:
    """Envia DM via inbox: lápis (force) → digita → primeiro resultado → Conversa → envia."""
    try:
        if "instagram.com/direct" not in page.url:
            page.goto("https://www.instagram.com/direct/inbox/", timeout=15000)
            time.sleep(3)
            dispensar_popup(page)

        lapis = page.locator('svg[aria-label="Nova mensagem"], svg[aria-label="New message"]')
        if lapis.count() == 0:
            print(f"  Icone de lapis nao encontrado")
            return False
        lapis.first.click(force=True)
        time.sleep(2)
        dispensar_popup(page)

        page.keyboard.type(username, delay=random.randint(30, 60))
        time.sleep(3.5)

        clicked = page.evaluate(f"""() => {{
            const opts = document.querySelectorAll('[role=option]');
            for (const el of opts) {{
                if ((el.innerText || '').toLowerCase().includes('{username.lower()}')) {{
                    el.click();
                    return el.innerText.trim().split('\\n')[0];
                }}
            }}
            if (opts.length > 0) {{ opts[0].click(); return opts[0].innerText.trim().split('\\n')[0]; }}
            return null;
        }}""")
        if not clicked:
            print(f"  @{username} nao apareceu nos resultados")
            page.keyboard.press("Escape")
            return False
        print(f"  Perfil: {clicked.strip()[:40]}")
        time.sleep(1.5)

        chat_clicked = page.evaluate("""() => {
            for (const btn of document.querySelectorAll('button, [role=button]')) {
                const t = (btn.innerText || btn.textContent || '').trim();
                if (['Conversa','Chat','Próximo','Next'].includes(t) && btn.offsetParent) {
                    btn.click(); return t;
                }
            }
            return null;
        }""")
        if chat_clicked:
            print(f"  '{chat_clicked}' clicado")
        else:
            page.keyboard.press("Enter")
        time.sleep(2)
        dispensar_popup(page)

        textarea = page.locator("div[role='textbox']")
        try:
            textarea.first.wait_for(state="visible", timeout=10000)
        except:
            print(f"  Campo de texto nao apareceu")
            page.keyboard.press("Escape")
            return False

        textarea.first.click()
        time.sleep(0.5)

        linhas = mensagem.split("\n")
        for i, linha in enumerate(linhas):
            if linha.strip():
                textarea.first.type(linha, delay=random.randint(20, 50))
            if i < len(linhas) - 1:
                page.keyboard.press("Shift+Enter")
                time.sleep(0.2)

        time.sleep(1)

        send_btn = page.locator(
            "div[role='button'] svg[aria-label='Enviar'], "
            "div[role='button'] svg[aria-label='Send']"
        )
        if send_btn.count() > 0:
            send_btn.first.click()
        else:
            page.keyboard.press("Enter")

        time.sleep(3)
        return True

    except Exception as e:
        print(f"  ERRO: {e}")
        try: page.keyboard.press("Escape")
        except: pass
        return False


def registrar_followup(sb, lead_id: str, etapa: int, status_destino: str):
    """Registra a interacao + atualiza status do lead."""
    sb.table("interacoes").insert({
        "lead_id": lead_id,
        "tipo": "follow_up",
        "conteudo": f"Mensagem {etapa} enviada",
    }).execute()
    sb.table("leads").update({"status": status_destino}).eq("id", lead_id).execute()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--etapa", type=int, choices=[1, 2, 3], required=True,
                        help="Qual mensagem disparar (1, 2 ou 3)")
    parser.add_argument("--limite", type=int, default=20)
    parser.add_argument("--intervalo", type=int, default=1)
    parser.add_argument("--categoria", choices=["oculos", "roupa", "all"], default="all")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--cdp", action="store_true")
    args = parser.parse_args()

    if not os.path.exists(SESSION_DIR) and not args.cdp:
        print("ERRO: Sessao nao encontrada. Rode: python enviar_dm.py --login")
        return

    config = ETAPAS[args.etapa]
    mensagem = config["mensagem"]
    status_origem = config["status_origem"]
    status_destino = config["status_destino"]

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Pega leads no(s) status(es) de origem
    q = sb.table("leads").select("*").in_("status", status_origem).order("updated_at")
    if args.categoria != "all":
        q = q.eq("categoria", args.categoria)
    leads = (q.execute().data or [])[:args.limite]

    if not leads:
        print(f"Nenhum lead em {status_origem} para receber Mensagem {args.etapa}.")
        return

    print(f"\n{'='*60}")
    print(f"  MENSAGEM {args.etapa} — {len(leads)} leads")
    print(f"  Origem: {status_origem} -> Destino: {status_destino}")
    print(f"  Intervalo: {args.intervalo} min")
    print(f"{'='*60}\n")

    with sync_playwright() as p:
        if args.cdp:
            print("Conectando via CDP (porta 9222)...")
            browser_conn = p.chromium.connect_over_cdp("http://localhost:9222")
            browser = browser_conn.contexts[0] if browser_conn.contexts else browser_conn.new_context()
            pages = browser.pages
            page = next((pg for pg in pages if "instagram.com" in (pg.url or "")), None) or browser.new_page()
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

            try:
                page.url
            except:
                page = browser.new_page()

            sucesso = enviar_followup(page, username, mensagem)
            if sucesso:
                registrar_followup(sb, lead["id"], args.etapa, status_destino)
                enviados += 1
                print(f"  -> {status_destino}")
            else:
                falhas += 1

            if i < len(leads) - 1 and args.intervalo > 0:
                espera = args.intervalo * 60 + random.randint(-15, 15)
                espera = max(espera, 5)
                print(f"\n  Aguardando {espera//60}m{espera%60}s...\n")
                time.sleep(espera)

        if not args.cdp:
            browser.close()

    print(f"\n{'='*60}")
    print(f"  RESULTADO: {enviados} enviadas, {falhas} falhas")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
