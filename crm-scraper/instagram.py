import argparse
import json
import os
from apify_client import ApifyClient
from config import APIFY_TOKEN, DATA_DIR, LEADS_BRUTOS_PATH

SEARCH_QUERIES = [
    "loja de oculos",
    "otica online",
    "oculos de sol loja",
    "eyewear brasil",
    "otica oculos grau",
    "otica armacoes",
    "sunglasses store brazil",
    "otica lentes contato",
    "oculos originais",
    "otica premium",
    "oculos grife",
    "optical store brazil",
]


def buscar_perfis(client: ApifyClient, query: str, limit: int) -> list[dict]:
    """Busca perfis de lojas no Instagram via Apify Search Scraper."""
    print(f"  Buscando: '{query}' (limite: {limit})...")

    run_input = {
        "search": query,
        "searchType": "user",
        "resultsLimit": limit,
    }

    run = client.actor("apify/instagram-search-scraper").call(run_input=run_input)

    if run["status"] != "SUCCEEDED":
        print(f"  ERRO: Actor terminou com status {run['status']}")
        return []

    items = list(client.dataset(run["defaultDatasetId"]).iterate_items())
    print(f"  {len(items)} perfis encontrados")
    return items


def detectar_idioma(bio: str, nome: str, site: str) -> str:
    """Detecta pt, en ou es."""
    texto = f"{bio} {nome} {site}".lower()

    pt_words = ["oculos", "óculos", "otica", "ótica", "optica", "óptica", "armação", "armacao",
                "brasileira", "loja", "ltda", "cnpj", "atendimento", "seg a sex",
                "whatsapp", "envio", "brasil", "lentes", "grau", "você", "voce", "comprar"]
    en_words = ["eyewear", "glasses", "sunglasses", "optical", "frames", "shop now", "free shipping",
                "customer service", "united states", "usa", "europe", "new york", "los angeles",
                "london", "paris", "made in", "worldwide"]
    es_words = ["gafas", "lentes", "óptica", "óptica", "sol", "tienda", "envío", "gratis",
                "méxico", "espana", "españa", "argentina", "colombia", "chile", "peru",
                "bienvenido", "descuento", "nuestra", "nuestras", "probar"]

    # Sites nacionais
    if ".com.br" in site or site.endswith(".br"):
        return "pt"
    if any(x in site for x in [".mx", ".ar", ".cl", ".co", ".pe", ".es"]):
        return "es"
    if any(x in site for x in [".eu", ".co.uk", ".de", ".fr", ".it"]):
        return "en"

    pt_score = sum(1 for w in pt_words if w in texto)
    en_score = sum(1 for w in en_words if w in texto)
    es_score = sum(1 for w in es_words if w in texto)

    max_score = max(pt_score, en_score, es_score)
    if max_score == 0:
        return "en"  # default internacional
    if pt_score == max_score:
        return "pt"
    if es_score == max_score:
        return "es"
    return "en"


def extrair_lead(item: dict) -> dict:
    """Extrai dados relevantes de um resultado do Apify."""
    # Pega o primeiro URL externo como site
    site = ""
    external_urls = item.get("externalUrls") or []
    if external_urls:
        site = external_urls[0].get("url", "")
    if not site:
        site = item.get("externalUrl", "")

    bio = item.get("biography", "") or ""
    nome = item.get("fullName", "") or ""
    idioma = detectar_idioma(bio, nome, site)

    return {
        "instagram": item.get("username", ""),
        "nome_loja": nome,
        "site": site,
        "seguidores": item.get("followersCount", 0) or item.get("followers", 0),
        "bio": bio,
        "is_business": item.get("isBusinessAccount", False),
        "idioma": idioma,
    }


def main():
    parser = argparse.ArgumentParser(description="Coleta perfis de lojas de oculos no Instagram via Apify")
    parser.add_argument("--query", type=str, default=None, help="Query especifica para buscar")
    parser.add_argument("--limit", type=int, default=20, help="Limite de perfis por query")
    parser.add_argument("--min-seg", type=int, default=5000, help="Minimo de seguidores (default: 5000)")
    args = parser.parse_args()

    if not APIFY_TOKEN:
        print("ERRO: APIFY_TOKEN nao definido no .env")
        return

    client = ApifyClient(APIFY_TOKEN)
    queries = [args.query] if args.query else SEARCH_QUERIES

    all_leads: list[dict] = []
    seen_usernames: set[str] = set()

    print(f"\nBuscando lojas de oculos no Instagram ({len(queries)} queries)\n")

    for query in queries:
        items = buscar_perfis(client, query, args.limit)

        for item in items:
            lead = extrair_lead(item)
            username = lead["instagram"]

            if not username or username in seen_usernames:
                continue

            site = lead["site"].strip().lower()
            if not site:
                continue
            if any(x in site for x in ["wa.me", "whatsapp", "api.whatsapp"]):
                continue

            # Oticas so se tiverem 10k+ seguidores
            nome = (lead.get("nome_loja") or "").lower()
            is_otica = any(x in nome or x in username.lower() for x in ["otica", "ótica", "optica", "óptica"])
            if is_otica and lead["seguidores"] < 10000:
                continue

            if lead["seguidores"] < args.min_seg:
                continue

            seen_usernames.add(username)
            all_leads.append(lead)
            print(f"    + @{username} — {lead['nome_loja']} ({lead['seguidores']} seg.)")

    # Salva resultado
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(LEADS_BRUTOS_PATH, "w", encoding="utf-8") as f:
        json.dump(all_leads, f, ensure_ascii=False, indent=2)

    print(f"\n{len(all_leads)} leads brutos salvos em {LEADS_BRUTOS_PATH}")


if __name__ == "__main__":
    main()
