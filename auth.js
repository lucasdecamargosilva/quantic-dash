/**
 * Quantic Auth Logic
 * Handles Supabase Authentication and Session Management
 */

// Wait for config to load, then initialize Supabase client
let authClient = null;

async function initAuthClient() {
    // Wait for config to be loaded
    if (window.CONFIG_LOADED) {
        await window.CONFIG_LOADED;
    }

    if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.URL) {
        console.error('SUPABASE_CONFIG not loaded!');
        return null;
    }

    if (!window.supabaseClient) {
        window.supabaseClient = window.supabase.createClient(
            window.SUPABASE_CONFIG.URL,
            window.SUPABASE_CONFIG.KEY
        );
    }

    return window.supabaseClient;
}

const AUTH = {
    // Current user session
    async getSession() {
        authClient = await initAuthClient();
        if (!authClient) return null;

        const { data: { session }, error } = await authClient.auth.getSession();
        if (error) {
            console.error('Error fetching session:', error);
            return null;
        }
        return session;
    },

    // Login function
    async login(email, password) {
        authClient = await initAuthClient();
        if (!authClient) throw new Error('Supabase client not initialized');

        const { data, error } = await authClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;
        return data;
    },

    // Logout function
    async logout() {
        authClient = await initAuthClient();
        if (!authClient) {
            window.location.href = 'login.html';
            return;
        }

        const { error } = await authClient.auth.signOut();
        if (error) console.error('Error signing out:', error);
        window.location.href = 'login.html';
    },

    // Check if session exists, redirect to login if not
    async protectPage() {
        const session = await this.getSession();
        const isLoginPage = window.location.pathname.includes('login.html');

        if (!session && !isLoginPage) {
            window.location.href = 'login.html';
        } else if (session && isLoginPage) {
            window.location.href = 'index.html';
        }

        return session;
    },


    // Initialize sidebar logout button
    initLogoutButton(session) {
        const sidebarFooter = document.querySelector('.sidebar-footer');
        if (sidebarFooter && !document.getElementById('logout-btn')) {
            // Add Welcome message
            const welcomeMsg = document.createElement('div');
            welcomeMsg.className = 'welcome-user';
            welcomeMsg.style.cssText = 'padding: 0 16px; margin-bottom: 8px; font-size: 13px; color: var(--text-gray); font-family: "Outfit", sans-serif;';

            // Pega o nome do metadados
            const user = session.user;
            const nameMap = {
                'lcamargo@quanticsolutions.com.br': 'Lucas de Camargo',
                'lcioni@quanticsolutions.com.br': 'Lucas Cioni'
            };

            const displayName = nameMap[user.email.toLowerCase()] ||
                user.user_metadata?.full_name ||
                user.user_metadata?.display_name ||
                user.email.split('@')[0];

            welcomeMsg.innerHTML = `Bem vindo, <strong style="color: #fff; display: block;">${displayName}</strong>`;
            sidebarFooter.appendChild(welcomeMsg);

            const logoutBtn = document.createElement('button');
            logoutBtn.id = 'logout-btn';
            logoutBtn.className = 'nav-link theme-btn'; // Use existing design system
            logoutBtn.style.marginTop = '4px';
            logoutBtn.style.width = '100%';
            logoutBtn.style.border = '1px solid var(--border-color)';
            logoutBtn.style.background = 'rgba(255, 0, 0, 0.02)';
            logoutBtn.style.transition = 'all 0.3s ease';

            logoutBtn.innerHTML = `
                <i class="ph-fill ph-sign-out" style="color: #ef4444;"></i>
                <span class="link-text" style="color: var(--text-gray);">Fazer Logout</span>
            `;

            // Hover effects
            logoutBtn.onmouseenter = () => {
                logoutBtn.style.background = 'rgba(239, 68, 68, 0.1)';
                logoutBtn.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                logoutBtn.querySelector('.link-text').style.color = '#fff';
            };
            logoutBtn.onmouseleave = () => {
                logoutBtn.style.background = 'rgba(255, 0, 0, 0.02)';
                logoutBtn.style.borderColor = 'var(--border-color)';
                logoutBtn.querySelector('.link-text').style.color = 'var(--text-gray)';
            };

            logoutBtn.onclick = () => this.logout();
            sidebarFooter.appendChild(logoutBtn);
        }
    }
};

// Auto-protect and init
document.addEventListener('DOMContentLoaded', async () => {
    // Only protect if not on login page
    const session = await AUTH.protectPage();
    if (session) {
        AUTH.initLogoutButton(session);
    }
});

window.AUTH = AUTH;
