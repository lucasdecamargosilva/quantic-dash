document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('themeToggle');
    const html = document.documentElement;

    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    html.setAttribute('data-theme', savedTheme);
    updateToggleState(savedTheme);

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = html.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

            html.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateToggleState(newTheme);
        });
    }

    function updateToggleState(theme) {
        if (!themeToggle) return;
        const icon = themeToggle.querySelector('i');
        const text = themeToggle.querySelector('.link-text');

        if (theme === 'light') {
            if (icon) icon.className = 'ph ph-moon';
            if (text) text.textContent = 'Modo Escuro';
        } else {
            if (icon) icon.className = 'ph ph-sun';
            if (text) text.textContent = 'Modo Claro';
        }
    }
});
