import json
import requests
from bs4 import BeautifulSoup
from config import PROVADOR_KEYWORDS, LEADS_BRUTOS_PATH, LEADS_FILTRADOS_PATH


def verificar_site(url: str) -> bool:
    """Verifica se o site ja possui provador virtual."""
    try:
        response = requests.get(url, timeout=10, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
        })
        response.raise_for_status()
        html = response.text.lower()

        # Busca keywords no HTML
        for keyword in PROVADOR_KEYWORDS:
            if keyword.lower() in html:
                return True

        # Busca tambem em scripts src (provador pode ser carregado via JS externo)
        soup = BeautifulSoup(html, "html.parser")
        for script in soup.find_all("script", src=True):
            src = script["src"].lower()
            if "provador" in src or "try-on" in src or "fitting" in src:
                return True

        return False
    except Exception as e:
        print(f"  Erro ao acessar {url}: {e}")
        return False


def main():
    with open(LEADS_BRUTOS_PATH, "r", encoding="utf-8") as f:
        leads = json.load(f)

    print(f"Verificando {len(leads)} leads...")
    resultados = []

    for i, lead in enumerate(leads, 1):
        site = lead["site"]
        tem_provador = verificar_site(site)
        lead["tem_provador"] = tem_provador
        status = "JA TEM" if tem_provador else "NAO TEM"
        print(f"  [{i}/{len(leads)}] @{lead['instagram']} — {status} provador")
        resultados.append(lead)

    # Filtra apenas os que NAO tem provador
    filtrados = [l for l in resultados if not l["tem_provador"]]

    with open(LEADS_FILTRADOS_PATH, "w", encoding="utf-8") as f:
        json.dump(filtrados, f, ensure_ascii=False, indent=2)

    print(f"\n{len(filtrados)} leads qualificados (sem provador) de {len(leads)} total")
    print(f"Salvos em {LEADS_FILTRADOS_PATH}")


if __name__ == "__main__":
    main()
