# Design Spec: Módulo PJ — Quantic Dashboard

**Date:** 2026-03-24
**Status:** Approved

---

## Contexto

O Quantic Dashboard é uma SPA multi-página em vanilla HTML/CSS/JS com design escuro e identidade visual roxa (#8b5cf6). Usa Phosphor Icons, CSS custom properties e Supabase como backend.

A página `custos.html` já existe e cobre as **saídas** fixas e variáveis da empresa + Pró-Labore. O módulo PJ acrescenta o lado de **entradas** (receitas, clientes) e os demonstrativos derivados (DRE, Fluxo de Caixa).

---

## Abordagem

Opção A: páginas separadas. Cada nova tela é um arquivo HTML independente adicionado ao sidebar, seguindo o padrão das páginas existentes.

---

## Páginas Novas

| Arquivo | Nome nav | Ícone Phosphor |
|---|---|---|
| `receitas.html` | Receitas | `ph-money` |
| `clientes.html` | Clientes | `ph-buildings` |
| `dre.html` | DRE | `ph-file-text` |
| `fluxo-caixa.html` | Fluxo de Caixa | `ph-arrows-left-right` |

As quatro ficam agrupadas no sidebar após o link "Custos".

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
id               uuid primary key default gen_random_uuid()
cliente_id       uuid references pj_clientes(id)
descricao        text
valor            numeric not null
valor_recebido   numeric default 0
data_emissao     date
data_vencimento  date not null
status           text check (status in ('open','received','overdue','cancelled')) default 'open'
created_at       timestamptz default now()
```

### `pj_custos_lancados`
Lançamentos mensais reais pagos — complementa os custos estáticos de `custos.html` para cálculos do DRE e Fluxo de Caixa.
```sql
id             uuid primary key default gen_random_uuid()
descricao      text not null
valor          numeric not null
data_pagamento date not null
categoria      text
created_at     timestamptz default now()
```

> Fornecedores e Contas a Pagar formais ficam para uma segunda fase.

---

## UI por Página

### `receitas.html`
- **4 cards topo:** Total a Receber | Recebido no Mês | Vencido | A Vencer em 7 dias
- **Filtros:** período (mês/ano) + status dropdown + busca por cliente
- **Lista de lançamentos:** cliente, descrição, valor, data vencimento, badge de status colorido, botão "Marcar como Recebido"
- **CTA:** botão "Nova Receita" abre modal com todos os campos de `pj_receitas`
- **Status colors:** open = roxo, received = verde, overdue = vermelho, cancelled = cinza

### `clientes.html`
- **Grid de cards:** nome, documento, email, telefone, total faturado (soma `pj_receitas.valor`), valor em aberto (status open/overdue)
- **Busca** por nome ou documento
- **CTA:** botão "Novo Cliente" abre modal com campos de `pj_clientes`
- **Ação:** desativar cliente (soft delete via `ativo = false`)

### `dre.html`
- **Seletor mês/ano** no topo
- **Tabela demonstrativo** (sem edição, somente leitura):
  - Receita Bruta = soma `pj_receitas.valor` do mês
  - Deduções = 0 (campo futuro)
  - Receita Líquida = Receita Bruta − Deduções
  - Custos Operacionais = soma `pj_custos_lancados.valor` do mês
  - **Resultado Operacional** = Receita Líquida − Custos Op.
  - **Margem %** = Resultado / Receita Bruta × 100
- Linhas de resultado e margem destacadas com cor (verde positivo / vermelho negativo)

### `fluxo-caixa.html`
- **Seletor de período:** 30 ou 60 dias a partir de hoje
- **Card resumo topo:** saldo inicial (manual ou zero) | total entradas | total saídas | saldo final projetado
- **Tabela dia a dia:** data | entradas do dia | saídas do dia | saldo acumulado
- Células de saldo acumulado coloridas: verde se positivo, vermelho se negativo
- Entradas = `pj_receitas` com `data_vencimento` no período e status open/received
- Saídas = `pj_custos_lancados` com `data_pagamento` no período

---

## Padrões de Implementação

- Seguir estrutura HTML/CSS/JS das páginas existentes (sem build step, sem frameworks)
- Supabase JS SDK via CDN (já presente nas outras páginas)
- Phosphor Icons via CDN (já presente)
- CSS custom properties do projeto: `--primary-purple`, `--text-muted`, `--bg-dark`, etc.
- Modais seguem o padrão já usado em outras páginas do dashboard
- Sidebar copiado de página existente com `active` no link correto
- Todas as queries Supabase com `await` e tratamento de erro inline
