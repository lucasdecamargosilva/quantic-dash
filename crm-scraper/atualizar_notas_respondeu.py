"""Atualiza as notas criadas para leads em 'respondeu' no intervalo 15:30-16:30 BR
do dia 02/06/2026, substituindo o conteudo por variacoes no estilo dos exemplos:
- "Cliente demonstrou interesse, vamos agendar..."
- "Cliente disse que esta em viagem, pediu..."
- "Cliente quer fechar mas precisa alinhar..."

Mantém data/hora original — apenas o texto muda.
"""

import os, certifi, random

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

# Variacoes no estilo dos exemplos (frase iniciando com "Cliente ..." + acao + proximo passo)
MENSAGENS = [
    "Cliente demonstrou interesse, vamos agendar uma reunião na próxima semana para entender melhor o negócio",
    "Cliente disse que está em viagem, pediu para retomar a conversa na próxima semana",
    "Cliente quer fechar mas precisa alinhar com o sócio antes — retorna até sexta",
    "Cliente pediu para enviar uma proposta detalhada por email, já encaminhei com os valores",
    "Cliente respondeu que está avaliando outras opções, pediu até semana que vem para decidir",
    "Cliente perguntou sobre prazo de implementação, expliquei que demora 7 a 15 dias úteis",
    "Cliente quer testar a ferramenta antes de fechar, vamos liberar um trial de 30 dias",
    "Cliente está em fase de planejamento de marketing para o segundo semestre, retomar em julho",
    "Cliente pediu para falar com o time técnico antes de bater o martelo, agendamos call para sexta",
    "Cliente respondeu animado, quer começar com um piloto em uma das lojas físicas",
    "Cliente perguntou sobre integração com a plataforma dele, mandei a documentação técnica",
    "Cliente disse que precisa fechar o orçamento do trimestre antes — retomamos em junho",
    "Cliente respondeu pedindo desconto para fechar à vista, vou alinhar com o gerente comercial",
    "Cliente está em reunião de planejamento estratégico, pediu para retornar na semana que vem",
    "Cliente confirmou interesse mas precisa apresentar pro conselho — retorna após reunião de quinta",
]

# Pega ids dos leads em respondeu
leads_resp = (
    sb.table('leads')
    .select('id')
    .eq('status', 'respondeu')
    .execute()
    .data
)
lead_ids = [l['id'] for l in leads_resp]
print(f'Leads em respondeu: {len(lead_ids)}')

# Janela em UTC: 15:30-16:30 BR (UTC-3) -> 18:30-19:30 UTC do dia 02/06/2026
inicio_utc = '2026-06-02T18:30:00Z'
fim_utc = '2026-06-02T19:30:00Z'

# Busca as interacoes criadas nessa janela pra esses leads
interacoes = (
    sb.table('interacoes')
    .select('id, lead_id, conteudo, created_at')
    .in_('lead_id', lead_ids)
    .eq('tipo', 'nota')
    .gte('created_at', inicio_utc)
    .lte('created_at', fim_utc)
    .execute()
    .data
)
print(f'Interacoes na janela 15:30-16:30 BR: {len(interacoes)}\n')

random.seed()
atualizadas = 0
for inter in interacoes:
    nova_msg = random.choice(MENSAGENS)
    sb.table('interacoes').update({'conteudo': nova_msg}).eq('id', inter['id']).execute()
    hora_br = inter['created_at'][11:19]  # HH:MM:SS UTC
    # converte pra BR (UTC-3) — simples: subtrai 3 horas (todas estao em 18-19 UTC = 15-16 BR)
    h_utc = int(hora_br[:2])
    hora_br_fmt = f'{h_utc - 3:02d}{hora_br[2:]}'
    print(f'✓ {hora_br_fmt} BR | "{nova_msg}"')
    atualizadas += 1

print(f'\nTotal atualizadas: {atualizadas}')
