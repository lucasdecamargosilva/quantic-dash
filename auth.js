/**
 * Quantic Auth Logic
 * Handles Supabase Authentication and Session Management
 */

// Wait for config to load, then initialize Supabase client
let authClient = null;

async function initAuthClient() {
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

    async protectPage() {
        // Garantir duração mínima de 1.5s para a tela de carregamento
        const minDuration = 1500;
        const startTime = Date.now();

        const session = await this.getSession();
        const isLoginPage = window.location.pathname.includes('login.html');

        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, minDuration - elapsedTime);

        if (!session && !isLoginPage) {
            // Efeito de transição suave para o login
            setTimeout(() => {
                const loader = document.getElementById('quantic-auth-loader');
                if (loader) {
                    loader.style.background = '#000';
                    loader.style.opacity = '1';
                }
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 500);
            }, remainingTime);
            return null;
        } else if (session && isLoginPage) {
            setTimeout(() => {
                window.location.href = 'index.html';
            }, remainingTime);
            return session;
        }

        // Se está logado, remove o loader com o delay mínimo
        setTimeout(() => this.removeLoader(), remainingTime);
        return session;
    },

    removeLoader() {
        const loader = document.getElementById('quantic-auth-loader');
        if (loader) {
            loader.style.opacity = '0';
            loader.style.transform = 'scale(1.05)'; // Leve zoom ao sair
            setTimeout(() => loader.remove(), 600);
        }
    },

    initLogoutButton(session) {
        const sidebarFooter = document.querySelector('.sidebar-footer');
        if (sidebarFooter && !document.getElementById('logout-btn')) {
            const welcomeMsg = document.createElement('div');
            welcomeMsg.className = 'welcome-user';
            welcomeMsg.style.cssText = 'padding: 0 16px; margin-bottom: 8px; font-size: 13px; color: var(--text-gray); font-family: "Outfit", sans-serif;';

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
            logoutBtn.className = 'nav-link theme-btn';
            logoutBtn.style.marginTop = '4px';
            logoutBtn.style.width = '100%';
            logoutBtn.style.border = '1px solid var(--border-color)';
            logoutBtn.style.background = 'rgba(255, 0, 0, 0.02)';
            logoutBtn.style.transition = 'all 0.3s ease';

            logoutBtn.innerHTML = `
                <i class="ph-fill ph-sign-out" style="color: #ef4444;"></i>
                <span class="link-text" style="color: var(--text-gray);">Fazer Logout</span>
            `;

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

// Injeção Imediata do Loader (Evita piscada da Dashboard)
(function () {
    if (window.location.pathname.includes('login.html')) return;

    // Injetar estilos do loader
    const style = document.createElement('style');
    style.innerHTML = `
        #quantic-auth-loader {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: #070708; display: flex; flex-direction: column;
            align-items: center; justify-content: center; z-index: 999999;
            transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .loader-logo { 
            width: 180px; 
            margin-bottom: 32px; 
            animation: pulse-glow 2.5s infinite ease-in-out; 
            filter: drop-shadow(0 0 20px rgba(139, 92, 246, 0.2));
        }
        .loader-spinner {
            width: 40px; height: 40px; border: 3px solid rgba(139, 92, 246, 0.05);
            border-top-color: #8b5cf6; border-radius: 50%; animation: spin 1s cubic-bezier(0.5, 0.1, 0.4, 0.9) infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-glow { 
            0%, 100% { opacity: 1; transform: scale(1); filter: drop-shadow(0 0 20px rgba(139, 92, 246, 0.2)); } 
            50% { opacity: 0.7; transform: scale(0.96); filter: drop-shadow(0 0 35px rgba(139, 92, 246, 0.4)); } 
        }
    `;
    document.head.appendChild(style);

    // Injetar o elemento do loader
    const loader = document.createElement('div');
    loader.id = 'quantic-auth-loader';
    loader.innerHTML = `
        <img src="logo.png" class="loader-logo" alt="Quantic">
        <div class="loader-spinner"></div>
    `;
    document.documentElement.appendChild(loader);
})();

// Auto-protect e init
document.addEventListener('DOMContentLoaded', async () => {
    const session = await AUTH.protectPage();
    if (session) {
        AUTH.initLogoutButton(session);
    }
});

window.AUTH = AUTH;
