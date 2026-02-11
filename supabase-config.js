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
        URL: 'https://jytsrxrmgvliyyuktxsd.supabase.co',
        KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5dHNyeHJtZ3ZsaXl5dWt0eHNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MDA0ODYsImV4cCI6MjA3NTQ3NjQ4Nn0.vxiQwV3DxFxfcqts4mgRjk9CRmzdhxKvKBM7XPCrKXQ'
    };
    return false;
}

// Global initialization promise
window.CONFIG_LOADED = loadSupabaseConfig();
