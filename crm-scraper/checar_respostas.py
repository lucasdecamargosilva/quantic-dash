"""
READ-ONLY: para os leads em dm_enviada / mensagem_1 / mensagem_2,
identifica quem respondeu e quem nao no Instagram. NAO altera o banco.

Le a inbox (nome + preview da ultima msg), rola agressivamente,
e cruza com os leads por nome_loja/instagram normalizado.
"""
import os, sys, time, re, json, datetime, truststore
truststore.inject_into_ssl()
sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright
from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY

SESSION_DIR = os.path.join(os.path.dirname(__file__), "instagram_session")
ESTAGIOS = ["dm_enviada", "mensagem_1", "mensagem_2"]

MINHA_MSG_PREFIXES = [
    "você:", "voce:", "you:", "vc:",
    "você enviou", "voce enviou", "you sent",
    "você curtiu", "voce curtiu", "you liked",
    "você reagiu", "voce reagiu",
]


def norm(s):
    s = (s or "").lower().strip()
    for a, b in [("áàâã","a"),("éê","e"),("í","i"),("óôõ","o"),("ú","u"),("ç","c")]:
        for ch in a:
            s = s.replace(ch, b)
    return re.sub(r"[^a-z0-9]", "", s)


CACHE_PATH = os.path.join(os.path.dirname(__file__), "data", "inbox_cache.json")


