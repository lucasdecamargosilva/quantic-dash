"""
GERADOR DE ISCA — pra cada lead com site (ex.: os da demo 'demo_provador'), entra no
site, pega até 3 produtos, gera as provas no provador (modelo usando o produto) e
ENFILEIRA como 1ª mensagem (com as fotos) na Fila de Aprovação.

É a isca comercial: "peguei produtos da sua loja e testei no provador, olha como fica".
Nada é enviado sem o OK do Lucas — cai na tela /aprovacao.html com as fotos.

Usa o photo-maker (Next.js) rodando localmente:
  - POST {PHOTO_MAKER}/api/scrape  {url}                → imagens de produto (base64)
  - POST {PHOTO_MAKER}/api/tryon   formData(product, targetShotId=model) → modelo usando

As fotos geradas vão como DATA URL no campo `fotos` (a tela mostra direto; sem bucket).

⚠️ Roda na sua máquina, com o photo-maker no ar (npm run start:all → :3001) e a chave
   Gemini configurada nele. Ajuste PHOTO_MAKER se necessário. Teste com --limite 1 antes.

USO:
  python gerar_isca.py --fonte demo_provador --limite 1 --dry-run
  python gerar_isca.py --fonte demo_provador --limite 5
  python gerar_isca.py --lead-id <uuid>
"""
import argparse
import os
import io
import base64

try:
    import certifi
    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
except ImportError:
    pass
try:
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass

import requests
from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY

PHOTO_MAKER = os.getenv("PHOTO_MAKER_URL", "http://localhost:3001")
MAX_PRODUTOS = 3

PITCH = (
    "Oi! Tudo bem? 😊\n\n"
    "Fiz um teste rápido: peguei alguns produtos da loja de vocês e gerei no nosso "
    "provador virtual pra você ver como fica num modelo. Olha só 👇\n\n"
    "Se curtir, esse mesmo provador entra no site de vocês — o cliente experimenta pela "
    "câmera antes de comprar (nossas lojas veem até 13% mais conversão). Posso te mostrar como funciona?"
)


def scrape_produtos(site):
    url = site if site.startswith("http") else "https://" + site
    r = requests.post(f"{PHOTO_MAKER}/api/scrape", json={"url": url}, timeout=90)
    r.raise_for_status()
    imgs = r.json().get("images") or []
    # dedup por bytes, pega os maiores (produto principal costuma ser maior)
    imgs = [i for i in imgs if i.get("base64")]
    imgs.sort(key=lambda i: i.get("bytes", 0), reverse=True)
    return imgs[:MAX_PRODUTOS]


def gerar_tryon(prod_b64, mime):
    """Gera 1 imagem 'modelo usando o produto'. Retorna data URL ou None."""
    img_bytes = base64.b64decode(prod_b64)
    files = {"product": ("produto.jpg", io.BytesIO(img_bytes), mime or "image/jpeg")}
    data = {"targetShotId": "model", "aspectRatio": "9:16"}  # usa o shot 'model' (DEFAULT_SHOTS)
    r = requests.post(f"{PHOTO_MAKER}/api/tryon", files=files, data=data, timeout=180)
    r.raise_for_status()
    res = r.json().get("results") or []
    if not res:
        return None
    first = res[0]
    b64 = first.get("base64") or first.get("image") or (first.get("dataUrl", "").split(",")[-1] if first.get("dataUrl") else "")
    if not b64:
        return None
    return "data:image/jpeg;base64," + b64


def ja_na_fila(sb, lead_id):
    r = sb.table("disparos_pendentes").select("id").eq("lead_id", lead_id).in_("status", ["pendente", "aprovado"]).limit(1).execute()
    return bool(r.data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fonte", default="demo_provador", help="fonte_oportunidade dos leads-alvo")
    ap.add_argument("--lead-id", help="gera isca só pra 1 lead (uuid)")
    ap.add_argument("--limite", type=int, default=5)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    q = sb.table("leads").select("*").not_.is_("site", "null").eq("status", "novo")
    if args.lead_id:
        q = sb.table("leads").select("*").eq("id", args.lead_id)
    else:
        q = q.eq("fonte_oportunidade", args.fonte)
    leads = (q.limit(args.limite).execute().data) or []
    print(f"{len(leads)} leads-alvo pra isca (fonte={args.fonte})\n")

    feitos = 0
    for lead in leads:
        site = lead.get("site")
        if not site:
            continue
        if ja_na_fila(sb, lead["id"]):
            print(f"⏭  {site} já tem disparo na fila")
            continue
        print(f"→ {site}")
        try:
            produtos = scrape_produtos(site)
        except Exception as e:
            print(f"   ✗ scrape falhou: {str(e)[:70]}")
            continue
        if not produtos:
            print("   ✗ nenhum produto encontrado no site")
            continue
        print(f"   {len(produtos)} produto(s) — gerando provas...")
        fotos = []
        for p in produtos:
            try:
                du = gerar_tryon(p["base64"], p.get("mimeType"))
                if du:
                    fotos.append(du)
            except Exception as e:
                print(f"     (tryon falhou num produto: {str(e)[:50]})")
        if not fotos:
            print("   ✗ não gerou nenhuma prova")
            continue
        print(f"   ✓ {len(fotos)} prova(s) gerada(s)")
        if args.dry_run:
            feitos += 1
            continue
        canal = "instagram" if (lead.get("instagram") and "." not in lead["instagram"]) else "whatsapp"
        destino = ("@" + lead["instagram"]) if canal == "instagram" else (lead.get("whatsapp") or lead.get("telefone"))
        row = {
            "lead_id": lead["id"], "instagram": lead.get("instagram"),
            "nome_loja": lead.get("nome_loja") or site, "canal": canal, "destino": destino,
            "tipo": "isca", "motivo": f"Isca gerada de {site} ({len(fotos)} provas)",
            "texto": PITCH, "fotos": fotos, "status_lead_atual": lead["status"],
            "proximo_status": "fotos_enviadas", "status": "pendente", "criado_por": "agente-isca",
        }
        try:
            sb.table("disparos_pendentes").insert(row).execute()
            feitos += 1
            print("   ✓ isca na fila de aprovação")
        except Exception as e:
            print(f"   ✗ não enfileirou: {str(e)[:60]}")

    print(f"\n{'(dry-run) ' if args.dry_run else ''}{feitos} isca(s) preparada(s).")
    if not args.dry_run and feitos:
        print("Aprove em /aprovacao.html")


if __name__ == "__main__":
    main()
