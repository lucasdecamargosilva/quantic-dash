"""
Coleta seguidores de marcas ancora de oculos e filtra os que parecem ser lojas/marcas.

Fluxo:
1. instaprism/instagram-followers-scraper — pega lista de usernames
2. apify/instagram-profile-scraper — detalhes (bio, site, seguidores) em lote
3. Filtra por keywords + seguidores
"""
import argparse
import json
import os
from apify_client import ApifyClient
from config import APIFY_TOKEN, DATA_DIR, LEADS_BRUTOS_PATH

ANCHOR_BRANDS = [
    "warbyparker",
    "gentlemonster",
    "oliverpeoples",
    "moscotnyc",
    "ahlemeyewear",
    "jacques_marie_mage",
    "persol",
]

KEYWORDS = [
    "eyewear", "glasses", "sunglasses", "oculos", "óculos",
    "frames", "optical", "optica", "óptica", "otica", "ótica",
    "shades", "gafas", "brille",
]


def detectar_idioma(bio: str, nome: str, site: str) -> str:
    texto = f"{bio} {nome} {site}".lower()
    if ".com.br" in site or site.endswith(".br"):
        return "pt"
    if any(x in site for x in [".eu", ".co.uk", ".de", ".fr", ".it", ".es"]):
        return "en"
    pt_words = ["oculos", "óculos", "otica", "ótica", "brasileira", "loja", "atendimento"]
    en_words = ["eyewear", "glasses", "sunglasses", "shop now", "worldwide"]
    pt_score = sum(1 for w in pt_words if w in texto)
    en_score = sum(1 for w in en_words if w in texto)
    return "pt" if pt_score >= en_score else "en"


def listar_usernames_seguidores(client: ApifyClient, anchor: str, limit: int) -> list[str]:
    """Pega usernames dos seguidores de uma marca ancora."""
    print(f"\n[1/2] Listando seguidores de @{anchor} (limite: {limit})...")
    run = client.actor("instaprism/instagram-followers-scraper").call(
        run_input={"username": anchor, "resultsLimit": limit}
    )
    if run["status"] != "SUCCEEDED":
        print(f"  ERRO: {run['status']}")
        return []
    items = list(client.dataset(run["defaultDatasetId"]).iterate_items())
    usernames = [i.get("username") for i in items if i.get("username")]
    print(f"  {len(usernames)} usernames coletados")
    return usernames


def buscar_detalhes_perfis(client: ApifyClient, usernames: list[str]) -> list[dict]:
    """Pega detalhes (bio, site, seguidores) de varios perfis de uma vez."""
    print(f"\n[2/2] Buscando detalhes de {len(usernames)} perfis...")
    run = client.actor("apify/instagram-profile-scraper").call(
        run_input={"usernames": usernames}
    )
    if run["status"] != "SUCCEEDED":
        print(f"  ERRO: {run['status']}")
        return []
    items = list(client.dataset(run["defaultDatasetId"]).iterate_items())
    print(f"  {len(items)} perfis detalhados")
    return items


def filtrar_leads(perfis: list[dict], min_seg: int, max_seg: int) -> list[dict]:
    """Filtra perfis que parecem lojas/marcas de oculos."""
    leads = []
    for p in perfis:
        username = (p.get("username") or "").lower()
        nome = (p.get("fullName") or "").lower()
        bio = (p.get("biography") or "").lower()
        seguidores_count = p.get("followersCount") or 0

        if seguidores_count < min_seg or seguidores_count > max_seg:
            continue

        texto = f"{username} {nome} {bio}"
        if not any(kw in texto for kw in KEYWORDS):
            continue

        # Site
        site = ""
        urls = p.get("externalUrls") or []
        if urls:
            site = urls[0].get("url", "")
        if not site:
            site = p.get("externalUrl", "") or ""

        if not site:
            continue
        if any(x in site.lower() for x in ["wa.me", "whatsapp", "api.whatsapp"]):
            continue

        leads.append({
            "instagram": p.get("username", ""),
            "nome_loja": p.get("fullName") or "",
            "site": site,
            "seguidores": seguidores_count,
            "bio": p.get("biography") or "",
            "is_business": p.get("isBusinessAccount", False),
            "idioma": detectar_idioma(p.get("biography") or "", p.get("fullName") or "", site),
        })
    return leads


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--anchor", type=str, default=None)
    parser.add_argument("--limit", type=int, default=200, help="Seguidores por ancora")
    parser.add_argument("--min-seg", type=int, default=1000)
    parser.add_argument("--max-seg", type=int, default=500000)
    args = parser.parse_args()

    if not APIFY_TOKEN:
        print("ERRO: APIFY_TOKEN nao definido")
        return

    client = ApifyClient(APIFY_TOKEN)
    anchors = [args.anchor] if args.anchor else ANCHOR_BRANDS

    all_leads = []
    seen = set()

    for anchor in anchors:
        try:
            usernames = listar_usernames_seguidores(client, anchor, args.limit)
            if not usernames:
                continue
            perfis = buscar_detalhes_perfis(client, usernames)
            leads = filtrar_leads(perfis, args.min_seg, args.max_seg)
            print(f"  {len(leads)} leads qualificados de @{anchor}")
            for l in leads:
                if l["instagram"] and l["instagram"] not in seen:
                    seen.add(l["instagram"])
                    all_leads.append(l)
                    print(f"    + @{l['instagram']} — {l['nome_loja']} ({l['seguidores']} seg.) [{l['idioma']}]")
        except Exception as e:
            print(f"  ERRO com @{anchor}: {e}")

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(LEADS_BRUTOS_PATH, "w", encoding="utf-8") as f:
        json.dump(all_leads, f, ensure_ascii=False, indent=2)

    print(f"\n{len(all_leads)} leads salvos em {LEADS_BRUTOS_PATH}")


if __name__ == "__main__":
    main()
