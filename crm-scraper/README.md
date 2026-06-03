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
| `instagram.py`          | Coleta perfis no Instagram por keyword (Apify) |
| `tiktok.py`             | Coleta perfis no TikTok por **keyword** (Apify) — `plataforma=tiktok` |
| `coletar_seguidores_tiktok.py` | Coleta perfis no TikTok por **hashtag** (mais denso em lojas) |
| `verificador.py`        | Filtra leads (tem provador? domínio válido?) |
| `enviar_dm.py`          | Envia DMs automatizadas no Instagram |
| `enviar_dm_tiktok.py`   | Envia DMs no TikTok (sem botão Message → cai pro email) |
| `coletar_emails.py`     | Raspa email de contato do site (qualquer plataforma) |
| `enviar_email.py`       | Dispara email via SMTP (qualquer plataforma) |
| `importar_conversas.py` | Sincroniza conversas para Supabase |
| `exportar.py`           | Exporta leads do **Instagram** (não tocar — fluxo que funciona) |
| `exportar_tiktok.py`    | Exporta leads do **TikTok** (`plataforma=tiktok`) |
| `google_shopping.py`    | Busca lojas via Google Shopping (APIFY) |

## Fluxo TikTok (coleta + filtragem + CRM)

> Totalmente **isolado** do Instagram: os arquivos `instagram.py`, `exportar.py` e
> `enviar_dm.py` não são alterados. A migration só **adiciona** a coluna `plataforma`
> (aditiva, sem mexer em constraints) — o fluxo do Instagram segue idêntico.

```bash
# 1. Migration (1x) — só adiciona a coluna plataforma
#    rodar database/add_plataforma_tiktok.sql no Supabase

# 2. Coleta + filtragem — dois métodos (o de hashtag é bem mais denso em lojas)
python coletar_seguidores_tiktok.py --limit 30 --min-seg 1000   # por hashtag (recomendado)
python tiktok.py --limit 30 --min-seg 1000                      # por keyword

# 3. CRM — sobe os leads filtrados pro Supabase (marcados plataforma=tiktok)
python exportar_tiktok.py
```

> **Diferenças do TikTok** (descobertas testando): a bio costuma vir vazia e não há
> campo de site/link — por isso o filtro **não exige site** e guarda a URL do perfil
> TikTok como contato. Sinais de loja usados: `ttSeller` (TikTok Shop) e `commerceUser`.
>
> **Custo:** os actors `clockworks/*` do TikTok são pagos por resultado no Apify.
> Se aparecer `402 not-enough-usage-to-run-paid-actor`, é saldo de uso esgotado.
>
> Disparo de mensagem (DM/email) fica para depois. O `enviar_dm_tiktok.py` existe
> mas não é executado neste fluxo.

## Conecta com qual banco?

O mesmo Supabase do dashboard (`quantic-supabase.k5jwra.easypanel.host`).
Tabelas: `leads`, `interacoes` (criadas pelas migrations do CRM).

## ⚠️ Observações

- Usar **service_role key** no `.env` — os scripts fazem inserts em lote e RLS `authenticated` bloqueia acesso direto sem sessão
- Automação de DM no Instagram pode violar ToS — usar com moderação e conta dedicada
- `data/` é diretório de trabalho local (outputs JSON), ignorado no git
