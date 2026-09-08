# PL Atendimento

Painel local de atendimento comercial da Provou Levou, integrado ao WhatsApp e ao CRM do Quantic Dash.

## Configuração

1. Copie `.env.example` para `.env.local`.
2. Preencha `UAZAPI_TOKEN` e `GEMINI_KEY`.
3. Se o Quantic Dash não estiver na pasta irmã esperada, preencha `PL_CRM_URL` e `PL_CRM_KEY`.
4. Execute `painel.bat` no Windows ou `python painel.py`.
5. Abra `http://localhost:8781`.

O banco local, as conversas, os logs e as chaves ficam fora do Git.
