require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkColumns() {
    const { data, error } = await supabase
        .from('leads_qualificados')
        .select('*')
        .limit(1);

    if (error) {
        console.error("❌ Erro:", error);
        return;
    }

    if (data && data.length > 0) {
        console.log("✅ Colunas encontradas:", Object.keys(data[0]));
    } else {
        console.log("ℹ️ Tabela vazia ou não encontrada.");
    }
}

checkColumns();
