"""Prospecta 50 leads novos no Instagram com 3 queries:
  - loja de oculos
  - oculos de sol loja
  - oculos de grau loja

Filtra perfis pessoais e exige sinal de loja (igual instagram.py).
ANTES de cada insercao confere se o @instagram ja existe em qualquer pipeline
do Supabase — se ja existir, descarta.

Para automaticamente quando tiver 50 NOVOS leads."""

import os, certifi
os.environ['SSL_CERT_FILE'] = certifi.where()
os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()
try:
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass

from apify_client import ApifyClient
from supabase import create_client
from config import APIFY_TOKEN, SUPABASE_URL, SUPABASE_KEY

# Re-aproveita logica do instagram.py
from instagram import buscar_perfis, extrair_lead

QUERIES = [
    "loja oculos ipatinga",
    "loja oculos mossoro",
    "loja oculos imperatriz",
    "loja oculos governador valadares",
    "loja oculos vitoria da conquista",
]
META_LEADS = 1  # objetivo: chegar a 100 total (ja temos 99)
PERFIS_POR_QUERY = 60       # busca alta pra ter folga apos filtros + duplicatas
MIN_SEGUIDORES = 2000        # afrouxado de 5000 pra captar lojas medias
MIN_SEG_OTICA = 5000         # afrouxado de 10000 pra captar oticas de cidade media
CATEGORIA = "oculos"
RESPONSAVEL = None  # sem responsavel — atribuir manualmente depois

# ---------- Conexoes ----------
print(f'\nProspeccao: meta {META_LEADS} novos leads em status=novo')
print(f'Queries: {QUERIES}\n')

apify = ApifyClient(APIFY_TOKEN)
sb = create_client(SUPABASE_URL, SUPABASE_KEY)


def carregar_instagrams_existentes() -> set[str]:
    """Pre-carrega todos os @ ja existentes no DB (paginado de 1000 em 1000)."""
    todos = set()
    offset = 0
    while True:
        r = sb.table('leads').select('instagram').range(offset, offset + 999).execute()
        if not r.data:
            break
        for row in r.data:
            ig = (row.get('instagram') or '').strip().lower()
            if ig:
                todos.add(ig)
        if len(r.data) < 1000:
            break
        offset += 1000
    return todos


EXISTENTES = carregar_instagrams_existentes()
print(f'Cache de @ existentes no DB: {len(EXISTENTES)}\n')


def lead_ja_existe(insta: str) -> bool:
    return insta.strip().lower() in EXISTENTES


def passa_filtro_loja(lead: dict) -> tuple[bool, str]:
    """Filtros do instagram.py: descarta perfis pessoais, sem site, sem sinal de loja."""
    username = (lead.get('instagram') or '').lower()
    site = (lead.get('site') or '').strip().lower()
    # Aceita sem site SE for conta business (lojas pequenas atendem so via DM/WhatsApp)
    if not site and not lead.get('is_business'):
        return False, 'sem site e nao-business'
    if site and any(x in site for x in ['wa.me', 'whatsapp', 'api.whatsapp']):
        return False, 'site eh whatsapp'

    nome = (lead.get('nome_loja') or '').lower()
    bio = (lead.get('bio') or '').lower()
    texto = f"{nome} {bio} {username}"

    blocklist_pessoa = [
        'blogger', 'influencer', 'creator', 'lifestyle', 'minha vida',
        'esposa de', 'mãe de', 'mae de', 'mom of', 'wife of',
        'personal trainer', 'diga oi', 'siga meu', 'minha jornada',
        'amante de', 'apaixonad', 'estilista pessoal',
    ]
    if any(b in bio for b in blocklist_pessoa):
        return False, 'bio pessoal'

    keywords_loja = [
        'loja', 'store', 'shop', 'brand', 'marca', 'official', 'oficial',
        'atendimento', 'atacado', 'varejo', 'envio', 'frete', 'pedido',
        'encomend', 'compre', 'compra pelo', 'boutique', 'atelier',
        'produtos', 'modas', 'outlet', 'showroom', 'venda',
    ]
    tem_sinal_loja = lead.get('is_business') or any(k in texto for k in keywords_loja)
    if not tem_sinal_loja:
        return False, 'sem sinal de loja'

    # OBRIGATORIO: tem que ter keyword de eyewear no perfil
    # (evita pegar lojas de outros segmentos quando a query "loja oculos X" pega resultados pelo "X")
    keywords_eyewear = [
        'oculos', 'óculos', 'otica', 'ótica', 'optica', 'óptica', 'optical',
        'lentes', 'lente de contato', 'eyewear', 'glasses', 'sunglasses',
        'armacao', 'armação', 'oculista', 'eyeglasses', 'frames', 'shades',
    ]
    tem_eyewear = any(k in texto for k in keywords_eyewear)
    if not tem_eyewear:
        return False, 'nao eh de eyewear'

    is_otica = any(x in nome or x in username for x in ['otica', 'ótica', 'optica', 'óptica'])
    seguidores = lead.get('seguidores') or 0
    if is_otica and seguidores < MIN_SEG_OTICA:
        return False, f'otica com {seguidores} seg (min {MIN_SEG_OTICA})'
    if seguidores < MIN_SEGUIDORES:
        return False, f'{seguidores} seg (min {MIN_SEGUIDORES})'

    return True, ''


