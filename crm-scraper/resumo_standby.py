"""Resumo da pipeline stand_by — @ + fonte + ultima interacao."""
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

leads = (
    sb.table('leads')
    .select('id, instagram, nome_loja, responsavel, fonte_oportunidade')
    .eq('status', 'stand_by')
    .order('responsavel')
    .order('instagram')
    .execute()
    .data
)

print(f'Total: {len(leads)} leads em stand_by\n')
print('=' * 100)

for l in leads:
    inters = (
        sb.table('interacoes')
        .select('tipo, conteudo, created_at')
        .eq('lead_id', l['id'])
        .order('created_at', desc=True)
        .limit(1)
        .execute()
        .data
    )
    insta = l['instagram']
    fonte = l['fonte_oportunidade'] or '—'
    resp = (l['responsavel'] or '').strip() or '—'

    print()
    print(f'@{insta}')
    print(f'   Responsavel: {resp} | Fonte: {fonte}')
    if inters:
        i = inters[0]
        dt = i['created_at'][:19].replace('T', ' ')
        conteudo = (i['conteudo'] or '').strip()
        print(f'   Ultima interacao: {dt} [{i["tipo"]}]')
        print(f'   "{conteudo}"')
    else:
        print(f'   Ultima interacao: — sem interacao registrada')
