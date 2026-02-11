// Dashboard Initialization
// Note: AI Metrics currency toggle is now handled by supabase-integration.js

console.log('Quantic Dashboard - Main script loaded');

// Security Utility: Escape HTML to prevent XSS
window.escapeHtml = function (text) {
    if (!text) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

// Unified Toast helper
window.showToast = function (message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;';
        document.body.appendChild(container);

        const style = document.createElement('style');
        style.textContent = `@keyframes slideIn { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`;
        document.head.appendChild(style);
    }

    const toast = document.createElement('div');
    toast.style.cssText = `
        background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6'};
        color: white; padding: 12px 24px; border-radius: 8px; font-family: 'Outfit', sans-serif;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1); font-size: 14px; animation: slideIn 0.3s ease; min-width: 250px;
        transition: opacity 0.3s ease;
    `;
    const icon = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';

    // Safety: message itself is textContent, only HTML for icon
    toast.innerHTML = `<strong>${icon}</strong> <span class="toast-text"></span>`;
    toast.querySelector('.toast-text').textContent = message;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
};

// You can add other dashboard functionality here that doesn't conflict with Supabase integration
// For example: charts, animations, other interactive elements

document.addEventListener('DOMContentLoaded', function () {
    console.log('Dashboard ready - Supabase integration active');

    // Add any additional non-Supabase related functionality here
    // The currency toggle and AI metrics are handled by supabase-integration.js
    // Sidebar Toggle
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('toggleSidebar');

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', function () {
            sidebar.classList.toggle('collapsed');
        });
    }
});
