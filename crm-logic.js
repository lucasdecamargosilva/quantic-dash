// CRM Logic - Fetching and updating data from Supabase
let crmClient;

function initCrmSupabase() {
    if (window.supabase && window.SUPABASE_CONFIG) {
        crmClient = window.supabase.createClient(
            window.SUPABASE_CONFIG.URL,
            window.SUPABASE_CONFIG.KEY
        );
        return true;
    }
    return false;
}

async function fetchCrmData(pipelineName = 'Quantic Starter') {
    if (!crmClient) return [];

    try {
        const { data, error } = await crmClient
            .from('opportunities')
            .select(`
                id,
                stage,
                pipeline,
                responsible_name,
                tags,
                contacts (
                    id,
                    full_name,
                    company_name,
                    phone,
                    email,
                    monthly_revenue,
                    business_type,
                    audience_type,
                    acquisition_channels,
                    client_volume,
                    biggest_difficulty
                )
            `)
            .eq('pipeline', pipelineName);

        if (error) {
            console.error('Error fetching CRM data:', error);
            return [];
        }

        return data.map(opp => ({
            id: opp.id,
            name: opp.contacts ? opp.contacts.full_name : 'Sem Nome',
            company: opp.contacts ? opp.contacts.company_name : 'Sem Empresa',
            revenue: opp.contacts ? opp.contacts.monthly_revenue : 'R$ 0,00',
            phone: opp.contacts ? opp.contacts.phone : '---',
            email: opp.contacts ? opp.contacts.email : '---',
            stage: opp.stage,
            business: opp.contacts ? opp.contacts.business_type : '---',
            audience: opp.contacts ? opp.contacts.audience_type : '---',
            channels: opp.contacts ? opp.contacts.acquisition_channels : '---',
            volume: opp.contacts ? opp.contacts.client_volume : '---',
            difficulty: opp.contacts ? opp.contacts.biggest_difficulty : '---',
            responsible: opp.responsible_name || 'Não atribuído',
            tags: opp.tags || []
        }));
    } catch (err) {
        console.error('Fetch CRM data catch error:', err);
        return [];
    }
}

async function updateOpportunityDetails(oppId, details) {
    if (!crmClient) return;

    try {
        const { error } = await crmClient
            .from('opportunities')
            .update(details)
            .eq('id', oppId);

        if (error) {
            console.error('Error updating opportunity details:', error);
            if (window.showToast) window.showToast("Erro ao atualizar dados", "error");
        } else {
            if (window.showToast) window.showToast("Dados atualizados!", "success");
        }
    } catch (err) {
        console.error('Update details catch error:', err);
    }
}

async function updateLeadStage(leadId, newStage) {
    if (!crmClient) return;

    try {
        const { error } = await crmClient
            .from('opportunities')
            .update({ stage: newStage, updated_at: new Date().toISOString() })
            .eq('id', leadId);

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

async function fetchPipelineSummary() {
    if (!crmClient) return { total: { starter: 0, growth: 0, enterprise: 0 }, stages: { starter: {}, growth: {}, enterprise: {} } };

    try {
        const { data, error } = await crmClient
            .from('opportunities')
            .select('pipeline, stage, responsible_name');

        if (error) throw error;

        const summary = {
            total: { starter: 0, growth: 0, enterprise: 0 },
            stages: { starter: {}, growth: {}, enterprise: {} },
            responsible: {},
            salesByResponsible: {},
            meetingsByResponsible: {}
        };

        const SALES_STAGE = "Venda Realizada";
        const MEETING_STAGE = "Reunião Agendada";

        data.forEach(opp => {
            const p = opp.pipeline ? opp.pipeline.toLowerCase() : '';
            const stage = opp.stage;
            const resp = opp.responsible_name || 'Não atribuído';

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
    subscribeToCrmChanges,
    initCrmSupabase
};
