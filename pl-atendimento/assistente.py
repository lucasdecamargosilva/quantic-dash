"""Assistente IA do CRM de prospecção: a Dione (e o Lucas) conversam sobre o negócio.

Acesso a dados: só pela função crm_ia_contexto(p_chave) do Supabase, que devolve um
retrato do funil, dos leads em andamento e do uso dos catálogos — sem telefone, e-mail,
chave de loja ou faturamento de lojista. A chave da IA (PL_IA_KEY) fica só no EasyPanel;
no banco existe apenas o hash dela (tabela crm_ia_chave, invisível pra anon).
"""
import json
import os
import threading
import time
import urllib.error
import urllib.request

USUARIOS = {"lucas", "dione"}
MODELO = "gemini-2.5-flash"
MAX_TURNOS = 24
CACHE_SEG = 180

BASE = """# Provou Levou — o que vendemos

Provador virtual com IA para lojas de óculos, roupa e acessórios. O cliente da loja manda uma
foto e se vê usando o produto antes de comprar. Tagline: "O provador virtual que materializa o
desejo de compra." Site provoulevou.com.br · Instagram @provoulevouapp · WhatsApp comercial
(11) 93803-4714 · contato@provoulevou.com.br.

## Dois produtos
1. PROVADOR NO SITE — para quem tem loja online. Botão "Provar" na página do produto.
   Plataformas: Shopify, Nuvemshop, Tray, Bagy, VTEX, WooCommerce, Loja Integrada, Wix ou
   qualquer loja que aceite script (via Google Tag Manager). Instala em ~5 min (GTM, FTP ou app
   da plataforma), sem mexer no código da loja; a equipe costuma deixar no ar no mesmo dia.
   O lojista ganha painel com quem provou o quê e quem comprou depois (atribuição), e captura
   o WhatsApp de quem provou.
2. PROVOU CATÁLOGO — para quem NÃO tem loja online (vende por Instagram, WhatsApp ou loja
   física). Montamos um catálogo próprio com o provador dentro, num link só
   (provoulevou.com.br/catalogo/?loja=<nome>). O lojista cadastra os produtos num login
   próprio (foto, nome, preço) e divulga o link. Para criar: logo da loja, e-mail do login e
   WhatsApp da loja.
Em ambos criamos um grupo no WhatsApp onde o lojista recebe cada prova em tempo real (foto do
cliente usando o produto + modelo provado + WhatsApp do cliente), para chamar enquanto o
interesse está quente. 7 dias grátis para testar, sem cartão e sem custo de instalação.

## Planos do Provou Catálogo (mensais — é a tabela que o comercial envia)
Essencial R$ 39 (50 provas) · Crescimento R$ 79 (100) · Profissional R$ 159 (200) ·
Escala R$ 369 (500) · Volume 1.000 R$ 699 · Volume 1.500 R$ 959 · Volume 2.500 R$ 1.499.
No fim do teste recomendamos o pacote pelo volume real de provas (projete as provas dos
últimos 7 dias para 30 dias).

## Planos do Provador no site (mensais)
Essencial R$ 97 (50 fotos) · Crescimento R$ 147 (100) · Acelerador R$ 347 (300) ·
Performance R$ 547 (500, o mais vendido) · Escala R$ 997 (1.200) · acima disso, plano
Enterprise sob medida (SLA + gerente de conta) — falar com o Lucas.

## Números para argumentar
- +10.000 provas realizadas; R$ 230 mil+ em vendas atribuídas ao provador; ~22% de atribuição média.
- Conversão de quem usa o provador chega a 14,32% (Cacife Brand) — ~7,5x a média de moda online no Brasil (1,9%).
- Cacife Brand: instalou em março; abril vs abril do ano anterior, faturamento por dia +22%, e
  mais de R$ 100 mil em vendas de clientes que provaram antes de comprar.
- Óticas: 51% de quem prova compra em até 1h; até 30% das vendas atribuídas ao provador.
- Devoluções caem 23–78% em estudos globais (Warby Parker −27%).
- Regra prática: para cada R$ 10 mil/mês que a loja fatura, o provador costuma somar R$ 1,2–1,5 mil.
Clientes conhecidos: Cacife Brand, Mariana Cardoso, Amazoni, Maxilook, Califa, Paris London,
Ótica Style, Liuzzi, Mi Piace, Oclinhos de Leitura, Soucet, Marandola, Menina Flor e dezenas de
óticas no Provou Catálogo.

## Objeções (respostas que já usamos)
- "Sem interesse no momento": não forçar. Agradecer, deixar um dado forte (Cacife +22%,
  +R$ 100 mil atribuídos) e o convite dos 7 dias grátis sem cartão. Lead morno volta em 2–3 meses.
- "Achei caro / quanto custa?": ancorar no retorno antes do preço (1,9% → até 15% de conversão;
  R$ 1,2–1,5 mil a mais por R$ 10 mil faturados) e fechar com os 7 dias grátis.
- Reaquecer lead parado: curto e direto — "Bora instalar os 7 dias grátis de provador?" ou
  "Conseguiu dar uma olhada no que te enviei sobre o Provador Virtual?".
- Quem só tem loja física, Instagram ou WhatsApp → Provou Catálogo.

## Etapas do funil (códigos do CRM)
meta/dm_enviada/mensagem_1..3 = prospecção fria · respondeu · contatar · interessado ·
fotos_enviadas · reuniao_agendada · teste_catalogo_7_dias e testando (Teste Grátis, ainda sem
catálogo/instalação) · testando_ativo (Testando: catálogo/provador no ar) · aguardando_cadastro ·
passou_prazo (teste acabou sem fechar) · proposta_enviada · negociando · aguardando_pagamento ·
fechou (Convertido) · stand_by · parou_responder · perdida · descartado.
"""

