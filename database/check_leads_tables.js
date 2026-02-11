require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkLeads() {
    console.log("--- leads_qualificados ---");
    const { data: q, error: qe } = await supabase.from('leads_qualificados').select('*').limit(1);
    if (qe) console.error(qe); else console.log(q[0] ? Object.keys(q[0]) : "Empty");

    console.log("\n--- leads_google_maps ---");
    const { data: m, error: me } = await supabase.from('leads_google_maps').select('*').limit(1);
    if (me) console.error(me); else console.log(m[0] ? Object.keys(m[0]) : "Empty");
}

checkLeads();
