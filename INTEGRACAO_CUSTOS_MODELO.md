# Integração Dashboard com Supabase - Tabela custos_modelo

## ✅ O que foi implementado

### 1. **Filtro de Ano (2025/2026)**
- Botões no header para alternar entre 2025 e 2026
- Filtra dados da tabela `custos_modelo` pela coluna `data_request`
- Atualiza automaticamente os cards de IA ao mudar o ano

### 2. **Conexão com Tabela custos_modelo**

#### Estrutura da Tabela:
```sql
custos_modelo (
    input_tokens BIGINT,
    output_tokens BIGINT,
    cost_input_usd DECIMAL,
    cost_output_usd DECIMAL,
    total_usd DECIMAL,
    data_request DATE
)
```

#### Mapeamento para Dashboard:

| Coluna Supabase | Card Dashboard | Descrição |
|----------------|----------------|-----------|
| `input_tokens` | Input (Entrada) - Valor | Tokens de entrada em milhões |
| `cost_input_usd` | Input (Entrada) - Custo | Custo em USD/BRL |
| `output_tokens` | Output (Saída) - Valor | Tokens de saída em milhões |
| `cost_output_usd` | Output (Saída) - Custo | Custo em USD/BRL |
| `total_usd` | Consumo Total | Custo total em USD/BRL |
| `data_request` | - | Usado para filtrar por ano |

### 3. **Funcionalidades**

#### ✅ Agregação de Dados
- Soma todos os registros do ano selecionado
- Converte tokens para milhões (divide por 1.000.000)
- Formata valores em USD ou BRL

#### ✅ Conversão de Moeda
- Toggle USD/BRL funciona com dados do Supabase
- Taxa de câmbio: 1 USD = 5 BRL (configurável)

#### ✅ Tempo Real
- Subscrição a mudanças na tabela `custos_modelo`
- Atualiza automaticamente quando novos dados são inseridos
- Verifica se a mudança afeta o ano selecionado

## 🚀 Como Usar

### Passo 1: Configurar Credenciais

Edite o arquivo `supabase-integration.js` (linhas 2-3):

```javascript
const SUPABASE_URL = 'https://seu-projeto.supabase.co';
const SUPABASE_ANON_KEY = 'sua-chave-publica-aqui';
```

### Passo 2: Verificar Estrutura da Tabela

No Supabase SQL Editor, verifique se sua tabela tem a estrutura correta:

```sql
SELECT * FROM custos_modelo LIMIT 5;
```

### Passo 3: Inserir Dados de Teste

```sql
-- Dados para 2025
INSERT INTO custos_modelo (
    input_tokens, 
    output_tokens, 
    cost_input_usd, 
    cost_output_usd, 
    total_usd, 
    data_request
) VALUES 
    (5000000, 2000000, 15.00, 60.00, 75.00, '2025-01-15'),
    (7500000, 2200000, 22.50, 66.00, 88.50, '2025-02-20'),
    (10000000, 3000000, 30.00, 90.00, 120.00, '2025-03-10');

-- Dados para 2026
INSERT INTO custos_modelo (
    input_tokens, 
    output_tokens, 
    cost_input_usd, 
    cost_output_usd, 
    total_usd, 
    data_request
) VALUES 
    (8000000, 3000000, 24.00, 90.00, 114.00, '2026-01-15'),
    (12000000, 4000000, 36.00, 120.00, 156.00, '2026-02-20');
```

### Passo 4: Testar

1. Abra o dashboard no navegador
2. Abra o Console (F12)
3. Você verá:
   ```
   Initializing Supabase connection...
   Fetching AI costs for year 2025...
   Found X records for 2025
   Aggregated totals: {...}
   AI Metrics display updated successfully
   ```

4. Clique no botão **2026** para ver os dados de 2026
5. Clique em **USD/BRL** para alternar a moeda

## 📊 Exemplo de Cálculo

### Dados no Supabase (2025):
```
Registro 1: input_tokens=5000000, cost_input_usd=15.00
Registro 2: input_tokens=7500000, cost_input_usd=22.50
Registro 3: input_tokens=10000000, cost_input_usd=30.00
```

### Resultado no Dashboard:
```
Input Tokens: 22.5 M (5M + 7.5M + 10M = 22.5M)
Custo Input: $ 67.50 (15 + 22.50 + 30 = 67.50)
```

## 🔄 Fluxo de Dados

```
1. Usuário clica em "2025" ou "2026"
   ↓
2. fetchAICostsByYear(year) é chamado
   ↓
3. Supabase busca registros onde:
   data_request >= '2025-01-01' AND data_request <= '2025-12-31'
   ↓
4. aggregateAICosts() soma todos os valores
   ↓
5. updateAIMetricsDisplay() atualiza os cards
   ↓
6. Valores aparecem no dashboard
```

## 🎯 Funções Principais

### `fetchAICostsByYear(year)`
Busca e agrega dados do Supabase para o ano especificado.

### `aggregateAICosts(data)`
Soma todos os registros retornados do Supabase.

### `updateAIMetricsDisplay(costs)`
Atualiza os 4 cards de IA com os dados agregados.

### `setupYearFilter()`
Configura os event listeners dos botões de ano.

### `subscribeToAICostsUpdates()`
Habilita atualizações em tempo real.

## 🔧 Personalização

### Mudar Taxa de Câmbio
```javascript
const USD_TO_BRL = 5.0; // Linha 13 do supabase-integration.js
```

### Adicionar Mais Anos
```html
<!-- No index.html -->
<div class="year-filter">
    <button class="year-btn" data-year="2024">2024</button>
    <button class="year-btn active" data-year="2025">2025</button>
    <button class="year-btn" data-year="2026">2026</button>
    <button class="year-btn" data-year="2027">2027</button>
</div>
```

### Mudar Orçamento Mensal
```javascript
// Linha 167 do supabase-integration.js
const monthlyBudget = 220; // Altere para seu orçamento
```

## ❓ Troubleshooting

### Dados não aparecem
1. Verifique as credenciais do Supabase
2. Confirme que a tabela `custos_modelo` existe
3. Verifique se há dados para o ano selecionado
4. Abra o Console (F12) e veja os logs

### Erro "table does not exist"
Execute no SQL Editor:
```sql
CREATE TABLE IF NOT EXISTS custos_modelo (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    input_tokens BIGINT,
    output_tokens BIGINT,
    cost_input_usd DECIMAL(10,2),
    cost_output_usd DECIMAL(10,2),
    total_usd DECIMAL(10,2),
    data_request DATE NOT NULL
);
```

### Real-time não funciona
1. Vá em Database → Replication no Supabase
2. Habilite replication para a tabela `custos_modelo`

## 📈 Próximos Passos

- [ ] Adicionar filtro por mês
- [ ] Criar gráfico de evolução mensal
- [ ] Exportar dados para CSV
- [ ] Dashboard de comparação ano a ano
- [ ] Alertas de orçamento excedido

## 🎉 Pronto!

Agora seu dashboard está conectado ao Supabase e filtrando dados por ano!
