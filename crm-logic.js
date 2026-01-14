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
			.eq('pipeline', fullPipelineName); // <-- Usa o nome completo

		if (error) {
			console.error('Error fetching CRM data:', error);
			return [];
		}

		// Extract usernames to fetch statuses
		const usernames = data
			.map(o => o.contacts ? o.contacts.company_name : null)
			.filter(u => u != null);

		// Fetch statuses from leads_qualificados
		let statusMap = {};
		if (usernames.length > 0) {
			const { data: leadsData } = await crmClient
				.from('leads_qualificados')
				.select('usuario, status')
				.in('usuario', usernames);

			if (leadsData) {
				leadsData.forEach(l => {
					statusMap[l.usuario] = l.status;
				});
			}
		}

		return data.map(opp => ({
			id: opp.id,
			contactId: opp.contacts ? opp.contacts.id : null,
			name: opp.contacts ? opp.contacts.full_name : 'Sem Nome',
			company: opp.contacts ? opp.contacts.company_name : 'Sem Empresa',
			phone: opp.contacts ? opp.contacts.phone : '---',
			email: opp.contacts ? opp.contacts.email : '---',
			stage: opp.stage,
			lead_status: opp.contacts ? (statusMap[opp.contacts.company_name] || '---') : '---',
			channels: opp.contacts ? opp.contacts.acquisition_channels : '---',
			responsible: opp.responsible_name || 'Não atribuído',
			tags: opp.tags || []
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
            const { error: oppError } = await crmClient
                .from('opportunities')
                .update(oppData)
                .eq('id', oppId);

            if (oppError) {
                console.error('Error updating opportunity:', oppError);
                if (window.showToast) window.showToast("Erro ao atualizar oportunidade", "error");
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
            .select(`
                pipeline, 
                stage, 
                responsible_name,
                contacts ( acquisition_channels )
            `);

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
            const channel = (opp.contacts && opp.contacts.acquisition_channels)
                ? opp.contacts.acquisition_channels
                : 'Não informado';

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
        const { data, error } = await crmClient
            .from('leads_qualificados')
            .select('*')
            .eq('usuario', username)
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
    initCrmSupabase
};
