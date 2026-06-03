"""
Descoberta de lojas no TikTok por HASHTAG (2o metodo, equivalente store-dense ao
coletar_seguidores.py do Instagram).

Por que hashtag e nao "seguidores de marca-ancora"?
    O TikTok NAO expoe a lista de seguidores de um perfil (ao contrario do Instagram),
    entao nao da pra raspar "quem segue a marca X". A busca por hashtags de nicho
    (#oticas, #oculosdesol...) e o caminho viavel e traz mais lojas que texto livre.

Reutiliza buscar_detalhes / filtrar_perfis / salvar do tiktok.py — mesma filtragem.

Uso:
    python coletar_seguidores_tiktok.py --limit 30 --min-seg 1000
    python coletar_seguidores_tiktok.py --hashtag oticas --limit 50
    python exportar_tiktok.py
"""
import argparse
from apify_client import ApifyClient
from config import APIFY_TOKEN
from tiktok import buscar_detalhes, filtrar_perfis, salvar, MAX_PERFIS_DETALHE

# Hashtags de nicho mais densas em lojas/marcas de oculos
ANCHOR_HASHTAGS = [
    "oticas", "otica", "oculos", "oculosdesol", "oculosdegrau",
    "oculosatacado", "oticaonline", "armacoes", "eyewear", "sunglasses",
    "oculospersonalizados", "oticabrasil",
]


def buscar_usernames_hashtag(client: ApifyClient, hashtag: str, limit: int) -> list[str]:
    """Coleta usernames dos autores de videos de uma hashtag."""
    print(f"  Hashtag #{hashtag} (limite: {limit})...")
    run = client.actor("clockworks/tiktok-scraper").call(run_input={
        "hashtags": [hashtag],
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
    parser = argparse.ArgumentParser(description="Descoberta de lojas no TikTok por hashtag")
    parser.add_argument("--hashtag", type=str, default=None, help="Hashtag especifica (sem #)")
    parser.add_argument("--limit", type=int, default=30, help="Videos por hashtag (default: 30)")
    parser.add_argument("--min-seg", type=int, default=1000, help="Minimo de seguidores (default: 1000)")
    parser.add_argument("--categoria", type=str, default="oculos", choices=["oculos", "roupa"])
    args = parser.parse_args()

    if not APIFY_TOKEN:
        print("ERRO: APIFY_TOKEN nao definido no .env")
        return

    client = ApifyClient(APIFY_TOKEN)
    hashtags = [args.hashtag] if args.hashtag else ANCHOR_HASHTAGS

    print(f"\nDescobrindo lojas no TikTok por {len(hashtags)} hashtags\n")

    todos_usernames: list[str] = []
    seen_user: set[str] = set()
    for h in hashtags:
        for u in buscar_usernames_hashtag(client, h.lstrip("#"), args.limit):
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
