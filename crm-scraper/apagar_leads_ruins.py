"""Apaga os leads que nao sao de eyewear/oticas inseridos por engano."""
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

# Os 17 @ ruins da rodada 9 (query "loja oculos sao jose dos campos")
RUINS = [
    'joseramonfernandeza',
    'lojasoficiaisdoflamengo',
    'lojarenatogarciayt',
    'josey_officiel',
    'saopaulofc',
    'lojahmmm',
    'josefidalgo_oficial',
    'saostore',
    'lojakings',
    'josephcmarco',
    'saojosearmarinho',
    'joseaguerrab',
    'joseparejaoficial',
    'josegbricenot2',
    'lojasantoantonio',
    'rubio_josesh10',
    'josephprince',
]

apagados = 0
for insta in RUINS:
    # Confere e apaga so se status ainda for 'novo' (seguranca)
    leads = sb.table('leads').select('id, status, nome_loja').eq('instagram', insta).execute().data
    if not leads:
        print(f'  ? @{insta} nao encontrado')
        continue
    l = leads[0]
    if l['status'] != 'novo':
        print(f'  ! @{insta} ja em status={l["status"]} — NAO apago')
        continue
    sb.table('leads').delete().eq('id', l['id']).execute()
    print(f'  X apagado: @{insta} ({l["nome_loja"]})')
    apagados += 1

print(f'\nTotal apagados: {apagados}')

# Conta final
total = sb.table('leads').select('id', count='exact').eq('status', 'novo').execute().count
print(f'Em status=novo agora: {total}')
