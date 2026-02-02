const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jytsrxrmgvliyyuktxsd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5dHNyeHJtZ3ZsaXl5dWt0eHNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MDA0ODYsImV4cCI6MjA3NTQ3NjQ4Nn0.vxiQwV3DxFxfcqts4mgRjk9CRmzdhxKvKBM7XPCrKXQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
    console.log("--- Checking contacts ---");
    const { data: contactsData, error: contactsError, count: contactsCount } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true });

    if (contactsError) console.error("Error:", contactsError);
    else console.log("Count:", contactsCount);

    const { data: contactsSample } = await supabase.from('contacts').select('*').limit(3);
    console.log("Sample:", contactsSample);
}
check();
