"""Atualiza o conteudo das interacoes da janela 15:30-16:30 BR (02/06/2026)
para os 26 leads do Lucas Cioni em 'respondeu', com texto especifico por @."""

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

# Mapa @ -> nova interacao
NOVAS = {
    'tuoptica.segurola':    'Atendente respondeu animado, vai enviar a proposta para o gestor',
    'califa_sunglasses':    'Cliente não respondeu mais vou efetuar mais uma tentativa',
    'camelia.closet_':      'Cliente vai passar para o time técnico avaliar a proposta',
    'casadokimono':         'Cliente pediu para enviar uma proposta detalhada por email',
    'glassespnz':           'Não respondeu',
    'lojalebrun':           'Não respondeu',
    'useavance.com.br':     'Cliente perguntou sobre prazo de implementação, expliquei aguardando retorno',
    'oculosatacadoluxoo':   'Cliente disse que está em viagem, pediu para retomar a conversa na próxima semana',
    'made.glasses':         'Não Respondeu',
    'minimalclub.br':       'Gerente responsável, pediu para retomar amanhã',
    'like_luxooficial':     'Não respondeu',
    'dsmeyewear':           'Não respondeu',
    'ohoculos':             'Cliente pediu para enviar uma proposta detalhada por email',
    'onlauri':              'Cliente quer fechar mas precisa alinhar com o sócio antes — retorna até sexta',
    'pulso_recife':         'Não respondeu',
    'oticaisabeladias':     'Cliente demonstrou interesse, perguntei se aceita uma call ele ficou de confirmar',
    'oticapontual.oficial': 'Cliente está em fase de planejamento de marketing para o segundo semestre, retomar em julho',
    'oticaumarizal':        'Não respondeu',
    'oticaunivision':       'Não respondeu',
    'qualidadevisual':      'Não respondeu',
    'so.otica':             'Cliente respondeu que está avaliando outras opções, pediu até semana que vem para decidir',
    'sunflower.otica':      'Cliente pediu para enviar uma proposta detalhada por email',
    'mommy fitness':        'Não respondeu',
    'visionarieyewear':     'Cliente pediu para enviar uma proposta detalhada por email',
    'vkmodaplussize':       'Não respondeu',
    'lojaxiz_':             'Não respondeu',
}

# Janela em UTC (15:30-16:30 BR -> 18:30-19:30 UTC)
INICIO = '2026-06-02T18:30:00Z'
FIM    = '2026-06-02T19:30:00Z'

atualizados, nao_encontrados, sem_interacao = 0, [], []

for insta, novo_texto in NOVAS.items():
    # Busca o lead pelo @ (status respondeu, responsavel Cioni)
    leads = (
        sb.table('leads')
        .select('id, instagram')
        .eq('instagram', insta)
        .eq('status', 'respondeu')
        .eq('responsavel', 'Lucas Cioni')
        .execute()
        .data
    )
    if not leads:
        nao_encontrados.append(insta)
        continue
    lead_id = leads[0]['id']

    # Pega a interacao na janela
    inters = (
        sb.table('interacoes')
        .select('id, conteudo')
        .eq('lead_id', lead_id)
        .eq('tipo', 'nota')
        .gte('created_at', INICIO)
        .lte('created_at', FIM)
        .execute()
        .data
    )
    if not inters:
        sem_interacao.append(insta)
        continue

    # Atualiza
    sb.table('interacoes').update({'conteudo': novo_texto}).eq('id', inters[0]['id']).execute()
    print(f'✓ @{insta}  →  {novo_texto}')
    atualizados += 1

print(f'\n--- Resumo ---')
print(f'Atualizadas: {atualizados}/{len(NOVAS)}')
if nao_encontrados:
    print(f'Lead nao encontrado em respondeu+Cioni: {nao_encontrados}')
if sem_interacao:
    print(f'Lead sem interacao na janela: {sem_interacao}')
