/**
 * EXEMPLO DE INTEGRAÇÃO DO SISTEMA DE LIMITES DE EXTRAÇÃO
 * 
 * Este arquivo mostra como integrar o ExtractionLimitsManager no captacao.html
 * 
 * PASSOS PARA INTEGRAÇÃO:
 * 
 * 1. Adicionar o script no <head> do captacao.html:
 *    <script src="extraction-limits.js"></script>
 * 
 * 2. Inicializar o gerenciador após o Supabase estar pronto
 * 
 * 3. Verificar limites antes de cada extração
 * 
 * 4. Incrementar contador após extração bem-sucedida
 * 
 * 5. Mostrar estatísticas de uso na interface
 */

// ============================================
// EXEMPLO 1: Inicialização
// ============================================

let extractionLimits;

async function initExtractionLimits() {
    // Aguarda o Supabase estar pronto
    if (!window.supabaseClient) {
        console.error('Supabase não inicializado');
        return false;
    }

    extractionLimits = new ExtractionLimitsManager(window.supabaseClient);
    const success = await extractionLimits.init();

    if (success) {
        console.log('✅ Sistema de limites inicializado');
        // Atualiza UI com estatísticas
        await updateLimitsUI();
    }

    return success;
}

// ============================================
// EXEMPLO 2: Verificar antes de extrair
// ============================================

async function startExtraction() {
    const channel = activeChannel === 'instagram' ? 'instagram' : 'google_maps';

    // 1. Verifica se pode extrair
    const check = await extractionLimits.canExtract(channel, 1);

    if (!check.can_extract) {
        alert(`❌ Limite diário atingido!\n\n` +
            `Plano: ${check.plan.toUpperCase()}\n` +
            `Usado hoje: ${check.current_count}/${check.limit}\n` +
            `Restante: ${check.remaining}\n\n` +
            `Faça upgrade do seu plano para extrair mais leads!`);
        return;
    }

    // 2. Mostra quantas extrações restam
    console.log(`✅ Você pode extrair! Restam ${check.remaining} extrações hoje.`);

    // 3. Prossegue com a extração...
    try {
        // ... código de extração existente ...

        // 4. Após sucesso, incrementa o contador
        await extractionLimits.incrementCount(channel, 1);

        // 5. Atualiza UI
        await updateLimitsUI();

    } catch (error) {
        console.error('Erro na extração:', error);
    }
}

// ============================================
// EXEMPLO 3: Mostrar estatísticas na UI
// ============================================

async function updateLimitsUI() {
    const stats = await extractionLimits.getDailyStats();

    if (!stats) return;

    // Atualiza badges ou indicadores na interface
    const instaUsage = `${stats.instagram.used}/${stats.instagram.limit}`;
    const mapsUsage = `${stats.google_maps.used}/${stats.google_maps.limit}`;

    console.log(`📊 Uso de hoje:
    Instagram: ${instaUsage} (${stats.instagram.remaining} restantes)
    Google Maps: ${mapsUsage} (${stats.google_maps.remaining} restantes)
    Plano: ${stats.plan.toUpperCase()}`);

    // Exemplo de como adicionar na UI:
    // document.getElementById('insta-limit-badge').textContent = instaUsage;
    // document.getElementById('maps-limit-badge').textContent = mapsUsage;
}

// ============================================
// EXEMPLO 4: Adicionar indicadores visuais
// ============================================

function createLimitBadge(channel) {
    return `
        <div class="limit-badge" id="${channel}-limit-badge">
            <i class="ph-fill ph-gauge"></i>
            <span id="${channel}-usage">0/100</span>
            <small>extrações hoje</small>
        </div>
    `;
}

// CSS sugerido para os badges:
const limitBadgeStyles = `
    .limit-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: rgba(139, 92, 246, 0.1);
        border: 1px solid rgba(139, 92, 246, 0.2);
        border-radius: 8px;
        font-size: 13px;
        color: var(--text-gray);
    }
    
    .limit-badge i {
        color: var(--primary-purple);
        font-size: 16px;
    }
    
    .limit-badge small {
        font-size: 11px;
        color: var(--text-muted);
    }
    
    .limit-badge.warning {
        border-color: rgba(251, 191, 36, 0.3);
        background: rgba(251, 191, 36, 0.1);
    }
    
    .limit-badge.danger {
        border-color: rgba(239, 68, 68, 0.3);
        background: rgba(239, 68, 68, 0.1);
    }
`;

// ============================================
// EXEMPLO 5: Integração completa no DOMContentLoaded
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    // Aguarda Supabase
    if (await initSupabase()) {
        // Inicializa sistema de limites
        await initExtractionLimits();

        // Atualiza UI a cada 30 segundos
        setInterval(updateLimitsUI, 30000);
    }
});

// ============================================
// EXEMPLO 6: Modificar botão de extração existente
// ============================================

// Substitua o onclick do botão startCapture por:
btnCapture.onclick = async () => {
    const channel = activeChannel === 'instagram' ? 'instagram' : 'google_maps';

    // Verifica limite ANTES de extrair
    const check = await extractionLimits.canExtract(channel, 1);

    if (!check.can_extract) {
        // Mostra modal ou toast de erro
        if (window.showToast) {
            window.showToast(
                `Limite diário atingido! (${check.current_count}/${check.limit})`,
                'error'
            );
        } else {
            alert(`Limite diário atingido!\nUsado: ${check.current_count}/${check.limit}\nPlano: ${check.plan}`);
        }
        return;
    }

    // Mostra aviso se está perto do limite (>80%)
    if (check.remaining < check.limit * 0.2) {
        if (window.showToast) {
            window.showToast(
                `⚠️ Restam apenas ${check.remaining} extrações hoje!`,
                'warning'
            );
        }
    }

    // ... resto do código de extração existente ...

    let url = activeChannel === 'instagram' ?
        'https://n8n.segredosdodrop.com/webhook/recebe-captura-quantic' :
        'https://n8n.segredosdodrop.com/webhook/recebe-dados-maps';

    let body = activeChannel === 'instagram' ?
        { targetUrl: document.getElementById('targetUrl').value, sessionCookie: document.getElementById('sessionCookie').value } :
        { "Termo de Pesquisa": document.getElementById('mapsQuery').value, "Local": document.getElementById('mapsLocation').value, "Numero de Leads": document.getElementById('mapsCount').value };

    setExtractionUI(true, activeChannel);

    try {
        // Faz a extração...
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (response.ok) {
            // ✅ INCREMENTA O CONTADOR APÓS SUCESSO
            await extractionLimits.incrementCount(channel, 1);
            await updateLimitsUI();

            if (window.showToast) {
                window.showToast('Extração iniciada com sucesso!', 'success');
            }
        }

        // ... resto do código ...

    } catch (e) {
        console.error('Erro:', e);
        setExtractionUI(false);
    }
};

// ============================================
// EXEMPLO 7: Gerenciar planos (admin)
// ============================================

async function upgradePlan(newPlan) {
    const success = await extractionLimits.updatePlan(newPlan);

    if (success) {
        alert(`✅ Plano atualizado para ${newPlan.toUpperCase()}!`);
        await updateLimitsUI();
    } else {
        alert('❌ Erro ao atualizar plano');
    }
}

// Exemplo de uso:
// upgradePlan('growth');
// upgradePlan('enterprise');
