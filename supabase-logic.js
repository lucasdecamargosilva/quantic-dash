// Fallback for debug logging
if (!window.logDebug) {
    window.logDebug = function (msg) { console.log("DEBUG:", msg); };
}

let supabaseClient;

// Initialize Supabase using the global client from auth.js
async function initSupabase() {
    window.logDebug("initSupabase called...");
    try {
        // Wait for config to load
        if (window.CONFIG_LOADED) {
            window.logDebug("Waiting for CONFIG_LOADED promise...");
            await window.CONFIG_LOADED;
            window.logDebug("CONFIG_LOADED resolved.");
        }

        // Robust waiting for supabaseClient (up to 5 seconds)
        let attempts = 0;
        window.logDebug("Searching for window.supabaseClient...");
        while (!window.supabaseClient && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        if (window.supabaseClient) {
            supabaseClient = window.supabaseClient;
            window.logDebug("Global Supabase Client found. Verifying session...");

            // Explicitly wait for session to be recovered from storage
            const { data: { session }, error } = await supabaseClient.auth.getSession();
            if (error) {
                window.logDebug("Session error: " + error.message);
            }
            if (session) {
                window.logDebug("Session active for: " + session.user.email);
            } else {
                window.logDebug("No active session found in client.");
            }

            return true;
        } else {
            window.logDebug("FAILED: Global Supabase Client missing after 5s!");
            if (window.showToast) window.showToast("Erro de Conexão: Cliente não inicializado", "error");
            return false;
        }
    } catch (e) {
        window.logDebug("INIT ERROR: " + e.message);
        return false;
    }
}

// Global state
let currentCurrency = 'USD';
const USD_TO_BRL = 5.0;
let currentStartDate = null;
let currentEndDate = null;

// Update UI
function updateAIMetricsDisplay(costs) {
    window.logDebug("Updating UI with costs...");

    // Card 1: Input
    const valInput = document.getElementById('ai-input-value');
    const subInput = document.getElementById('ai-input-subtext');
    if (valInput && subInput) {
        valInput.textContent = `${(costs.input_tokens / 1000000).toFixed(2)} M`;
        subInput.textContent = `Tokens • ${formatCurrency(costs.cost_input_usd, currentCurrency)}`;
    }

    // Card 2: Output
    const valOutput = document.getElementById('ai-output-value');
    const subOutput = document.getElementById('ai-output-subtext');
    if (valOutput && subOutput) {
        valOutput.textContent = `${(costs.output_tokens / 1000000).toFixed(2)} M`;
        subOutput.textContent = `Tokens • ${formatCurrency(costs.cost_output_usd, currentCurrency)}`;
    }

    // Card 3: Total
    const valTotal = document.getElementById('ai-total-value');
    const subTotal = document.getElementById('ai-total-subtext');
    if (valTotal && subTotal) {
        valTotal.textContent = formatCurrency(costs.total_usd, currentCurrency);
        if (currentCurrency === 'USD') {
            subTotal.textContent = `~ R$ ${(costs.total_usd * USD_TO_BRL).toFixed(2).replace('.', ',')} (Estimado)`;
        } else {
            subTotal.textContent = `~ $ ${costs.total_usd.toFixed(2)} (Estimado)`;
        }
    }
}

function formatCurrency(value, currency) {
    const amount = currency === 'BRL' ? value * USD_TO_BRL : value;
    return currency === 'USD' ? `$ ${amount.toFixed(2)}` : `R$ ${amount.toFixed(2).replace('.', ',')}`;
}

function updateClientsTable(clients) {
    const tableBody = document.getElementById('clients-table-body');
    if (!tableBody) return;

    if (!clients || clients.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">Nenhum cliente encontrado na tabela do Supabase.</td></tr>';
        updateFinancialKPIs(0, 0, 0);
        return;
    }

    // Calcular KPIs
    let totalMRR = 0;
    let totalImp = 0;
    let clientsWithImp = 0;

    clients.forEach(c => {
        const mrr = parseFloat(c.valor_recorrencia) || 0;
        const imp = parseFloat(c.valor_implementacao) || 0;
        totalMRR += mrr;
        totalImp += imp;
        if (imp > 0) clientsWithImp++;
    });

    const arr = (totalMRR * 12) + totalImp;
    const receitaMensal = totalMRR + totalImp;
    const ticketMedio = clientsWithImp > 0 ? totalImp / clientsWithImp : 0;

    // Atualizar UI dos Cards
    document.getElementById('kpi-mrr-value').textContent = formatBRL(totalMRR);
    document.getElementById('kpi-arr-value').textContent = formatBRL(arr);
    document.getElementById('kpi-total-revenue-value').textContent = formatBRL(receitaMensal);
    document.getElementById('kpi-avg-ticket-value').textContent = formatBRL(ticketMedio);

    tableBody.innerHTML = clients.map(client => {
        // Mapeamento exato com base no schema fornecido
        const clientName = client.cliente || 'Sem Nome';
        const projectStatus = client.status_projeto || 'Ativo';
        const valImp = parseFloat(client.valor_implementacao) || 0;
        const valRec = parseFloat(client.valor_recorrencia) || 0;

        const initials = getInitials(clientName);
        const statusClass = projectStatus.toLowerCase() === 'ativo' ? 'status-badge' : 'status-badge standby';
        const statusIcon = projectStatus.toLowerCase() === 'ativo' ? 'ph-check-circle' : 'ph-clock';

        return `
            <tr>
                <td>
                    <div class="client-info">
                        <div class="client-avatar" style="background: var(--gradient-primary); font-weight: 600;">${initials}</div>
                        <div class="client-details">
                            <span class="name">${clientName}</span>
                            <span class="desc">${client.descricao_cliente || 'Sem descrição'}</span>
                        </div>
                    </div>
                </td>
                <td><span class="${statusClass}"><i class="ph-fill ${statusIcon}"></i> ${projectStatus}</span></td>
                <td><span class="table-value">${formatBRL(valImp)}</span></td>
                <td><span class="recurrence-pill">${formatBRL(valRec)}/mês</span></td>
                <td><button class="action-btn"><i class="ph-bold ph-dots-three"></i></button></td>
            </tr>
        `;
    }).join('');
}

// Helper para zerar KPIs se necessário
function updateFinancialKPIs(mrr, arr, rec) {
    if (document.getElementById('kpi-mrr-value')) document.getElementById('kpi-mrr-value').textContent = formatBRL(mrr);
    if (document.getElementById('kpi-arr-value')) document.getElementById('kpi-arr-value').textContent = formatBRL(arr);
    if (document.getElementById('kpi-total-revenue-value')) document.getElementById('kpi-total-revenue-value').textContent = formatBRL(rec);
    if (document.getElementById('kpi-avg-ticket-value')) document.getElementById('kpi-avg-ticket-value').textContent = formatBRL(0);
}

function getInitials(name) {
    if (!name) return '??';
    const parts = name.split(' ').filter(p => p.length > 0);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

function formatBRL(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

async function fetchAICostsByPeriod(startDate, endDate) {
    if (!supabaseClient) {
        window.logDebug("Abort fetchAICosts: No supabaseClient");
        return;
    }

    window.logDebug(`fetchAICosts called: ${startDate} to ${endDate}`);

    // UI Loading state
    const loadingIds = ['ai-input-value', 'ai-output-value', 'ai-total-value'];
    loadingIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = "...";
    });

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;

        const { data, error } = await supabaseClient
            .from('custos_modelo')
            .select('*')
            .gte('data_request', startDate)
            .lte('data_request', endDate)
            .eq('user_id', user.id)
            .order('data_request', { ascending: true });

        if (error) {
            window.logDebug("API ERROR (custos_modelo): " + error.message);
            if (window.showToast) window.showToast("Erro ao carregar métricas de IA", "error");
            return;
        }

        window.logDebug(`API Success: Received ${data ? data.length : 0} rows from custos_modelo`);

        if (data) {
            const totals = data.reduce((acc, r) => ({
                input_tokens: acc.input_tokens + (parseFloat(r.input_tokens) || 0),
                output_tokens: acc.output_tokens + (parseFloat(r.output_tokens) || 0),
                cost_input_usd: acc.cost_input_usd + (parseFloat(r.cost_input_usd) || 0),
                cost_output_usd: acc.cost_output_usd + (parseFloat(r.cost_output_usd) || 0),
                total_usd: acc.total_usd + (parseFloat(r.total_usd) || 0)
            }), { input_tokens: 0, output_tokens: 0, cost_input_usd: 0, cost_output_usd: 0, total_usd: 0 });

            updateAIMetricsDisplay(totals);
            if (data.length > 0) {
                showToast(`Dados carregados com sucesso`, 'success');
            } else {
                showToast(`Nenhum dado encontrado para este período`, 'info');
            }
        }
    } catch (err) {
        window.logDebug("CATCH ERROR: " + err.message);
    }
}

