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

# Leads que vieram do batch Instagram mas ja foram movidos:
# sem responsavel (sinal do nosso batch) + sem fonte ainda + categoria oculos
candidatos = (
    sb.table('leads')
    .select('id, instagram, status')
    .is_('responsavel', 'null')
    .is_('fonte_oportunidade', 'null')
    .eq('categoria', 'oculos')
    .execute()
    .data
)

print(f'Candidatos (sem fonte, sem responsavel, oculos): {len(candidatos)}')
for l in candidatos[:30]:
    print(f"  @{l['instagram']} status={l['status']}")

if candidatos:
    r = (
        sb.table('leads')
        .update({'fonte_oportunidade': 'Instagram'})
        .is_('responsavel', 'null')
        .is_('fonte_oportunidade', 'null')
        .eq('categoria', 'oculos')
        .execute()
    )
    print(f'\nAtualizados: {len(r.data)}')

# Estado final
total = (
    sb.table('leads')
    .select('id', count='exact')
    .is_('responsavel', 'null')
    .eq('fonte_oportunidade', 'Instagram')
    .eq('categoria', 'oculos')
    .execute()
    .count
)
print(f'Total batch (responsavel=NULL + fonte=Instagram + oculos): {total}')
