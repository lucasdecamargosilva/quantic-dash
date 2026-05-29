(function () {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    window.addEventListener('DOMContentLoaded', () => {
        const toggleBtn = document.getElementById('themeToggle');
        if (toggleBtn) {
            updateToggleIcon(savedTheme);
            toggleBtn.addEventListener('click', () => {
                const currentTheme = document.documentElement.getAttribute('data-theme');
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('theme', newTheme);
                updateToggleIcon(newTheme);
            });
        }

        // Mobile drawer (<=768px): injeta topbar com hamburguer + backdrop e amarra eventos
        setupMobileDrawer();
    });

    function updateToggleIcon(theme) {
        const icon = document.querySelector('#themeToggle i');
        if (icon) {
            icon.className = theme === 'dark' ? 'ph ph-sun' : 'ph ph-moon';
        }
        const text = document.querySelector('#themeToggle .link-text');
        if (text) {
            text.textContent = theme === 'dark' ? 'Modo Claro' : 'Modo Escuro';
        }
    }

    function setupMobileDrawer() {
        const mainContent = document.querySelector('.main-content');
        if (!mainContent) return;
        if (document.querySelector('.mobile-topbar')) return;

        // Topbar com hamburguer + logo (mantém o logo financeiro existente)
        const topbar = document.createElement('div');
        topbar.className = 'mobile-topbar';
        topbar.innerHTML = ''
            + '<button class="hamburger" aria-label="Abrir menu" type="button">'
            + '  <i class="ph ph-list" style="font-size:20px"></i>'
            + '</button>'
            + '<img class="mobile-topbar-logo" src="logo.png" alt="Logo">';
        mainContent.insertBefore(topbar, mainContent.firstChild);

        // Backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'mobile-backdrop';
        document.body.appendChild(backdrop);

        const closeDrawer = () => document.body.classList.remove('sidebar-open');
        const openDrawer = () => document.body.classList.add('sidebar-open');

        topbar.querySelector('.hamburger').addEventListener('click', openDrawer);
        backdrop.addEventListener('click', closeDrawer);

        // Fecha o drawer ao clicar em qualquer item de navegação
        document.querySelectorAll('.sidebar .nav-link').forEach((link) => {
            link.addEventListener('click', closeDrawer);
        });

        // Fecha com tecla Esc
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeDrawer();
        });

        // Se a janela for redimensionada pra desktop, garante que o drawer feche
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) closeDrawer();
        });
    }
})();
