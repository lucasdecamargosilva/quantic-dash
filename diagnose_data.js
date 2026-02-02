const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jytsrxrmgvliyyuktxsd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5dHNyeHJtZ3ZsaXl5dWt0eHNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MDA0ODYsImV4cCI6MjA3NTQ3NjQ4Nn0.vxiQwV3DxFxfcqts4mgRjk9CRmzdhxKvKBM7XPCrKXQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
    console.log("--- Checking leads_capturados_posts ---");
    const { data: postsData, error: postsError, count: postsCount } = await supabase
        .from('leads_capturados_posts')
        .select('*', { count: 'exact', head: true });

    if (postsError) console.error("Error:", postsError);
    else console.log("Count:", postsCount);

    const { data: postsSample } = await supabase.from('leads_capturados_posts').select('*').limit(3);
    console.log("Sample:", postsSample);


    console.log("\n--- Checking captured_leads ---");
    const { data: leadsData, error: leadsError, count: leadsCount } = await supabase
        .from('captured_leads')
        .select('*', { count: 'exact', head: true });

    if (leadsError) console.error("Error:", leadsError);
    else console.log("Count:", leadsCount);

    const { data: leadsSample } = await supabase.from('captured_leads').select('*').limit(3);
    console.log("Sample:", leadsSample);

    console.log("\n--- Checking leads_qualificados_ia ---");
    const { data: iaData, error: iaError, count: iaCount } = await supabase
        .from('leads_qualificados_ia')
        .select('*', { count: 'exact', head: true });

    if (iaError) console.error("Error:", iaError);
    else console.log("Count:", iaCount);
}
check();
