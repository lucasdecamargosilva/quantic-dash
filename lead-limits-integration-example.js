/**
 * EXEMPLO DE INTEGRAÇÃO - Sistema de Limites de LEADS
 * 
 * IMPORTANTE: Este sistema conta LEADS capturados, não cliques no botão!
 * 
 * Os triggers no banco incrementam automaticamente quando:
 * - Um lead é inserido em leads_qualificados
 * - Um lead é inserido em leads_frios
 * - Um lead é inserido em leads_google_maps
 * 
 * Você só precisa VERIFICAR o limite ANTES de extrair!
 */

// ============================================
// PASSO 1: Adicionar script no captacao.html
// ============================================

/*
No <head> do captacao.html, adicione:

<script src="lead-limits.js"></script>
*/

// ============================================
// PASSO 2: Inicializar o sistema
// ============================================

let leadLimits;

async function initLeadLimits() {
    if (!window.supabaseClient) {
        console.error('Supabase não inicializado');
        return false;
    }

    leadLimits = new LeadLimitsManager(window.supabaseClient);
    const success = await leadLimits.init();

    if (success) {
        console.log('✅ Sistema de limites de LEADS inicializado');
        await updateLimitsUI();
    }

    return success;
}

// ============================================
// PASSO 3: Verificar ANTES de extrair
// ============================================

// EXEMPLO: Google Maps (usuário escolhe quantos leads quer)
async function startGoogleMapsExtraction() {
    const requestedLeads = parseInt(document.getElementById('mapsCount').value) || 20;

    // ✅ VERIFICAR se pode capturar essa quantidade
    const check = await leadLimits.canCaptureLeads('google_maps', requestedLeads);

    if (!check.can_capture) {
        // ❌ BLOQUEAR - Não pode capturar
        alert(leadLimits.formatLimitError(check));
        return;
    }

    // ⚠️ AVISAR se está perto do limite
    const warning = leadLimits.formatWarning(check);
    if (warning && window.showToast) {
        window.showToast(warning, 'warning');
    }

    // ✅ PODE EXTRAIR - Prosseguir
    console.log(`✅ Pode capturar ${requestedLeads} leads! Restam ${check.remaining} no limite.`);

    try {
        // Faz a extração
        const response = await fetch('https://n8n.../webhook/recebe-dados-maps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                "Termo de Pesquisa": document.getElementById('mapsQuery').value,
                "Local": document.getElementById('mapsLocation').value,
                "Numero de Leads": requestedLeads
            })
        });

        if (response.ok) {
            // ✅ Sucesso!
            // Os triggers no banco vão incrementar automaticamente
            // quando os leads forem salvos em leads_google_maps

            if (window.showToast) {
                window.showToast('Extração iniciada! Os leads serão contabilizados automaticamente.', 'success');
            }

            // Atualiza UI após alguns segundos
            setTimeout(async () => {
                await updateLimitsUI();
            }, 3000);
        }

    } catch (error) {
        console.error('Erro na extração:', error);
    }
}

// EXEMPLO: Instagram (não sabemos quantos leads virão)
async function startInstagramExtraction() {
    // Para Instagram, verificamos com uma estimativa conservadora
    // Ou podemos bloquear se já atingiu o limite

    const check = await leadLimits.canCaptureLeads('instagram', 1);

    if (check.remaining === 0) {
        // ❌ Já atingiu o limite total
        alert(leadLimits.formatLimitError(check));
        return;
    }

    // ⚠️ Avisar quantos leads ainda pode capturar
    if (window.showToast) {
        window.showToast(
            `Você pode capturar até ${check.remaining} leads do Instagram hoje.`,
            'info'
        );
    }

    // ✅ Prosseguir com extração
    try {
        const response = await fetch('https://n8n.../webhook/recebe-captura-quantic', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                targetUrl: document.getElementById('targetUrl').value,
                sessionCookie: document.getElementById('sessionCookie').value
            })
        });

        const data = await response.json();

        if (data.job_id) {
            console.log('Job iniciado:', data.job_id);

            // Os triggers vão contar automaticamente quando
            // os leads forem salvos em leads_qualificados e leads_frios

            // Monitora o job e atualiza UI quando finalizar
            monitorJobAndUpdateLimits(data.job_id);
        }

    } catch (error) {
        console.error('Erro:', error);
    }
}

// ============================================
// PASSO 4: Atualizar UI após extração
// ============================================

