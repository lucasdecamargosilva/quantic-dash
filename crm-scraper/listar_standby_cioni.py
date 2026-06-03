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
    .eq('responsavel', 'Lucas Cioni')
    .order('nome_loja')
    .execute()
    .data
)

print(f'Total: {len(leads)} leads em stand_by de Lucas Cioni\n')
print('=' * 80)

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
    insta = l['instagram']

    print()
    print(f'Lead: {nome} (@{insta})')
    if inters:
        i = inters[0]
        dt = i['created_at'][:19].replace('T', ' ')
        conteudo = (i['conteudo'] or '').strip()
        print(f'Última interação: {dt} | {i["tipo"]}')
        print(f'Mensagem completa:')
        print(conteudo)
    else:
        print('Última interação: — sem interação registrada')
    print('-' * 80)
