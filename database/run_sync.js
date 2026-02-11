require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function syncLeads() {
    console.log("🔄 Iniciando sincronização backfill...");

    // 1. Buscar Leads Qualificados
    const { data: leads, error } = await supabase
        .from('leads_qualificados')
        .select('*');

    if (error) {
        console.error("❌ Erro ao buscar leads:", error);
        return;
    }

    console.log(`🔎 Total de leads encontrados: ${leads ? leads.length : 0}`);

    // Filter: Include if status is 'quente' OR 'qualificado'
    const qualifiedLeads = leads.filter(l =>
        l.status && (
            l.status.toLowerCase().includes('qualificado') ||
            l.status.toLowerCase().includes('quente')
        )
    );

    if (qualifiedLeads.length === 0) {
        console.log("ℹ️ Nenhum lead com status 'qualificado' ou 'quente' encontrado.");
        return;
    }

    console.log(`✅ Leads para processar: ${qualifiedLeads.length}`);

    let processed = 0;
    let createdContacts = 0;
    let createdOpps = 0;

    for (const lead of qualifiedLeads) {
        processed++;

        // --- 1. Verificar/Criar Contato ---
        let contactId = null;

        // Check by Email
        if (lead.email) {
            const { data: cEmail } = await supabase
                .from('contacts')
                .select('id')
                .eq('email', lead.email)
                .single();
            if (cEmail) contactId = cEmail.id;
        }

        // Check by User (Company) if not found yet
        if (!contactId && lead.usuario) {
            const { data: cUser } = await supabase
                .from('contacts')
                .select('id')
                .eq('company_name', lead.usuario)
                .single();
            if (cUser) contactId = cUser.id;
        }

        // Insert Contact if NEW
        if (!contactId) {
            const { data: newContact, error: insertError } = await supabase
                .from('contacts')
                .insert({
                    full_name: lead.nome_cliente || lead.usuario || 'Lead IA',
                    company_name: lead.usuario,
                    phone: lead.telefone,
                    email: lead.email,
                    created_at: new Date()
                })
                .select()
                .single();

            if (insertError) {
                console.error(`❌ Erro ao criar contato para ${lead.usuario}:`, insertError.message);
                continue;
            }
            contactId = newContact.id;
            createdContacts++;
        }

        // --- 2. Verificar/Criar Oportunidade ---
        if (contactId) {
            const { data: existingOpp } = await supabase
                .from('opportunities')
                .select('id')
                .eq('contact_id', contactId)
                .single();

            if (!existingOpp) {
                const { error: oppError } = await supabase
                    .from('opportunities')
                    .insert({
                        contact_id: contactId,
                        stage: 'Contato',
                        pipeline: 'Quantic Starter',
                        responsible_name: 'IA',
                        tags: ['Lead IA', 'Sincronizado'],
                        created_at: new Date()
                    });

                if (oppError) {
                    console.error(`❌ Erro ao criar oportunidade para contato ${contactId}:`, oppError.message);
                } else {
                    createdOpps++;
                }
            }
        }
    }

    console.log("✅ Concluído!");
    console.log(`📊 Processados: ${processed}`);
    console.log(`🆕 Novos Contatos: ${createdContacts}`);
    console.log(`🚀 Novas Oportunidades: ${createdOpps}`);
}

syncLeads();
