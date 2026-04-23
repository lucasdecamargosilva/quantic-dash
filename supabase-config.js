// Supabase Configuration Loader
// Fetches configuration from the server to avoid hardcoding secrets in frontend files
async function loadSupabaseConfig() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();

        if (config.supabaseUrl && config.supabaseAnonKey) {
            window.SUPABASE_CONFIG = {
                URL: config.supabaseUrl,
                KEY: config.supabaseAnonKey
            };
            return true;
        }
    } catch (e) {
        console.error('Failed to load Supabase config:', e);
    }

    // Fallback for local development if server is not running or env vars are missing
    // Replace these if needed for offline local testing
    window.SUPABASE_CONFIG = {
        URL: 'https://quantic-supabase.k5jwra.easypanel.host',
        KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.g2PgdtfvvAFY_Dyylnh9dRVKudf1RWiw1WqwogmsHTA'
    };
    return false;
}

// Global initialization promise
window.CONFIG_LOADED = loadSupabaseConfig();
