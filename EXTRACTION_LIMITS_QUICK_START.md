# 📊 RESUMO RÁPIDO - Sistema de Limites de Extração

## ✅ Como Saber Quantas Extrações Foram Feitas no Dia?

### Opção 1: Via JavaScript (Frontend)
```javascript
const stats = await extractionLimits.getDailyStats();
console.log(stats);
// {
//   instagram: { used: 45, limit: 100, remaining: 55 },
//   google_maps: { used: 23, limit: 100, remaining: 77 },
//   plan: 'starter'
// }
```

### Opção 2: Via SQL (Banco de Dados)
```sql
-- Ver extrações do usuário atual hoje
SELECT channel, count 
FROM daily_extractions 
WHERE user_id = auth.uid() 
AND extraction_date = current_date;

-- Resultado:
-- channel      | count
-- instagram    | 45
-- google_maps  | 23
```

### Opção 3: Via Função RPC
```javascript
const result = await supabaseClient.rpc('can_extract', {
    p_user_id: user.id,
    p_channel: 'instagram',
    p_count: 1
});

console.log(`Usado hoje: ${result.current_count}/${result.limit}`);
// Usado hoje: 45/100
```

## 🎯 Fluxo Completo

```
┌─────────────────────────────────────────────────────────┐
│ 1. USUÁRIO CLICA EM "INICIAR EXTRAÇÃO"                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 2. VERIFICAR LIMITE                                     │
│    const check = await canExtract('instagram', 1)       │
│                                                          │
│    Retorna:                                             │
│    - can_extract: true/false                            │
│    - current_count: 45                                  │
│    - limit: 100                                         │
│    - remaining: 55                                      │
└─────────────────────────────────────────────────────────┘
                          ↓
                    ┌─────────┐
                    │ Pode?   │
                    └─────────┘
                    ↙         ↘
              ❌ NÃO          ✅ SIM
                ↓               ↓
    ┌──────────────────┐   ┌──────────────────┐
    │ Mostrar erro:    │   │ Fazer extração   │
    │ "Limite atingido"│   │                  │
    │ Sugerir upgrade  │   └──────────────────┘
    └──────────────────┘            ↓
                            ┌──────────────────┐
                            │ Extração OK?     │
                            └──────────────────┘
                                    ↓
                            ┌──────────────────┐
                            │ Incrementar:     │
                            │ incrementCount() │
                            │ 45 → 46          │
                            └──────────────────┘
                                    ↓
                            ┌──────────────────┐
                            │ Atualizar UI     │
                            │ "46/100 hoje"    │
                            └──────────────────┘
```

## 📋 Checklist de Implementação

- [ ] 1. Executar `setup_extraction_limits.sql` no Supabase
- [ ] 2. Adicionar `<script src="extraction-limits.js"></script>` no captacao.html
- [ ] 3. Inicializar: `extractionLimits = new ExtractionLimitsManager(supabaseClient)`
- [ ] 4. Verificar antes: `await extractionLimits.canExtract(channel, 1)`
- [ ] 5. Incrementar depois: `await extractionLimits.incrementCount(channel, 1)`
- [ ] 6. Mostrar na UI: `await extractionLimits.getDailyStats()`

## 🔢 Limites por Plano

| Plano       | Instagram | Google Maps | Total/Dia |
|-------------|-----------|-------------|-----------|
| Starter     | 100       | 100         | 200       |
| Growth      | 300       | 300         | 600       |
| Enterprise  | 500       | 500         | 1000      |

## 💡 Vantagens desta Solução

✅ **Simples de usar** - Apenas 2 funções principais
✅ **Automático** - Reseta todo dia automaticamente
✅ **Por usuário** - Cada usuário tem seu próprio limite
✅ **Por canal** - Instagram e Google Maps separados
✅ **Tempo real** - Atualiza instantaneamente
✅ **Seguro** - RLS configurado, não pode burlar
✅ **Escalável** - Suporta milhares de usuários
✅ **Auditável** - Histórico de 30 dias mantido

## 🚀 Uso Rápido

```javascript
// Inicializar (uma vez)
extractionLimits = new ExtractionLimitsManager(supabaseClient);
await extractionLimits.init();

// Antes de extrair
const check = await extractionLimits.canExtract('instagram', 1);
if (!check.can_extract) {
    alert(`Limite atingido! ${check.current_count}/${check.limit}`);
    return;
}

// Fazer extração...
// ...

// Após sucesso
await extractionLimits.incrementCount('instagram', 1);

// Mostrar na UI
const stats = await extractionLimits.getDailyStats();
console.log(`Instagram: ${stats.instagram.used}/${stats.instagram.limit}`);
```

## 📊 Queries Úteis

```sql
-- Ver meu uso de hoje
SELECT * FROM daily_extractions 
WHERE user_id = auth.uid() 
AND extraction_date = current_date;

-- Ver meu plano
SELECT plan_name FROM user_plans 
WHERE user_id = auth.uid();

-- Verificar se posso extrair (via função)
SELECT can_extract(auth.uid(), 'instagram', 1);

-- Resetar meu contador (admin)
DELETE FROM daily_extractions 
WHERE user_id = auth.uid() 
AND extraction_date = current_date;
```

## 🎨 Exemplo de UI

```
┌─────────────────────────────────────────────┐
│  📊 Uso de Extrações Hoje                   │
├─────────────────────────────────────────────┤
│                                             │
│  📸 Instagram                               │
│  ████████████░░░░░░░░  45/100              │
│  Restam: 55 extrações                       │
│                                             │
│  📍 Google Maps                             │
│  ████████░░░░░░░░░░░░  23/100              │
│  Restam: 77 extrações                       │
│                                             │
│  💎 Plano: STARTER                          │
│  [Fazer Upgrade]                            │
└─────────────────────────────────────────────┘
```

## 📁 Arquivos Criados

1. `database/setup_extraction_limits.sql` - Schema do banco
2. `extraction-limits.js` - Módulo JavaScript
3. `extraction-limits-integration-example.js` - Exemplos de uso
4. `EXTRACTION_LIMITS_README.md` - Documentação completa
5. `QUICK_START.md` - Este arquivo (resumo rápido)
