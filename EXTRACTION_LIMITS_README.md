# 🎯 Sistema de Controle de Limites de Extração

Sistema completo para gerenciar limites diários de extração de leads por plano (Starter, Growth, Enterprise).

## 📊 Limites por Plano

| Plano | Instagram | Google Maps |
|-------|-----------|-------------|
| **Starter** | 100/dia | 100/dia |
| **Growth** | 300/dia | 300/dia |
| **Enterprise** | 500/dia | 500/dia |

## 🚀 Como Implementar

### 1️⃣ Configurar o Banco de Dados

Execute o script SQL no Supabase:

```bash
# No Supabase Dashboard > SQL Editor, execute:
database/setup_extraction_limits.sql
```

Isso criará:
- ✅ Tabela `user_plans` - Armazena o plano de cada usuário
- ✅ Tabela `daily_extractions` - Rastreia extrações diárias
- ✅ Função `can_extract()` - Verifica se pode extrair
- ✅ Função `increment_extraction_count()` - Incrementa contador
- ✅ Função `get_plan_limit()` - Retorna limite do plano
- ✅ Políticas RLS configuradas

### 2️⃣ Adicionar Script no Frontend

No arquivo `captacao.html`, adicione no `<head>`:

```html
<script src="extraction-limits.js"></script>
```

### 3️⃣ Inicializar o Sistema

No código JavaScript do `captacao.html`:

```javascript
let extractionLimits;

async function initExtractionLimits() {
    extractionLimits = new ExtractionLimitsManager(window.supabaseClient);
    await extractionLimits.init();
    console.log('✅ Sistema de limites inicializado');
}

// Chamar após Supabase estar pronto
document.addEventListener('DOMContentLoaded', async () => {
    if (await initSupabase()) {
        await initExtractionLimits();
    }
});
```

### 4️⃣ Verificar Antes de Extrair

Modifique a função de extração:

```javascript
btnCapture.onclick = async () => {
    const channel = activeChannel === 'instagram' ? 'instagram' : 'google_maps';
    
    // ✅ VERIFICAR LIMITE
    const check = await extractionLimits.canExtract(channel, 1);
    
    if (!check.can_extract) {
        alert(`❌ Limite diário atingido!\n` +
              `Usado: ${check.current_count}/${check.limit}\n` +
              `Plano: ${check.plan.toUpperCase()}`);
        return;
    }
    
    // Prosseguir com extração...
    try {
        // ... código de extração ...
        
        // ✅ INCREMENTAR APÓS SUCESSO
        await extractionLimits.incrementCount(channel, 1);
        
    } catch (error) {
        console.error('Erro:', error);
    }
};
```

## 📱 Interface do Usuário

### Adicionar Indicadores de Uso

HTML sugerido:

```html
<div class="limits-container">
    <div class="limit-card">
        <i class="ph-fill ph-instagram-logo"></i>
        <div class="limit-info">
            <span class="limit-label">Instagram</span>
            <span class="limit-usage" id="instagram-usage">0/100</span>
        </div>
    </div>
    
    <div class="limit-card">
        <i class="ph-fill ph-map-pin"></i>
        <div class="limit-info">
            <span class="limit-label">Google Maps</span>
            <span class="limit-usage" id="maps-usage">0/100</span>
        </div>
    </div>
</div>
```

CSS sugerido:

```css
.limits-container {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
}

.limit-card {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: rgba(139, 92, 246, 0.1);
    border: 1px solid rgba(139, 92, 246, 0.2);
    border-radius: 8px;
}

.limit-card i {
    font-size: 24px;
    color: var(--primary-purple);
}

.limit-info {
    display: flex;
    flex-direction: column;
}

.limit-label {
    font-size: 11px;
    color: var(--text-muted);
    text-transform: uppercase;
}

.limit-usage {
    font-size: 16px;
    font-weight: 700;
    color: white;
}

/* Estados de alerta */
.limit-card.warning {
    border-color: rgba(251, 191, 36, 0.3);
    background: rgba(251, 191, 36, 0.1);
}

.limit-card.danger {
    border-color: rgba(239, 68, 68, 0.3);
    background: rgba(239, 68, 68, 0.1);
}
```

JavaScript para atualizar:

```javascript
async function updateLimitsUI() {
    const stats = await extractionLimits.getDailyStats();
    
    if (!stats) return;
    
    // Atualiza Instagram
    const instaEl = document.getElementById('instagram-usage');
    instaEl.textContent = `${stats.instagram.used}/${stats.instagram.limit}`;
    
    // Atualiza Google Maps
    const mapsEl = document.getElementById('maps-usage');
    mapsEl.textContent = `${stats.google_maps.used}/${stats.google_maps.limit}`;
    
    // Adiciona classes de alerta
    updateLimitCardState('instagram', stats.instagram);
    updateLimitCardState('google_maps', stats.google_maps);
}

function updateLimitCardState(channel, data) {
    const card = document.querySelector(`[data-channel="${channel}"]`);
    if (!card) return;
    
    const percentage = (data.used / data.limit) * 100;
    
    card.classList.remove('warning', 'danger');
    
    if (percentage >= 100) {
        card.classList.add('danger');
    } else if (percentage >= 80) {
        card.classList.add('warning');
    }
}
```

