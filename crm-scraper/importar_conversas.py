"""
Importa chats da inbox do Instagram para o CRM.

Estrategia simples e confiavel:
- Le os cards da inbox (nome + preview da ultima msg)
- Se preview comeca com "Você:" / "You:" = so eu mandei = dm_enviada
- Se preview NAO comeca assim = ela respondeu = respondeu
- Nao abre cada chat individualmente (muito fragil)
"""
import argparse
import os
import time
from playwright.sync_api import sync_playwright
from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY

SESSION_DIR = os.path.join(os.path.dirname(__file__), "instagram_session")

# Prefixos que indicam minha mensagem (nao resposta)
MINHA_MSG_PREFIXES = [
    "você:", "voce:", "you:",
    "você enviou", "voce enviou", "you sent",
    "você curtiu", "voce curtiu", "you liked",
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--headless", action="store_true")
    args = parser.parse_args()

    if not os.path.exists(SESSION_DIR):
        print("ERRO: Sessao nao encontrada")
        return

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    with sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(
            SESSION_DIR, headless=args.headless,
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        page = browser.pages[0] if browser.pages else browser.new_page()

        try:
            page.goto("https://www.instagram.com/direct/inbox/", timeout=20000)
            time.sleep(6)
        except Exception as e:
            print(f"ERRO ao carregar inbox: {e}")
            browser.close()
            return

        # Dispensa popups
        try:
            nb = page.locator("button:has-text('Agora não'), button:has-text('Not Now')")
            if nb.count() > 0:
                nb.first.click()
                time.sleep(1)
        except: pass

        # Le cards em loop, rolando e acumulando
        print("Lendo e rolando inbox...")
        all_cards = {}  # nome -> preview (mantem primeiro encontrado)

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
                let target = null;
                let maxHeight = 0;
                for (const c of containers) {
                    if (c.scrollHeight > c.clientHeight + 50 && c.clientHeight > 300 && c.clientHeight < 1000) {
                        if (c.scrollHeight > maxHeight) {
                            maxHeight = c.scrollHeight;
                            target = c;
                        }
                    }
                }
                if (target) {
                    const before = target.scrollTop;
                    target.scrollBy(0, 600);
                    return { scrolled: target.scrollTop !== before, top: target.scrollTop, max: target.scrollHeight };
                }
                return { scrolled: false };
            }
        """

        for iteration in range(40):
            cards = page.evaluate(read_cards_js)
            new_count = 0
            for c in cards:
                if c["name"] and c["name"] not in all_cards:
                    all_cards[c["name"]] = c["preview"]
                    new_count += 1

            print(f"  iter {iteration+1}: +{new_count} novos (total: {len(all_cards)})")

            scroll_result = page.evaluate(scroll_js)
            if not scroll_result or not scroll_result.get("scrolled"):
                print("  chegou no fim")
                break
            time.sleep(1.5)

        time.sleep(2)

        # Converte para lista de cards
        cards_data = [{"name": n, "preview": p} for n, p in all_cards.items()]

        print(f"{len(cards_data)} chats encontrados na inbox\n")

        if not cards_data:
            print("Nenhum chat encontrado. Verifique se voce esta logado e a inbox tem mensagens.")
            browser.close()
            return

        processados = 0
        criados = 0
        atualizados = 0

        for i, card in enumerate(cards_data):
            nome = card.get("name", "").strip()
            preview = card.get("preview", "").strip().lower()

            if not nome:
                continue

            # Analisa preview: se contem "voce:" ou "you:" no inicio = dm_enviada
            # Senao = respondeu
            respondeu = True
            for prefix in MINHA_MSG_PREFIXES:
                if preview.startswith(prefix) or prefix in preview[:30]:
                    respondeu = False
                    break

            status = "respondeu" if respondeu else "dm_enviada"

            # O campo 'nome' pode ser fullName ou username — o Instagram nao mostra @ aqui
            # Nao temos o username direto. Vamos salvar como 'nome_loja' e procurar
            # pelo nome parecido no banco primeiro
            print(f"[{i+1}] {nome} — {status}")

            # Busca lead pelo nome_loja primeiro
            existing = sb.table("leads").select("*").ilike("nome_loja", f"%{nome[:30]}%").execute()

            if existing.data:
                lead = existing.data[0]
                ordem = ["descartado", "novo", "dm_enviada", "respondeu", "interessado", "fechou"]
                atual = ordem.index(lead["status"]) if lead["status"] in ordem else 0
                novo = ordem.index(status) if status in ordem else 0
                if novo > atual:
                    sb.table("leads").update({"status": status}).eq("id", lead["id"]).execute()
                    print(f"    @{lead['instagram']} — {lead['status']} -> {status}")
                    atualizados += 1
                else:
                    print(f"    @{lead['instagram']} — {lead['status']} (mantem)")
            else:
                print(f"    Nao encontrado no banco (nome nao bate com nenhum lead)")

            processados += 1

        browser.close()

    print(f"\n=== RESULTADO ===")
    print(f"Processados: {processados}")
    print(f"Atualizados: {atualizados}")
    print(f"Criados: {criados}")


if __name__ == "__main__":
    main()
