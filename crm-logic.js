// CRM Logic - Fetching and updating data from Supabase
let crmClient;

async function initCrmSupabase() {
    // Wait for config to load
    if (window.CONFIG_LOADED) {
        await window.CONFIG_LOADED;
    }

    // Robust waiting for supabaseClient (up to 5 seconds)
    let attempts = 0;
    while (!window.supabaseClient && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    if (window.supabaseClient) {
        crmClient = window.supabaseClient;
        return true;
    }
    return false;
}

async function fetchCrmData(pipelineName = 'starter') {
    if (!crmClient) return [];

    try {
        // Mapeia identificadores curtos para nomes completos do pipeline
        const pipelineMap = {
            'starter': 'Quantic Starter',
            'growth': 'Quantic Growth',
            'enterprise': 'Quantic Enterprise'
        };

        // Se receber um identificador curto, converte para nome completo
        const fullPipelineName = pipelineMap[pipelineName.toLowerCase()] || pipelineName;

        // Obtém o usuário logado para filtrar por user_id
        const { data: { user } } = await crmClient.auth.getUser();
        if (!user) return [];

        const { data, error } = await crmClient
            .from('opportunities')
            .select(`
                id,
                stage,
                pipeline,
                responsible_name,
                nome_oportunidade,
                fonte_oportunidade,
                telefone,
                email,
                site,
                tags,
                usuario_insta
            `)
            .eq('pipeline', fullPipelineName)
            .eq('user_id', user.id);

        if (error) {
            console.error('Error fetching CRM data:', error);
            return [];
        }

        return data.map(opp => ({
            id: opp.id,
            contactId: null, // No longer using contacts table relationship
            name: opp.nome_oportunidade || 'Sem Nome',
            company: opp.nome_oportunidade || 'Sem Empresa',
            phone: opp.telefone || '---',
            email: opp.email || '---',
            stage: opp.stage,
            lead_status: 'Novo',
            channels: opp.fonte_oportunidade || '---',
            responsible: opp.responsible_name || 'Não atribuído',
            tags: (function () {
                if (!opp.tags) return [];
                if (Array.isArray(opp.tags)) return opp.tags;
                try {
                    const parsed = JSON.parse(opp.tags);
                    return Array.isArray(parsed) ? parsed : [parsed];
                } catch (e) {
                    return String(opp.tags).split(',').map(t => t.trim()).filter(t => t);
                }
            })(),
            site: opp.site || '---',
            usuario_insta: opp.usuario_insta || null
        }));
    } catch (err) {
        console.error('Fetch CRM data catch error:', err);
        return [];
    }
}

async function updateOpportunityDetails(oppId, contactId, details) {
    if (!crmClient) return;

    try {
        const { contactData, oppData } = details;

        // 1. Update Opportunity (responsible, tags)
        if (oppData && Object.keys(oppData).length > 0) {
            const { data: { user } } = await crmClient.auth.getUser();
            if (!user) return;

            console.log('[CRM-DEBUG] Updating opportunity ID:', oppId, 'with data:', oppData);
            const { error: oppError } = await crmClient
                .from('opportunities')
                .update(oppData)
                .eq('id', oppId)
                .eq('user_id', user.id);

            if (oppError) {
                console.error('Error updating opportunity:', oppError);
                console.error('[CRM-DEBUG] Failed data:', oppData);
                if (window.showToast) window.showToast("Erro ao atualizar oportunidade: " + oppError.message, "error");
                return;
            }
        }

        // 2. Update Contact (audience, channels, etc)
        if (contactId && contactData && Object.keys(contactData).length > 0) {
            const { error: contactError } = await crmClient
                .from('contacts')
                .update(contactData)
                .eq('id', contactId);

            if (contactError) {
                console.error('Error updating contact:', contactError);
                if (window.showToast) window.showToast("Erro ao atualizar contatos", "error");
                return;
            }
        }

        if (window.showToast) window.showToast("Dados salvos com sucesso!", "success");

    } catch (err) {
        console.error('Update details catch error:', err);
        if (window.showToast) window.showToast("Erro inesperado", "error");
    }
}

async function updateLeadStage(leadId, newStage) {
    if (!crmClient) return;

    try {
        const { data: { user } } = await crmClient.auth.getUser();
        if (!user) return;

        const { error } = await crmClient
            .from('opportunities')
            .update({ stage: newStage, updated_at: new Date().toISOString() })
            .eq('id', leadId)
            .eq('user_id', user.id);

        if (error) {
            console.error('Error updating stage in DB:', error);
            if (window.showToast) window.showToast("Erro ao atualizar etapa", "error");
        } else {
            if (window.showToast) window.showToast("Etapa atualizada!", "success");
        }
    } catch (err) {
        console.error('Update stage catch error:', err);
    }
}

async function batchUpdateLeadStages(leadIds, newStage) {
    if (!crmClient || !leadIds || leadIds.length === 0) return;

    try {
        const { data: { user } } = await crmClient.auth.getUser();
        if (!user) return;

        const { error } = await crmClient
            .from('opportunities')
            .update({ stage: newStage, updated_at: new Date().toISOString() })
            .in('id', leadIds)
            .eq('user_id', user.id);

        if (error) {
            console.error('Error batch updating stages in DB:', error);
            if (window.showToast) window.showToast("Erro ao atualizar etapas", "error");
        } else {
            if (window.showToast) window.showToast(`${leadIds.length} etapas atualizadas!`, "success");
        }
    } catch (err) {
        console.error('Batch update stage catch error:', err);
    }
}
async function deleteOpportunity(oppId) {
    if (!crmClient) {
        console.error('CRM client not initialized');
        return false;
    }

    try {
        const { data: { user } } = await crmClient.auth.getUser();
        if (!user) return false;

        console.log('[CRM-DEBUG] Attempting to delete opportunity ID:', oppId, 'Type:', typeof oppId);

        // Using .select() after delete to confirm if rows were actually affected
        const { data, error } = await crmClient
            .from('opportunities')
            .delete()
            .eq('id', oppId)
            .eq('user_id', user.id)
            .select();

        if (error) {
            console.error('[CRM-DEBUG] Delete error:', error);
            if (window.showToast) window.showToast("Erro ao excluir: " + error.message, "error");
            return false;
        }

        if (!data || data.length === 0) {
            console.warn('[CRM-DEBUG] No rows deleted. ID might not exist or RLS policy preventing delete.', oppId);
            if (window.showToast) window.showToast("Erro: Nenhuma oportunidade encontrada para excluir.", "warning");
            return false;
        }

        console.log('[CRM-DEBUG] Delete successful. Rows affected:', data.length, data);
        if (window.showToast) window.showToast("Oportunidade excluída com sucesso!", "success");
        return true;
    } catch (err) {
        console.error('[CRM-DEBUG] Unexpected error during delete:', err);
        if (window.showToast) window.showToast("Erro inesperado ao excluir", "error");
        return false;
    }
}

async function fetchPipelineSummary() {
    if (!crmClient) return { total: { starter: 0, growth: 0, enterprise: 0 }, stages: { starter: {}, growth: {}, enterprise: {} } };

    try {
        // Obtém o usuário logado para filtrar por user_id
        const { data: { user } } = await crmClient.auth.getUser();
        if (!user) return { total: { starter: 0, growth: 0, enterprise: 0 }, stages: { starter: {}, growth: {}, enterprise: {} } };

        const { data, error } = await crmClient
            .from('opportunities')
            .select(`
                pipeline, 
                stage, 
                responsible_name,
                fonte_oportunidade
            `)
            .eq('user_id', user.id);

        if (error) throw error;

        const summary = {
            total: { starter: 0, growth: 0, enterprise: 0 },
            stages: { starter: {}, growth: {}, enterprise: {} },
            responsible: {},
            salesByResponsible: {},
            meetingsByResponsible: {},
            channels: {} // New aggregation
        };

        const SALES_STAGE = "Venda Realizada";
        const MEETING_STAGE = "Reunião Agendada";

        data.forEach(opp => {
            const p = opp.pipeline ? opp.pipeline.toLowerCase() : '';
            const stage = opp.stage;
            const resp = opp.responsible_name || 'Não atribuído';

            // Channel Aggregation
            const channel = opp.fonte_oportunidade || 'Não informado';

            // Normalize channel name (simple)
            const cName = channel.trim();
            summary.channels[cName] = (summary.channels[cName] || 0) + 1;

            summary.responsible[resp] = (summary.responsible[resp] || 0) + 1;

            if (stage === SALES_STAGE) {
                summary.salesByResponsible[resp] = (summary.salesByResponsible[resp] || 0) + 1;
            }
            if (stage === MEETING_STAGE) {
                summary.meetingsByResponsible[resp] = (summary.meetingsByResponsible[resp] || 0) + 1;
            }

            if (p.includes('starter')) {
                summary.total.starter++;
                summary.stages.starter[stage] = (summary.stages.starter[stage] || 0) + 1;
            }
            else if (p.includes('growth')) {
                summary.total.growth++;
                summary.stages.growth[stage] = (summary.stages.growth[stage] || 0) + 1;
            }
            else if (p.includes('enterprise')) {
                summary.total.enterprise++;
                summary.stages.enterprise[stage] = (summary.stages.enterprise[stage] || 0) + 1;
            }
        });

        return summary;
    } catch (err) {
        console.error('Summary fetch error:', err);
        return { total: { starter: 0, growth: 0, enterprise: 0 }, stages: { starter: {}, growth: {}, enterprise: {} } };
    }
}

async function fetchAILeadInfo(username) {
    if (!crmClient || !username) return null;

    try {
        // Remove @ if present for better matching
        const cleanUsername = username.startsWith('@') ? username.substring(1) : username;

        // First try to find in opportunities table by nome_oportunidade or site (url_perfil)
        const { data: oppData, error: oppError } = await crmClient
            .from('opportunities')
            .select('sinais_detectados, trechos_relevantes, observacoes, insight_ia')
            .or(`nome_oportunidade.ilike.%${cleanUsername}%,site.ilike.%${cleanUsername}%`)
            .order('created_at', { ascending: false })
            .limit(1);

        if (!oppError && oppData && oppData.length > 0) {
            return oppData[0];
        }

        // Fallback: try leads_qualificados table for legacy data
        const { data, error } = await crmClient
            .from('leads_qualificados')
            .select('*')
            .eq('usuario', cleanUsername)
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) throw error;
        return data && data.length > 0 ? data[0] : null;
    } catch (err) {
        console.error('Error fetching AI lead info:', err);
        return null;
    }
}

