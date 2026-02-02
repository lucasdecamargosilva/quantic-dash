// Dashboard Initialization
// Note: AI Metrics currency toggle is now handled by supabase-integration.js

console.log('Quantic Dashboard - Main script loaded');

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
