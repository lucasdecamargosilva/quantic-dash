import json
import requests
from bs4 import BeautifulSoup
from config import PROVADOR_KEYWORDS, LEADS_BRUTOS_PATH, LEADS_FILTRADOS_PATH

# Sinais fortes de que eh um e-commerce de verdade
ECOMMERCE_KEYWORDS = [
    # PT
    "adicionar ao carrinho", "comprar agora", "finalizar compra", "meu carrinho",
    "produtos adicionados", "ir para o checkout", "continuar comprando",
    "adicionar à sacola", "minha sacola", "calcular frete", "código promocional",
    # EN
    "add to cart", "add to bag", "shopping cart", "checkout", "buy now",
    "continue shopping", "shipping calculator", "promo code", "sold out",
    "out of stock", "in stock",
    # ES
    "agregar al carrito", "añadir al carrito", "comprar ahora", "finalizar compra",
    # Plataformas (indica CMS de e-commerce)
    "shopify", "woocommerce", "tiendanube", "nuvemshop", "magento", "vtex",
    "tray", "loja integrada", "wbuy", "bagy", "yampi", "kyte", "dooca",
    "bigcommerce", "opencart", "prestashop",
]

ECOMMERCE_SCRIPTS = [
    "shopify", "woocommerce", "tiendanube", "nuvemshop", "magento",
    "vtex", "tray", "bagy", "yampi", "dooca", "shopee", "bigcommerce",
    "stripe", "pagseguro", "mercadopago", "pagbank",
]

NON_ECOMMERCE_HOSTS = [
    "bit.ly", "tinyurl", "t.co", "tiny.cc",
    "youtube", "tiktok", "facebook.com", "twitter.com",
    "x.com", "wa.me", "whatsapp", "medium.com", "substack",
]

# Linktree-like — precisa seguir o primeiro link
LINKTREE_HOSTS = ["linktr.ee", "linktree", "beacons.ai", "lnk.bio", "bio.site", "campsite.bio"]

# TLDs nao-brasileiros que queremos rejeitar
BAD_TLDS = [".ru", ".cn", ".vn", ".ua", ".by", ".kr", ".jp", ".tw", ".ir", ".in", ".pk"]

# Palavras em portugues — se nao tiver, provavelmente nao eh BR
PT_MARKERS = [
    " e ", " de ", " do ", " da ", " para ", " com ", " em ",
    "você", "voce", "nossa", "nosso", "comprar", "frete",
    "entrega", "brasil", "produtos", "loja", "sobre nós",
    "adicionar", "carrinho", "sacola", "produto", "coleção",
]


def eh_brasileiro(html: str, url: str) -> bool:
    """Valida se o site é brasileiro (idioma PT ou domínio BR)."""
    url_low = url.lower()
    if ".com.br" in url_low or url_low.endswith(".br") or "/br" in url_low:
        return True
    # TLD ruim — nao eh BR
    for tld in BAD_TLDS:
        if tld in url_low.split("/")[2] if "://" in url_low else False:
            return False
    # Checa idioma pelo conteudo
    html_low = html.lower()
    # tag <html lang="pt-BR"> ou similar
    if 'lang="pt' in html_low or "lang='pt" in html_low:
        return True
    # presença de palavras PT
    pt_hits = sum(1 for m in PT_MARKERS if m in html_low)
    return pt_hits >= 3


def checar_ecommerce(html: str, url: str) -> tuple[bool, str]:
    """Retorna (eh_ecommerce, motivo). NAO valida idioma."""
    html_low = html.lower()

    # Plataformas de e-commerce via scripts/meta
    soup = BeautifulSoup(html, "html.parser")
    for script in soup.find_all("script", src=True):
        src = (script.get("src") or "").lower()
        for kw in ECOMMERCE_SCRIPTS:
            if kw in src:
                return (True, f"script: {kw}")
    for meta in soup.find_all("meta"):
        content = (meta.get("content") or "").lower()
        for kw in ECOMMERCE_SCRIPTS:
            if kw in content:
                return (True, f"meta: {kw}")

    # Keywords de compra
    matches = [kw for kw in ECOMMERCE_KEYWORDS if kw in html_low]
    if matches:
        return (True, f"keyword: {matches[0]}")

    # Preço + carrinho
    has_price = any(sym in html_low for sym in ["r$", "u$", "usd", "eur"])
    has_action = any(act in html_low for act in ["carrinho", "cart", "carrito", "sacola", "bag"])
    if has_price and has_action:
        return (True, "preco + carrinho")

    return (False, "sem sinal de e-commerce")


