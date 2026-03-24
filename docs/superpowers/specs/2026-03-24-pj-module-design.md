# Design Spec: Módulo PJ — Quantic Dashboard

**Date:** 2026-03-24
**Status:** Approved

---

## Contexto

O Quantic Dashboard é uma SPA multi-página em vanilla HTML/CSS/JS com design escuro e identidade visual roxa (#8b5cf6). Usa Phosphor Icons (`ph-fill` variant), CSS custom properties e Supabase como backend.

A página `custos.html` já existe e cobre as **saídas** fixas e variáveis da empresa + Pró-Labore (dados estáticos/hardcoded). O módulo PJ acrescenta o lado de **entradas** (receitas, clientes) e os demonstrativos derivados (DRE, Fluxo de Caixa), todos com dados reais do Supabase.

---

## Abordagem

Opção A: páginas separadas. Cada nova tela é um arquivo HTML independente adicionado ao sidebar, seguindo o padrão das páginas existentes.

---

## Páginas Novas

| Arquivo | Nome nav | Ícone Phosphor (ph-fill) |
|---|---|---|
| `receitas.html` | Receitas | `ph-money` |
| `clientes.html` | Clientes | `ph-buildings` |
| `dre.html` | DRE | `ph-receipt` |
| `fluxo-caixa.html` | Fluxo de Caixa | `ph-bank` |

As quatro ficam agrupadas no sidebar após o link "Custos".

> Ícones: `ph-money` (verificado em index.html:611), `ph-buildings` (verificado no projeto), `ph-receipt` (verificado em index.html via custos nav), `ph-bank` (verificado em index.html:835). Todos são `ph-fill` e existem no CDN em uso.

---

## Modelo de Dados (Supabase)

### `pj_clientes`
```sql
id          uuid primary key default gen_random_uuid()
nome        text not null
documento   text
email       text
telefone    text
ativo       boolean default true
created_at  timestamptz default now()
```

### `pj_receitas`
```sql
id                uuid primary key default gen_random_uuid()
cliente_id        uuid references pj_clientes(id)
descricao         text
valor             numeric not null
valor_recebido    numeric default 0
data_emissao      date
data_vencimento   date not null
data_recebimento  date                          -- preenchido ao marcar como recebido
status            text check (status in ('open','received','overdue','cancelled')) default 'open'
created_at        timestamptz default now()
```

**Regra de status `overdue`:** não há trigger de banco. O status `overdue` é computado em JS na camada de apresentação — qualquer receita com `status = 'open'` e `data_vencimento < hoje` é exibida com badge vermelho e contada nos cards de vencido. O campo `status` no banco permanece `'open'` até o usuário agir.

**Ação "Marcar como Recebido":** faz `UPDATE SET status = 'received', valor_recebido = valor, data_recebimento = today`. Pagamentos parciais não são suportados nesta fase — `valor_recebido` sempre recebe o valor total.

### `pj_custos_lancados`
Lançamentos de custos — tanto pagamentos já realizados quanto custos planejados/agendados futuros. Usado pelo DRE (custos pagos no mês) e pelo Fluxo de Caixa (projeção de saídas futuras).

```sql
id             uuid primary key default gen_random_uuid()
descricao      text not null
valor          numeric not null
data_pagamento date not null     -- data do pagamento real ou previsto
categoria      text
pago           boolean default false  -- false = agendado, true = pago
created_at     timestamptz default now()
```

**DRE** usa: `WHERE data_pagamento` no mês selecionado (todos, independente de `pago`).
**Fluxo de Caixa** usa apenas saídas futuras: `WHERE data_pagamento >= today`.

Os custos estáticos de `custos.html` **não alimentam** este módulo — `custos.html` é uma página informativa separada. O DRE reflete apenas o que for lançado em `pj_custos_lancados`.

### `pj_config`
Configurações persistentes do módulo PJ por usuário autenticado.

```sql
id       uuid primary key default gen_random_uuid()
user_id  uuid references auth.users(id) not null
chave    text not null
valor    text not null
unique(user_id, chave)
```

Linha do saldo inicial: `chave = 'saldo_inicial_caixa'`, `valor = '15000.00'`.
UPSERT usa `ON CONFLICT (user_id, chave) DO UPDATE SET valor = EXCLUDED.valor`.

> Fornecedores e Contas a Pagar formais ficam para uma segunda fase.

---

## UI por Página

### `receitas.html`

**4 cards topo:**
- "Total a Receber" = soma `valor` onde `status = 'open'` (inclui overdue computado), sem filtro de data
- "Recebido no Mês" = soma `valor_recebido` onde `status = 'received'` e `data_recebimento` no mês selecionado
- "Vencido" = soma `valor` onde `status = 'open'` e `data_vencimento < hoje`
- "A Vencer em 7 dias" = soma `valor` onde `status = 'open'` e `data_vencimento` entre hoje e hoje+7

**Filtros:** período (mês/ano, filtra por `data_vencimento`) + status dropdown + busca por nome do cliente

**Lista de lançamentos:** cliente, descrição, valor, data vencimento, badge de status, botão "Marcar como Recebido"
- Badge status derivado em JS: `status === 'open' && data_vencimento < hoje` → vermelho ("Vencido"); `status === 'open'` → roxo ("A Receber"); `status === 'received'` → verde ("Recebido"); `status === 'cancelled'` → cinza ("Cancelado")
- Botão "Marcar como Recebido" visível apenas para status open/overdue

**CTA:** botão "Nova Receita" abre modal com campos: cliente (select dos pj_clientes ativos), descrição, valor, data emissão (opcional), data vencimento

**Empty state:** "Nenhuma receita lançada para este período" com botão "Nova Receita"

### `clientes.html`

**Grid de cards:** nome, documento, email, telefone
- "Total faturado" = soma lifetime de `pj_receitas.valor` para esse cliente (sem filtro de data, todos os status exceto cancelled)
- "Em aberto" = soma `valor` onde `status = 'open'`, lifetime. Se houver valor overdue (open + data_vencimento < hoje), exibe sub-label vermelho "R$ X vencido" abaixo do valor em aberto
- Exemplo: "R$ 5.000 em aberto" + sub-label "R$ 4.000 vencido"

**Busca** por nome ou documento

**CTA:** botão "Novo Cliente" abre modal com campos de `pj_clientes`

**Ação:** botão de desativar cliente (ícone trash) → `UPDATE SET ativo = false`. Clientes inativos são ocultados da lista mas mantidos no banco para integridade referencial.

**Empty state:** "Nenhum cliente cadastrado" com botão "Novo Cliente"

### `dre.html`

**Seletor mês/ano** no topo (default: mês atual)

**Tabela demonstrativo** (somente leitura, recalculada ao mudar período):

| Linha | Cálculo |
|---|---|
| Receita Bruta | soma `pj_receitas.valor` onde `data_vencimento` no mês (competência) |
| (−) Deduções | R$ 0,00 — reservado para fase futura |
| Receita Líquida | Receita Bruta − Deduções |
| (−) Custos Operacionais | soma `pj_custos_lancados.valor` onde `data_pagamento` no mês |
| **Resultado Operacional** | Receita Líquida − Custos Operacionais |
| **Margem %** | Resultado / Receita Bruta × 100 (se Receita Bruta = 0 → exibe "—") |

Linhas Resultado e Margem: verde se ≥ 0, vermelho se < 0.

**Zero/empty state:** se ambas fontes retornam zero, exibe a tabela com valores zerados + nota "Lance receitas e custos para visualizar o DRE."

### `fluxo-caixa.html`

**Seletor de período:** 30 ou 60 dias a partir de hoje

**Card resumo topo:**
- "Saldo Inicial": lido de `pj_config` onde `chave = 'saldo_inicial_caixa'` e `user_id = user.id`. Campo editável inline — ao alterar, faz UPSERT. Default: R$ 0,00 se chave não existir.
- "Total Entradas": soma das entradas do período
- "Total Saídas": soma das saídas do período
- "Saldo Final": Saldo Inicial + Total Entradas − Total Saídas

**Tabela dia a dia:** data | entradas do dia | saídas do dia | saldo acumulado
- Células de saldo acumulado: verde se ≥ 0, vermelho se < 0
- Dias sem movimentação mostram R$ 0,00 e saldo igual ao dia anterior

**Fontes de dados:**
- **Entradas** = `pj_receitas` com `data_vencimento` no período e `status = 'open'` apenas (receitas já recebidas não entram — são caixa passado, não projeção)
- **Saídas** = `pj_custos_lancados` com `data_pagamento >= hoje` e dentro do período (apenas custos futuros/agendados — custo com `data_pagamento < hoje` já foi pago e não aparece na projeção)

**Empty state:** "Nenhuma movimentação projetada para este período."

---

## Padrões de Implementação

- Seguir estrutura HTML/CSS/JS das páginas existentes (sem build step, sem frameworks)
- Supabase JS SDK via CDN (já presente nas outras páginas)
- Phosphor Icons via CDN, variant `ph-fill` (padrão do projeto)
- CSS custom properties do projeto: `--primary-purple`, `--text-muted`, `--bg-dark`, etc.
- Modais com overlay escuro, fundo `--bg-card`, botões Cancelar/Salvar
- Sidebar copiado de página existente com `active` no link correto da nova página
- Todas as queries Supabase com `await` e tratamento de erro exibido inline na página
- Status `overdue` é sempre computado em JS (`status === 'open' && new Date(data_vencimento) < today`) — nunca escrito no banco
- `user_id` obtido via `supabase.auth.getUser()` para queries em `pj_config`
