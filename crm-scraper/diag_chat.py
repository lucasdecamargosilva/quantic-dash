"""
DIAGNOSTICO: abre alguns chats e dumpa a estrutura do DOM da conversa
pra calibrar como contar mensagens (e detectar remetente).
NAO envia nada.
"""
import os, sys, time, truststore
truststore.inject_into_ssl()
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

SESSION_DIR = os.path.join(os.path.dirname(__file__), "instagram_session")

# 3 que responderam + 3 que (provavelmente) so tem nossas 2 msgs
TESTES = ["intimissimi", "oculum", "viasolbrazil", "anabellamodasitb", "atitudeeyewear", "biquinibrasil"]


def dispensar_popup(page):
    try:
        btn = page.locator("button:has-text('Agora não'), button:has-text('Not Now'), button:has-text('Not now')")
        if btn.count() > 0:
            btn.first.click(); time.sleep(1)
    except Exception:
        pass


def abrir_chat(page, username):
    if "instagram.com/direct" not in page.url:
        page.goto("https://www.instagram.com/direct/inbox/", timeout=30000)
        time.sleep(3); dispensar_popup(page)
    lapis = page.locator('svg[aria-label="Nova mensagem"], svg[aria-label="New message"]')
    if lapis.count() == 0:
        return False
    lapis.first.click(force=True); time.sleep(2); dispensar_popup(page)
    page.keyboard.type(username, delay=40); time.sleep(3.5)
    clicked = page.evaluate(f"""() => {{
        const opts = document.querySelectorAll('[role=option]');
        for (const el of opts) {{
            if ((el.innerText || '').toLowerCase().includes('{username.lower()}')) {{ el.click(); return true; }}
        }}
        if (opts.length > 0) {{ opts[0].click(); return true; }}
        return false;
    }}""")
    if not clicked:
        page.keyboard.press("Escape"); return False
    time.sleep(1.5)
    page.evaluate("""() => {
        for (const btn of document.querySelectorAll('button, [role=button]')) {
            const t = (btn.innerText || btn.textContent || '').trim();
            if (['Conversa','Chat','Próximo','Next'].includes(t) && btn.offsetParent) { btn.click(); return; }
        }
    }""")
    time.sleep(2.5); dispensar_popup(page)
    return True


def diag(page, username):
    print(f"\n{'='*55}\n@{username}\n{'='*55}")
    if not abrir_chat(page, username):
        print("  NAO ABRIU"); return
    # Scroll-up pra carregar historico (lazy-load)
    for _ in range(6):
        page.evaluate("""() => {
            let best=null, h=0;
            for (const d of document.querySelectorAll('div')) {
                if (d.scrollHeight > d.clientHeight+40 && d.clientHeight>200) {
                    if (d.scrollHeight>h){h=d.scrollHeight;best=d;}
                }
            }
            if (best) best.scrollTop = 0;
        }""")
        time.sleep(1.0)
    # Dump cada div[dir=auto]: texto + posicao X (centro) + largura da viewport
    data = page.evaluate("""() => {
        const vw = window.innerWidth;
        const els = [...document.querySelectorAll('div[dir="auto"]')];
        return { vw, items: els.map(e => {
            const r = e.getBoundingClientRect();
            // procura <img> (avatar) como irmao/ancestral proximo = mensagem recebida
            let hasAvatar = false, n = e;
            for (let i=0;i<6 && n;i++){ n=n.parentElement; if(n && n.querySelector && n.querySelector('img')){hasAvatar=true;break;} }
            return { text:(e.innerText||'').slice(0,45), left:Math.round(r.left), right:Math.round(r.right), avatar:hasAvatar };
        })};
    }""")
    vw = data["vw"]
    print(f"  viewport: {vw}  | div[dir=auto]: {len(data['items'])}")
    for it in data["items"]:
        print(f"    left={it['left']:<5} right={it['right']:<5} avatar={str(it['avatar']):<5} | {it['text']!r}")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(
            SESSION_DIR, headless=True, viewport={"width":1280,"height":900},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        page = browser.pages[0] if browser.pages else browser.new_page()
        for u in TESTES:
            try:
                diag(page, u)
            except Exception as e:
                print(f"  ERRO: {e}")
            time.sleep(2)
        browser.close()


if __name__ == "__main__":
    main()