REGRAS = """Você é o assistente interno do time comercial da Provou Levou, dentro do CRM de prospecção.
Quem conversa com você é %(quem)s. Hoje é %(hoje)s (horário de Brasília).

Use a BASE DE CONHECIMENTO e o RETRATO DOS DADOS abaixo para responder sobre o negócio, o funil,
os leads em teste e o uso dos catálogos, sugerir próximos passos e escrever mensagens de WhatsApp.

Regras:
- Português do Brasil, direto, com recomendação clara. Nada de rodeio.
- Números e status de leads/catálogos: SOMENTE do retrato dos dados. Se não estiver lá, diga que
  não tem esse dado aqui e sugira perguntar ao Lucas. Nunca invente preço, desconto, prazo,
  funcionalidade ou case.
- Desconto, plano fora da tabela, Enterprise ou questão técnica de instalação: oriente a falar com o Lucas.
- Mensagem para lojista: estilo WhatsApp, 2 a 5 linhas, no máximo um emoji, pronta para copiar.
  Nunca use colchetes/placeholder ([Nome]); se não souber o nome da pessoa, comece com "Oi, tudo bem?".
- Prioridade de cobrança: o teste dura 7 dias a partir de "teste_desde". Mais urgente = mais dias
  de teste corridos (5–7 dias ou já passou) com pouco uso (0 produtos ou provas_7d = 0). Catálogo
  criado hoje ou ontem ainda NÃO é urgente — no máximo um empurrão para cadastrar produtos.
  Quem está provando bem (provas_7d alto) perto do fim do teste é hora de propor o pacote.
- Se o lojista perguntou o preço, responda com os valores (a tabela do produto certo) e convide
  para os 7 dias grátis — não fuja do preço.
- Responda em markdown simples (listas curtas, negrito pontual). Tabelas só se pedirem.
"""

_cache = {"em": 0, "txt": ""}
_lock = threading.Lock()


def _post(url, body, headers, timeout=120):
    r = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), method="POST",
                               headers={"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(r, timeout=timeout) as x:
        return json.loads(x.read().decode("utf-8"))


def contexto(crm_url, crm_key):
    with _lock:
        if time.time() - _cache["em"] < CACHE_SEG and _cache["txt"]:
            return _cache["txt"]
        chave = os.environ.get("PL_IA_KEY", "")
        if not (crm_url and crm_key and chave):
            raise RuntimeError("Assistente sem configuração (PL_IA_KEY / Supabase).")
        d = _post(crm_url.rstrip("/") + "/rest/v1/rpc/crm_ia_contexto", {"p_chave": chave},
                  {"apikey": crm_key, "Authorization": "Bearer " + crm_key})
        _cache.update(em=time.time(), txt=json.dumps(d, ensure_ascii=False, separators=(",", ":")))
        return _cache["txt"]


def responde(usuario, mensagens, gemini_key, crm_url, crm_key, hoje):
    usuario = (usuario or "").strip().lower()
    if usuario not in USUARIOS:
        raise PermissionError("Assistente disponível só para o comercial.")
    if not gemini_key:
        raise RuntimeError("Sem GEMINI_KEY no servidor.")
    if not isinstance(mensagens, list) or not mensagens:
        raise ValueError("Mande ao menos uma mensagem.")
    turnos = []
    for m in mensagens[-MAX_TURNOS:]:
        texto = str((m or {}).get("texto") or "").strip()[:6000]
        if texto:
            turnos.append({"role": "model" if m.get("de") == "ia" else "user", "parts": [{"text": texto}]})
    if not turnos or turnos[-1]["role"] != "user":
        raise ValueError("A última mensagem precisa ser sua.")
    sistema = (REGRAS % {"quem": "a Dione (comercial)" if usuario == "dione" else "o Lucas (dono)", "hoje": hoje}
               + "\n\n# BASE DE CONHECIMENTO\n" + BASE
               + "\n\n# RETRATO DOS DADOS (JSON, gerado agora do CRM)\n" + contexto(crm_url, crm_key))
    corpo = {"systemInstruction": {"parts": [{"text": sistema}]}, "contents": turnos,
             "generationConfig": {"temperature": 0.3, "maxOutputTokens": 4096,
                                  "thinkingConfig": {"thinkingBudget": 1024}}}
    url = ("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s"
           % (MODELO, gemini_key))
    for t in range(3):
        try:
            d = _post(url, corpo, {}, timeout=180)
            partes = d["candidates"][0]["content"]["parts"]
            return "".join(p.get("text", "") for p in partes if not p.get("thought")).strip()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 503) and t < 2:
                time.sleep(2 + t * 3)
                continue
            raise RuntimeError("A IA não respondeu (HTTP %d). Tente de novo." % e.code)
    raise RuntimeError("A IA está ocupada. Tente de novo em instantes.")
