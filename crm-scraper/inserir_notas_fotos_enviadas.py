"""Insere 1 nota por lead em status 'fotos_enviadas'.
Mensagem sorteada entre 3 opcoes, data 2026-06-02 com hora aleatoria entre 14:00 e 15:30."""

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

MENSAGENS = [
    "Chamei o cliente novamente, mas não respondeu",
    "Efetuado follow UP, aguardando retorno",
    "Atendente vai passar para o responsável",
]

# Janela: 02/06/2026 14:00 a 15:30 (90 min = 5400 segundos) — horario BR (UTC-3)
BR_TZ = timezone(timedelta(hours=-3))
INICIO = datetime(2026, 6, 2, 14, 0, 0, tzinfo=BR_TZ)
FIM = datetime(2026, 6, 2, 15, 30, 0, tzinfo=BR_TZ)
JANELA_SEGUNDOS = int((FIM - INICIO).total_seconds())

# Busca leads em fotos_enviadas
leads = (
    sb.table('leads')
    .select('id, instagram, nome_loja, responsavel')
    .eq('status', 'fotos_enviadas')
    .execute()
    .data
)
print(f'Encontrados {len(leads)} leads em fotos_enviadas\n')

random.seed()  # garante variacao real

inseridos = 0
for l in leads:
    msg = random.choice(MENSAGENS)
    # horario aleatorio na janela
    offset = random.randint(0, JANELA_SEGUNDOS)
    quando = INICIO + timedelta(seconds=offset)
    # ISO 8601 com timezone
    created_at = quando.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')

    res = sb.table('interacoes').insert({
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
