
// CRM Cliente Logic - Handles captured_leads
let supabaseClient;
let currentLeads = [];

const LEAD_STAGES = [
    "CONTATO",
    "MENSAGEM QUALIFICAÇÃO 1",
    "MENSAGEM QUALIFICAÇÃO 2",
    "MENSAGEM QUALIFICAÇÃO 3",
    "QUALIFICADO",
    "REUNIÃO AGENDADA",
    "REUNIÃO REALIZADA",
    "PROPOSTA ENVIADA",
    "VENDA REALIZADA",
    "DESQUALIFICADO",
    "VENDA PERDIDA"
];

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    document.getElementById('toast-msg').textContent = msg;
    toast.style.background = type === 'error' ? '#ef4444' : 'var(--secondary-green)';
    toast.style.transform = 'translateY(0)';

    setTimeout(() => {
        toast.style.transform = 'translateY(150%)';
    }, 3000);
}

function initSupabase() {
    if (window.supabase && window.SUPABASE_CONFIG) {
        supabaseClient = window.supabase.createClient(
            window.SUPABASE_CONFIG.URL,
            window.SUPABASE_CONFIG.KEY
        );
        return true;
    }
    return false;
}

// Render Kanban Board
function renderBoard(leads) {
    const board = document.getElementById('crm-board');
    if (!board) return;
    board.innerHTML = '';

    LEAD_STAGES.forEach(stageName => {
        const column = document.createElement('div');
        column.className = 'crm-column';
        column.dataset.stage = stageName;

        // Filter leads for this column
        const columnLeads = leads.filter(l => (l.stage || 'CONTATO') === stageName);

        // Header
        const header = document.createElement('div');
        header.className = 'column-header';
        header.innerHTML = `
            <h3>${stageName}</h3>
            <span class="opportunity-count">${columnLeads.length}</span>
        `;

        // Opportunity List (Cards Container)
        const listContainer = document.createElement('div');
        listContainer.className = 'opportunity-list';

        // Drag and Drop Zone Events
        listContainer.addEventListener('dragover', e => {
            e.preventDefault();
            listContainer.classList.add('drag-over');
        });

        listContainer.addEventListener('dragleave', e => {
            listContainer.classList.remove('drag-over');
        });

        listContainer.addEventListener('drop', async e => {
            e.preventDefault();
            listContainer.classList.remove('drag-over');
            const leadId = e.dataTransfer.getData('text/plain');

            if (leadId) {
                await updateLeadStage(leadId, stageName);
            }
        });

        // Create Cards
        columnLeads.forEach(lead => {
            const card = document.createElement('div');
            card.className = 'opportunity-card';
            card.draggable = true;
            card.dataset.id = lead.id;

            // Determine revenue/value display or styling based on data availability
            const emailTag = lead.email ? '<span class="tag" style="background: rgba(16, 185, 129, 0.2); color: #10b981;">Email</span>' : '';
            const phoneTag = lead.telefone ? '<span class="tag" style="background: rgba(59, 130, 246, 0.2); color: #3b82f6;">Tel</span>' : '';

            card.innerHTML = `
                <span class="client-name">${lead.nome || lead.nome_cliente || 'Sem Nome'}</span>
                <span class="company-name">@${lead.profile_name || lead.usuario || 'unknown'}</span>
                
                <div class="tags-container">
                   ${emailTag}
                   ${phoneTag}
                </div>
                
                <div class="responsible-badge">
                    <i class="ph ph-calendar-blank"></i>
                    ${lead.created_at ? new Date(lead.created_at).toLocaleDateString('pt-BR') : '-'}
                </div>
            `;

            // Drag Start
            card.addEventListener('dragstart', e => {
                e.dataTransfer.setData('text/plain', lead.id);
                card.classList.add('dragging');
            });

            card.addEventListener('dragend', e => {
                card.classList.remove('dragging');
            });

            // Click to Open Modal
            card.addEventListener('click', () => openLeadModal(lead));

            listContainer.appendChild(card);
        });

        column.appendChild(header);
        column.appendChild(listContainer);
        board.appendChild(column);
    });
}

