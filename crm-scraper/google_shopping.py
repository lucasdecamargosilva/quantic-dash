"""
Coleta leads via Google Shopping:
1. Busca queries de oculos no Google Shopping
2. Pega merchants (lojas) unicos
3. Busca cada merchant no Instagram
4. Filtra e salva
"""
import argparse
import json
import os
from apify_client import ApifyClient
from config import APIFY_TOKEN, DATA_DIR, LEADS_BRUTOS_PATH

SHOPPING_QUERIES_PT = [
    "oculos de sol",
    "oculos de grau",
    "oculos polarizado",
]

SHOPPING_QUERIES_EN = [
    "sunglasses",
    "eyewear",
    "eyeglasses",
]

SHOPPING_QUERIES_ES = [
    "gafas de sol",
    "lentes de sol",
    "anteojos",
]

# Merchants genericos para ignorar (marketplaces)
BLOCKED_MERCHANTS = [
    "amazon", "ebay", "mercado livre", "mercadolivre", "magalu",
    "magazine luiza", "americanas", "submarino", "shoppe", "shopee",
    "aliexpress", "wish", "shein", "dafiti", "walmart", "target",
    "costco", "best buy", "ray-ban", "oakley", "persol",  # marcas grandes conhecidas
]

KEYWORDS = [
    "eyewear", "glasses", "sunglasses", "oculos", "óculos",
    "frames", "optical", "optica", "óptica", "gafas", "lentes",
]


def detectar_idioma(bio: str, nome: str, site: str) -> str:
    texto = f"{bio} {nome} {site}".lower()
    if ".com.br" in site or site.endswith(".br"):
        return "pt"
    if any(x in site for x in [".mx", ".ar", ".cl", ".co", ".pe", ".es"]):
        return "es"
    if any(x in site for x in [".eu", ".co.uk", ".de", ".fr", ".it"]):
        return "en"
    pt_words = ["oculos", "otica", "brasileira", "loja", "atendimento"]
    en_words = ["eyewear", "glasses", "sunglasses", "shop now", "worldwide"]
    es_words = ["gafas", "lentes", "tienda", "mexico", "espana", "envío"]
    pt = sum(1 for w in pt_words if w in texto)
    en = sum(1 for w in en_words if w in texto)
    es = sum(1 for w in es_words if w in texto)
    mx = max(pt, en, es)
    if mx == 0:
        return "en"
    if pt == mx: return "pt"
    if es == mx: return "es"
    return "en"


def buscar_google_shopping(client: ApifyClient, queries: list[str], country: str, limit: int) -> list[str]:
    """Busca produtos no Google Shopping e retorna merchants unicos."""
    merchants = set()
    for query in queries:
        print(f"\n  Google Shopping [{country}]: '{query}' (limite: {limit})")
        try:
            run = client.actor("crawlerbros/google-shopping-insights").call(
                run_input={
                    "queries": [query],
                    "maxResultsPerQuery": limit,
                    "countryCode": country,
                    "languageCode": country,
                }
            )
            if run["status"] != "SUCCEEDED":
                print(f"    ERRO: {run['status']}")
                continue
            items = list(client.dataset(run["defaultDatasetId"]).iterate_items())
            print(f"    {len(items)} produtos")
            for item in items:
                m = (item.get("merchant") or "").strip()
                if m and not any(b in m.lower() for b in BLOCKED_MERCHANTS):
                    merchants.add(m)
        except Exception as e:
            print(f"    ERRO: {e}")

    print(f"\n  Merchants unicos: {len(merchants)}")
    return list(merchants)


def buscar_no_instagram(client: ApifyClient, termo: str) -> list[dict]:
    """Busca um termo no Instagram e retorna perfis."""
    try:
        run = client.actor("apify/instagram-search-scraper").call(
            run_input={"search": termo, "searchType": "user", "resultsLimit": 5}
        )
        if run["status"] != "SUCCEEDED":
            return []
        return list(client.dataset(run["defaultDatasetId"]).iterate_items())
    except Exception as e:
        print(f"    ERRO ao buscar '{termo}' no IG: {e}")
        return []


def extrair_lead(item: dict) -> dict | None:
    username = item.get("username", "")
    nome = (item.get("fullName") or "").lower()
    bio = (item.get("biography") or "").lower()
    seguidores = item.get("followersCount", 0) or 0

    if seguidores < 1000:
        return None

    texto = f"{username} {nome} {bio}"
    if not any(kw in texto for kw in KEYWORDS):
        return None

    urls = item.get("externalUrls") or []
    site = urls[0].get("url", "") if urls else (item.get("externalUrl") or "")
    if not site:
        return None
    if any(x in site.lower() for x in ["wa.me", "whatsapp", "api.whatsapp"]):
        return None

    return {
        "instagram": username,
        "nome_loja": item.get("fullName") or "",
        "site": site,
        "seguidores": seguidores,
        "bio": item.get("biography") or "",
        "is_business": item.get("isBusinessAccount", False),
        "idioma": detectar_idioma(item.get("biography") or "", item.get("fullName") or "", site),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--country", choices=["br", "us", "es", "all"], default="all")
    parser.add_argument("--limit", type=int, default=30, help="Produtos por query no Google Shopping")
    args = parser.parse_args()

    if not APIFY_TOKEN:
        print("ERRO: APIFY_TOKEN nao definido")
        return

    client = ApifyClient(APIFY_TOKEN)

    configs = []
    if args.country in ("br", "all"):
        configs.append(("br", SHOPPING_QUERIES_PT))
    if args.country in ("us", "all"):
        configs.append(("us", SHOPPING_QUERIES_EN))
    if args.country in ("es", "all"):
        configs.append(("es", SHOPPING_QUERIES_ES))

    merchants = set()
    for country, queries in configs:
        ms = buscar_google_shopping(client, queries, country, args.limit)
        merchants.update(ms)

    print(f"\n=== {len(merchants)} merchants unicos totais ===")
    for m in sorted(merchants):
        print(f"  - {m}")

    print(f"\n=== Buscando no Instagram ===")
    all_leads = []
    seen = set()

    for merchant in sorted(merchants):
        print(f"\n  @ Buscando '{merchant}'...")
        items = buscar_no_instagram(client, merchant)
        for item in items:
            lead = extrair_lead(item)
            if lead and lead["instagram"] and lead["instagram"] not in seen:
                seen.add(lead["instagram"])
                all_leads.append(lead)
                print(f"    + @{lead['instagram']} — {lead['nome_loja']} ({lead['seguidores']} seg.) [{lead['idioma']}]")

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(LEADS_BRUTOS_PATH, "w", encoding="utf-8") as f:
        json.dump(all_leads, f, ensure_ascii=False, indent=2)

    print(f"\n{len(all_leads)} leads salvos em {LEADS_BRUTOS_PATH}")


if __name__ == "__main__":
    main()
