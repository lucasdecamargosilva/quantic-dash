"""
Coleta emails de contato dos sites das lojas.

Para cada lead sem email mas com site:
  1. Faz GET na home
  2. Procura emails no HTML (mailto:, regex)
  3. Se nao achar, tenta paginas comuns: /contato, /sobre, /atendimento
  4. Filtra emails ruins (no-reply, trackers) e prioriza email cujo dominio bate com o site
  5. Atualiza o lead no Supabase

Uso:
    # roda em todos sem email
    python coletar_emails.py --limite 50

    # so categoria roupa
    python coletar_emails.py --categoria roupa --limite 30

    # testa um site sem alterar DB
    python coletar_emails.py --teste https://exemplo.com.br
"""
import argparse
import re
import time
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY

EMAIL_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

# Hosts que NAO sao site de loja — Linktree-like exigem seguir primeiro link real
LINKTREE_HOSTS = (
    "linktr.ee", "linktree.", "beacons.ai", "lnk.bio", "bio.site",
    "campsite.bio", "linkme.bio", "linklist.bio", "instabio.cc",
    "meulink.bio.br", "meulink.bio", "biolink.io", "later.com",
    "many.bio", "shorby.com", "tap.bio",
)

# Hosts que sao apenas links de mensagem — sem site para raspar
WHATSAPP_LIKE = ("wa.me", "wa.link", "api.whatsapp.com", "whatsapp.com", "t.me", "m.me")

# Caminhos comuns de paginas com email de contato (Shopify primeiro — alta taxa de hit)
PAGINAS_CONTATO = [
    # Shopify obrigatorios (LGPD/CDC) — quase sempre tem email
    "/policies/contact-information",
    "/policies/privacy-policy",
    "/policies/terms-of-service",
    "/policies/refund-policy",
    "/policies/shipping-policy",
    # Genericos PT-BR
    "/contato", "/contato/", "/atendimento", "/atendimento/",
    "/sobre", "/sobre-nos", "/sobre-nos/", "/quem-somos", "/institucional",
    "/faleconosco", "/fale-conosco", "/faq", "/ajuda", "/suporte",
    "/politica-de-privacidade", "/privacidade", "/termos-de-uso", "/termos",
    "/troca-e-devolucao", "/trocas-e-devolucoes",
    # Shopify pages comuns
    "/pages/contato", "/pages/sobre", "/pages/sobre-nos", "/pages/atendimento",
    "/pages/quem-somos", "/pages/fale-conosco", "/pages/politica-de-privacidade",
    # EN
    "/contact", "/contact-us", "/about", "/about-us",
]

# Dominios de email que NAO sao de contato real (trackers, plataformas, parceiros)
DOMINIOS_BLOQUEADOS = {
    "sentry.io", "sentry-next.wixpress.com", "wixpress.com",
    "googletagmanager.com", "google-analytics.com", "googleapis.com",
    "fontawesome.com", "cloudfront.net", "amazonaws.com",
    "facebook.com", "instagram.com", "whatsapp.com",
    "stripe.com", "paypal.com", "mercadopago.com",
    "example.com", "domain.com", "email.com", "your-email.com",
    "sentry.wixpress.com", "wix.com", "shopify.com", "myshopify.com",
    "vtex.com.br", "vtex.com", "tray.com.br",
    "godaddy.com", "secureserver.net", "yourwebsite.com",
}

# Prefixos que indicam email automatico/parceiro
PREFIXOS_BLOQUEADOS = {
    "no-reply", "noreply", "donotreply", "do-not-reply",
    "postmaster", "bounce", "bounces", "mailer-daemon",
    "abuse", "webmaster", "dns", "hostmaster",
}

# Extensoes de arquivo que poluem o regex (emails dentro de assets)
EXT_INVALIDAS = (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".css", ".js", ".woff", ".woff2", ".ttf")

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


