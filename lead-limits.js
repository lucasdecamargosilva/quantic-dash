/**
 * Módulo de Controle de Limites de LEADS Capturados
 * Gerencia limites diários de LEADS por plano (Starter, Growth, Enterprise)
 * 
 * IMPORTANTE: Conta LEADS capturados, não número de extrações!
 */

// Configuração de limites por plano (LEADS por dia)
const PLAN_LIMITS = {
    starter: {
        instagram: 100,      // 100 LEADS por dia
        google_maps: 100     // 100 LEADS por dia
    },
    growth: {
        instagram: 300,      // 300 LEADS por dia
        google_maps: 300     // 300 LEADS por dia
    },
    enterprise: {
        instagram: 500,      // 500 LEADS por dia
        google_maps: 500     // 500 LEADS por dia
    }
};

class LeadLimitsManager {
    constructor(supabaseClient) {
        this.client = supabaseClient;
        this.currentUser = null;
        this.userPlan = null;
    }

    /**
     * Inicializa o gerenciador obtendo dados do usuário
     */
    async init() {
        try {
            const { data: { user } } = await this.client.auth.getUser();
            if (!user) {
                throw new Error('Usuário não autenticado');
            }
            this.currentUser = user;
            await this.loadUserPlan();
            return true;
        } catch (error) {
            console.error('[LeadLimits] Erro ao inicializar:', error);
            return false;
        }
    }

    /**
     * Carrega o plano do usuário
     */
    async loadUserPlan() {
        try {
            const { data, error } = await this.client
                .from('user_plans')
                .select('plan_name')
                .eq('user_id', this.currentUser.id)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = not found
                throw error;
            }

            this.userPlan = data?.plan_name || 'starter';
            return this.userPlan;
        } catch (error) {
            console.error('[LeadLimits] Erro ao carregar plano:', error);
            this.userPlan = 'starter'; // Fallback
            return this.userPlan;
        }
    }

    /**
     * Verifica se o usuário pode capturar mais X leads
     * @param {string} channel - 'instagram' ou 'google_maps'
     * @param {number} requestedLeads - Quantidade de leads que quer capturar
     * @returns {Promise<Object>} Objeto com can_capture, current_count, limit, remaining, plan
     */
    async canCaptureLeads(channel, requestedLeads = 1) {
        try {
            if (!this.currentUser) {
                await this.init();
            }

            const { data, error } = await this.client
                .rpc('can_capture_leads', {
                    p_user_id: this.currentUser.id,
                    p_channel: channel,
                    p_requested_count: requestedLeads
                });

            if (error) throw error;

            return data;
        } catch (error) {
            console.error('[LeadLimits] Erro ao verificar limite:', error);
            // Em caso de erro, retorna valores conservadores
            return {
                can_capture: false,
                current_count: 0,
                limit: 100,
                remaining: 0,
                plan: 'starter',
                requested: requestedLeads,
                error: error.message
            };
        }
    }

    /**
     * Obtém estatísticas de uso do dia
     * @returns {Promise<Object>} Estatísticas de uso por canal
     */
    async getDailyStats() {
        try {
            if (!this.currentUser) {
                await this.init();
            }

            const { data, error } = await this.client
                .from('daily_lead_counts')
                .select('channel, leads_count')
                .eq('user_id', this.currentUser.id)
                .eq('count_date', new Date().toISOString().split('T')[0]);

            if (error) throw error;

            const stats = {
                instagram: { used: 0, limit: 0, remaining: 0 },
                google_maps: { used: 0, limit: 0, remaining: 0 },
                plan: this.userPlan || 'starter'
            };

            const plan = this.userPlan || 'starter';
            stats.instagram.limit = PLAN_LIMITS[plan].instagram;
            stats.google_maps.limit = PLAN_LIMITS[plan].google_maps;

            if (data) {
                data.forEach(item => {
                    if (stats[item.channel]) {
                        stats[item.channel].used = item.leads_count;
                        stats[item.channel].remaining = stats[item.channel].limit - item.leads_count;
                    }
                });
            }

            // Calcula remaining para canais sem uso
            if (stats.instagram.used === 0) {
                stats.instagram.remaining = stats.instagram.limit;
            }
            if (stats.google_maps.used === 0) {
                stats.google_maps.remaining = stats.google_maps.limit;
            }

            return stats;
        } catch (error) {
            console.error('[LeadLimits] Erro ao obter estatísticas:', error);
            return null;
        }
    }

    /**
     * Atualiza o plano do usuário
     * @param {string} newPlan - 'starter', 'growth', ou 'enterprise'
     */
    async updatePlan(newPlan) {
        try {
            if (!this.currentUser) {
                await this.init();
            }

            const { error } = await this.client
                .from('user_plans')
                .upsert({
                    user_id: this.currentUser.id,
                    plan_name: newPlan,
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;

            this.userPlan = newPlan;
            return true;
        } catch (error) {
            console.error('[LeadLimits] Erro ao atualizar plano:', error);
            return false;
        }
    }

    /**
     * Obtém os limites do plano atual
     */
    getPlanLimits() {
        const plan = this.userPlan || 'starter';
        return PLAN_LIMITS[plan];
    }

    /**
     * Formata mensagem de erro quando limite é atingido
     */
    formatLimitError(check) {
        return `❌ Limite de leads atingido!\n\n` +
            `Plano: ${check.plan.toUpperCase()}\n` +
            `Leads capturados hoje: ${check.current_count}/${check.limit}\n` +
            `Leads disponíveis: ${check.remaining}\n` +
            `Você tentou capturar: ${check.requested}\n\n` +
            `💡 Faça upgrade do seu plano para capturar mais leads!`;
    }

    /**
     * Formata mensagem de aviso quando está perto do limite
     */
    formatWarning(check) {
        const percentage = (check.current_count / check.limit) * 100;

        if (percentage >= 90) {
            return `⚠️ ATENÇÃO: Você já usou ${percentage.toFixed(0)}% do seu limite de leads hoje! (${check.remaining} restantes)`;
        } else if (percentage >= 75) {
            return `⚠️ Você já usou ${percentage.toFixed(0)}% do seu limite de leads hoje. (${check.remaining} restantes)`;
        }

        return null;
    }
}

// Exporta para uso global
window.LeadLimitsManager = LeadLimitsManager;
window.PLAN_LIMITS = PLAN_LIMITS;

console.log('✅ LeadLimitsManager carregado - Sistema de limites de LEADS por plano');
