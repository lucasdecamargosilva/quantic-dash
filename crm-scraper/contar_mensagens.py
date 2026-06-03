"""
READ-ONLY: abre cada conversa dos leads em mensagem_1 e conta mensagens
por remetente (borda direita = nossa; esquerda = cliente).

Classifica:
  - balde1 (2 nossas, sem resposta): nossas==2 e cliente==0
  - balde2 (mais de 3 msgs):         total >= 4
  - outros: total==3, ou 2-com-resposta, etc. (reportados a parte)

Salva progresso incremental em data/contagem_m1.json (resume se cair).
NAO envia nem altera nada.
"""
import os, sys, time, json, random, argparse, truststore
truststore.inject_into_ssl()
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright
from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY

SESSION_DIR = os.path.join(os.path.dirname(__file__), "instagram_session")


def dispensar_popup(page):
    try:
        b = page.locator("button:has-text('Agora não'), button:has-text('Not Now'), button:has-text('Not now')")
        if b.count() > 0:
            b.first.click(); time.sleep(1)
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
    page.keyboard.type(username, delay=random.randint(25, 55)); time.sleep(3.5)
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


def contar(page):
    # Scroll-up pra carregar historico
    for _ in range(5):
        page.evaluate("""() => {
            let best=null,h=0;
            for (const d of document.querySelectorAll('div')) {
                if (d.scrollHeight>d.clientHeight+40 && d.clientHeight>200 && d.scrollHeight>h){h=d.scrollHeight;best=d;}
            }
            if (best) best.scrollTop=0;
        }""")
        time.sleep(0.8)
    return page.evaluate("""() => {
        const vw = window.innerWidth;
        let nossas=[], cliente=0;
        for (const e of document.querySelectorAll('div[dir="auto"]')) {
            const t = (e.innerText||'').trim();
            if (!t) continue;
            const r = e.getBoundingClientRect();
            if (r.width < 5) continue;
            if (r.right >= vw - 60) nossas.push(t.slice(0,90)); else cliente++;
        }
        return { nossas: nossas.length, cliente, total: nossas.length+cliente, nossas_txt: nossas };
    }""")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", default="mensagem_1")
    ap.add_argument("--esperadas", type=int, default=2, help="qtd de DMs nossas esperadas nesse estagio")
    args = ap.parse_args()
    STATUS, N = args.status, args.esperadas
    PROG_PATH = os.path.join(os.path.dirname(__file__), "data", f"contagem_{STATUS}.json")

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    leads = sb.table("leads").select("instagram").eq("status", STATUS).limit(3000).execute().data or []
    usernames = sorted({l["instagram"] for l in leads if l.get("instagram")})
    print(f"Leads unicos em {STATUS}: {len(usernames)} (esperadas={N} nossas)")

    # Resume
    prog = {}
    if os.path.exists(PROG_PATH):
        with open(PROG_PATH, encoding="utf-8") as f:
            prog = json.load(f)
        print(f"[resume] {len(prog)} ja processados")

    pendentes = [u for u in usernames if u not in prog]
    print(f"Pendentes: {len(pendentes)}\n")

    if pendentes:
        with sync_playwright() as p:
            browser = p.chromium.launch_persistent_context(
                SESSION_DIR, headless=True, viewport={"width":1280,"height":900},
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            )
            page = browser.pages[0] if browser.pages else browser.new_page()
            for i, u in enumerate(pendentes, 1):
                try:
                    if not abrir_chat(page, u):
                        prog[u] = {"erro": "nao_abriu"}
                    else:
                        c = contar(page)
                        prog[u] = c
                        print(f"[{i}/{len(pendentes)}] @{u}: nossas={c['nossas']} cliente={c['cliente']} total={c['total']}")
                except Exception as e:
                    prog[u] = {"erro": str(e)[:60]}
                    print(f"[{i}/{len(pendentes)}] @{u}: ERRO {str(e)[:40]}")
                    try: page.keyboard.press("Escape")
                    except Exception: pass
                # salva incremental
                with open(PROG_PATH, "w", encoding="utf-8") as f:
                    json.dump(prog, f, ensure_ascii=False, indent=2)
                time.sleep(random.uniform(1.5, 3.0))
            browser.close()

    # Detecta quais templates nossos estao presentes
    def templates(txts):
        import unicodedata
        def nrm(s):
            s = unicodedata.normalize("NFKD", s.lower())
            return "".join(ch for ch in s if not unicodedata.combining(ch))
        joined = nrm(" || ".join(txts or []))
        tpl = set()
        if "estava olhando a loja" in joined: tpl.add("inicial")
        if "passado batido" in joined: tpl.add("M1")
        if "cacifebrand" in joined or "califabrand" in joined or "ja implementaram" in joined: tpl.add("M2")
        return tpl

    # Classifica
    b_exatas, b_mais, b_menos, b_outros, erro = [], [], [], [], []
    for u, c in prog.items():
        if "erro" in c:
            erro.append(u); continue
        n, cl, t = c["nossas"], c["cliente"], c["total"]
        tpl = templates(c.get("nossas_txt"))
        rec = {"u": u, "n": n, "cl": cl, "t": t, "tpl": sorted(tpl)}
        if n == N and cl == 0:
            b_exatas.append(rec)
        elif t >= 4:
            b_mais.append(rec)
        elif t <= 2:
            b_menos.append(rec)
        else:
            b_outros.append(rec)

    def fmt(recs):
        return " ".join("@"+r["u"] for r in sorted(recs, key=lambda x: x["u"]))

    print("\n" + "="*60)
    print(f"BALDE 1 — {N} mensagens nossas, SEM resposta ({len(b_exatas)}):")
    print("  " + fmt(b_exatas))
    print(f"\nBALDE 2 — mais de 3 mensagens ({len(b_mais)}):")
    print("  " + fmt(b_mais))
    print(f"\nBALDE 3 — menos de 3 mensagens ({len(b_menos)}):")
    for r in sorted(b_menos, key=lambda x: x["u"]):
        print(f"    @{r['u']:<28} nossas={r['n']} cliente={r['cl']} templates={r['tpl']}")
    print(f"\n--- SUBSET: so M1 e M2 (inicial ausente) ---")
    so_m1m2 = [r for r in (b_menos+b_outros) if set(r["tpl"]) == {"M1","M2"}]
    print("  " + (" ".join("@"+r["u"] for r in sorted(so_m1m2, key=lambda x: x["u"])) or "(nenhum)"))
    print(f"\n--- fora dos baldes ({len(b_outros)}) ---")
    for r in sorted(b_outros, key=lambda x: x["u"]):
        print(f"    @{r['u']} (nossas={r['n']} cliente={r['cl']} total={r['t']} templates={r['tpl']})")
    print(f"  erro/nao abriu ({len(erro)}): " + " ".join("@"+u for u in sorted(erro)))
    print(f"\nProgresso salvo em {PROG_PATH}")


if __name__ == "__main__":
    main()
