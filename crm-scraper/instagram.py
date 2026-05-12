import argparse
import json
import os
from apify_client import ApifyClient
from config import APIFY_TOKEN, DATA_DIR, LEADS_BRUTOS_PATH, LEADS_FILTRADOS_PATH

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
    "glasses store brazil",
    "glasses loja",
    "sunglasses brasil",
    "oculos de sol masculino loja",
    "oculos de sol feminino loja",
    "otica sao paulo",
    "otica rio de janeiro",
    "otica minas gerais",
    "oculos de grau loja",
    "otica centro optico",
    "loja glasses",
    "eyeglasses brasil",
    "armacao de oculos loja",
    "otica estilo",
    "oculos streetwear",
    "oculos vintage loja",
    # Cidades específicas
    "otica curitiba", "otica porto alegre", "otica recife", "otica fortaleza",
    "otica salvador", "otica brasilia", "otica belo horizonte", "otica goiania",
    "otica florianopolis", "otica vitoria", "otica manaus", "otica natal",
    # Sub-nichos
    "oculos esportivo loja", "oculos infantil loja", "oculos polarizado loja",
    "oculos blue light loja", "oculos redondo loja", "oculos quadrado loja",
    "lentes de contato loja", "oculos titanium loja",
    # Estilos
    "oculos minimalista", "oculos premium brasil", "oculos artesanal",
    "oculos handmade brasil", "oculos brasileiro autoral",
    # Marcas pequenas / autorais
    "marca de oculos brasileira", "designer de oculos brasil",
    "oculos sustentavel loja", "oculos eco loja",
    "tendencia oculos 2025", "novidade oculos brasil",
    # Cidades médias/menores
    "otica campinas", "otica santos", "otica joinville", "otica maringa",
    "otica londrina", "otica sorocaba", "otica ribeirao preto", "otica uberlandia",
    "otica caxias do sul", "otica niteroi", "otica belem", "otica sao luis",
    "otica cuiaba", "otica campo grande",
    # Materiais
    "oculos acetato loja", "oculos metal loja", "oculos madeira loja",
    "oculos fibra de carbono",
    # Formatos / estilos específicos
    "oculos aviador loja", "oculos wayfarer loja", "oculos gatinho loja",
    "oculos oversized loja", "oculos retro loja", "oculos y2k loja",
    # Casos de uso
    "oculos para dirigir", "oculos para computador", "oculos leitura loja",
    "oculos ciclismo loja", "oculos corrida loja",
    # Termos profissionais
    "optometrista loja oculos", "consultorio otica",
    # Hashtag-style / casual terms
    "oculosdesol loja", "oculosdegrau loja", "oculosbarato",
    "oculosnovos", "oculosdescolado", "oculosfashion",
    "oculostop", "oculosestiloso",
    # Compras / delivery
    "compre oculos online", "comprar oculos brasil",
    "oculos com entrega", "oculos frete gratis",
    # Específicos por regiao/estado
    "otica nordeste", "otica sul brasil", "otica norte brasil",
    "otica interior sao paulo", "otica abc paulista",
    # Mais cidades menores
    "otica blumenau", "otica jundiai", "otica petropolis",
    "otica taubate", "otica chapeco", "otica anapolis",
    # Termos de venda
    "promocao oculos", "oferta oculos", "oculos liquidacao",
    "outlet oculos brasil",
    # Características visuais
    "oculos colorido", "oculos transparente", "oculos espelhado",
]


def buscar_perfis(client: ApifyClient, query: str, limit: int) -> list[dict]:
    """Busca perfis no Instagram via apify/instagram-scraper (search profile, pay-per-result)."""
    print(f"  Buscando: '{query}' (limite: {limit})...")

    run_input = {
        "search": query,
        "searchType": "user",
        "searchLimit": limit,
        "resultsType": "details",
        "resultsLimit": limit,
    }

    run = client.actor("apify/instagram-scraper").call(run_input=run_input)

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
    parser.add_argument("--categoria", type=str, default="oculos", choices=["oculos", "roupa"], help="Categoria do lead")
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

            nome = (lead.get("nome_loja") or "").lower()
            bio = (lead.get("bio") or "").lower()
            texto = f"{nome} {bio} {username.lower()}"

            # Bloqueia perfis pessoais / influencer / blog
            blocklist_pessoa = [
                "blogger", "influencer", "creator", "lifestyle", "minha vida",
                "esposa de", "mãe de", "mae de", "mom of", "wife of",
                "personal trainer", "diga oi", "siga meu", "minha jornada",
                "amante de", "apaixonad", "estilista pessoal",
            ]
            if any(b in bio for b in blocklist_pessoa):
                continue

            # Exige sinal de loja: is_business OU keywords de loja
            keywords_loja = [
                "loja", "store", "shop", "brand", "marca", "official", "oficial",
                "atendimento", "atacado", "varejo", "envio", "frete", "pedido",
                "encomend", "compre", "compra pelo", "boutique", "atelier",
                "moda feminina", "moda masculina", "moda fitness", "moda praia",
                "produtos", "modas", "outlet", "showroom", "venda",
            ]
            tem_sinal_loja = lead.get("is_business") or any(k in texto for k in keywords_loja)
            if not tem_sinal_loja:
                continue

            # Oticas so se tiverem 10k+ seguidores
            is_otica = any(x in nome or x in username.lower() for x in ["otica", "ótica", "optica", "óptica"])
            if is_otica and lead["seguidores"] < 10000:
                continue

            if lead["seguidores"] < args.min_seg:
                continue

            lead["categoria"] = args.categoria
            seen_usernames.add(username)
            all_leads.append(lead)
            print(f"    + @{username} — {lead['nome_loja']} ({lead['seguidores']} seg.)")

    # Salva resultado em ambos os paths (bruto + filtrado pronto para exportar)
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(LEADS_BRUTOS_PATH, "w", encoding="utf-8") as f:
        json.dump(all_leads, f, ensure_ascii=False, indent=2)
    with open(LEADS_FILTRADOS_PATH, "w", encoding="utf-8") as f:
        json.dump(all_leads, f, ensure_ascii=False, indent=2)

    print(f"\n{len(all_leads)} leads salvos. Pode rodar exportar.py direto (sem verificador).")


if __name__ == "__main__":
    main()
