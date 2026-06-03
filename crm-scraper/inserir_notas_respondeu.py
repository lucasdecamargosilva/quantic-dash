"""Insere 1 nota por lead em status 'respondeu'.
Mensagem sorteada entre variacoes detalhadas, data 2026-06-02 entre 15:30 e 16:30 BR."""

import os, certifi, random
from datetime import datetime, timezone, timedelta

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

# 12 variacoes mais detalhadas — refletem diferentes desfechos pos-resposta do lead
MENSAGENS = [
    "Cliente respondeu pedindo mais informações sobre o produto, enviei o catálogo completo via WhatsApp",
    "Cliente demonstrou interesse, vamos agendar uma reunião na próxima semana para apresentação",
    "Atendente passou o contato para o responsável da loja, aguardando retorno",
    "Conversado com a gerente, ficou de avaliar internamente com a equipe e retornar em alguns dias",
    "Cliente quer fechar mas precisa alinhar com o sócio antes — retorna até sexta",
    "Cliente pediu para mandar os valores por email, proposta enviada",
    "Cliente respondeu interessado, marcamos call de demonstração para esta semana",
    "Encaminhei o caso para o time comercial, eles vão dar sequência no atendimento",
    "Esclareci as dúvidas sobre o provador virtual, cliente vai testar no site dele e retorna",
    "Cliente respondeu pedindo prazo de implementação, expliquei o processo e enviei timeline",
    "Conversa direta com o dono, ele autorizou fazer um teste piloto na loja",
    "Cliente disse que está em viagem, pediu para retomar a conversa na próxima semana",
]

# Janela: 02/06/2026 15:30 a 16:30 BR (UTC-3) — 60 min = 3600 segundos
BR_TZ = timezone(timedelta(hours=-3))
INICIO = datetime(2026, 6, 2, 15, 30, 0, tzinfo=BR_TZ)
FIM = datetime(2026, 6, 2, 16, 30, 0, tzinfo=BR_TZ)
JANELA_SEGUNDOS = int((FIM - INICIO).total_seconds())

# Busca leads em respondeu
leads = (
    sb.table('leads')
    .select('id, instagram, nome_loja, responsavel')
    .eq('status', 'respondeu')
    .execute()
    .data
)
print(f'Encontrados {len(leads)} leads em respondeu\n')

random.seed()

inseridos = 0
for l in leads:
    msg = random.choice(MENSAGENS)
    offset = random.randint(0, JANELA_SEGUNDOS)
    quando = INICIO + timedelta(seconds=offset)
    created_at = quando.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')

    sb.table('interacoes').insert({
        'lead_id': l['id'],
        'tipo': 'nota',
        'conteudo': msg,
        'created_at': created_at,
    }).execute()

    nome = l['nome_loja'] or f"@{l['instagram']}"
    hora_br = quando.strftime('%H:%M:%S')
    print(f"✓ {nome} (@{l['instagram']}) | {hora_br} BR | \"{msg}\"")
    inseridos += 1

print(f'\nTotal inserido: {inseridos} interacoes')
