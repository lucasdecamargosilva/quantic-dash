# CRM Scraper (standalone)

Scripts Python de prospecção / automação de Instagram que acompanham o módulo CRM.
Importados do projeto original `crmquantic` (pasta `scraper/`).

**Não faz parte do deploy do dashboard.** Roda manualmente ou como job separado.

## Setup

```bash
cd crm-scraper
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # criar o arquivo e preencher
```

## Variáveis de ambiente (`.env`)

```
SUPABASE_URL=https://quantic-supabase.k5jwra.easypanel.host
SUPABASE_KEY=<service_role_key>          # service role, não anon
APIFY_TOKEN=<token_do_apify>             # usado pelo google_shopping.py
INSTAGRAM_USERNAME=<usuário>             # usado por instagram.py / enviar_dm.py
INSTAGRAM_PASSWORD=<senha>
```

## Scripts

| Script | Função |
|---|---|
| `coletar_seguidores.py` | Coleta seguidores de contas seed no Instagram |
| `instagram.py`          | Helpers de login / sessão no Instagram |
| `verificador.py`        | Filtra leads (tem provador? domínio válido?) |
| `enviar_dm.py`          | Envia DMs automatizadas |
| `importar_conversas.py` | Sincroniza conversas para Supabase |
| `exportar.py`           | Exporta dataset local |
| `google_shopping.py`    | Busca lojas via Google Shopping (APIFY) |

## Conecta com qual banco?

O mesmo Supabase do dashboard (`quantic-supabase.k5jwra.easypanel.host`).
Tabelas: `leads`, `interacoes` (criadas pelas migrations do CRM).

## ⚠️ Observações

- Usar **service_role key** no `.env` — os scripts fazem inserts em lote e RLS `authenticated` bloqueia acesso direto sem sessão
- Automação de DM no Instagram pode violar ToS — usar com moderação e conta dedicada
- `data/` é diretório de trabalho local (outputs JSON), ignorado no git
