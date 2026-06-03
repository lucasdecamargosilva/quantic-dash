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

cioni = (
    sb.table('leads')
    .select('id, instagram, nome_loja')
    .eq('status', 'respondeu')
    .eq('responsavel', 'Lucas Cioni')
    .order('nome_loja')
    .execute()
    .data
)
ids = [l['id'] for l in cioni]

inters = (
    sb.table('interacoes')
    .select('lead_id, conteudo, created_at')
    .in_('lead_id', ids)
    .eq('tipo', 'nota')
    .gte('created_at', '2026-06-02T18:30:00Z')
    .lte('created_at', '2026-06-02T19:30:00Z')
    .execute()
    .data
)

by_lead = {i['lead_id']: i for i in inters}
print(f'Total: {len(inters)} interacoes\n')

for l in cioni:
    insta = l['instagram']
    i = by_lead.get(l['id'])
    if i:
        h_utc = i['created_at'][11:19]
        h = int(h_utc[:2]) - 3
        hora_br = f'{h:02d}{h_utc[2:]}'
        print(f"@{insta}  ({hora_br} BR)")
        print(f"   {i['conteudo']}")
        print()
    else:
        print(f"@{insta}  [sem interacao na janela]")
        print()
