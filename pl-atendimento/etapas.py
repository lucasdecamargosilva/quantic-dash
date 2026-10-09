"""Funil de prospecção (out/2026) — fonte única das etapas do Atendimento e do CRM.

Cada etapa do painel (rótulo em maiúsculas, gravado no painel.db) corresponde a um slug
que JÁ existia em leads.status no Supabase; as etapas antigas foram migradas e o banco
converte qualquer slug antigo que ainda chegue (trigger leads_a_normaliza_etapa).
"""

FUNIL = [
    ("NOVO", "novo"),                          # chegou, ainda não respondeu de verdade
    ("EM CONVERSA", "respondeu"),              # respondeu; descobrindo onde vende
    ("INTERESSADO", "interessado"),            # recebeu apresentação/preço e quer seguir
    ("AGUARDANDO DADOS", "testando"),          # aceitou o teste; falta logo/e-mail/WhatsApp
    ("EM TESTE", "testando_ativo"),            # catálogo/provador no ar (automático)
    ("TESTE PARADO", "passou_prazo"),          # no ar sem uso ou prazo acabou (automático)
    ("PROPOSTA ENVIADA", "proposta_enviada"),
    ("AGUARDANDO PAGAMENTO", "aguardando_pagamento"),
    ("CONVERTIDO", "fechou"),
    ("STAND-BY", "stand_by"),                  # com data de retorno (leads.retomar_em)
    ("PERDIDO", "perdida"),                    # com motivo (leads.motivo_perda)
]

STATUS = [rotulo for rotulo, _ in FUNIL]
PARA_CRM = dict(FUNIL)
ENCERRADO = {"CONVERTIDO", "PERDIDO"}
# etapas com coluna própria: não aparecem em "Esperando" / "Sem resposta"
COM_COLUNA = ("CONVERTIDO", "PERDIDO", "AGUARDANDO DADOS", "EM TESTE", "TESTE PARADO",
              "PROPOSTA ENVIADA", "AGUARDANDO PAGAMENTO")

ROTULO_CRM = {
    "novo": "Novo", "respondeu": "Em conversa", "interessado": "Interessado", "testando": "Aguardando dados",
    "testando_ativo": "Em teste", "passou_prazo": "Teste parado", "proposta_enviada": "Proposta enviada",
    "aguardando_pagamento": "Aguardando pagamento", "fechou": "Convertido", "stand_by": "Stand-by", "perdida": "Perdido",
}

# slugs antigos do CRM -> slug do funil (mesma tabela do trigger no banco)
SLUG_LEGADO = {
    "meta": "novo", "dm_enviada": "novo", "mensagem_1": "novo", "mensagem_2": "novo", "mensagem_3": "novo",
    "email_a_enviar": "novo", "email_enviado": "novo", "lead_coletado": "novo", "novo_tiktok": "novo",
    "whatsapp": "novo", "sem_site": "novo",
    "contatar": "respondeu", "atendimento_ia": "respondeu",
    "fotos_enviadas": "interessado", "reuniao_agendada": "interessado",
    "aguardando_cadastro": "testando", "teste_catalogo_7_dias": "testando",
    "negociando": "proposta_enviada",
    "parou_responder": "stand_by",
    "descartado": "perdida", "testou_e_saiu": "perdida",
}

# rótulos antigos do painel.db -> rótulo do funil (migração local, uma vez)
LOCAL_LEGADO = {
    "SEM ETAPA": "NOVO", "MENSAGEM 1": "NOVO", "MENSAGEM 2": "NOVO", "MENSAGEM 3": "NOVO",
    "CONTATAR": "EM CONVERSA", "TESTE GRÁTIS": "AGUARDANDO DADOS", "AGUARDANDO CADASTRO": "AGUARDANDO DADOS",
    "TESTANDO": "EM TESTE", "PASSOU DO PRAZO": "TESTE PARADO", "NEGOCIANDO": "PROPOSTA ENVIADA",
}

_DO_CRM = {slug: rotulo for rotulo, slug in FUNIL}


def local_do_slug(slug):
    """Rótulo do painel para um slug do CRM (antigo ou novo)."""
    return _DO_CRM.get(SLUG_LEGADO.get(slug, slug), "NOVO")