# ---------- Coleta ----------
novos = []
seen_run = set()
stats = {'total_perfis': 0, 'sem_filtro': 0, 'ja_existem': 0, 'duplicados_run': 0, 'inseridos': 0}

for query in QUERIES:
    if len(novos) >= META_LEADS:
        break

    print(f'>> Query: "{query}" — buscando {PERFIS_POR_QUERY} perfis...')
    items = buscar_perfis(apify, query, PERFIS_POR_QUERY)
    stats['total_perfis'] += len(items)

    for item in items:
        if len(novos) >= META_LEADS:
            break

        lead = extrair_lead(item)
        username = lead.get('instagram', '').strip().lower()
        if not username:
            continue

        if username in seen_run:
            stats['duplicados_run'] += 1
            continue
        seen_run.add(username)

        ok, motivo = passa_filtro_loja(lead)
        if not ok:
            stats['sem_filtro'] += 1
            continue

        # CHECA DUPLICATA no Supabase ANTES de inserir
        if lead_ja_existe(username):
            stats['ja_existem'] += 1
            continue

        # Insere com status=novo
        row = {
            'instagram': username,
            'nome_loja': lead.get('nome_loja') or '',
            'site': lead.get('site') or '',
            'seguidores': lead.get('seguidores') or 0,
            'tem_provador': False,
            'status': 'novo',
            'idioma': lead.get('idioma') or 'pt',
            'categoria': CATEGORIA,
            'fonte_oportunidade': 'Instagram',  # captura veio do Instagram (Apify)
        }
        if RESPONSAVEL is not None:
            row['responsavel'] = RESPONSAVEL
        # Insert com retry (Supabase as vezes estoura pool de conexao)
        import time
        inserido = False
        for tentativa in range(3):
            try:
                sb.table('leads').insert(row).execute()
                inserido = True
                break
            except Exception as e:
                err = str(e)[:120]
                if tentativa < 2:
                    print(f"  ~ retry @{username} apos erro: {err}")
                    time.sleep(2 * (tentativa + 1))
                else:
                    print(f"  ! Erro inserindo @{username}: {err}")
        if inserido:
            novos.append(lead)
            EXISTENTES.add(username)  # evita re-tentar mesma query bruta
            stats['inseridos'] += 1
            print(f"  + [{len(novos)}/{META_LEADS}] @{username} — {lead.get('nome_loja','')[:50]} ({lead.get('seguidores')} seg.)")

# ---------- Resumo ----------
print(f'\n--- Resumo ---')
print(f"Perfis buscados (bruto):  {stats['total_perfis']}")
print(f"Descartados (filtros):    {stats['sem_filtro']}")
print(f"Ja existiam no Supabase:  {stats['ja_existem']}")
print(f"Duplicados dentro do run: {stats['duplicados_run']}")
print(f"INSERIDOS em status=novo: {stats['inseridos']}")