def email_valido(email: str) -> bool:
    email = email.lower().strip(".,;:")
    if not email or "@" not in email:
        return False
    if any(email.endswith(ext) for ext in EXT_INVALIDAS):
        return False
    local, _, dominio = email.partition("@")
    if dominio in DOMINIOS_BLOQUEADOS:
        return False
    if any(local.startswith(p) for p in PREFIXOS_BLOQUEADOS):
        return False
    # Filtra strings com hex/hash que sobraram em assets (ex: u003e@2x.png)
    if "u003" in email or "%40" in email:
        return False
    if len(local) > 40 or len(dominio) > 50:
        return False
    return True


def extrair_emails_da_pagina(html: str) -> list[str]:
    """Pega todos os emails do HTML — mailto: + regex no texto."""
    encontrados = set()

    # mailto: tem prioridade — sao emails reais clicaveis
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.find_all("a", href=True):
        href = a.get("href", "")
        if href.lower().startswith("mailto:"):
            email = href[7:].split("?")[0].strip()
            if email_valido(email):
                encontrados.add(email.lower())

    # Regex no texto visivel (nao no HTML cru — pega menos lixo)
    texto = soup.get_text(" ")
    for m in EMAIL_RE.findall(texto):
        if email_valido(m):
            encontrados.add(m.lower())

    # Tambem busca em atributos data-* (Wix, Squarespace as vezes escondem email la)
    for el in soup.find_all(attrs=True):
        for attr_name, attr_val in el.attrs.items():
            if not attr_name.startswith("data-"):
                continue
            if isinstance(attr_val, str):
                for m in EMAIL_RE.findall(attr_val):
                    if email_valido(m):
                        encontrados.add(m.lower())

    return sorted(encontrados)


def escolher_melhor(emails: list[str], dominio_loja: str) -> str | None:
    """Prioriza: (1) email com dominio = dominio do site; (2) primeiro restante."""
    if not emails:
        return None
    dominio_loja = dominio_loja.lower().lstrip("www.")
    # tira "www." e subdominios — mantem dominio raiz
    parts = dominio_loja.split(".")
    if len(parts) >= 2:
        dominio_raiz = ".".join(parts[-2:]) if not parts[-2] in ("com", "net", "org") else ".".join(parts[-3:])
    else:
        dominio_raiz = dominio_loja

    casados = [e for e in emails if dominio_raiz in e.split("@")[1]]
    if casados:
        # Dentro dos casados, prioriza prefixos comuns de contato
        for prefixo in ["contato", "atendimento", "sac", "vendas", "comercial", "ola", "oi", "loja"]:
            for e in casados:
                if e.split("@")[0].startswith(prefixo):
                    return e
        return casados[0]

    # Sem casamento — pega o primeiro nao-bloqueado
    return emails[0]


def resolver_linktree(html: str, debug: bool = False) -> str | None:
    """Numa pagina Linktree-like, acha o primeiro link externo que parece ser loja."""
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.find_all("a", href=True):
        href = (a.get("href") or "").strip()
        if not href.startswith("http"):
            continue
        low = href.lower()
        # Pula redes sociais, outros linktrees, whatsapp, fontes/CDN
        skip = (
            "instagram.com", "facebook.com", "twitter.com", "x.com",
            "tiktok.com", "youtube", "spotify", "apple.com",
            "google.com", "fonts.gstatic", "fontawesome", "cloudfront",
            "linktr.ee", "bio.site", "beacons.ai", "lnk.bio", "campsite.bio",
            "wa.me", "wa.link", "whatsapp", "t.me", "m.me",
        )
        if any(s in low for s in skip):
            continue
        if debug:
            print(f"    linktree -> {href}")
        return href
    return None