function monitorJobAndUpdateLimits(jobId) {
    const channel = supabaseClient
        .channel(`job_${jobId}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'capturas_jobs',
            filter: `job_id=eq.${jobId}`
        }, async (payload) => {
            if (payload.new.status === 'finished') {
                console.log('Job finalizado!');

                // ✅ Atualiza estatísticas de uso
                await updateLimitsUI();

                supabaseClient.removeChannel(channel);
            }
        })
        .subscribe();
}

// ============================================
// PASSO 5: Mostrar estatísticas na UI
// ============================================

async function updateLimitsUI() {
    const stats = await leadLimits.getDailyStats();

    if (!stats) return;

    console.log(`📊 Leads capturados hoje:
    Instagram: ${stats.instagram.used}/${stats.instagram.limit} (${stats.instagram.remaining} restantes)
    Google Maps: ${stats.google_maps.used}/${stats.google_maps.limit} (${stats.google_maps.remaining} restantes)
    Plano: ${stats.plan.toUpperCase()}`);

    // Atualizar badges na interface
    updateLimitBadge('instagram', stats.instagram);
    updateLimitBadge('google_maps', stats.google_maps);
}

function updateLimitBadge(channel, data) {
    const badgeEl = document.getElementById(`${channel}-limit-badge`);
    if (!badgeEl) return;

    const percentage = (data.used / data.limit) * 100;

    badgeEl.textContent = `${data.used}/${data.limit} leads`;

    // Adiciona classes de alerta
    badgeEl.classList.remove('warning', 'danger', 'ok');

    if (percentage >= 100) {
        badgeEl.classList.add('danger');
    } else if (percentage >= 80) {
        badgeEl.classList.add('warning');
    } else {
        badgeEl.classList.add('ok');
    }
}

// ============================================
// PASSO 6: HTML sugerido para UI
// ============================================

const suggestedHTML = `
<div class="limits-container">
    <div class="limit-card">
        <i class="ph-fill ph-instagram-logo"></i>
        <div class="limit-info">
            <span class="limit-label">Instagram</span>
            <span class="limit-usage" id="instagram-limit-badge">0/100 leads</span>
            <small class="limit-remaining" id="instagram-remaining">100 disponíveis</small>
        </div>
    </div>
    
    <div class="limit-card">
        <i class="ph-fill ph-map-pin"></i>
        <div class="limit-info">
            <span class="limit-label">Google Maps</span>
            <span class="limit-usage" id="google_maps-limit-badge">0/100 leads</span>
            <small class="limit-remaining" id="google_maps-remaining">100 disponíveis</small>
        </div>
    </div>
</div>
`;

// ============================================
// PASSO 7: CSS sugerido
// ============================================

const suggestedCSS = `
.limits-container {
    display: flex;
    gap: 16px;
    margin-bottom: 24px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 12px;
    border: 1px solid var(--border-color);
}

.limit-card {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: rgba(139, 92, 246, 0.05);
    border: 1px solid rgba(139, 92, 246, 0.2);
    border-radius: 8px;
    transition: all 0.3s;
}

.limit-card i {
    font-size: 32px;
    color: var(--primary-purple);
}

.limit-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.limit-label {
    font-size: 11px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: 600;
}

.limit-usage {
    font-size: 18px;
    font-weight: 700;
    color: white;
}

.limit-usage.ok {
    color: #10b981;
}

.limit-usage.warning {
    color: #f59e0b;
}

.limit-usage.danger {
    color: #ef4444;
}

.limit-remaining {
    font-size: 11px;
    color: var(--text-muted);
}

.limit-card.warning {
    border-color: rgba(251, 191, 36, 0.3);
    background: rgba(251, 191, 36, 0.05);
}

.limit-card.danger {
    border-color: rgba(239, 68, 68, 0.3);
    background: rgba(239, 68, 68, 0.05);
}
`;

// ============================================
// PASSO 8: Integração no DOMContentLoaded
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    // Aguarda Supabase
    if (await initSupabase()) {
        // Inicializa sistema de limites
        await initLeadLimits();

        // Atualiza UI a cada 30 segundos
        setInterval(updateLimitsUI, 30000);
    }
});

// ============================================
// RESUMO: O QUE VOCÊ PRECISA FAZER
// ============================================

/*
1. ✅ Executar setup_extraction_limits.sql no Supabase
   - Isso cria as tabelas e triggers automáticos

2. ✅ Adicionar <script src="lead-limits.js"></script> no captacao.html

3. ✅ Inicializar: leadLimits = new LeadLimitsManager(supabaseClient)

4. ✅ ANTES de extrair, verificar:
   const check = await leadLimits.canCaptureLeads('instagram', quantidadeDesejada);
   if (!check.can_capture) { bloquear(); }

5. ✅ Os triggers contam automaticamente quando leads são salvos!
   Você NÃO precisa chamar incrementCount() manualmente!

6. ✅ Após extração, atualizar UI:
   await updateLimitsUI();
*/

console.log('📚 Exemplos de integração carregados!');
