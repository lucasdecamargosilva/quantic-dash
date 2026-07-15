"""
LEITOR do Instagram — lê a inbox, entende o ponto de quem RESPONDEU e enfileira o
rascunho da resposta na Fila de Aprovação (nada é enviado sem o OK do Lucas).

Fluxo: lê a inbox (como o importar_conversas.py) → pra cada lead que respondeu, roda
o classificador (classificar_conversa.py, Gemini) → atualiza a etapa no CRM → se a ação
for responder/mandar_isca/reativar e houver rascunho, insere em `disparos_pendentes`.

⚠️ Roda na máquina do Lucas (precisa Playwright + sessão IG salva pelo enviar_dm.py --login).
   Precisa de GEMINI_API_KEY no .env pra o cérebro ser esperto (senão cai nas regras).

USO:
  python leitor_instagram.py --dry-run     # lê e mostra o que faria (não grava)
  python leitor_instagram.py               # atualiza CRM + enfileira rascunhos
"""
import argparse
import os
import time

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

from playwright.sync_api import sync_playwright
from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY
from classificar_conversa import classificar

SESSION_DIR = os.path.join(os.path.dirname(__file__), "instagram_session")
MINHA_MSG_PREFIXES = ["você:", "voce:", "you:", "você enviou", "voce enviou", "you sent",
                      "você curtiu", "voce curtiu", "you liked"]
ACOES_QUE_ENFILEIRAM = ("mandar_isca", "responder", "reativar")

READ_CARDS_JS = """
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
SCROLL_JS = """
() => {
    const cs = document.querySelectorAll('div'); let t = null, mh = 0;
    for (const c of cs) {
        if (c.scrollHeight > c.clientHeight + 50 && c.clientHeight > 300 && c.clientHeight < 1000 && c.scrollHeight > mh) { mh = c.scrollHeight; t = c; }
    }
    if (t) { const b = t.scrollTop; t.scrollBy(0, 600); return { scrolled: t.scrollTop !== b }; }
    return { scrolled: false };
}
"""


def _respondeu(preview):
    p = (preview or "").strip().lower()
    for pref in MINHA_MSG_PREFIXES:
        if p.startswith(pref) or pref in p[:30]:
            return False, p
    return True, p


def _ja_na_fila(sb, lead_id):
    r = sb.table("disparos_pendentes").select("id").eq("lead_id", lead_id).in_("status", ["pendente", "aprovado"]).limit(1).execute()
    return bool(r.data)


def _enfileirar(sb, lead, r, texto_lead):
    row = {
        "lead_id": lead["id"], "instagram": lead.get("instagram"),
        "nome_loja": lead.get("nome_loja") or lead.get("instagram"),
        "canal": "instagram", "destino": "@" + (lead.get("instagram") or ""),
        "tipo": "resposta", "motivo": f"Leitor: lead {r['ponto']} — \"{texto_lead[:50]}\"",
        "texto": r.get("rascunho") or "", "status_lead_atual": lead["status"],
        "proximo_status": r.get("status_crm"), "status": "pendente", "criado_por": "leitor-ig",
    }
    sb.table("disparos_pendentes").insert(row).execute()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--headless", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not os.path.exists(SESSION_DIR):
        print("ERRO: Sessão IG não encontrada. Rode antes: python enviar_dm.py --login")
        return
    if not os.getenv("GEMINI_API_KEY"):
        print("AVISO: GEMINI_API_KEY não setada — o cérebro vai rodar no modo REGRAS (menos esperto).")
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    with sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(
            SESSION_DIR, headless=args.headless, viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        page = browser.pages[0] if browser.pages else browser.new_page()
        try:
            page.goto("https://www.instagram.com/direct/inbox/", timeout=20000)
            time.sleep(6)
        except Exception as e:
            print(f"ERRO ao carregar inbox: {e}"); browser.close(); return
        try:
            nb = page.locator("button:has-text('Agora não'), button:has-text('Not Now')")
            if nb.count() > 0:
                nb.first.click(); time.sleep(1)
        except Exception:
            pass

        print("Lendo inbox...")
        cards = {}
        for it in range(40):
            for c in page.evaluate(READ_CARDS_JS):
                if c["name"] and c["name"] not in cards:
                    cards[c["name"]] = c["preview"]
            sr = page.evaluate(SCROLL_JS)
            if not sr or not sr.get("scrolled"):
                break
            time.sleep(1.5)
        browser.close()

    print(f"{len(cards)} chats na inbox.\n")
    atual = enfileirados = pulados = 0
    for nome, preview in cards.items():
        nome = (nome or "").strip()
        if not nome:
            continue
        respondeu, texto_lead = _respondeu(preview)
        if not respondeu:
            continue  # não respondeu → a cadência (preparar_fila) cuida do follow-up
        ex = sb.table("leads").select("*").ilike("nome_loja", f"%{nome[:30]}%").execute().data
        if not ex:
            pulados += 1
            continue
        lead = ex[0]
        r = classificar([{"de": "lead", "texto": texto_lead}], lead)
        print(f"[{lead.get('instagram')}] respondeu: \"{texto_lead[:45]}\" → {r['ponto']} / {r['proxima_acao']} [{r['fonte']}]")
        if args.dry_run:
            if r["proxima_acao"] in ACOES_QUE_ENFILEIRAM:
                print(f"    enfileiraria: {(r.get('rascunho') or '')[:70]}")
            continue
        # atualiza a etapa do lead
        if r.get("status_crm") and r["status_crm"] != lead["status"]:
            try:
                sb.table("leads").update({"status": r["status_crm"]}).eq("id", lead["id"]).execute()
                atual += 1
            except Exception as e:
                print(f"    (falha update status: {str(e)[:50]})")
        # enfileira o rascunho, se a ação pede resposta e não há disparo aberto pro lead
        if r["proxima_acao"] in ACOES_QUE_ENFILEIRAM and r.get("rascunho"):
            if _ja_na_fila(sb, lead["id"]):
                continue
            try:
                _enfileirar(sb, lead, r, texto_lead)
                enfileirados += 1
                print(f"    ✓ rascunho na fila de aprovação")
            except Exception as e:
                print(f"    (não enfileirou: {str(e)[:60]})")

    print(f"\n=== Leitor IG ===\nEtapas atualizadas: {atual} | Rascunhos enfileirados: {enfileirados} | Sem match no CRM: {pulados}")
    if not args.dry_run and enfileirados:
        print("Aprove em /aprovacao.html")


if __name__ == "__main__":
    main()
