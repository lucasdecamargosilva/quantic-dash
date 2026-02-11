# 🎯 GUIA RÁPIDO - Sistema de Limites de LEADS

## ✅ O Que Foi Implementado

Sistema **AUTOMÁTICO** que conta quantos **LEADS** foram capturados (não cliques no botão).

---

## 🔢 Limites por Plano

| Plano | Instagram | Google Maps | Total/Dia |
|-------|-----------|-------------|-----------|
| **Starter** | 100 leads | 100 leads | 200 leads |
| **Growth** | 300 leads | 300 leads | 600 leads |
| **Enterprise** | 500 leads | 500 leads | 1000 leads |

---

## ⚡ Como Funciona (AUTOMÁTICO!)

### 1️⃣ Triggers Automáticos no Banco

Quando um lead é salvo, o contador incrementa **automaticamente**:

```sql
-- Lead salvo em leads_qualificados → Contador Instagram +1
-- Lead salvo em leads_frios → Contador Instagram +1
-- Lead salvo em leads_google_maps → Contador Google Maps +1
```

**Você NÃO precisa chamar nenhuma função manualmente!**

### 2️⃣ Verificação Antes de Extrair

Você só precisa **verificar** antes de iniciar a extração:

```javascript
// Verificar se pode capturar 50 leads
const check = await leadLimits.canCaptureLeads('google_maps', 50);

if (!check.can_capture) {
    alert(`Você só pode capturar mais ${check.remaining} leads!`);
    return; // BLOQUEIA
}

// Prosseguir com extração...
```

---

## 📊 Exemplo Prático

### Cenário: Plano Starter (100 leads/dia)

**Manhã - 10:00**
```
Usuário: "Quero extrair 50 leads do Google Maps"
Sistema: ✅ Pode! (0/100 usado, restam 100)
→ Extrai 50 leads
→ Triggers incrementam automaticamente
→ Novo total: 50/100
```

**Tarde - 14:00**
```
Usuário: "Quero extrair 40 leads do Google Maps"
Sistema: ✅ Pode! (50/100 usado, restam 50)
→ Extrai 40 leads
→ Triggers incrementam automaticamente
→ Novo total: 90/100
```

**Noite - 18:00**
```
Usuário: "Quero extrair 30 leads do Google Maps"
Sistema: ❌ NÃO PODE! (90/100 usado, restam apenas 10)
→ Mostra erro: "Você só pode capturar mais 10 leads hoje"
→ BLOQUEIA a extração
```

---

## 🚀 Como Implementar

### 1️⃣ Execute o SQL no Supabase

```bash
# Vá para: Supabase Dashboard → SQL Editor
# Cole e execute: database/setup_extraction_limits.sql
```

Isso cria:
- ✅ Tabelas `user_plans` e `daily_lead_counts`
- ✅ Função `can_capture_leads()`
- ✅ **Triggers automáticos** para contar leads
- ✅ Políticas RLS

### 2️⃣ Adicione o Script no HTML

```html
<!-- No <head> do captacao.html -->
<script src="lead-limits.js"></script>
```

### 3️⃣ Inicialize no JavaScript

```javascript
let leadLimits;

async function initLeadLimits() {
    leadLimits = new LeadLimitsManager(window.supabaseClient);
    await leadLimits.init();
}

// No DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
    if (await initSupabase()) {
        await initLeadLimits();
    }
});
```

### 4️⃣ Verifique Antes de Extrair

```javascript
// GOOGLE MAPS
btnCapture.onclick = async () => {
    if (activeChannel === 'maps') {
        const requestedLeads = parseInt(document.getElementById('mapsCount').value);
        
        // ✅ VERIFICAR
        const check = await leadLimits.canCaptureLeads('google_maps', requestedLeads);
        
        if (!check.can_capture) {
            alert(`Limite atingido! Você só pode capturar mais ${check.remaining} leads.`);
            return;
        }
        
        // Prosseguir com extração...
    }
};

// INSTAGRAM
btnCapture.onclick = async () => {
    if (activeChannel === 'instagram') {
        // ✅ VERIFICAR se ainda tem limite
        const check = await leadLimits.canCaptureLeads('instagram', 1);
        
        if (check.remaining === 0) {
            alert('Limite de leads do Instagram atingido!');
            return;
        }
        
        // Prosseguir com extração...
    }
};
```

---

## 🎨 UI Sugerida

```html
<div class="limits-container">
    <div class="limit-card">
        <i class="ph-fill ph-instagram-logo"></i>
        <div>
            <small>Instagram</small>
            <strong id="instagram-usage">0/100 leads</strong>
        </div>
    </div>
    
    <div class="limit-card">
        <i class="ph-fill ph-map-pin"></i>
        <div>
            <small>Google Maps</small>
            <strong id="google_maps-usage">0/100 leads</strong>
        </div>
    </div>
</div>
```

```javascript
// Atualizar UI
async function updateLimitsUI() {
    const stats = await leadLimits.getDailyStats();
    
    document.getElementById('instagram-usage').textContent = 
        `${stats.instagram.used}/${stats.instagram.limit} leads`;
    
    document.getElementById('google_maps-usage').textContent = 
        `${stats.google_maps.used}/${stats.google_maps.limit} leads`;
}
```

---

## 🔍 Queries Úteis

```sql
-- Ver quantos leads capturei hoje
SELECT * FROM daily_lead_counts 
WHERE user_id = auth.uid() 
AND count_date = current_date;

-- Verificar se posso capturar 50 leads
SELECT can_capture_leads(auth.uid(), 'instagram', 50);

-- Ver meu plano
SELECT plan_name FROM user_plans WHERE user_id = auth.uid();

-- Resetar contador (admin)
DELETE FROM daily_lead_counts 
WHERE user_id = 'uuid-aqui' 
AND count_date = current_date;
```

---

## ✨ Vantagens

✅ **100% Automático** - Triggers contam sozinhos  
✅ **Impossível Burlar** - Contagem no banco de dados  
✅ **Preciso** - Conta exatamente quantos leads foram salvos  
✅ **Simples** - Você só verifica antes de extrair  
✅ **Reseta Sozinho** - Todo dia às 00:00  
✅ **Por Usuário** - Cada um tem seu limite  
✅ **Por Canal** - Instagram e Maps separados  

---

## 📁 Arquivos Criados

1. `database/setup_extraction_limits.sql` - Schema com triggers
2. `lead-limits.js` - Módulo JavaScript
3. `lead-limits-integration-example.js` - Exemplos completos
4. `LEAD_LIMITS_QUICK_START.md` - Este guia

---

## 🎯 Próximo Passo

Execute o SQL no Supabase e teste! 🚀

```bash
# 1. Abra Supabase Dashboard
# 2. Vá em SQL Editor
# 3. Cole database/setup_extraction_limits.sql
# 4. Execute
# 5. Pronto! Os triggers já estão funcionando!
```
