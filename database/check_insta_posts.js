require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkLeads() {
    console.log("--- leads_capturados_posts ---");
    const { data, error } = await supabase.from('leads_capturados_posts').select('*').limit(1);
    if (error) {
        console.error(error);
    } else {
        console.log(data[0] ? Object.keys(data[0]) : "Empty (no records found to check schema)");
        if (data[0]) console.log("Example:", data[0]);
    }
}

checkLeads();
