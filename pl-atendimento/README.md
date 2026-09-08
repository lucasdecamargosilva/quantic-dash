# PL Atendimento

Painel local de atendimento comercial da Provou Levou, integrado ao WhatsApp e ao CRM do Quantic Dash.

## Configuração

1. Copie `.env.example` para `.env.local`.
2. Preencha `UAZAPI_TOKEN` e `GEMINI_KEY`.
3. Se o Quantic Dash não estiver na pasta irmã esperada, preencha `PL_CRM_URL` e `PL_CRM_KEY`.
4. Execute `painel.bat` no Windows ou `python painel.py`.
5. Abra `http://localhost:8781`.

O banco local, as conversas, os logs e as chaves ficam fora do Git.

## Atualização em tempo real

`live_events.py` mantém uma conexão SSE de saída com a UAZAPI. Quando uma mensagem chega, o servidor grava no SQLite e publica imediatamente um evento local em `/api/events`; a tela atualiza sem esperar polling. O token fica no servidor. Há reconexão automática, deduplicação e polling apenas como recuperação. `/api/sync` informa o estado da conexão e os contadores.
