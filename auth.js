if (window.__QUANTIC_AUTH_INITIALIZED) {
	// Já inicializado — evita redeclaração de variáveis/constantes se o arquivo for carregado duas vezes
	console.debug('[auth.js] já inicializado, pulo execução duplicada.');
} else {
	window.__QUANTIC_AUTH_INITIALIZED = true;

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
			const session = await this.getSession();
			const isLoginPage = window.location.pathname.includes('login.html');

			if (!session && !isLoginPage) {
				// Not logged in: go to login
				window.location.href = 'login.html';
				return null;
			} else if (session && isLoginPage) {
				// Already logged in: skip login page
				window.location.href = 'index.html';
				return session;
			}

			// Se logado e em uma página protegida, revela o conteúdo instantaneamente
			if (session && !isLoginPage) {
				this.removeLoader(true); // true = instantâneo
			}

			return session;
		},

		removeLoader(immediate = true) {
			console.log("Revealing page...");
			const loader = document.getElementById('quantic-auth-loader');

			// Remove block styles and show body
			document.body.style.transition = 'none';
			document.body.style.opacity = '1';
			document.body.style.filter = 'blur(0)';

			if (loader) {
				loader.remove();
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

	// Injeção Imediata do Loader e Proteção de Visibilidade
	(function () {
		if (window.location.pathname.includes('login.html')) return;

		// Bloqueia a renderização do corpo imediatamente para evitar piscadas agresivas
		const blockStyle = document.createElement('style');
		blockStyle.innerHTML = `
			body { 
				opacity: 0; 
				filter: blur(10px); 
				transition: none; 
			}
			#quantic-auth-loader {
				position: fixed; top: 0; left: 0; width: 100%; height: 100%;
				background: #070708; display: flex; flex-direction: column;
				align-items: center; justify-content: center; z-index: 999999;
				transition: opacity 1s cubic-bezier(0.4, 0, 0.2, 1);
			}
			.loader-logo { 
				width: 180px; 
				margin-bottom: 32px; 
				animation: pulse-glow 3s infinite ease-in-out; 
				filter: drop-shadow(0 0 20px rgba(139, 92, 246, 0.2));
			}
			.loader-spinner {
				width: 40px; height: 40px; border: 3px solid rgba(139, 92, 246, 0.05);
				border-top-color: #8b5cf6; border-radius: 50%; animation: spin 1.2s cubic-bezier(0.5, 0.1, 0.4, 0.9) infinite;
			}
			@keyframes spin { to { transform: rotate(360deg); } }
			@keyframes pulse-glow { 
				0%, 100% { opacity: 1; transform: scale(1); filter: drop-shadow(0 0 20px rgba(139, 92, 246, 0.2)); } 
				50% { opacity: 0.6; transform: scale(0.95); filter: drop-shadow(0 0 40px rgba(139, 92, 246, 0.4)); } 
			}
		`;
		document.head.appendChild(blockStyle);

		// Injetar o elemento do loader (apenas o container, vazio por padrão)
		const loader = document.createElement('div');
		loader.id = 'quantic-auth-loader';
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
}