function setPeriodDates(days) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);

    currentStartDate = start.toISOString().split('T')[0];
    currentEndDate = end.toISOString().split('T')[0];
}


async function fetchClientes() {
    if (!supabaseClient) return;

    window.logDebug("Fetching clientes data...");

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;

        const { data, error } = await supabaseClient
            .from('clientes')
            .select('*')
            .eq('user_id', user.id)
            .order('cliente', { ascending: true }); // Nome exato da coluna conforme schema

        if (error) {
            window.logDebug("CLIENTES API ERROR: " + error.message);
            console.error("Full Supabase Error:", error);
            return;
        }

        if (data) {
            window.logDebug(`Found ${data.length} clients in 'clientes' table.`);
            updateClientsTable(data);
        }
    } catch (err) {
        window.logDebug("CLIENTES CATCH ERROR: " + err.message);
    }
}


// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    window.logDebug("DOM Loaded - Initializing dashboard logic...");

    const initialized = await initSupabase();
    if (initialized) {
        window.logDebug("Supabase Initialized successfully.");
        // Period filter buttons
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');

                const period = this.dataset.period;
                const customRange = document.getElementById('custom-date-range');

                if (period === 'custom') {
                    customRange.style.display = 'flex';
                } else {
                    customRange.style.display = 'none';
                    setPeriodDates(parseInt(period));
                    fetchAICostsByPeriod(currentStartDate, currentEndDate);
                }
            });
        });

        // Apply Custom Range
        const applyBtn = document.getElementById('apply-custom-range');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                const start = document.getElementById('start-date').value;
                const end = document.getElementById('end-date').value;

                if (start && end) {
                    currentStartDate = start;
                    currentEndDate = end;
                    fetchAICostsByPeriod(currentStartDate, currentEndDate);
                } else {
                    showToast("Selecione as duas datas", "error");
                }
            });
        }

        // Currency toggle
        document.querySelectorAll('.toggle-currency span').forEach(span => {
            span.addEventListener('click', function () {
                document.querySelectorAll('.toggle-currency span').forEach(s => s.classList.remove('active'));
                this.classList.add('active');
                currentCurrency = this.textContent.trim();
                fetchAICostsByPeriod(currentStartDate, currentEndDate);
            });
        });

        // Initial fetch - Default 30 days
        setPeriodDates(30);
        window.logDebug("Triggering initial data fetch (30 days)...");
        await fetchAICostsByPeriod(currentStartDate, currentEndDate);
        await fetchClientes();

        // Real-time for costs
        supabaseClient.channel('costs-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'custos_modelo' }, payload => {
            window.logDebug("Real-time update for costs!");
            fetchAICostsByPeriod(currentStartDate, currentEndDate);
        }).subscribe();


        // Real-time for clients
        supabaseClient.channel('clients-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, payload => {
            window.logDebug("Real-time update for clients!");
            fetchClientes();
        }).subscribe();
    }
});
