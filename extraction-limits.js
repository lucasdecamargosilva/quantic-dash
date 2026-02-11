/**
 * Módulo de Controle de Limites de Extração
 * Gerencia limites diários de extração por plano (Starter, Growth, Enterprise)
 */

// Configuração de limites por plano
const PLAN_LIMITS = {
    starter: {
        instagram: 100,
        google_maps: 100
    },
    growth: {
        instagram: 300,
        google_maps: 300
    },
    enterprise: {
        instagram: 500,
        google_maps: 500
    }
};

class ExtractionLimitsManager {
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
            console.error('[ExtractionLimits] Erro ao inicializar:', error);
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
            console.error('[ExtractionLimits] Erro ao carregar plano:', error);
            this.userPlan = 'starter'; // Fallback
            return this.userPlan;
        }
    }

    /**
     * Verifica se o usuário pode realizar uma extração
     * @param {string} channel - 'instagram' ou 'google_maps'
     * @param {number} count - Quantidade de leads a extrair (default: 1)
     * @returns {Promise<Object>} Objeto com can_extract, current_count, limit, remaining, plan
     */
    async canExtract(channel, count = 1) {
        try {
            if (!this.currentUser) {
                await this.init();
            }

            const { data, error } = await this.client
                .rpc('can_extract', {
                    p_user_id: this.currentUser.id,
                    p_channel: channel,
                    p_count: count
                });

            if (error) throw error;

            return data;
        } catch (error) {
            console.error('[ExtractionLimits] Erro ao verificar limite:', error);
            // Em caso de erro, retorna valores conservadores
            return {
                can_extract: false,
                current_count: 0,
                limit: 100,
                remaining: 0,
                plan: 'starter',
                requested: count,
                error: error.message
            };
        }
    }

    /**
     * Incrementa o contador de extrações
     * @param {string} channel - 'instagram' ou 'google_maps'
     * @param {number} count - Quantidade extraída
     * @returns {Promise<number>} Novo total de extrações do dia
     */
    async incrementCount(channel, count = 1) {
        try {
            if (!this.currentUser) {
                await this.init();
            }

            const { data, error } = await this.client
                .rpc('increment_extraction_count', {
                    p_user_id: this.currentUser.id,
                    p_channel: channel,
                    p_count: count
                });

            if (error) throw error;

            return data;
        } catch (error) {
            console.error('[ExtractionLimits] Erro ao incrementar contador:', error);
            throw error;
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
                .from('daily_extractions')
                .select('channel, count')
                .eq('user_id', this.currentUser.id)
                .eq('extraction_date', new Date().toISOString().split('T')[0]);

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
                        stats[item.channel].used = item.count;
                        stats[item.channel].remaining = stats[item.channel].limit - item.count;
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
            console.error('[ExtractionLimits] Erro ao obter estatísticas:', error);
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
            console.error('[ExtractionLimits] Erro ao atualizar plano:', error);
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
}

// Exporta para uso global
window.ExtractionLimitsManager = ExtractionLimitsManager;
window.PLAN_LIMITS = PLAN_LIMITS;