// Fetch Leads from Supabase
async function loadLeads() {
    if (!supabaseClient) return;

    try {
        // Fetch ONLY from leads_qualificados_ia
        const { data: iaData, error: iaError } = await supabaseClient
            .from('leads_qualificados_ia')
            .select('id, created_at, nome_cliente, usuario, bio, email, telefone')
            .order('created_at', { ascending: false });

        if (iaError) console.error('Error fetching leads_qualificados_ia:', iaError);

        let allLeads = [];

        // Map leads_qualificados_ia to standard format
        if (iaData) {
            allLeads = iaData.map(l => ({
                id: l.id,
                created_at: l.created_at,
                nome: l.nome_cliente,
                profile_name: l.usuario,
                bio: l.bio,
                email: l.email,
                telefone: l.telefone,
                stage: 'QUALIFICADO'
            }));
        }

        currentLeads = allLeads;
        renderMetrics(currentLeads);
        filterAndRender();

    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

function filterAndRender() {
    const searchTerm = document.getElementById('crmSearch').value.toLowerCase();

    const filtered = currentLeads.filter(lead => {
        const name = (lead.nome || '').toLowerCase();
        const profile = (lead.profile_name || '').toLowerCase();
        return name.includes(searchTerm) || profile.includes(searchTerm);
    });

    renderBoard(filtered);
}

// Update Lead Stage
async function updateLeadStage(id, newStage) {
    if (!supabaseClient) return;

    // Optimistic UI update could be done here
    // For now we rely on the realtime subscription or reload to show the change
    try {
        const { error } = await supabaseClient
            .from('captured_leads')
            .update({ stage: newStage })
            .eq('id', id);

        if (error) throw error;

        showToast("Estágio atualizado!");
        loadLeads(); // Refresh board to ensure consistency
    } catch (err) {
        console.error('Error updating stage:', err);
        showToast("Erro ao mover lead", "error");
    }
}

// Modal Logic
function openLeadModal(lead) {
    const modal = document.getElementById('leadModal');
    if (!modal) return;

    document.getElementById('modal-lead-name').textContent = lead.nome || 'Sem Nome';

    const instaLink = document.getElementById('modal-lead-instagram');
    instaLink.href = lead.profile_url || '#';
    instaLink.innerHTML = `<i class="ph-fill ph-instagram-logo"></i> @${lead.profile_name || 'unknown'}`;

    document.getElementById('modal-lead-date').textContent = new Date(lead.created_at).toLocaleString('pt-BR');
    document.getElementById('modal-lead-bio').textContent = lead.bio || 'Nenhuma descrição disponível.';

    const emailEl = document.getElementById('modal-lead-email');
    emailEl.innerHTML = `<i class="ph ph-envelope"></i> ${lead.email || 'Não informado'}`;

    const phoneEl = document.getElementById('modal-lead-phone');
    phoneEl.innerHTML = `<i class="ph ph-phone"></i> ${lead.telefone || 'Não informado'}`;

    modal.classList.remove('hidden');
    modal.style.display = 'flex'; // Ensure flex display for centering
}

function closeModal() {
    const modal = document.getElementById('leadModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (initSupabase()) {
        loadLeads();

        // Realtime Subscription
        supabaseClient
            .channel('crm-leads-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'captured_leads' }, () => {
                loadLeads();
            })
            .subscribe();
    }

    // Search Input
    document.getElementById('crmSearch').addEventListener('input', filterAndRender);

    // Modal Close
    document.getElementById('closeModal').onclick = closeModal;
    document.getElementById('closeModalBtn').onclick = closeModal;
    // Close on outside click
    document.getElementById('leadModal').addEventListener('click', (e) => {
        if (e.target.id === 'leadModal') {
            closeModal();
        }
    });

});

// Render Metrics Dashboard
function renderMetrics(leads) {
    const barContainer = document.getElementById('metrics-bar');
    const legendContainer = document.getElementById('metrics-legend');
    if (!barContainer || !legendContainer) return;

    // Calculate Counts
    const counts = {};
    LEAD_STAGES.forEach(stage => counts[stage] = 0);

    leads.forEach(lead => {
        const s = lead.stage || 'CONTATO';
        if (counts[s] !== undefined) counts[s]++;
        else counts[s] = (counts[s] || 0) + 1; // Fallback for unknown stages
    });

    const total = leads.length;

    // Colors for stages (gradient roughly)
    const stageColors = {
        "CONTATO": "#94a3b8",
        "MENSAGEM QUALIFICAÇÃO 1": "#818cf8",
        "MENSAGEM QUALIFICAÇÃO 2": "#6366f1",
        "MENSAGEM QUALIFICAÇÃO 3": "#4f46e5",
        "QUALIFICADO": "#c084fc",
        "REUNIÃO AGENDADA": "#a855f7",
        "REUNIÃO REALIZADA": "#9333ea",
        "PROPOSTA ENVIADA": "#7e22ce",
        "VENDA REALIZADA": "#10b981",
        "DESQUALIFICADO": "#ef4444",
        "VENDA PERDIDA": "#9ca3af"
    };

    barContainer.innerHTML = '';
    legendContainer.innerHTML = '';

    if (total === 0) {
        barContainer.innerHTML = '<div style="width: 100%; background: #333; height: 100%;"></div>';
        legendContainer.innerHTML = '<span style="color: var(--text-muted); font-size: 13px;">Sem dados para exibir metrics.</span>';
        return;
    }

    LEAD_STAGES.forEach(stage => {
        const count = counts[stage] || 0;
        if (count > 0) {
            const percentage = (count / total) * 100;
            const color = stageColors[stage] || '#666';

            // Bar Segment
            const segment = document.createElement('div');
            segment.style.width = `${percentage}%`;
            segment.style.backgroundColor = color;
            segment.title = `${stage}: ${count} (${percentage.toFixed(1)}%)`;
            barContainer.appendChild(segment);

            // Legend Item
            const item = document.createElement('div');
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.gap = '6px';
            item.innerHTML = `
                <div style="width: 8px; height: 8px; border-radius: 50%; background: ${color};"></div>
                <span style="font-size: 12px; color: var(--text-white); font-weight: 500;">${stage} <span style="color: var(--text-muted);">(${count})</span></span>
            `;
            legendContainer.appendChild(item);
        }
    });
}

