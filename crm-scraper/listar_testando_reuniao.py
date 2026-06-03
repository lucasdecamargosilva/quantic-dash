"""Lista leads em 'testando' e 'reuniao_agendada' com última interação completa."""
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


def lista(status_chave, titulo):
    leads = (
        sb.table('leads')
        .select('id, instagram, nome_loja, responsavel')
        .eq('status', status_chave)
        .order('responsavel')
        .order('nome_loja')
        .execute()
        .data
    )
    print(f'\n========================================')
    print(f'  {titulo} — {len(leads)} leads')
    print(f'========================================\n')

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
        print(f'• Responsável: {resp} | Lead: {nome} (@{l["instagram"]})')
        if inters:
            i = inters[0]
            dt = i['created_at'][:19].replace('T', ' ')
            conteudo = (i['conteudo'] or '').strip()
            print(f'  Última interação: {dt} | {i["tipo"]}')
            print(f'  Mensagem: {conteudo}')
        else:
            print(f'  Última interação: — sem interação registrada')
        print()


lista('testando', 'TESTANDO')
lista('reuniao_agendada', 'REUNIAO AGENDADA')
