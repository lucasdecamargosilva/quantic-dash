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
    .select('id, instagram, nome_loja, responsavel')
    .eq('status', 'stand_by')
    .order('responsavel')
    .execute()
    .data
)

print(f'Total: {len(leads)} leads em stand_by\n')

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
    nome = l['nome_loja'] or f"@{l['instagram']}"
    resp = (l['responsavel'] or '').strip() or '—'
    insta = l['instagram']

    if inters:
        i = inters[0]
        dt = i['created_at'][:19].replace('T', ' ')
        conteudo = (i['conteudo'] or '').strip().replace('\n', ' ').replace('\r', ' ')
        if len(conteudo) > 100:
            conteudo = conteudo[:97] + '...'
        ultima = f"{dt} | {i['tipo']}: {conteudo}"
    else:
        ultima = '— sem interação registrada'

    print(f'• Pipeline: stand_by | Responsável: {resp} | Lead: {nome} (@{insta})')
    print(f'   Última interação: {ultima}')
    print()