## 🔧 Funções Disponíveis

### `canExtract(channel, count)`

Verifica se o usuário pode realizar uma extração.

```javascript
const check = await extractionLimits.canExtract('instagram', 1);

// Retorna:
{
    can_extract: true,      // Pode extrair?
    current_count: 45,      // Quantas extrações já fez hoje
    limit: 100,             // Limite do plano
    remaining: 55,          // Quantas restam
    plan: 'starter',        // Plano atual
    requested: 1            // Quantidade solicitada
}
```

### `incrementCount(channel, count)`

Incrementa o contador após extração bem-sucedida.

```javascript
const newTotal = await extractionLimits.incrementCount('instagram', 1);
console.log(`Total de extrações hoje: ${newTotal}`);
```

### `getDailyStats()`

Obtém estatísticas completas do dia.

```javascript
const stats = await extractionLimits.getDailyStats();

// Retorna:
{
    instagram: {
        used: 45,
        limit: 100,
        remaining: 55
    },
    google_maps: {
        used: 23,
        limit: 100,
        remaining: 77
    },
    plan: 'starter'
}
```

### `updatePlan(newPlan)`

Atualiza o plano do usuário (admin).

```javascript
await extractionLimits.updatePlan('growth');
await extractionLimits.updatePlan('enterprise');
```

## 🎨 Melhorias de UX Recomendadas

### 1. Toast de Aviso

Quando estiver perto do limite:

```javascript
if (check.remaining < check.limit * 0.2) {
    showToast(`⚠️ Restam apenas ${check.remaining} extrações hoje!`, 'warning');
}
```

### 2. Modal de Upgrade

Quando atingir o limite:

```javascript
if (!check.can_extract) {
    showUpgradeModal(check.plan, check.limit);
}
```

### 3. Progress Bar

Mostrar visualmente o uso:

```html
<div class="progress-bar">
    <div class="progress-fill" style="width: 45%"></div>
</div>
<span>45/100 extrações</span>
```

## 🔄 Manutenção

### Limpar Dados Antigos

Execute periodicamente (via cron job no Supabase):

```sql
SELECT cleanup_old_extractions();
```

Isso remove registros com mais de 30 dias.

### Resetar Contador de um Usuário

```sql
DELETE FROM daily_extractions
WHERE user_id = 'uuid-do-usuario'
AND extraction_date = current_date;
```

## 📈 Monitoramento

### Ver uso de todos os usuários:

```sql
SELECT 
    u.email,
    up.plan_name,
    de.channel,
    de.count,
    de.extraction_date
FROM daily_extractions de
JOIN auth.users u ON u.id = de.user_id
LEFT JOIN user_plans up ON up.user_id = de.user_id
WHERE de.extraction_date = current_date
ORDER BY de.count DESC;
```

### Ver usuários que atingiram o limite:

```sql
SELECT 
    u.email,
    up.plan_name,
    de.channel,
    de.count,
    CASE up.plan_name
        WHEN 'starter' THEN 100
        WHEN 'growth' THEN 300
        WHEN 'enterprise' THEN 500
    END as limit
FROM daily_extractions de
JOIN auth.users u ON u.id = de.user_id
LEFT JOIN user_plans up ON up.user_id = de.user_id
WHERE de.extraction_date = current_date
AND de.count >= CASE up.plan_name
    WHEN 'starter' THEN 100
    WHEN 'growth' THEN 300
    WHEN 'enterprise' THEN 500
END;
```

## 🎯 Próximos Passos

1. ✅ Executar `setup_extraction_limits.sql` no Supabase
2. ✅ Adicionar `extraction-limits.js` no `captacao.html`
3. ✅ Integrar verificação antes de extrair
4. ✅ Adicionar indicadores visuais na UI
5. ✅ Testar com diferentes planos
6. ✅ Configurar limpeza automática de dados antigos

## 🐛 Troubleshooting

**Erro: "Função can_extract não existe"**
- Execute o SQL `setup_extraction_limits.sql` no Supabase

**Contador não incrementa**
- Verifique se RLS está configurado corretamente
- Confirme que o usuário está autenticado

**Limite sempre retorna 100**
- Verifique se o plano está cadastrado na tabela `user_plans`
- Execute: `SELECT * FROM user_plans WHERE user_id = auth.uid();`

## 📞 Suporte

Para dúvidas ou problemas, verifique:
1. Console do navegador para erros JavaScript
2. Logs do Supabase para erros de banco
3. Arquivo `extraction-limits-integration-example.js` para exemplos completos