// Subscribe to real-time changes
function subscribeToCrmChanges(callback) {
    if (!crmClient) return;

    crmClient
        .channel('crm-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'opportunities' }, payload => {
            console.log('CRM Change detected!', payload);
            callback();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, payload => {
            console.log('Contact Change detected!', payload);
            callback();
        })
        .subscribe();
}

window.CRM_LOGIC = {
    fetchCrmData,
    fetchPipelineSummary,
    updateLeadStage,
    updateOpportunityDetails,
    fetchAILeadInfo,
    subscribeToCrmChanges,
    initCrmSupabase,
    deleteOpportunity,
    batchUpdateLeadStages
};

/* ===== CRM_LOGIC logging wrappers =====
   Aguarda window.CRM_LOGIC e envolve métodos para debug sem alterar comportamento.
*/
(function attachCrmLogicLogging() {
    // evita múltiplas aplicações
    if (window.__CRM_LOGGING_ATTACHED) {
        console.debug('[CRM-LOG] logging already attached');
        return;
    }

    function wrapAsyncMethod(obj, name) {
        if (!obj || typeof obj[name] !== 'function') return;
        if (obj[name].__crm_logged) return;
        const original = obj[name];
        obj[name] = async function (...args) {
            console.debug(`[CRM-LOG] CALL ${name}`, args);
            try {
                const res = await original.apply(this, args);
                console.debug(`[CRM-LOG] OK ${name}`, res);
                return res;
            } catch (err) {
                console.error(`[CRM-LOG] ERROR ${name}`, err);
                throw err;
            }
        };
        obj[name].__crm_logged = true;
    }

    function wrapSyncMethod(obj, name) {
        if (!obj || typeof obj[name] !== 'function') return;
        if (obj[name].__crm_logged) return;
        const original = obj[name];
        obj[name] = function (...args) {
            console.debug(`[CRM-LOG] CALL ${name}`, args);
            try {
                const res = original.apply(this, args);
                console.debug(`[CRM-LOG] OK ${name}`, res);
                return res;
            } catch (err) {
                console.error(`[CRM-LOG] ERROR ${name}`, err);
                throw err;
            }
        };
        obj[name].__crm_logged = true;
    }

    const methodsAsync = [
        'initCrmSupabase',
        'fetchPipelineSummary',
        'fetchCrmData',
        'fetchAILeadInfo',
        'updateOpportunityDetails',
        'updateLeadStage',
        'deleteOpportunity',
        'batchUpdateLeadStages'
    ];
    const methodsSync = [
        'subscribeToCrmChanges'
    ];

    let tries = 0;
    const maxTries = 60; // ~6s
    const interval = setInterval(() => {
        if (window.CRM_LOGIC) {
            methodsAsync.forEach(m => wrapAsyncMethod(window.CRM_LOGIC, m));
            methodsSync.forEach(m => wrapSyncMethod(window.CRM_LOGIC, m));
            window.__CRM_LOGGING_ATTACHED = true;
            console.debug('[CRM-LOG] logging wrappers attached to window.CRM_LOGIC');
            clearInterval(interval);
            return;
        }
        tries++;
        if (tries >= maxTries) {
            console.warn('[CRM-LOG] window.CRM_LOGIC not found - logging wrappers not attached');
            clearInterval(interval);
        }
    }, 100);
})();