def buscar_email_no_site(url: str, debug: bool = False) -> str | None:
    """Tenta a home + paginas de contato. Retorna o melhor email."""
    headers = {"User-Agent": USER_AGENT, "Accept-Language": "pt-BR,pt;q=0.9"}
    base_url = url
    url_low = url.lower()
    todos_emails: set[str] = set()

    # WhatsApp link nao tem site para raspar
    if any(h in url_low for h in WHATSAPP_LIKE):
        if debug:
            print(f"    skip: WhatsApp link")
        return None

    try:
        r = requests.get(url, timeout=10, headers=headers, allow_redirects=True)
        r.raise_for_status()
        base_url = str(r.url)
        host = urlparse(base_url).netloc.lower()

        # Linktree-like — segue o primeiro link real
        if any(h in host for h in LINKTREE_HOSTS):
            real_url = resolver_linktree(r.text, debug=debug)
            if not real_url:
                if debug:
                    print(f"    linktree sem link real")
                return None
            # Recurse uma vez no link real
            try:
                r = requests.get(real_url, timeout=10, headers=headers, allow_redirects=True)
                r.raise_for_status()
                base_url = str(r.url)
            except Exception as e:
                if debug:
                    print(f"    linktree -> link real erro: {type(e).__name__}")
                return None

        emails_home = extrair_emails_da_pagina(r.text)
        if debug:
            print(f"    home ({base_url}): {emails_home}")
        todos_emails.update(emails_home)
    except Exception as e:
        if debug:
            print(f"    home erro: {type(e).__name__}: {e}")
        return None

    parsed = urlparse(base_url)
    base_root = f"{parsed.scheme}://{parsed.netloc}"

    # Se ja achou email casando com o dominio, nao precisa nem tentar paginas extras
    melhor = escolher_melhor(sorted(todos_emails), parsed.netloc)
    if melhor and parsed.netloc.replace("www.", "") in melhor:
        return melhor

    # Tenta paginas de contato
    for caminho in PAGINAS_CONTATO:
        try:
            page_url = urljoin(base_root, caminho)
            r = requests.get(page_url, timeout=8, headers=headers, allow_redirects=True)
            if r.status_code != 200:
                continue
            novos = extrair_emails_da_pagina(r.text)
            if debug and novos:
                print(f"    {caminho}: {novos}")
            todos_emails.update(novos)
            # Se achou email casando, para logo
            melhor = escolher_melhor(sorted(todos_emails), parsed.netloc)
            if melhor and parsed.netloc.replace("www.", "") in melhor:
                return melhor
        except Exception:
            continue

    return escolher_melhor(sorted(todos_emails), parsed.netloc)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--teste", type=str, help="Testa um URL especifico sem mexer no DB")
    parser.add_argument("--categoria", choices=["oculos", "roupa", "all"], default="all")
    parser.add_argument("--status", type=str, default=None,
                        help="Filtra por status (ex: 'novo' ou 'novo,dm_enviada')")
    parser.add_argument("--limite", type=int, default=50)
    parser.add_argument("--intervalo", type=float, default=2.0, help="segundos entre requests")
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    if args.teste:
        print(f"Testando: {args.teste}\n")
        email = buscar_email_no_site(args.teste, debug=True)
        print(f"\n  -> Melhor email: {email or '(nenhum)'}")
        return

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    q = sb.table("leads").select("id,instagram,nome_loja,site,email,categoria,status").order("created_at")
    if args.categoria != "all":
        q = q.eq("categoria", args.categoria)
    if args.status:
        statuses = [s.strip() for s in args.status.split(",")]
        q = q.in_("status", statuses)

    todos = q.execute().data or []
    pendentes = [
        l for l in todos
        if l.get("site") and not (l.get("email") and "@" in (l.get("email") or ""))
    ][:args.limite]

    if not pendentes:
        print("Nenhum lead sem email com site encontrado.")
        return

    print(f"\n{'='*60}")
    print(f"  COLETA EMAIL — {len(pendentes)} leads (cat={args.categoria})")
    print(f"{'='*60}\n")

    achados = 0
    for i, lead in enumerate(pendentes):
        nome = lead.get("nome_loja") or lead["instagram"]
        site = lead["site"]
        print(f"[{i+1}/{len(pendentes)}] {nome} — {site}")

        email = buscar_email_no_site(site, debug=args.debug)
        if email:
            sb.table("leads").update({"email": email}).eq("id", lead["id"]).execute()
            achados += 1
            print(f"  -> {email}")
        else:
            print(f"  (sem email)")

        if i < len(pendentes) - 1 and args.intervalo > 0:
            time.sleep(args.intervalo)

    print(f"\n{'='*60}")
    print(f"  RESULTADO: {achados}/{len(pendentes)} emails coletados")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
