"""
Envia SÓ os disparos que o Lucas aprovou na Fila de Aprovação.

Pega `disparos_pendentes` com status='aprovado', dispara (Instagram DM via Playwright;
WhatsApp via Uazapi), marca 'enviado' e avança o lead na cadência. Nada aqui decide
conteúdo — isso já foi aprovado na tela.

USO:
  python enviar_aprovados.py                 # envia os aprovados
  python enviar_aprovados.py --limite 10 --intervalo 2
  python enviar_aprovados.py --cdp           # usa Chrome aberto (porta 9222)
  python enviar_aprovados.py --dry-run
"""

import argparse
import os
import time
import random

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
from enviar_dm import enviar_dm, SESSION_DIR
from enviar_follow_up import _exec_retry


def _marcar(sb, disp, status, erro=None):
    upd = {"status": status}
    if status == "enviado":
        from datetime import datetime, timezone
        upd["enviado_at"] = datetime.now(timezone.utc).isoformat()
    if erro:
        upd["erro"] = str(erro)[:300]
    _exec_retry(lambda: sb.table("disparos_pendentes").update(upd).eq("id", disp["id"]).execute())


def _avancar_lead(sb, disp):
    if disp.get("proximo_status") and disp.get("lead_id"):
        _exec_retry(lambda: sb.table("leads").update({"status": disp["proximo_status"]}).eq("id", disp["lead_id"]).execute())
    _exec_retry(lambda: sb.table("interacoes").insert({
        "lead_id": disp["lead_id"],
        "tipo": "follow_up",
        "conteudo": disp.get("motivo") or disp.get("tipo") or "disparo aprovado",
    }).execute())


def _enviar_whatsapp(disp):
    """Best-effort WhatsApp via Uazapi (reaproveita enviar_whats se existir)."""
    try:
        from enviar_whats import enviar_uazapi
    except Exception:
        return False, "canal whatsapp ainda não ligado (enviar_uazapi indisponível)"
    try:
        ok, erro = enviar_uazapi(disp["destino"], disp["texto"])  # enviar_uazapi retorna (bool, str)
        return ok, (None if ok else (erro or "uazapi retornou falha"))
    except Exception as e:
        return False, str(e)


def main():
    ap = argparse.ArgumentParser(description="Envia os disparos aprovados na fila.")
    ap.add_argument("--limite", type=int, default=20)
    ap.add_argument("--intervalo", type=int, default=2, help="Minutos entre envios de IG")
    ap.add_argument("--cdp", action="store_true")
    ap.add_argument("--headless", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERRO: SUPABASE_URL/SUPABASE_KEY não definidos no .env")
        return
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    res = (
        sb.table("disparos_pendentes")
        .select("*")
        .eq("status", "aprovado")
        .order("decidido_at")
        .limit(args.limite)
        .execute()
    )
    aprovados = res.data or []
    ig_lista = [d for d in aprovados if (d.get("canal") or "instagram") == "instagram"]
    wa_lista = [d for d in aprovados if d.get("canal") == "whatsapp"]
    print(f"{len(aprovados)} aprovados: {len(ig_lista)} Instagram, {len(wa_lista)} WhatsApp\n")

    if args.dry_run:
        for d in aprovados:
            print(f"  [{d.get('canal')}] {d.get('destino')} → {d.get('motivo')}: {(d.get('texto') or '')[:50]}…")
        return

    # WhatsApp primeiro (não precisa de browser)
    for d in wa_lista:
        ok, erro = _enviar_whatsapp(d)
        if ok:
            _marcar(sb, d, "enviado"); _avancar_lead(sb, d)
            print(f"  ✓ WhatsApp {d.get('destino')}")
        else:
            _marcar(sb, d, "falhou", erro)
            print(f"  ✗ WhatsApp {d.get('destino')}: {erro}")

    # Instagram via Playwright
    if ig_lista:
        if not os.path.exists(SESSION_DIR) and not args.cdp:
            print("ERRO: Sessão IG não encontrada. Rode antes: python enviar_dm.py --login")
        else:
            with sync_playwright() as p:
                if args.cdp:
                    conn = p.chromium.connect_over_cdp("http://localhost:9222")
                    browser = conn.contexts[0] if conn.contexts else conn.new_context()
                    page = next((pg for pg in browser.pages if "instagram.com" in (pg.url or "")), None) or browser.new_page()
                else:
                    browser = p.chromium.launch_persistent_context(
                        SESSION_DIR, headless=args.headless, viewport={"width": 1280, "height": 800},
                        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    )
                    page = browser.pages[0] if browser.pages else browser.new_page()

                for i, d in enumerate(ig_lista, 1):
                    user = (d.get("instagram") or (d.get("destino") or "").lstrip("@")).strip()
                    print(f"[{i}/{len(ig_lista)}] @{user} — {d.get('motivo')}")
                    try:
                        _ = page.url
                    except Exception:
                        page = browser.new_page()
                    try:
                        ok = enviar_dm(page, user, d["texto"])
                    except Exception as e:
                        ok = False; erro = str(e)
                    if ok:
                        _marcar(sb, d, "enviado"); _avancar_lead(sb, d)
                        print(f"           ✓ enviado, lead → {d.get('proximo_status')}")
                    else:
                        _marcar(sb, d, "falhou", "envio IG falhou")
                        print("           ✗ falhou")
                    if i < len(ig_lista) and args.intervalo > 0:
                        esp = max(args.intervalo * 60 + random.randint(-15, 15), 5)
                        print(f"           aguardando {esp//60}m{esp%60}s...\n")
                        time.sleep(esp)

                if not args.cdp:
                    browser.close()

    print("\nConcluído.")


if __name__ == "__main__":
    main()
