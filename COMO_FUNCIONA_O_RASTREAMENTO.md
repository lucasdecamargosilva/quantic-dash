# 🎯 CORREÇÃO: Limite de LEADS, não de Extrações

## ❌ Entendimento Anterior (ERRADO)
- Limite: 100 **cliques no botão** por dia
- Exemplo: Clicou 100 vezes = bloqueado

## ✅ Entendimento Correto (CERTO)
- Limite: 100 **leads capturados** por dia
- Exemplo: Capturou 100 leads (em 1, 2, 5 ou 10 cliques) = bloqueado

---

## 📊 Exemplos Práticos

### Plano Starter (100 leads/dia)

**Cenário 1:**
- Extração 1: 50 leads → Total: 50/100 ✅
- Extração 2: 30 leads → Total: 80/100 ✅
- Extração 3: 15 leads → Total: 95/100 ✅
- Extração 4: 10 leads → ❌ BLOQUEADO (95 + 10 = 105 > 100)

**Cenário 2:**
- Extração 1: 100 leads → Total: 100/100 ✅
- Extração 2: Qualquer quantidade → ❌ BLOQUEADO

---

## 🔧 Como Implementar Corretamente

### OPÇÃO 1: Contar Após Salvar no Banco (Recomendado)

Quando o n8n salva os leads no Supabase, ele deve também incrementar o contador.

#### No n8n Workflow:

```javascript
// Após inserir leads no Supabase
const leadsInseridos = 45; // Quantidade que foi inserida

// Incrementar contador
await supabase.rpc('increment_extraction_count', {
    p_user_id: userId,
    p_channel: 'instagram',
    p_count: leadsInseridos  // ← Passa a QUANTIDADE de leads
});
```

### OPÇÃO 2: Contar Quando Buscar Histórico (Frontend)

Quando o job finaliza, contar quantos leads NOVOS apareceram.

```javascript
// Antes da extração
const { data: leadsBefore } = await supabaseClient
    .from('leads_qualificados')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startOfToday);

const countBefore = leadsBefore?.count || 0;

// ... faz extração ...

// Depois da extração
const { data: leadsAfter } = await supabaseClient
    .from('leads_qualificados')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startOfToday);

const countAfter = leadsAfter?.count || 0;
const newLeads = countAfter - countBefore;

// Incrementa com a quantidade real
await extractionLimits.incrementCount('instagram', newLeads);
```

### OPÇÃO 3: Usar Trigger no Banco (Automático)

Criar um trigger que conta automaticamente quando leads são inseridos.

```sql
-- Trigger que incrementa automaticamente
CREATE OR REPLACE FUNCTION auto_count_leads()
RETURNS TRIGGER AS $$
BEGIN
    -- Incrementa contador quando lead é inserido
    PERFORM increment_extraction_count(
        NEW.user_id,
        'instagram',  -- ou detectar pelo contexto
        1
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER count_instagram_leads
AFTER INSERT ON leads_qualificados
FOR EACH ROW
EXECUTE FUNCTION auto_count_leads();

CREATE TRIGGER count_instagram_cold_leads
AFTER INSERT ON leads_frios
FOR EACH ROW
EXECUTE FUNCTION auto_count_leads();
```

---

## 🎯 Solução Recomendada

### Para Instagram:

**No n8n**, após salvar os leads:
1. Conta quantos leads foram salvos
2. Chama a função `increment_extraction_count` com essa quantidade

### Para Google Maps:

**No frontend**, após a extração:
1. Conta quantos leads NOVOS apareceram na tabela
2. Incrementa o contador com essa quantidade

---

## 📝 Código Atualizado

### 1. Modificar a função de verificação

Antes de extrair, verificar se PODE extrair a quantidade solicitada:

```javascript
// Google Maps - usuário pede 50 leads
const requestedCount = parseInt(document.getElementById('mapsCount').value);

const check = await extractionLimits.canExtract('google_maps', requestedCount);

if (!check.can_extract) {
    alert(`Você só pode extrair mais ${check.remaining} leads hoje!\n` +
          `Já usou: ${check.current_count}/${check.limit}\n` +
          `Solicitado: ${requestedCount}`);
    return;
}
```

### 2. Incrementar com a quantidade real

```javascript
// Instagram - após job finalizar
if (payload.new.status === 'finished') {
    // Buscar quantos leads foram inseridos neste job
    const { data: newLeads } = await supabaseClient
        .from('leads_qualificados')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', meuJobId);  // Se tiver campo job_id
    
    const leadsCount = newLeads?.count || 0;
    
    // Incrementa com a quantidade real
    await extractionLimits.incrementCount('instagram', leadsCount);
    
    console.log(`✅ ${leadsCount} leads contabilizados`);
}
```

---

## 🔄 Fluxo Correto

```
┌─────────────────────────────────────────────────────────┐
│ 1. Usuário quer extrair 50 leads do Google Maps        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Verificar: Já usou 80 leads hoje                    │
│    Limite: 100 leads                                    │
│    Pode extrair 50? 80 + 50 = 130 > 100 ❌              │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Bloquear e sugerir:                                  │
│    "Você só pode extrair mais 20 leads hoje!"          │
└─────────────────────────────────────────────────────────┘
```

OU

```
┌─────────────────────────────────────────────────────────┐
│ 1. Usuário quer extrair 15 leads                       │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Verificar: Já usou 80 leads hoje                    │
│    Limite: 100 leads                                    │
│    Pode extrair 15? 80 + 15 = 95 ≤ 100 ✅               │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Permitir extração                                    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 4. n8n extrai e salva 15 leads                         │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 5. Incrementar contador: +15 leads                      │
│    Total agora: 95/100                                  │
└─────────────────────────────────────────────────────────┘
```

---

## 🎨 UI Atualizada

```
┌─────────────────────────────────────────────┐
│  📊 Limite de Leads Hoje                    │
├─────────────────────────────────────────────┤
│                                             │
│  📸 Instagram                               │
│  ████████████░░░░░░░░  80/100 leads        │
│  Restam: 20 leads disponíveis               │
│                                             │
│  📍 Google Maps                             │
│  ████████░░░░░░░░░░░░  45/100 leads        │
│  Restam: 55 leads disponíveis               │
│                                             │
│  💎 Plano: STARTER                          │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  Extrair quantos leads?                     │
│  [  50  ] leads                             │
│                                             │
│  ⚠️ Você só pode extrair mais 20 leads!    │
│  [INICIAR EXTRAÇÃO] (desabilitado)          │
└─────────────────────────────────────────────┘
```

---

## ✅ Resumo da Correção

| Item | Antes (Errado) | Depois (Correto) |
|------|----------------|------------------|
| **O que conta?** | Cliques no botão | Leads salvos no banco |
| **Limite Starter** | 100 cliques/dia | 100 leads/dia |
| **Incremento** | +1 por clique | +N por quantidade de leads |
| **Verificação** | Antes de clicar | Antes de extrair X leads |

---

## 🚀 Próximos Passos

Qual abordagem você prefere?

1. **Opção A:** n8n incrementa o contador (mais preciso)
2. **Opção B:** Frontend conta leads novos (mais simples)
3. **Opção C:** Trigger automático no banco (mais automático)

Diga qual você quer e eu implemento! 🎯
