# Guia de Integração com Supabase

Este guia mostra como conectar o dashboard Quantic Financeiro ao Supabase.

## 📋 Pré-requisitos

1. Conta no Supabase (gratuita em https://supabase.com)
2. Projeto criado no Supabase

## 🚀 Configuração Rápida

### Passo 1: Obter Credenciais do Supabase

1. Acesse seu projeto no Supabase
2. Vá em **Settings** → **API**
3. Copie:
   - **Project URL** (ex: `https://xxxxx.supabase.co`)
   - **anon/public key** (chave pública)

### Passo 2: Configurar o Dashboard

Abra o arquivo `supabase-integration.js` e substitua:

```javascript
const SUPABASE_URL = 'SUA_URL_AQUI';
const SUPABASE_ANON_KEY = 'SUA_CHAVE_AQUI';
```

### Passo 3: Criar Tabelas no Supabase

Execute estes comandos SQL no **SQL Editor** do Supabase:

#### Tabela de Métricas Financeiras
```sql
CREATE TABLE financial_metrics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    mrr DECIMAL(10,2),
    arr DECIMAL(10,2),
    total_revenue DECIMAL(10,2),
    avg_ticket DECIMAL(10,2),
    growth_percentage DECIMAL(5,2)
);
```

#### Tabela de Métricas de IA
```sql
CREATE TABLE ai_metrics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    input_tokens BIGINT,
    input_cost DECIMAL(10,2),
    output_tokens BIGINT,
    output_cost DECIMAL(10,2),
    total_cost DECIMAL(10,2),
    budget DECIMAL(10,2)
);
```

#### Tabela de Clientes
```sql
CREATE TABLE clients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    name VARCHAR(255) NOT NULL,
    company VARCHAR(255),
    status VARCHAR(50) DEFAULT 'Ativo',
    mrr DECIMAL(10,2),
    plan VARCHAR(50),
    engagement_score INTEGER
);
```

### Passo 4: Inserir Dados de Exemplo

```sql
-- Métricas Financeiras
INSERT INTO financial_metrics (mrr, arr, total_revenue, avg_ticket, growth_percentage)
VALUES (48500, 582000, 62150, 5179, 12);

-- Métricas de IA
INSERT INTO ai_metrics (input_tokens, input_cost, output_tokens, output_cost, total_cost, budget)
VALUES (12500000, 37.50, 4200000, 126.00, 163.50, 220);

-- Clientes
INSERT INTO clients (name, company, status, mrr, plan, engagement_score)
VALUES 
    ('João Silva', 'Tech Corp', 'Ativo', 2500, 'Mensal', 85),
    ('Maria Santos', 'StartupXYZ', 'Ativo', 5000, 'Anual', 92),
    ('Pedro Costa', 'Innovate Ltd', 'Ativo', 1500, 'Mensal', 78);
```

### Passo 5: Ativar a Integração

No arquivo `supabase-integration.js`, descomente as linhas no final:

```javascript
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Initializing Supabase connection...');
    
    // Descomente estas linhas:
    await fetchFinancialMetrics();
    await fetchAIMetrics();
    await fetchClients();
    subscribeToMetricsUpdates();
});
```

## 🔄 Funcionalidades Disponíveis

### 1. Buscar Dados
- `fetchFinancialMetrics()` - Busca métricas financeiras
- `fetchAIMetrics()` - Busca métricas de IA
- `fetchClients()` - Busca lista de clientes

### 2. Atualizações em Tempo Real
- `subscribeToMetricsUpdates()` - Recebe atualizações automáticas quando dados mudam

### 3. Inserir Novos Dados

```javascript
async function addNewClient(clientData) {
    const { data, error } = await supabase
        .from('clients')
        .insert([clientData]);
    
    if (error) console.error('Error:', error);
    else console.log('Client added:', data);
}
```

### 4. Atualizar Dados

```javascript
async function updateMetrics(id, newData) {
    const { data, error } = await supabase
        .from('financial_metrics')
        .update(newData)
        .eq('id', id);
    
    if (error) console.error('Error:', error);
    else console.log('Updated:', data);
}
```

## 🔐 Segurança

### Row Level Security (RLS)

Para proteger seus dados, ative RLS no Supabase:

```sql
-- Ativar RLS
ALTER TABLE financial_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Política de leitura pública (ajuste conforme necessário)
CREATE POLICY "Enable read access for all users" ON financial_metrics
    FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON ai_metrics
    FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON clients
    FOR SELECT USING (true);
```

## 📊 Estrutura de Dados Recomendada

### financial_metrics
- `mrr`: Monthly Recurring Revenue
- `arr`: Annual Recurring Revenue
- `total_revenue`: Receita total do mês
- `avg_ticket`: Ticket médio por cliente
- `growth_percentage`: Percentual de crescimento

### ai_metrics
- `input_tokens`: Tokens de entrada (milhões)
- `input_cost`: Custo de input em USD
- `output_tokens`: Tokens de saída (milhões)
- `output_cost`: Custo de output em USD
- `total_cost`: Custo total
- `budget`: Orçamento mensal

### clients
- `name`: Nome do cliente
- `company`: Empresa
- `status`: Status (Ativo, Inativo, etc.)
- `mrr`: MRR do cliente
- `plan`: Tipo de plano (Mensal, Anual)
- `engagement_score`: Score de engajamento (0-100)

## 🧪 Testar a Conexão

Abra o console do navegador (F12) e você verá:
- "Initializing Supabase connection..."
- "Dashboard updated with Supabase data: {...}"
- "Clients table updated with Supabase data"

## 📚 Recursos Adicionais

- [Documentação do Supabase](https://supabase.com/docs)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [Real-time Subscriptions](https://supabase.com/docs/guides/realtime)

## ❓ Problemas Comuns

### Erro de CORS
Se você tiver problemas de CORS, verifique as configurações de autenticação no Supabase.

### Dados não aparecem
1. Verifique se as credenciais estão corretas
2. Confirme que as tabelas existem
3. Verifique o console do navegador para erros
4. Certifique-se de que há dados nas tabelas

### Real-time não funciona
1. Verifique se o Realtime está habilitado no Supabase
2. Confirme que a tabela tem permissões corretas
