// Mock data for testing without Supabase
// Use this file to test the dashboard with fake data before connecting to Supabase

const mockData = {
    financialMetrics: {
        mrr: 48500,
        arr: 582000,
        total_revenue: 62150,
        avg_ticket: 5179,
        growth_percentage: 12
    },

    aiMetrics: {
        input_tokens: 12.5, // in millions
        input_cost: 37.50,
        output_tokens: 4.2, // in millions
        output_cost: 126.00,
        total_cost: 163.50,
        budget: 220
    },

    clients: [
        {
            id: 1,
            name: 'João Silva',
            company: 'Tech Corp Brasil',
            status: 'Ativo',
            mrr: 2500,
            plan: 'Mensal',
            engagement_score: 85
        },
        {
            id: 2,
            name: 'Maria Santos',
            company: 'StartupXYZ',
            status: 'Ativo',
            mrr: 5000,
            plan: 'Anual',
            engagement_score: 92
        },
        {
            id: 3,
            name: 'Pedro Costa',
            company: 'Innovate Ltd',
            status: 'Ativo',
            mrr: 1500,
            plan: 'Mensal',
            engagement_score: 78
        },
        {
            id: 4,
            name: 'Ana Oliveira',
            company: 'Digital Solutions',
            status: 'Ativo',
            mrr: 3200,
            plan: 'Trimestral',
            engagement_score: 88
        },
        {
            id: 5,
            name: 'Carlos Mendes',
            company: 'Cloud Services Inc',
            status: 'Ativo',
            mrr: 7500,
            plan: 'Anual',
            engagement_score: 95
        }
    ],

    revenueHistory: [
        { month: 'JAN', value: 45000 },
        { month: 'FEV', value: 48000 },
        { month: 'MAR', value: 52000 },
        { month: 'ABR', value: 49000 },
        { month: 'MAI', value: 55000 },
        { month: 'JUN', value: 58000 },
        { month: 'JUL', value: 54000 },
        { month: 'AGO', value: 60000 },
        { month: 'SET', value: 57000 },
        { month: 'OUT', value: 61000 },
        { month: 'NOV', value: 59000 },
        { month: 'DEZ', value: 62150 }
    ],

    profitMargins: {
        gross_margin: 68,
        net_margin: 42,
        operating_margin: 55
    },

    cashflow: {
        receivables: 125000,
        payables: 78000,
        net_cashflow: 47000
    }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = mockData;
}
