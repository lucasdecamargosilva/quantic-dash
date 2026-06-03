"""Apaga as notas inseridas em 02/06/2026 entre 15:30-16:30 BR
para leads em 'respondeu' atribuidos ao Lucas de Camargo.
Mantem as do Lucas Cioni."""

import os, certifi

os.environ['SSL_CERT_FILE'] = certifi.where()
os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()
try:
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass

from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# Janela em UTC (15:30-16:30 BR = 18:30-19:30 UTC)
inicio_utc = '2026-06-02T18:30:00Z'
fim_utc = '2026-06-02T19:30:00Z'

# Leads em respondeu de cada responsavel
camargo = (
    sb.table('leads')
    .select('id, instagram, nome_loja')
    .eq('status', 'respondeu')
    .eq('responsavel', 'Lucas de Camargo')
    .execute()
    .data
)
cioni = (
    sb.table('leads')
    .select('id, instagram, nome_loja')
    .eq('status', 'respondeu')
    .eq('responsavel', 'Lucas Cioni')
    .execute()
    .data
)
ids_camargo = [l['id'] for l in camargo]
ids_cioni = [l['id'] for l in cioni]

print(f'Leads em respondeu — Lucas de Camargo: {len(ids_camargo)}')
print(f'Leads em respondeu — Lucas Cioni: {len(ids_cioni)}')

if not ids_camargo:
    print('Nenhum lead do Camargo em respondeu — nada a apagar.')
else:
    # Busca as interacoes na janela pra esses leads
    inters = (
        sb.table('interacoes')
        .select('id, lead_id, conteudo, created_at')
        .in_('lead_id', ids_camargo)
        .eq('tipo', 'nota')
        .gte('created_at', inicio_utc)
        .lte('created_at', fim_utc)
        .execute()
        .data
    )
    print(f'\nInteracoes do Camargo na janela: {len(inters)}\n')

    apagadas = 0
    for inter in inters:
        # Encontra o nome do lead pelo lead_id
        lead = next((l for l in camargo if l['id'] == inter['lead_id']), None)
        nome = (lead['nome_loja'] if lead else None) or '?'
        insta = lead['instagram'] if lead else '?'
        sb.table('interacoes').delete().eq('id', inter['id']).execute()
        hora_utc = inter['created_at'][11:19]
        h_utc = int(hora_utc[:2])
        hora_br = f'{h_utc - 3:02d}{hora_utc[2:]}'
        print(f'✗ APAGADA | {hora_br} BR | {nome} (@{insta}) | "{inter["conteudo"][:60]}..."')
        apagadas += 1

    print(f'\nTotal apagadas: {apagadas}')

# Confirma: quantas interacoes ainda existem na janela (deveria ser = qtd Lucas Cioni)
restantes = (
    sb.table('interacoes')
    .select('id', count='exact')
    .in_('lead_id', ids_cioni)
    .eq('tipo', 'nota')
    .gte('created_at', inicio_utc)
    .lte('created_at', fim_utc)
    .execute()
)
print(f'\nInteracoes restantes na janela (Lucas Cioni): {restantes.count}')
