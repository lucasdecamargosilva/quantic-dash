"""
Coleta perfis de lojas de oculos no TikTok via Apify (busca por keyword) e salva
no formato que o exportar_tiktok.py entende, com plataforma='tiktok'.

Reusa SEARCH_QUERIES e detectar_idioma do instagram.py.

Diferencas vs Instagram (descobertas testando o retorno do TikTok):
- A bio (signature) costuma vir vazia e NAO ha campo de link/site -> nao exigimos site.
  Guardamos como 'site' o link achado na bio (se houver) ou a URL do perfil TikTok.
- Sinais fortes de loja no TikTok: ttSeller (vendedor TikTok Shop) e commerceUser.

As funcoes buscar_detalhes / filtrar_perfis / salvar sao reutilizadas pelo
coletar_seguidores_tiktok.py (descoberta por hashtag).

Uso:
    python tiktok.py --limit 30 --min-seg 1000
    python tiktok.py --query "loja de oculos" --limit 20
    python exportar_tiktok.py
"""
import argparse
import json
import os
import re
import sys

# Nomes de loja / bios no TikTok costumam ter emoji — evita UnicodeEncodeError no console Windows
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from apify_client import ApifyClient
from config import APIFY_TOKEN, DATA_DIR, LEADS_BRUTOS_PATH, LEADS_FILTRADOS_PATH
from instagram import SEARCH_QUERIES, detectar_idioma

# Quantos usernames no maximo enviar pro profile-scraper (controla custo do Apify)
MAX_PERFIS_DETALHE = 400

_URL_RE = re.compile(r"https?://[^\s)]+", re.IGNORECASE)
_SKIP_URL = ("tiktok.com", "instagram.com", "facebook.com", "wa.me", "whatsapp",
             "t.me", "m.me", "youtube", "fonts.g", "linktr.ee")


def _extrair_site(author: dict) -> str:
    """Site do lead: URL real achada na bio (signature); senao a URL do perfil TikTok."""
    sig = author.get("signature", "") or ""
    for m in _URL_RE.findall(sig):
        url = m.rstrip(".,);")
        if not any(s in url.lower() for s in _SKIP_URL):
            return url
    return author.get("profileUrl") or (
        f"https://www.tiktok.com/@{author.get('name', '')}" if author.get("name") else ""
    )


def extrair_lead(item: dict) -> dict:
    """Extrai dados de um perfil do TikTok (item da clockworks traz authorMeta)."""
    author = item.get("authorMeta") or item
    commerce = author.get("commerceUserInfo") or {}
    is_business = bool(author.get("ttSeller") or (
        commerce.get("commerceUser") if isinstance(commerce, dict) else False
    ))
    bio = author.get("signature", "") or ""
    nome = author.get("nickName", "") or author.get("nickname", "") or ""
    site = _extrair_site(author)

    # Nao alimenta o detector com a URL do TikTok (contem ".co" e seria lido como Colombia/es)
    site_externo = site if "tiktok.com" not in site else ""

    return {
        "instagram": author.get("name", "") or "",   # handle do TikTok vai na coluna 'instagram'
        "nome_loja": nome,
        "site": site,
        "seguidores": author.get("fans", 0) or author.get("followers", 0) or 0,
        "bio": bio,
        "is_business": is_business,
        "idioma": detectar_idioma(bio, nome, site_externo),
        "plataforma": "tiktok",
        "privado": bool(author.get("privateAccount", False)),
    }


def buscar_detalhes(client: ApifyClient, usernames: list[str]) -> list[dict]:
    """Detalhes (bio, seguidores, ttSeller) de varios perfis de uma vez."""
    if not usernames:
        return []
    print(f"\n  Detalhando {len(usernames)} perfis...")
    run = client.actor("clockworks/tiktok-profile-scraper").call(run_input={
        "profiles": usernames,
        "resultsPerPage": 1,
        "shouldDownloadVideos": False,
        "shouldDownloadCovers": False,
        "shouldDownloadSubtitles": False,
    })
    if run["status"] != "SUCCEEDED":
        print(f"  ERRO: Actor terminou com status {run['status']}")
        return []
    items = list(client.dataset(run["defaultDatasetId"]).iterate_items())
    print(f"  {len(items)} perfis detalhados")
    return items