def seguir_linktree(url: str, html: str) -> str | None:
    """Se eh um Linktree, tenta encontrar o primeiro link que parece ser site."""
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.find_all("a", href=True):
        href = a.get("href", "")
        if not href.startswith("http"):
            continue
        low = href.lower()
        # Pula redes sociais e outros Linktree
        if any(x in low for x in ["instagram.com", "tiktok.com", "facebook.com", "wa.me", "whatsapp", "linktr.ee", "youtube", "twitter", "x.com"]):
            continue
        return href
    return None


def eh_ecommerce(html: str, url: str) -> tuple[bool, str]:
    """Retorna (eh_ecommerce, motivo). Inclui validacao de Brasil + Linktree."""
    url_low = url.lower()

    # Host nao ecommerce (redes sociais, encurtadores)
    for host in NON_ECOMMERCE_HOSTS:
        if host in url_low:
            return (False, f"url contem '{host}'")

    # TLD suspeito — nao eh BR
    try:
        host_only = url_low.split("/")[2] if "://" in url_low else url_low.split("/")[0]
        for tld in BAD_TLDS:
            if host_only.endswith(tld):
                return (False, f"TLD nao-BR '{tld}'")
    except:
        pass

    # Se eh Linktree, seguir primeiro link e validar ele
    for lt in LINKTREE_HOSTS:
        if lt in url_low:
            proximo = seguir_linktree(url, html)
            if not proximo:
                return (False, f"linktree sem link valido")
            try:
                r = requests.get(
                    proximo, timeout=8,
                    headers={"User-Agent": "Mozilla/5.0"},
                    allow_redirects=True,
                )
                if not eh_brasileiro(r.text, str(r.url)):
                    return (False, f"linktree -> site nao-BR")
                return checar_ecommerce(r.text, str(r.url))
            except Exception as e:
                return (False, f"linktree -> erro {type(e).__name__}")

    # Valida se é brasileiro
    if not eh_brasileiro(html, url):
        return (False, "site nao-BR (idioma)")

    return checar_ecommerce(html, url)


def verificar_site(url: str) -> tuple[bool, bool, str]:
    """Retorna (tem_provador, eh_ecommerce, motivo_nao_ecommerce)."""
    try:
        response = requests.get(
            url,
            timeout=10,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            allow_redirects=True,
        )
        response.raise_for_status()
        html = response.text
        html_low = html.lower()

        # Provador virtual?
        tem_provador = any(kw.lower() in html_low for kw in PROVADOR_KEYWORDS)
        if not tem_provador:
            soup = BeautifulSoup(html, "html.parser")
            for script in soup.find_all("script", src=True):
                src = (script.get("src") or "").lower()
                if "provador" in src or "try-on" in src or "fitting" in src:
                    tem_provador = True
                    break

        # E-commerce?
        is_ecom, motivo = eh_ecommerce(html, str(response.url))
        return (tem_provador, is_ecom, motivo)

    except Exception as e:
        return (False, False, f"erro: {type(e).__name__}")


def main():
    with open(LEADS_BRUTOS_PATH, "r", encoding="utf-8") as f:
        leads = json.load(f)

    print(f"Verificando {len(leads)} leads...")
    resultados = []

    for i, lead in enumerate(leads, 1):
        site = lead["site"]
        tem_provador, is_ecom, motivo = verificar_site(site)
        lead["tem_provador"] = tem_provador
        lead["eh_ecommerce"] = is_ecom
        flag_prov = "PROV" if tem_provador else "----"
        flag_ecom = "ECOM" if is_ecom else "NAO-ECOM"
        print(f"  [{i}/{len(leads)}] @{lead['instagram']} — {flag_prov} {flag_ecom} ({motivo})")
        resultados.append(lead)

    # Filtra: SEM provador E eh e-commerce
    filtrados = [l for l in resultados if not l["tem_provador"] and l["eh_ecommerce"]]

    with open(LEADS_FILTRADOS_PATH, "w", encoding="utf-8") as f:
        json.dump(filtrados, f, ensure_ascii=False, indent=2)

    print(f"\n{len(filtrados)} leads qualificados (sem provador + e-commerce) de {len(leads)} total")
    print(f"Salvos em {LEADS_FILTRADOS_PATH}")


if __name__ == "__main__":
    main()