def main():
    use_cache = "--cache" in sys.argv
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    leads = sb.table("leads").select("id,instagram,nome_loja,status").in_("status", ESTAGIOS).limit(3000).execute().data or []
    print(f"Leads nos 3 estagios: {len(leads)}")
    from collections import Counter
    print("  " + "  ".join(f"{s}={n}" for s, n in Counter(l['status'] for l in leads).items()))

    # Dedupe leads por instagram (DB tem duplicatas)
    unique_leads = {}
    for l in leads:
        unique_leads.setdefault(l["instagram"], l)
    print(f"Leads unicos (dedupe por @): {len(unique_leads)}")

    # === Carrega inbox: cache ou scroll ===
    if use_cache and os.path.exists(CACHE_PATH):
        with open(CACHE_PATH, encoding="utf-8") as f:
            all_cards = json.load(f)
        print(f"\n[cache] {len(all_cards)} chats carregados de {CACHE_PATH}\n")
        return classificar(all_cards, unique_leads, sb)

    if not os.path.exists(SESSION_DIR):
        print("ERRO: Sessao nao encontrada"); return

    with sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(
            SESSION_DIR, headless=True,
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        page = browser.pages[0] if browser.pages else browser.new_page()
        try:
            page.goto("https://www.instagram.com/direct/inbox/", timeout=30000)
            time.sleep(6)
        except Exception as e:
            print(f"ERRO ao carregar inbox: {e}"); browser.close(); return
        try:
            nb = page.locator("button:has-text('Agora não'), button:has-text('Not Now')")
            if nb.count() > 0:
                nb.first.click(); time.sleep(1)
        except Exception:
            pass

        read_cards_js = """
            () => {
                const imgs = document.querySelectorAll('img');
                const results = [];
                for (const img of imgs) {
                    const alt = (img.alt || '').toLowerCase();
                    if (!alt.includes('foto') && !alt.includes('profile') && !alt.includes('picture')) continue;
                    let el = img;
                    for (let i = 0; i < 8; i++) {
                        el = el.parentElement;
                        if (!el) break;
                        const text = el.innerText || '';
                        const lines = text.split('\\n').filter(s => s.trim());
                        const rect = el.getBoundingClientRect();
                        if (lines.length >= 2 && rect.width > 150 && rect.width < 500) {
                            results.push({ name: lines[0], preview: lines.slice(1, 3).join(' ') });
                            break;
                        }
                    }
                }
                return results;
            }
        """
        scroll_js = """
            () => {
                const containers = document.querySelectorAll('div');
                let target = null, maxHeight = 0;
                for (const c of containers) {
                    if (c.scrollHeight > c.clientHeight + 50 && c.clientHeight > 300 && c.clientHeight < 1000) {
                        if (c.scrollHeight > maxHeight) { maxHeight = c.scrollHeight; target = c; }
                    }
                }
                if (target) {
                    const before = target.scrollTop;
                    target.scrollBy(0, 800);
                    return { scrolled: target.scrollTop !== before };
                }
                return { scrolled: false };
            }
        """

        print("Lendo inbox (scroll agressivo)...")
        all_cards = {}
        stalls = 0
        for iteration in range(200):
            for c in page.evaluate(read_cards_js):
                if c["name"] and c["name"] not in all_cards:
                    all_cards[c["name"]] = c["preview"]
            sr = page.evaluate(scroll_js)
            if not sr or not sr.get("scrolled"):
                stalls += 1
                time.sleep(2.5)  # da tempo do lazy-load
                if stalls >= 4:
                    print(f"  fim apos {iteration+1} iters (total {len(all_cards)} chats)")
                    break
            else:
                stalls = 0
                if iteration % 10 == 0:
                    print(f"  iter {iteration+1}: {len(all_cards)} chats")
                time.sleep(1.2)
        browser.close()

    print(f"\n{len(all_cards)} chats lidos na inbox")
    # Salva cache cru pra re-match offline
    os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(all_cards, f, ensure_ascii=False, indent=2)
    print(f"[cache] inbox salva em {CACHE_PATH}\n")

    return classificar(all_cards, unique_leads, sb)


def classificar(all_cards, unique_leads, sb):
    """Match 1:1 ESTRITO. Cada lead classificado uma vez. Ambiguo -> nao_localizado."""
    # Pre-computa cards normalizados + flag de quem mandou por ultimo
    cards = []
    for nome, preview in all_cards.items():
        pv = (preview or "").strip().lower()
        eu_mandei = any(pv.startswith(pref) or pref in pv[:30] for pref in MINHA_MSG_PREFIXES)
        cards.append({"norm": norm(nome), "name": nome, "eu_mandei": eu_mandei})

    resultado = {s: {"responderam": [], "nao_responderam": [], "nao_localizado": [], "ambiguo": []} for s in ESTAGIOS}

    for inst, lead in unique_leads.items():
        keys = [k for k in [norm(inst), norm(lead.get("nome_loja"))] if k and len(k) >= 4]

        # 1) match exato (prioriza handle, depois nome_loja)
        matches = []
        for k in keys:
            matches = [c for c in cards if c["norm"] == k]
            if matches:
                break
        # 2) match parcial forte: so se UNICO e key longa (>=6)
        if not matches:
            for k in keys:
                if len(k) < 6:
                    continue
                cand = [c for c in cards if (k in c["norm"] or c["norm"] in k)]
                if len(cand) == 1:
                    matches = cand
                    break

        if not matches:
            resultado[lead["status"]]["nao_localizado"].append(inst)
            continue

        # Se os matches divergem (uns responderam, outros nao) -> ambiguo
        flags = set(c["eu_mandei"] for c in matches)
        if len(flags) > 1:
            resultado[lead["status"]]["ambiguo"].append(inst)
        elif True in flags:
            resultado[lead["status"]]["nao_responderam"].append(inst)
        else:
            resultado[lead["status"]]["responderam"].append(inst)

    # Salva JSON
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    path = f"crm-scraper/data/respostas_{ts}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)

    LABEL = {"dm_enviada": "DM Enviada", "mensagem_1": "Mensagem 1", "mensagem_2": "Mensagem 2"}
    for s in ESTAGIOS:
        r = resultado[s]
        tot = sum(len(r[b]) for b in r)
        print("=" * 60)
        print(f"PIPELINE: {LABEL[s]}  (total unico={tot})")
        print("=" * 60)
        print(f"  RESPONDERAM ({len(r['responderam'])}):")
        print("    " + (" ".join("@"+u for u in sorted(r['responderam'])) or "(nenhum)"))
        print(f"  NAO RESPONDERAM ({len(r['nao_responderam'])}):")
        print("    " + (" ".join("@"+u for u in sorted(r['nao_responderam'])) or "(nenhum)"))
        print(f"  NAO LOCALIZADO ({len(r['nao_localizado'])})  |  AMBIGUO ({len(r['ambiguo'])})")
        if r["ambiguo"]:
            print("    ambiguos: " + " ".join("@"+u for u in sorted(r['ambiguo'])))
        print()

    print(f"JSON salvo: {path}")


if __name__ == "__main__":
    main()