def filtrar_perfis(perfis: list[dict], categoria: str, min_seg: int) -> list[dict]:
    """Aplica os filtros de loja e devolve os leads qualificados (sem exigir site)."""
    # Keywords de loja/nicho — incluem termos de oculos pq a bio costuma vir vazia
    keywords_loja = [
        "loja", "store", "shop", "brand", "marca", "official", "oficial",
        "atendimento", "atacado", "varejo", "envio", "frete", "pedido",
        "encomend", "compre", "compra pelo", "boutique", "atelier",
        "produtos", "outlet", "showroom", "venda",
        # nicho oculos — pega nome de loja mesmo com bio vazia
        "otica", "ótica", "oticas", "óticas", "optica", "óptica",
        "oculos", "óculos", "eyewear", "glasses", "sunglasses", "lentes",
    ]
    blocklist_pessoa = [
        "blogger", "influencer", "creator", "lifestyle", "minha vida",
        "esposa de", "mãe de", "mae de", "mom of", "wife of",
        "personal trainer", "diga oi", "siga meu", "minha jornada",
        "amante de", "apaixonad", "estilista pessoal",
        # infoprodutor / conteudo — nao e loja
        "mentoria", "mentor", "ebook", "e-book", "curso", "podcast",
        "palestra", "treinamento", "consultoria", "coach",
    ]

    leads: list[dict] = []
    seen: set[str] = set()
    for item in perfis:
        lead = extrair_lead(item)
        username = lead["instagram"]
        if not username or username in seen:
            continue
        if lead["privado"]:
            continue

        nome = (lead.get("nome_loja") or "").lower()
        bio = (lead.get("bio") or "").lower()
        texto = f"{nome} {bio} {username.lower()}"

        if any(b in bio for b in blocklist_pessoa):
            continue

        # Sinal de loja: TikTok Shop/comercial OU keyword de loja/nicho no nome/bio/handle
        tem_sinal_loja = lead["is_business"] or any(k in texto for k in keywords_loja)
        if not tem_sinal_loja:
            continue

        if lead["seguidores"] < min_seg:
            continue

        lead["categoria"] = categoria
        lead.pop("privado", None)
        seen.add(username)
        leads.append(lead)
        flag = "[shop]" if lead["is_business"] else "      "
        print(f"    + {flag} @{username} - {lead['nome_loja']} ({lead['seguidores']} seg.) [{lead['idioma']}]")
    return leads


def salvar(leads: list[dict]):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(LEADS_BRUTOS_PATH, "w", encoding="utf-8") as f:
        json.dump(leads, f, ensure_ascii=False, indent=2)
    with open(LEADS_FILTRADOS_PATH, "w", encoding="utf-8") as f:
        json.dump(leads, f, ensure_ascii=False, indent=2)
    print(f"\n{len(leads)} leads TikTok salvos. Rode: python exportar_tiktok.py")


def buscar_usernames(client: ApifyClient, query: str, limit: int) -> list[str]:
    """Busca videos por keyword e coleta os usernames dos autores (unicos)."""
    print(f"  Buscando: '{query}' (limite: {limit})...")
    run = client.actor("clockworks/tiktok-scraper").call(run_input={
        "searchQueries": [query],
        "resultsPerPage": limit,
        "shouldDownloadVideos": False,
        "shouldDownloadCovers": False,
        "shouldDownloadSubtitles": False,
        "shouldDownloadSlideshowImages": False,
    })
    if run["status"] != "SUCCEEDED":
        print(f"  ERRO: Actor terminou com status {run['status']}")
        return []
    usernames: list[str] = []
    seen: set[str] = set()
    for item in client.dataset(run["defaultDatasetId"]).iterate_items():
        author = item.get("authorMeta") or {}
        name = author.get("name") or item.get("authorName") or ""
        if name and name not in seen:
            seen.add(name)
            usernames.append(name)
    print(f"  {len(usernames)} perfis encontrados")
    return usernames


def main():
    parser = argparse.ArgumentParser(description="Coleta lojas de oculos no TikTok por keyword (Apify)")
    parser.add_argument("--query", type=str, default=None, help="Query especifica para buscar")
    parser.add_argument("--limit", type=int, default=20, help="Videos por query (default: 20)")
    parser.add_argument("--min-seg", type=int, default=1000, help="Minimo de seguidores (default: 1000)")
    parser.add_argument("--categoria", type=str, default="oculos", choices=["oculos", "roupa"])
    args = parser.parse_args()

    if not APIFY_TOKEN:
        print("ERRO: APIFY_TOKEN nao definido no .env")
        return

    client = ApifyClient(APIFY_TOKEN)
    queries = [args.query] if args.query else SEARCH_QUERIES

    print(f"\nBuscando lojas de oculos no TikTok ({len(queries)} queries)\n")

    todos_usernames: list[str] = []
    seen_user: set[str] = set()
    for query in queries:
        for u in buscar_usernames(client, query, args.limit):
            if u not in seen_user:
                seen_user.add(u)
                todos_usernames.append(u)

    if len(todos_usernames) > MAX_PERFIS_DETALHE:
        print(f"\n  {len(todos_usernames)} usernames -> limitando a {MAX_PERFIS_DETALHE} (custo Apify)")
        todos_usernames = todos_usernames[:MAX_PERFIS_DETALHE]

    perfis = buscar_detalhes(client, todos_usernames)
    leads = filtrar_perfis(perfis, args.categoria, args.min_seg)
    salvar(leads)


if __name__ == "__main__":
    main()
