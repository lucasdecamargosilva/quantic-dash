const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jytsrxrmgvliyyuktxsd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5dHNyeHJtZ3ZsaXl5dWt0eHNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MDA0ODYsImV4cCI6MjA3NTQ3NjQ4Nn0.vxiQwV3DxFxfcqts4mgRjk9CRmzdhxKvKBM7XPCrKXQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const pipelines = ["Quantic Starter", "Quantic Growth", "Quantic Enterprise"];
const stages = [
    "Contato", "Mensagem Enviada", "Mensagem Enviada 2", "Mensagem Enviada 3",
    "Conexão", "Reunião Agendada", "Reunião Realizada", "Proposta Enviada",
    "Venda Realizada", "Perdida"
];
const responsibles = ["Lucas Silva", "Ana Oliveira", "Bruno Santos", "Carla Costa"];
const businessTypes = ["E-commerce", "SaaS", "Agência de Marketing", "Infoprodutos", "Imobiliária", "Educação"];

const fakeNames = ["Alice", "Bob", "Carlos", "Daniela", "Eduardo", "Fernanda", "Gabriel", "Helena", "Igor", "Julia", "Kleber", "Laura", "Marcos", "Nathalia", "Otavio", "Paula", "Ricardo", "Sofia", "Thiago", "Vitoria"];
const fakeCompanies = ["TechSolutions", "MarketPro", "CloudScale", "InnovateX", "GrowthFlow", "PrimeLogic", "NexusCorp", "PeakPerformance", "DigitalEdge", "Skyward"];

async function seed() {
    console.log("Starting seeding process...");

    // 1. Create Contacts
    const contactsData = [];
    for (let i = 0; i < 60; i++) {
        const clientName = fakeNames[Math.floor(Math.random() * fakeNames.length)] + " " + (i + 1);
        const companyName = fakeCompanies[Math.floor(Math.random() * fakeCompanies.length)] + " " + (i + 1);

        contactsData.push({
            full_name: clientName,
            company_name: companyName,
            monthly_revenue: `R$ ${Math.floor(Math.random() * 50000 + 5000).toLocaleString('pt-BR')}`,
            business_type: businessTypes[Math.floor(Math.random() * businessTypes.length)],
            phone: `+55 11 9${Math.floor(Math.random() * 90000000 + 10000000)}`,
            email: `${clientName.toLowerCase().replace(/ /g, '.')}@example.com`,
            audience_type: `${Math.floor(Math.random() * 5000 + 100)} seguidores`,
            acquisition_channels: "Instagram, YouTube, LinkedIn",
            client_volume: `${Math.floor(Math.random() * 100 + 5)} clientes/mês`,
            biggest_difficulty: "Qualificação de leads e automação"
        });
    }

    const { data: contacts, error: contactError } = await supabase
        .from('contacts')
        .insert(contactsData)
        .select();

    if (contactError) {
        console.error("Error inserting contacts:", contactError);
        return;
    }

    console.log(`${contacts.length} contacts inserted.`);

    // 2. Create Opportunities
    const opportunitiesData = [];
    contacts.forEach((contact, index) => {
        const pipeline = pipelines[Math.floor(Math.random() * pipelines.length)];
        const stage = stages[Math.floor(Math.random() * stages.length)];
        const responsible = responsibles[Math.floor(Math.random() * responsibles.length)];

        opportunitiesData.push({
            contact_id: contact.id,
            pipeline: pipeline,
            stage: stage,
            responsible_name: responsible,
            tags: ["Fake", "Teste", index % 2 === 0 ? "Hot" : "Cold"]
        });
    });

    const { error: oppError } = await supabase
        .from('opportunities')
        .insert(opportunitiesData);

    if (oppError) {
        console.error("Error inserting opportunities:", oppError);
    } else {
        console.log("Seeding complete! 60 fake deals created.");
    }
}

seed();
