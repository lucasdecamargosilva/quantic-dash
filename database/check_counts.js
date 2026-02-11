require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function check() {
    const { count: c1 } = await supabase.from('leads_qualificados').select('*', { count: 'exact', head: true });
    const { count: c2 } = await supabase.from('leads_qualificados_ia').select('*', { count: 'exact', head: true });
    console.log(`leads_qualificados: ${c1}`);
    console.log(`leads_qualificados_ia: ${c2}`);
}
check();
