# 🔧 Guia de Troubleshooting - Supabase não está mostrando dados

## ✅ Problema Resolvido!

Removi o código com dados fixos (hardcoded) do `script.js` que estava sobrescrevendo os dados do Supabase.

## 📋 Checklist para Verificar

### 1. ✅ Credenciais Configuradas

Abra `supabase-integration.js` e verifique se você substituiu:

```javascript
const SUPABASE_URL = 'YOUR_SUPABASE_URL';  // ❌ ERRADO
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';  // ❌ ERRADO
```

Por suas credenciais reais:

```javascript
const SUPABASE_URL = 'https://xxxxx.supabase.co';  // ✅ CORRETO
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';  // ✅ CORRETO
```

### 2. 🧪 Teste a Conexão

Abra o arquivo de teste no navegador:

```bash
open /Users/lucasdecamargosilva/.gemini/antigravity/scratch/quantic_dashboard/test-supabase.html
```

Ou simplesmente abra `test-supabase.html` no navegador.

Este arquivo vai:
- ✅ Verificar se o Supabase está conectado
- ✅ Mostrar quantos registros existem para 2025
- ✅ Mostrar quantos registros existem para 2026
- ✅ Calcular os totais agregados
- ✅ Mostrar erros detalhados se houver

### 3. 📊 Verifique os Dados no Supabase

No Supabase, execute:

```sql
-- Ver todos os dados
SELECT * FROM custos_modelo ORDER BY data_request DESC;

-- Contar registros por ano
SELECT 
    EXTRACT(YEAR FROM data_request) as ano,
    COUNT(*) as total_registros,
    SUM(total_usd) as total_custo
FROM custos_modelo
GROUP BY EXTRACT(YEAR FROM data_request)
ORDER BY ano;
```

### 4. 🔍 Verifique o Console do Navegador

Abra o dashboard e pressione **F12** para abrir o Console.

Você deve ver:

```
✅ Initializing Supabase connection...
✅ Supabase URL: https://xxxxx.supabase.co
✅ Fetching AI costs for year 2025...
✅ Found X records for 2025
✅ Aggregated totals: {...}
✅ AI Metrics display updated successfully
✅ Dashboard initialized successfully!
```

### 5. ❌ Erros Comuns

#### Erro: "Invalid API key"
**Solução:** Verifique se copiou a chave correta do Supabase (Settings → API → anon/public key)

#### Erro: "relation custos_modelo does not exist"
**Solução:** A tabela não existe. Crie ela no SQL Editor:

```sql
CREATE TABLE custos_modelo (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    input_tokens BIGINT,
    output_tokens BIGINT,
    cost_input_usd DECIMAL(10,2),
    cost_output_usd DECIMAL(10,2),
    total_usd DECIMAL(10,2),
    data_request DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Erro: "No data found for year 2025"
**Solução:** Não há dados para 2025. Insira alguns:

```sql
INSERT INTO custos_modelo (
    input_tokens, 
    output_tokens, 
    cost_input_usd, 
    cost_output_usd, 
    total_usd, 
    data_request
) VALUES 
    (5000000, 2000000, 15.00, 60.00, 75.00, '2025-01-15'),
    (7500000, 2200000, 22.50, 66.00, 88.50, '2025-02-20');
```

#### Cards ainda mostram valores antigos
**Solução:** 
1. Limpe o cache do navegador (Cmd+Shift+R no Mac)
2. Verifique se `script.js` não tem dados hardcoded
3. Certifique-se de que `supabase-integration.js` está sendo carregado ANTES de `script.js` no HTML

### 6. 📝 Ordem Correta dos Scripts no HTML

No `index.html`, os scripts devem estar nesta ordem:

```html
<!-- Supabase Client Library -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

<!-- Dashboard Scripts -->
<script src="supabase-integration.js"></script>  <!-- PRIMEIRO -->
<script src="script.js"></script>                <!-- DEPOIS -->
```

## 🎯 Teste Rápido

1. Abra `test-supabase.html` no navegador
2. Clique em "Testar Conexão"
3. Se aparecer ✅ verde, está funcionando!
4. Clique em "Buscar Dados 2025"
5. Você deve ver seus dados do Supabase

## 📞 Ainda não funciona?

Envie um print do Console (F12) mostrando os erros que aparecem.

## ✅ Checklist Final

- [ ] Credenciais configuradas em `supabase-integration.js`
- [ ] Tabela `custos_modelo` existe no Supabase
- [ ] Há dados na tabela para 2025 ou 2026
- [ ] `test-supabase.html` mostra conexão bem-sucedida
- [ ] Console do navegador não mostra erros
- [ ] Scripts estão na ordem correta no HTML
- [ ] Cache do navegador foi limpo

Se todos os itens estiverem ✅, o dashboard deve estar mostrando os dados do Supabase!
