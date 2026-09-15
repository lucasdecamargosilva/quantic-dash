#!/usr/bin/env python3
"""Painel de Atendimento — Provou Levou

Fila de conversas do WhatsApp que esperam resposta, com histórico próprio,
áudios prontos, gravação de voz e status do lead.

Rodar:  painel.bat        ->  http://localhost:8781

Como funciona por dentro:
  - Um sincronizador roda em segundo plano e traz da Uazapi tudo que mudou.
    O histórico fica em painel.db (SQLite), entao a conversa NAO se perde quando
    a Uazapi expira as mensagens — ela guarda so ~2 meses.
  - A tela le do banco: abre instantaneo e nao depende da rede a cada clique.
  - Transcricao de audio so acontece pra lead ativo: quem esta CONVERTIDO ou
    PERDIDO nao gasta chamada de IA.
"""
import base64
import hashlib
from crm_bridge import CRM, ETAPAS
from live_events import EventHub, LiveEvents
from metas_config import read_goals, save_goals
import io
import json
import os
import re
import socket
import sqlite3
import sys
import threading
import uuid
import time
import urllib.error
import urllib.parse
import urllib.request
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

AQUI = os.path.dirname(os.path.abspath(__file__))
PORTA = 8781
BRT = timezone(timedelta(hours=-3))
UZ = "https://quantic.uazapi.com"

for _env_name in (".env.local", ".env"):
    _env_path = os.path.join(AQUI, _env_name)
    if not os.path.exists(_env_path):
        continue
    for _line in open(_env_path, encoding="utf-8-sig"):
        if "=" not in _line or _line.lstrip().startswith("#"):
            continue
        _name, _value = _line.split("=", 1)
        os.environ.setdefault(_name.strip(), _value.strip().strip('"\''))

UZ_TOKEN = os.environ.get("UAZAPI_TOKEN", "")
MEU_NUMERO = "5511965749173"          # botao "testar em mim"
GEMINI_KEY = os.environ.get("GEMINI_KEY", "")
GEMINI_MODEL = "gemini-2.5-flash"
JANELA_DIAS = 14
INTERVALO_SYNC = 6                     # segundos entre uma varredura e outra

STATUS = ["MENSAGEM 1", "MENSAGEM 2", "MENSAGEM 3", "STAND-BY", "INTERESSADO", "TESTE GRÁTIS", "CONVERTIDO", "PERDIDO"]
STATUS_ENCERRADO = {"CONVERTIDO", "PERDIDO"}

RUIDO = re.compile(
    r"(?i)serasa|shopee|rappi|infinitepay|itapeva|nubank|mercado pago|ifood|uber|itau|"
    r"bradesco|magalu|aliexpress|temu|correios|receita federal|d[ií]vida|empr[ée]stimo|"
    r"imers[ãa]o|f10x|accura|amazon|olx|nuvemshop|zapsign|99food|99entrega|clush|salvy|"
    r"duo gourmet|abec|clear corretora|zeleno|garotobr|prime day|tiktok|jornada|mentoria")

CONTEXTO = """Você é o Lucas, da Provou Levou — um provador virtual com IA para lojas
de óculos e roupa. Você está respondendo um lojista no WhatsApp.

O que a Provou Levou vende:
- PROVADOR no site da loja: o cliente manda uma foto e se vê usando o produto na
  própria página do produto. A equipe integra (Shopify, Nuvemshop, Tray, WooCommerce,
  Loja Integrada, Wix, Bagy) e costuma deixar no ar no mesmo dia. Sem custo de instalação.
- PROVOU CATÁLOGO, para quem NÃO tem loja online (vende por Instagram, WhatsApp ou só
  loja física): a gente monta uma página com os produtos do lojista e o provador dentro
  dela. Ele cadastra os produtos num login próprio e manda o link pro cliente.
- Em ambos, criamos um grupo no WhatsApp onde o lojista acompanha cada prova em tempo real.

Planos mensais do Provou Catálogo:
  Essencial = R$ 39, com 50 provas virtuais
  Crescimento = R$ 79, com 100 provas virtuais
  Profissional = R$ 159, com 200 provas virtuais
  Escala = R$ 369, com 500 provas virtuais
  Volume 1.000 = R$ 699, com 1.000 provas virtuais
  Volume 1.500 = R$ 959, com 1.500 provas virtuais
  Volume 2.500 = R$ 1.499, com 2.500 provas virtuais
São 7 dias grátis para testar; no fim do teste recomendamos o pacote adequado.

Como você escreve no WhatsApp:
- Português do Brasil, direto e cordial, sem formalidade de e-mail.
- Curto: 2 a 4 linhas. Nada de texto de vendas longo.
- Uma pergunta por vez, no máximo.
- Emoji só quando cabe, no máximo um.
- Nunca invente prazo, desconto ou funcionalidade que não está descrita acima.
- Ao perguntar onde a pessoa vende, ofereça as quatro opções: loja online, loja
  física, Instagram ou WhatsApp. Quem só tem loja física é caso de Provou Catálogo.
- Se a pessoa já disse onde vende, NÃO pergunte de novo.
- Se ela já ouviu o preço e perguntou de novo, mande os valores por escrito.

Escreva SOMENTE o texto da mensagem a enviar. Sem saudação, sem assinatura, sem aspas."""

AUDIOS = [
 {"id": "indicacatalogo", "rotulo": "O ideal é o Catálogo", "seg": 16,
  "url": "https://quantic.uazapi.com/files/ce6373366a39489d82dac80c28419491dc89a3206f2b032a5e45a48d2b3b4e91.mp3",
  "resumo": "No seu caso o ideal é o Provou Catálogo: criamos seu acesso, você cadastra os produtos e dispara o link."},
 {"id": "setedias", "rotulo": "7 dias grátis", "seg": 19,
  "url": "https://quantic.uazapi.com/files/2e168b47f4886b341d2cdd06e5e24c8fcee8c828012f230a77848d59fe345737.mp3",
  "resumo": "7 dias grátis pra testar; no fim indicamos o pacote pelo volume real. Pede logo + e-mail pra montar o catálogo."},
]

# Tabela pra CONSULTA na tela — a equipe olha enquanto conversa.
# (o texto de envio fica em TEXTOS['tabela'])
PLANOS = [
 {"nome": "Essencial",     "preco": "R$ 39",    "fotos": "50",    "por_prova": "R$ 0,78"},
 {"nome": "Crescimento",   "preco": "R$ 79",    "fotos": "100",   "por_prova": "R$ 0,79"},
 {"nome": "Profissional",  "preco": "R$ 159",   "fotos": "200",   "por_prova": "R$ 0,80"},
 {"nome": "Escala",        "preco": "R$ 369",   "fotos": "500",   "por_prova": "R$ 0,74"},
 {"nome": "Volume 1.000",  "preco": "R$ 699",   "fotos": "1.000", "por_prova": "R$ 0,70"},
 {"nome": "Volume 1.500",  "preco": "R$ 959",   "fotos": "1.500", "por_prova": "R$ 0,64"},
 {"nome": "Volume 2.500",  "preco": "R$ 1.499", "fotos": "2.500", "por_prova": "R$ 0,60"},
]

COMBOS = [
 {"id": "combo_catalogo", "rotulo": "Combo: Catálogo → 7 dias",
  "audios": ["indicacatalogo", "setedias"]},
]

CATALOGO_MENSAGENS = [
 "Perfeito, então o ideal para você seria o Provou Catálogo",
 "O Provou Catálogo funciona de forma simples: o lojista recebe um acesso próprio para "
 "cadastrar as fotos, nomes, preços e informações dos produtos. Depois, é só compartilhar "
 "o link do catálogo pelo WhatsApp, Instagram ou onde preferir. O cliente acessa, escolhe "
 "um produto, envia uma foto e se vê usando a peça com o provador virtual por IA.\n\n"
 "A instalação não tem custo e os planos começam em R$ 39 por mês por 50 provas virtuais\n\n"
 "Nós disponibilizamos 7 dias grátis para você testar o catálogo, só precisamos que nos "
 "envie o logo da loja, e-mail e o WhatsApp da loja para criarmos o catálogo.",
]

TEXTOS = [
 {"id": "reaquecer", "rotulo": "Reaquecer",
  "texto": "Oi, Conseguiu dar uma olhada no que te enviei sobre o Provador Virtual?"},
 {"id": "tabela", "rotulo": "Tabela de planos",
  "texto": "Nossos pacotes mensais do Provou Catálogo são:\n\n"
           "*Essencial* — R$ 39 — 50 provas virtuais\n"
           "*Crescimento* — R$ 79 — 100 provas virtuais\n"
           "*Profissional* — R$ 159 — 200 provas virtuais\n"
           "*Escala* — R$ 369 — 500 provas virtuais\n"
           "*Volume 1.000* — R$ 699 — 1.000 provas virtuais\n"
           "*Volume 1.500* — R$ 959 — 1.500 provas virtuais\n"
           "*Volume 2.500* — R$ 1.499 — 2.500 provas virtuais\n\n"
           "Não tem custo de instalação, a integração a gente faz no mesmo dia e você "
           "testa 7 dias grátis antes de escolher o pacote."},
 {"id": "dadoscatalogo", "rotulo": "Pedir logo + e-mail",
  "texto": "Pra eu montar o seu catálogo preciso só de duas coisas: o *logo da loja* "
           "(de preferência em arquivo, sem fundo) e um *e-mail* pro login. Pode mandar por aqui 😊"},
]


# ─────────────────────────── banco ───────────────────────────
DB = os.environ.get("PL_DB_PATH") or os.path.join(AQUI, "painel.db")
_local = threading.local()


def con():
    """Uma conexao por thread — sqlite nao aceita conexao compartilhada."""
    if not hasattr(_local, "c"):
        _local.c = sqlite3.connect(DB, timeout=30)
        _local.c.row_factory = sqlite3.Row
        _local.c.execute("PRAGMA journal_mode=WAL")     # leitura nao trava escrita
    return _local.c


CRM_CLIENT = CRM(con)
UI_EVENTS = EventHub()


def avisa_mensagem_nova():
    UI_EVENTS.publish()
    CRM_CLIENT.notify_messages()


LIVE_EVENTS = LiveEvents(UZ, UZ_TOKEN, con, avisa_mensagem_nova)

def cria_banco():
    c = con()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS mensagens (
      messageid TEXT PRIMARY KEY, chatid TEXT, ts INTEGER, from_me INTEGER,
      tipo TEXT, texto TEXT, file_url TEXT, segundos INTEGER);
    CREATE INDEX IF NOT EXISTS ix_msg_chat ON mensagens(chatid, ts);
    CREATE TABLE IF NOT EXISTS leads (
      chatid TEXT PRIMARY KEY, fone TEXT, nome TEXT, status TEXT,
      ultimo_ts INTEGER, ultimo_de TEXT, atualizado TEXT, responsavel TEXT);
    CREATE INDEX IF NOT EXISTS ix_lead_ts ON leads(ultimo_ts);
    CREATE TABLE IF NOT EXISTS transcricoes (url TEXT PRIMARY KEY, texto TEXT);
    CREATE TABLE IF NOT EXISTS conversas_iniciadas (
      chatid TEXT PRIMARY KEY, ts INTEGER NOT NULL, responsavel TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS ix_conversa_inicio_ts ON conversas_iniciadas(ts, responsavel);
    CREATE TABLE IF NOT EXISTS planos_fechados (
      chatid TEXT PRIMARY KEY, lead_id TEXT, plano TEXT NOT NULL, valor_centavos INTEGER NOT NULL,
      fechado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS atendimentos_iniciados (
      chatid TEXT NOT NULL, responsavel TEXT NOT NULL, ts INTEGER NOT NULL,
      PRIMARY KEY (chatid, responsavel));
    CREATE INDEX IF NOT EXISTS ix_atendimento_inicio ON atendimentos_iniciados(ts,responsavel);
    CREATE TABLE IF NOT EXISTS conversas_atribuidas (
      chatid TEXT NOT NULL, responsavel TEXT NOT NULL, ts INTEGER NOT NULL,
      PRIMARY KEY (chatid, responsavel));
    CREATE INDEX IF NOT EXISTS ix_conversa_atribuida_ts ON conversas_atribuidas(ts, responsavel);
    """)
    c.execute("CREATE TABLE IF NOT EXISTS metricas_migracoes (nome TEXT PRIMARY KEY)")
    if not c.execute("SELECT 1 FROM metricas_migracoes WHERE nome='primeiro_envio_v1'").fetchone():
        c.execute("INSERT OR IGNORE INTO atendimentos_iniciados(chatid,responsavel,ts) "
                  "SELECT chatid,responsavel,ts FROM conversas_iniciadas")
        c.execute("INSERT INTO atendimentos_iniciados(chatid,responsavel,ts) "
                  "SELECT m.chatid,'Lucas',MIN(CASE WHEN m.ts>100000000000 THEN m.ts/1000 ELSE m.ts END) "
                  "FROM mensagens m JOIN conversas_atribuidas a ON a.chatid=m.chatid AND a.responsavel='Lucas' "
                  "WHERE m.from_me=1 AND m.ts>0 "
                  "AND date(CASE WHEN m.ts>100000000000 THEN m.ts/1000 ELSE m.ts END,'unixepoch','-3 hours')<'2026-09-14' "
                  "GROUP BY m.chatid ON CONFLICT(chatid,responsavel) DO UPDATE SET ts=MIN(ts,excluded.ts)")
        c.execute("INSERT INTO metricas_migracoes(nome) VALUES('primeiro_envio_v1')")
    c.commit()
    CRM_CLIENT.setup()
    # migracao: bancos criados antes do "remover da fila" nao tem essa coluna
    if "oculto" not in [r[1] for r in c.execute("PRAGMA table_info(leads)")]:
        c.execute("ALTER TABLE leads ADD COLUMN oculto INTEGER DEFAULT 0")
    if "responsavel" not in [r[1] for r in c.execute("PRAGMA table_info(leads)")]:
        c.execute("ALTER TABLE leads ADD COLUMN responsavel TEXT")
    if "excluida" not in [r[1] for r in c.execute("PRAGMA table_info(mensagens)")]:
        c.execute("ALTER TABLE mensagens ADD COLUMN excluida INTEGER NOT NULL DEFAULT 0")
    if "editada" not in [r[1] for r in c.execute("PRAGMA table_info(mensagens)")]:
        c.execute("ALTER TABLE mensagens ADD COLUMN editada INTEGER NOT NULL DEFAULT 0")
    c.commit()


def migra_cache_antigo():
    """Aproveita as transcricoes que ja pagamos no cache.json da versao anterior."""
    p = os.path.join(AQUI, "cache.json")
    if not os.path.exists(p):
        return
    try:
        d = json.load(open(p, encoding="utf-8")).get("audios") or {}
    except Exception:
        return
    c = con()
    c.executemany("INSERT OR IGNORE INTO transcricoes(url,texto) VALUES(?,?)", list(d.items()))
    c.commit()
    print("  cache antigo importado: %d transcrições" % len(d))


# ─────────────────────────── uazapi ───────────────────────────
def _req(url, body=None, headers=None, timeout=90, raw=False):
    h = dict(headers or {})
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        h.setdefault("Content-Type", "application/json")
    r = urllib.request.Request(url, data=data, headers=h, method="POST" if data else "GET")
    with urllib.request.urlopen(r, timeout=timeout) as x:
        b = x.read()
    return b if raw else json.loads(b.decode("utf-8"))


def uz(path, body):
    if not UZ_TOKEN:
        raise RuntimeError("Configure UAZAPI_TOKEN em .env.local.")
    return _req(UZ + path, body, {"token": UZ_TOKEN})


def altera_mensagem(chatid, messageid, acao, texto=None):
    """Altera no WhatsApp primeiro; só então reflete a operação no histórico local."""
    if not isinstance(chatid, str) or not isinstance(messageid, str) or not chatid or not messageid:
        raise ValueError("Conversa ou mensagem inválida.")
    if acao not in ("editar", "excluir"):
        raise ValueError("Ação inválida.")
    c = con()
    m = c.execute("SELECT from_me,tipo,texto,excluida FROM mensagens WHERE chatid=? AND messageid=?",
                  (chatid, messageid)).fetchone()
    if not m or not m["from_me"] or m["excluida"]:
        raise ValueError("Mensagem enviada não encontrada.")
    if acao == "editar":
        if m["tipo"] not in ("Conversation", "ExtendedTextMessage", "TextMessage"):
            raise ValueError("Só é possível editar mensagens de texto.")
        if not isinstance(texto, str) or not texto.strip():
            raise ValueError("Digite o novo texto da mensagem.")
        texto = texto.strip()
        if len(texto) > 4096:
            raise ValueError("Mensagem muito longa.")
        if texto == (m["texto"] or ""):
            return
    resposta = uz("/message/edit" if acao == "editar" else "/message/delete",
                  {"id": messageid, **({"text": texto} if acao == "editar" else {})})
    if not isinstance(resposta, dict) or resposta.get("error") or resposta.get("erro") or resposta.get("success") is False:
        detalhe = resposta.get("error") or resposta.get("erro") if isinstance(resposta, dict) else None
        raise RuntimeError(str(detalhe or "A integração não confirmou a alteração da mensagem."))
    if acao == "editar":
        c.execute("UPDATE mensagens SET texto=?, editada=1 WHERE messageid=? AND chatid=?",
                  (texto, messageid, chatid))
    else:
        # Mantém o ID como lápide: uma sincronização atrasada não pode recriar a bolha.
        c.execute("UPDATE mensagens SET excluida=1, texto='', file_url=NULL WHERE messageid=? AND chatid=?",
                  (messageid, chatid))
    c.commit()
    UI_EVENTS.publish()


# A Uazapi APAGA os arquivos depois de poucos dias: a URL do audio volta 404 e o
# /send/media responde 500. Por isso os audios padrao ficam GRAVADOS AQUI, em
# audios/<id>.mp3, e vao como base64. A URL so serve de reserva.
DIR_AUDIOS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audios")
DIR_MIDIAS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "midias")
CATALOGO_VIDEO = os.path.join(DIR_MIDIAS, "provou-catalogo.mp4")
TIPOS_MIDIA = {"AudioMessage", "ImageMessage", "VideoMessage", "DocumentMessage", "StickerMessage"}
MIME_PADRAO = {
    "AudioMessage": "audio/mpeg", "ImageMessage": "image/jpeg",
    "VideoMessage": "video/mp4", "DocumentMessage": "application/octet-stream",
    "StickerMessage": "image/webp",
}


def fonte_audio(a):
    """O que mandar no campo 'file': o mp3 salvo aqui (base64) ou a URL de reserva."""
    caminho = os.path.join(DIR_AUDIOS, a["id"] + ".mp3")
    if os.path.exists(caminho):
        with open(caminho, "rb") as f:
            return "data:audio/mpeg;base64," + base64.b64encode(f.read()).decode()
    return a["url"]


def manda_audio(fone, a):
    return uz("/send/media", {"number": fone, "type": "ptt", "file": fonte_audio(a)})


def fonte_video_catalogo():
    if not os.path.exists(CATALOGO_VIDEO):
        raise RuntimeError("Vídeo do Provou Catálogo não encontrado.")
    with open(CATALOGO_VIDEO, "rb") as f:
        return "data:video/mp4;base64," + base64.b64encode(f.read()).decode()


def manda_catalogo(fone):
    for texto in CATALOGO_MENSAGENS:
        uz("/send/text", {"number": fone, "text": texto})
    return manda_video_catalogo(fone)


def manda_video_catalogo(fone):
    return uz("/send/media", {
        "number": fone,
        "type": "video",
        "file": fonte_video_catalogo(),
    })


def carrega_midia(messageid):
    """Baixa, decodifica e guarda localmente uma mídia recebida do WhatsApp."""
    r = con().execute("SELECT tipo,file_url FROM mensagens WHERE messageid=?", (messageid,)).fetchone()
    if not r or r["tipo"] not in TIPOS_MIDIA or not r["file_url"]:
        raise ValueError("Mídia não encontrada.")
    chave = hashlib.sha256(messageid.encode("utf-8")).hexdigest()
    arquivo = os.path.join(DIR_MIDIAS, chave + ".bin")
    meta = os.path.join(DIR_MIDIAS, chave + ".json")
    if os.path.exists(arquivo) and os.path.exists(meta):
        with open(meta, encoding="utf-8") as f:
            mime = json.load(f).get("mimetype") or MIME_PADRAO[r["tipo"]]
        with open(arquivo, "rb") as f:
            return f.read(), mime

    d = uz("/message/download", {
        "id": messageid, "return_base64": True, "return_link": False,
        "generate_mp3": True,
    })
    codificado = d.get("base64Data") or ""
    if "," in codificado and codificado.lstrip().startswith("data:"):
        codificado = codificado.split(",", 1)[1]
    try:
        corpo = base64.b64decode(codificado, validate=True)
    except Exception as e:
        raise RuntimeError("A API não devolveu uma mídia válida.") from e
    if not corpo:
        raise RuntimeError("A API devolveu a mídia vazia.")
    if len(corpo) > 50 * 1024 * 1024:
        raise RuntimeError("A mídia ultrapassa o limite de 50 MB do painel.")
    mime = (d.get("mimetype") or MIME_PADRAO[r["tipo"]]).split(";", 1)[0]
    os.makedirs(DIR_MIDIAS, exist_ok=True)
    temporario = arquivo + "." + uuid.uuid4().hex + ".tmp"
    with open(temporario, "wb") as f:
        f.write(corpo)
    os.replace(temporario, arquivo)
    with open(meta, "w", encoding="utf-8") as f:
        json.dump({"mimetype": mime}, f)
    return corpo, mime


def quando(ms):
    return datetime.fromtimestamp(int(ms) / 1000, BRT)


def humano(dt):
    s = (datetime.now(BRT) - dt).total_seconds()
    if s < 60:
        return "agora"
    if s < 3600:
        return "há %d min" % int(s // 60)
    if s < 86400:
        return "há %dh" % int(s // 3600)
    return "há %d dias" % int(s // 86400)


def rotulo(tipo, seg):
    n = {"AudioMessage": "áudio", "ImageMessage": "imagem", "VideoMessage": "vídeo",
         "DocumentMessage": "documento", "StickerMessage": "figurinha",
         "LocationMessage": "localização"}.get(tipo, (tipo or "?").replace("Message", "").lower())
    return "[%s%s]" % (n, " de %ss" % seg if seg else "")


# ─────────────────────────── sincronizacao ───────────────────────────
SYNC = {"ultimo": None, "novas": 0, "erro": ""}


def sincroniza():
    """Traz da Uazapi o que mudou e grava no banco."""
    c = con()
    chats, off = [], 0
    while True:
        d = uz("/chat/find", {"operator": "AND", "sort": "-wa_lastMsgTimestamp",
                              "limit": 500, "offset": off})
        it = d.get("chats") or []
        chats += it
        if len(it) < 500:
            break
        off += len(it)

    corte = int((datetime.now(BRT) - timedelta(days=JANELA_DIAS)).timestamp() * 1000)
    vivos = [x for x in chats if not x.get("wa_isGroup") and x.get("wa_chatid")
             and int(x.get("wa_lastMsgTimestamp") or 0) >= corte
             and not RUIDO.search(x.get("wa_name") or x.get("name") or "")]

    # so abre quem mudou desde a ultima passada
    tem = {r["chatid"]: r["ultimo_ts"] for r in c.execute("SELECT chatid,ultimo_ts FROM leads")}
    mudou = [x for x in vivos if int(x.get("wa_lastMsgTimestamp") or 0) > tem.get(x["wa_chatid"], 0)]

    def puxa(x):
        try:
            d = uz("/message/find", {"operator": "AND", "chatid": x["wa_chatid"],
                                     "sort": "messageTimestamp", "limit": 60})
        except Exception:
            return None
        ms = [m for m in (d.get("messages") or []) if m.get("status") != "Deleted"]
        ms.sort(key=lambda y: int(y["messageTimestamp"]))
        return (x, ms)

    novas = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        for r in pool.map(puxa, mudou):
            if not r:
                continue
            x, ms = r
            cid = x["wa_chatid"]
            for m in ms:
                mid = m.get("messageid") or m.get("id")
                if not mid:
                    continue
                cc = m.get("content") or {}
                cur = c.execute(
                    "INSERT OR IGNORE INTO mensagens"
                    "(messageid,chatid,ts,from_me,tipo,texto,file_url,segundos)"
                    " VALUES(?,?,?,?,?,?,?,?)",
                    (mid, cid, int(m["messageTimestamp"]), 1 if m.get("fromMe") else 0,
                     m.get("messageType"), (m.get("text") or "").strip(),
                     m.get("fileURL"), cc.get("seconds")))
                novas += cur.rowcount
            if not ms:
                continue
            ult = ms[-1]
            fone = re.sub(r"\D", "", x.get("phone") or cid.split("@")[0])
            nome = x.get("wa_name") or x.get("name") or x.get("wa_contactName") or ""
            # o status e do usuario: nunca sobrescreve num sync
            c.execute(
                "INSERT INTO leads(chatid,fone,nome,status,ultimo_ts,ultimo_de,atualizado)"
                " VALUES(?,?,?,'SEM ETAPA',?,?,?)"
                " ON CONFLICT(chatid) DO UPDATE SET nome=excluded.nome, fone=excluded.fone,"
                " ultimo_ts=excluded.ultimo_ts, ultimo_de=excluded.ultimo_de,"
                " atualizado=excluded.atualizado WHERE excluded.ultimo_ts >= COALESCE(leads.ultimo_ts,0)",
                (cid, fone, nome, int(ult["messageTimestamp"]),
                 "nos" if ult.get("fromMe") else "lead", datetime.now(BRT).isoformat()))
    c.commit()
    if novas:
        avisa_mensagem_nova()
    return novas


def loop_sync():
    while True:
        try:
            n = sincroniza()
            SYNC.update({"ultimo": datetime.now(BRT).strftime("%H:%M:%S"), "novas": n, "erro": ""})
        except Exception as e:
            SYNC["erro"] = str(e)[:120]
        time.sleep(30 if LIVE_EVENTS.status["connected"] else INTERVALO_SYNC)


# ─────────────────────────── transcricao ───────────────────────────
def transcreve(url):
    c = con()
    r = c.execute("SELECT texto FROM transcricoes WHERE url=?", (url,)).fetchone()
    if r:
        return r["texto"]
    if not GEMINI_KEY:
        return ""
    try:
        b = _req(url, raw=True, timeout=90)
        d = _req("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s"
                 % (GEMINI_MODEL, GEMINI_KEY),
                 {"contents": [{"role": "user", "parts": [
                     {"text": "Transcreva este áudio em português do Brasil. Só a transcrição."},
                     {"inline_data": {"mime_type": "audio/mpeg",
                                      "data": base64.b64encode(b).decode()}}]}],
                  "generationConfig": {"temperature": 0}}, timeout=200)
        t = d["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception:
        return ""
    if t:
        c.execute("INSERT OR REPLACE INTO transcricoes(url,texto) VALUES(?,?)", (url, t))
        c.commit()
    return t


# ─────────────────────────── consultas ───────────────────────────
# Quem abre a conversa com "Olá! Tive um problema ao usar o provador." e um
# CONSUMIDOR de alguma loja pedindo suporte — nao e lojista, nao e venda. O Lucas
# atende esses em lote, por fora. Some da fila e das contagens (a conversa
# continua no banco; so nao polui a tela de atendimento).
SEM_SUPORTE = ("""
 AND NOT EXISTS (SELECT 1 FROM mensagens m WHERE m.chatid = leads.chatid
                 AND m.from_me = 0
                 AND m.texto LIKE 'Olá! Tive um problema ao usar o provador%')""")


def normaliza_busca(valor):
    valor = unicodedata.normalize("NFKD", str(valor or ""))
    return " ".join("".join(c for c in valor if not unicodedata.combining(c)).casefold().split())


def fila(status=None, busca=None, responsavel=None, chatid=None):
    c = con()
    busca = str(busca or "").strip()
    if chatid:
        linhas = c.execute("SELECT * FROM leads WHERE chatid=?", (chatid,)).fetchall()
    elif busca:
        linhas = c.execute("SELECT * FROM leads WHERE COALESCE(oculto,0)=0"
                           + SEM_SUPORTE + " ORDER BY ultimo_ts DESC").fetchall()
        termo = normaliza_busca(busca)
        digitos = re.sub(r"\D", "", busca)
        busca_telefone = bool(digitos) and not re.search(r"[^\d\s()+.\-]", busca)
        linhas = [r for r in linhas if termo in normaliza_busca(r["nome"])
                  or (busca_telefone and digitos in re.sub(r"\D", "", r["fone"] or ""))]
    elif status == "_ocultos":
        linhas = c.execute("SELECT * FROM leads WHERE oculto=1 ORDER BY ultimo_ts DESC").fetchall()
    elif status == "_sem_resposta":
        linhas = c.execute(
            "SELECT * FROM leads WHERE ultimo_de='nos'"
            " AND COALESCE(oculto,0)=0 AND status NOT IN ('CONVERTIDO','PERDIDO')"
            + SEM_SUPORTE + " ORDER BY ultimo_ts DESC").fetchall()
    elif status:
        linhas = c.execute("SELECT * FROM leads WHERE status=? AND COALESCE(oculto,0)=0"
                           + SEM_SUPORTE +
                           " ORDER BY ultimo_ts DESC", (status,)).fetchall()
    else:
        linhas = c.execute(
            "SELECT * FROM leads WHERE ultimo_de='lead' AND COALESCE(oculto,0)=0"
            " AND status NOT IN ('CONVERTIDO','PERDIDO')"
            + SEM_SUPORTE + " ORDER BY ultimo_ts DESC").fetchall()
    if responsavel:
        linhas = [r for r in linhas if (not r["responsavel"] if responsavel == "_sem_responsavel"
                                       else r["responsavel"] == responsavel)]
    vendas = {r["chatid"]: dict(r) for r in c.execute("SELECT * FROM planos_fechados")}
    out = []
    for r in linhas:
        u = c.execute("SELECT tipo,texto,segundos FROM mensagens WHERE chatid=? AND excluida=0"
                      " ORDER BY ts DESC LIMIT 1", (r["chatid"],)).fetchone()
        dt = quando(r["ultimo_ts"])
        out.append({"chatid": r["chatid"], "fone": r["fone"], "nome": r["nome"],
                    "status": r["status"], "responsavel": r["responsavel"], "venda": vendas.get(r["chatid"]),
                    "ultimo_ts": r["ultimo_ts"], "quando": dt.strftime("%d/%m %H:%M"),
                    "ha": humano(dt),
                    "ultima": (u["texto"] if u and u["texto"]
                               else rotulo(u["tipo"], u["segundos"]) if u else "")})
    return out


PIPELINE_REMOTE_STATUS = {"MENSAGEM 1":"mensagem_1", "MENSAGEM 2":"mensagem_2", "MENSAGEM 3":"mensagem_3", "STAND-BY":"stand_by",
                          "INTERESSADO":"interessado", "TESTE GRÁTIS":"testando", "CONVERTIDO":"fechou", "PERDIDO":"perdida"}

def dados_pipeline(chatid):
    data = CRM_CLIENT.details(chatid)
    row = con().execute("SELECT status,ultimo_de,oculto FROM leads WHERE chatid=?", (chatid,)).fetchone()
    atual = "_ocultos" if row and row["oculto"] else row["status"] if row and row["status"] in STATUS else "_sem_resposta" if row and row["ultimo_de"] == "nos" else ""
    data["pipeline"] = {"status": atual, "etapas": {s:s.title() for s in STATUS}}
    return data

def move_pipeline_dados(chatid, status):
    if status not in PIPELINE_REMOTE_STATUS:
        raise ValueError("Selecione uma etapa do Pipeline Atendimento.")
    CRM_CLIENT.change(chatid, PIPELINE_REMOTE_STATUS[status])
    c = con()
    c.execute("UPDATE leads SET oculto=0 WHERE chatid=?", (chatid,))
    c.commit()
    return dados_pipeline(chatid)


def salva_plano_fechado(chatid, plano, valor_centavos):
    if plano not in {p["nome"] for p in PLANOS}:
        raise ValueError("Selecione um plano válido.")
    if type(valor_centavos) is not int or not 1 <= valor_centavos <= 100000000:
        raise ValueError("Informe um valor de mensalidade válido.")
    with CRM_CLIENT.chat_lock(chatid):
        lead = CRM_CLIENT.change(chatid, "fechou")
        agora = datetime.now(BRT).isoformat()
        c = con()
        c.execute("INSERT INTO planos_fechados(chatid,lead_id,plano,valor_centavos,fechado_em,atualizado_em) "
                  "VALUES(?,?,?,?,?,?) ON CONFLICT(chatid) DO UPDATE SET lead_id=excluded.lead_id, "
                  "plano=excluded.plano,valor_centavos=excluded.valor_centavos,atualizado_em=excluded.atualizado_em",
                  (chatid,lead["id"],plano,valor_centavos,agora,agora))
        c.execute("UPDATE leads SET oculto=0 WHERE chatid=?", (chatid,))
        c.commit()
        return {"ok": True}


def recebidas_recentes(limite=50):
    """Mensagens recebidas usadas pelos avisos discretos da interface."""
    limite = max(1, min(int(limite or 50), 100))
    c = con()
    linhas = c.execute("""
        SELECT mensagens.messageid, mensagens.chatid, mensagens.ts,
               mensagens.tipo, mensagens.texto, mensagens.segundos,
               leads.nome, leads.fone
          FROM mensagens
          JOIN leads ON leads.chatid = mensagens.chatid
         WHERE mensagens.from_me = 0
           AND COALESCE(leads.oculto, 0) = 0
           AND NOT EXISTS (
               SELECT 1 FROM mensagens suporte
                WHERE suporte.chatid = leads.chatid
                  AND suporte.from_me = 0
                  AND suporte.texto LIKE 'Olá! Tive um problema ao usar o provador%'
           )
         ORDER BY mensagens.ts DESC, mensagens.messageid DESC
         LIMIT ?
    """, (limite,)).fetchall()
    return [{"id": r["messageid"], "chatid": r["chatid"], "ts": r["ts"],
             "nome": r["nome"] or r["fone"] or "Nova conversa",
             "texto": (r["texto"] or rotulo(r["tipo"], r["segundos"]) or "Nova mensagem")}
            for r in linhas]


def contagem():
    c = con()
    d = {r["status"]: r["n"] for r in
         c.execute("SELECT status, COUNT(*) n FROM leads WHERE COALESCE(oculto,0)=0"
                   + SEM_SUPORTE + " GROUP BY status")}
    d["_esperando"] = c.execute(
        "SELECT COUNT(*) n FROM leads WHERE ultimo_de='lead' AND COALESCE(oculto,0)=0"
        " AND status NOT IN ('CONVERTIDO','PERDIDO')" + SEM_SUPORTE).fetchone()["n"]
    d["_sem_resposta"] = c.execute(
        "SELECT COUNT(*) n FROM leads WHERE ultimo_de='nos'"
        " AND COALESCE(oculto,0)=0 AND status NOT IN ('CONVERTIDO','PERDIDO')"
        + SEM_SUPORTE).fetchone()["n"]
    d["_ocultos"] = c.execute(
        "SELECT COUNT(*) n FROM leads WHERE oculto=1").fetchone()["n"]
    por_responsavel = {}
    sem_resposta_responsavel = {}
    for r in c.execute(
        "SELECT COALESCE(NULLIF(TRIM(responsavel),''),'') responsavel, "
        "COALESCE(status,'SEM ETAPA') etapa, COUNT(*) n, "
        "SUM(CASE WHEN ultimo_de='nos' AND status NOT IN ('CONVERTIDO','PERDIDO') THEN 1 ELSE 0 END) sem_resposta FROM leads "
        "WHERE COALESCE(oculto,0)=0" + SEM_SUPORTE + " GROUP BY 1,2"):
        por_responsavel.setdefault(r["responsavel"], {})[r["etapa"]] = r["n"]
        sem_resposta_responsavel[r["responsavel"]] = sem_resposta_responsavel.get(r["responsavel"], 0) + r["sem_resposta"]
    nomes = list(RESPONSAVEIS) + sorted(n for n in por_responsavel if n and n not in RESPONSAVEIS) + [""]
    d["_responsaveis"] = [{"nome": n or "Sem responsável", "responsavel": n,
                           "total": sum(por_responsavel.get(n, {}).values()),
                           "sem_resposta": sem_resposta_responsavel.get(n, 0),
                           "etapas": {**dict.fromkeys(STATUS, 0), **por_responsavel.get(n, {})}} for n in nomes]
    return d


def conversa(chatid):
    c = con()
    lead = c.execute("SELECT * FROM leads WHERE chatid=?", (chatid,)).fetchone()
    ms = c.execute("SELECT * FROM mensagens WHERE chatid=? AND excluida=0 ORDER BY ts", (chatid,)).fetchall()
    encerrado = bool(lead and lead["status"] in STATUS_ENCERRADO)
    ja = {r["url"] for r in c.execute("SELECT url FROM transcricoes")}
    # lead encerrado nao gasta IA
    faltam = [m["file_url"] for m in ms
              if m["tipo"] == "AudioMessage" and m["file_url"] and m["file_url"] not in ja]
    if faltam and not encerrado:
        with ThreadPoolExecutor(max_workers=6) as pool:
            list(pool.map(transcreve, faltam))
    tr = {r["url"]: r["texto"] for r in c.execute("SELECT url,texto FROM transcricoes")}
    linhas = []
    for m in ms:
        t = m["texto"] or rotulo(m["tipo"], m["segundos"])
        aud = False
        if m["tipo"] == "AudioMessage" and tr.get(m["file_url"]):
            t, aud = tr[m["file_url"]], True
        linhas.append({"id": m["messageid"], "de": "loja" if m["from_me"] else "lead",
                       "hora": quando(m["ts"]).strftime("%d/%m %H:%M"),
                       "texto": t, "audio": aud, "tipo": m["tipo"], "editada": bool(m["editada"]),
                       "midia": bool(m["file_url"] and m["tipo"] in TIPOS_MIDIA)})
    return {"linhas": linhas, "status": lead["status"] if lead else "SEM ETAPA",
            "oculto": bool(lead and (lead["oculto"] if "oculto" in lead.keys() else 0)),
            "nome": lead["nome"] if lead else "", "fone": lead["fone"] if lead else "",
            "responsavel": lead["responsavel"] if lead else None,
            "encerrado": encerrado}


def sugere(linhas, nome):
    padrao = next(t["texto"] for t in TEXTOS if t["id"] == "canal")
    if not GEMINI_KEY:
        return padrao
    hist = "\n".join("%s [%s]: %s" % ("LOJISTA" if l["de"] == "lead" else "VOCÊ",
                                      l["hora"], l["texto"]) for l in linhas[-30:])
    prompt = "%s\n\nConversa com %s:\n\n%s\n\nEscreva a próxima mensagem." % (
        CONTEXTO, nome or "o lojista", hist)
    for t in range(3):
        try:
            d = _req("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s"
                     % (GEMINI_MODEL, GEMINI_KEY),
                     {"contents": [{"role": "user", "parts": [{"text": prompt}]}],
                      "generationConfig": {"temperature": 0.4, "maxOutputTokens": 800,
                                           "thinkingConfig": {"thinkingBudget": 0}}},
                     timeout=180)
            return d["candidates"][0]["content"]["parts"][0]["text"].strip()
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2 + t * 3)
                continue
            break
        except Exception:
            time.sleep(2)
    return padrao


COMBO_STATUS = {}
ENVIOS = {}          # eid -> {"estado": enviando|ok|erro, "erro": ""}
MAX_DISPARO_MASSA = 100
ABORDAGEM_SEGUNDA = "Antes de iniciarmos, você vende em loja online, física, WhatsApp, Instagram?"
RESPONSAVEIS = ("Lucas", "Dione")


def atribui_responsavel(chatid, responsavel):
    if not isinstance(chatid, str) or not chatid.strip():
        raise ValueError("Conversa inválida.")
    if responsavel not in (*RESPONSAVEIS, None, ""):
        raise ValueError("Responsável inválido.")
    responsavel = responsavel or None
    c = con()
    anterior = c.execute("SELECT responsavel FROM leads WHERE chatid=?", (chatid,)).fetchone()
    if not anterior:
        raise ValueError("Conversa não encontrada.")
    cur = c.execute("UPDATE leads SET responsavel=? WHERE chatid=?", (responsavel, chatid))
    if not cur.rowcount:
        raise ValueError("Conversa não encontrada.")
    if responsavel and anterior["responsavel"] != responsavel:
        c.execute("INSERT OR IGNORE INTO conversas_atribuidas(chatid,responsavel,ts) VALUES(?,?,?)",
                  (chatid, responsavel, int(time.time())))
    c.commit()
    UI_EVENTS.publish()
    return responsavel


def nome_vendedor(usuario):
    return "a Dione" if (usuario or "").strip().lower() == "dione" else "o Lucas"


def nome_responsavel(usuario):
    return "Dione" if (usuario or "").strip().lower() == "dione" else "Lucas"


def registra_inicio(chatid, responsavel):
    """Registra uma única vez quem realizou o primeiro envio da conversa."""
    if not chatid or not responsavel:
        return
    c = sqlite3.connect(DB, timeout=30)
    try:
        c.execute("INSERT OR IGNORE INTO conversas_iniciadas(chatid,ts,responsavel) VALUES(?,?,?)",
                  (chatid, int(time.time()), responsavel))
        c.execute("INSERT OR IGNORE INTO atendimentos_iniciados(chatid,responsavel,ts) VALUES(?,?,?)",
                  (chatid, responsavel, int(time.time())))
        c.commit()
    finally:
        c.close()


def envia_texto(chatid, fone, texto, responsavel):
    resposta = uz("/send/text", {"number": fone, "text": texto})
    registra_inicio(chatid, responsavel)
    return resposta


def envia_midia_atendimento(acao, fone, responsavel, teste=False):
    resposta = acao()
    if not teste:
        c = sqlite3.connect(DB, timeout=30)
        try:
            lead = c.execute("SELECT chatid FROM leads WHERE fone=?", (fone,)).fetchone()
        finally:
            c.close()
        if lead:
            registra_inicio(lead[0], responsavel)
    return resposta


def metas_conversas(since, until):
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", since or "") or not re.match(r"^\d{4}-\d{2}-\d{2}$", until or ""):
        raise ValueError("Período inválido.")
    c = sqlite3.connect(DB, timeout=30)
    try:
        c.row_factory = sqlite3.Row
        rows = c.execute(
            "SELECT responsavel, date(ts,'unixepoch','-3 hours') dia, count(*) total "
            "FROM atendimentos_iniciados WHERE date(ts,'unixepoch','-3 hours') BETWEEN ? AND ? "
            "GROUP BY responsavel, dia ORDER BY dia", (since, until)).fetchall()
    finally:
        c.close()
    return [dict(r) for r in rows]


def mensagens_abordagem(nome, vendedor):
    limpo = (nome or "").strip()
    primeiro = "" if not limpo or re.match(r"^\+?\d", limpo) else re.sub(r"[,:;]+$", "", limpo.split()[0])
    return ["Oi%s, aqui é %s, da Provou Levou." % ((" " + primeiro) if primeiro else "", vendedor),
            ABORDAGEM_SEGUNDA]


def inicia_disparo_massa(chatids, texto, modo=None, vendedor="Lucas", responsavel="Lucas"):
    """Valida os alvos e envia a mensagem escolhida a cada conversa em segundo plano."""
    if not isinstance(chatids, list):
        raise ValueError("Selecione pelo menos uma conversa.")
    chatids = list(dict.fromkeys(str(x).strip() for x in chatids if str(x).strip()))
    if not chatids:
        raise ValueError("Selecione pelo menos uma conversa.")
    if len(chatids) > MAX_DISPARO_MASSA:
        raise ValueError("O limite por disparo é de %d conversas." % MAX_DISPARO_MASSA)
    if modo not in (None, "abordagem"):
        raise ValueError("Modelo de disparo inválido.")
    texto = str(texto or "").strip()
    if modo != "abordagem" and not texto:
        raise ValueError("Escolha ou escreva a mensagem do disparo.")
    if len(texto) > 4096:
        raise ValueError("A mensagem pode ter no máximo 4.096 caracteres.")

    c = con()
    marks = ",".join("?" for _ in chatids)
    rows = c.execute("SELECT chatid,fone,nome FROM leads WHERE chatid IN (%s)" % marks,
                     chatids).fetchall()
    encontrados = {r["chatid"]: dict(r) for r in rows}
    alvos = [encontrados[cid] for cid in chatids if cid in encontrados]
    if len(alvos) != len(chatids):
        raise ValueError("Uma ou mais conversas selecionadas não existem mais.")
    if any(not re.sub(r"\D", "", a.get("fone") or "") for a in alvos):
        raise ValueError("Uma das conversas selecionadas não possui telefone válido.")

    eid = uuid.uuid4().hex[:12]
    estado = ENVIOS[eid] = {
        "estado": "enviando", "erro": "", "total": len(alvos),
        "enviados": 0, "falhas": 0, "resultados": [], "modo": modo
    }

    def roda():
        for alvo in alvos:
            resultado = {"chatid": alvo["chatid"], "nome": alvo["nome"] or alvo["fone"],
                         "ok": False, "erro": "", "mensagens_enviadas": 0}
            try:
                mensagens = (mensagens_abordagem(alvo["nome"], vendedor)
                             if modo == "abordagem" else [texto])
                for mensagem in mensagens:
                    envia_texto(alvo["chatid"], alvo["fone"], mensagem, responsavel)
                    resultado["mensagens_enviadas"] += 1
                resultado["ok"] = True
                estado["enviados"] += 1
            except Exception as e:
                prefixo = ("A primeira mensagem foi enviada; a segunda falhou: "
                           if modo == "abordagem" and resultado["mensagens_enviadas"] else "")
                resultado["erro"] = (prefixo + str(e))[:180]
                estado["falhas"] += 1
            estado["resultados"].append(resultado)
        estado["estado"] = "ok" if not estado["falhas"] else "erro"
        if estado["falhas"]:
            estado["erro"] = "%d de %d envios falharam." % (estado["falhas"], estado["total"])

    threading.Thread(target=roda, daemon=True).start()
    return eid


# ─────────────────────────── pagina ───────────────────────────
PAGINA = r"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Atendimento — Provou Levou</title><style>
:root{--bg:#0e0e11;--card:#17171c;--linha:#26262e;--txt:#eceaf0;--fraco:#8e8b99;
--roxo:#7c3aed;--roxo2:#8b5cf6;--ok:#22c55e;--alerta:#f59e0b;--azul:#3b82f6;--verm:#ef4444;
--campo:#101015;--chip:#20202a;--hover:#241f33;--bolha-lead:#22222a;--bolha-loja:#2a2140;
--previa:#b9b6c4;
--topo:#0e0e11ee}
html[data-tema="claro"]{
--bg:#f4f4f7;--card:#ffffff;--linha:#e2e2e9;--txt:#1a1a20;--fraco:#6b6875;
--roxo:#6d28d9;--roxo2:#7c3aed;--ok:#15803d;--alerta:#b45309;--azul:#1d4ed8;--verm:#b91c1c;
--campo:#ffffff;--chip:#f7f7fa;--hover:#f1ecfd;--bolha-lead:#f0f0f4;--bolha-loja:#ede6fd;
--previa:#55525e;
--topo:#f4f4f7ee}
*{box-sizing:border-box}html,body{height:100%}body{margin:0;background:var(--bg);color:var(--txt);
font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;display:flex;flex-direction:column;overflow:hidden}
header{position:sticky;top:0;background:var(--topo);backdrop-filter:blur(8px);
border-bottom:1px solid var(--linha);padding:12px 20px;display:flex;gap:14px;align-items:center;z-index:9;flex:none}
h1{font-size:17px;margin:0;font-weight:650}
.tag{font-size:12px;color:var(--fraco)}
.responsavel-linha{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 0}
.responsavel-tag{display:inline-flex;align-items:center;border:1px solid var(--linha);
 border-radius:99px;background:var(--chip);color:var(--txt);padding:2px 9px;font-size:12px}
.responsavel-select{max-width:160px;border:1px solid var(--linha);border-radius:7px;
 background:var(--campo);color:var(--txt);padding:3px 7px;font:inherit;font-size:12px;cursor:pointer}
.responsavel-erro{font-size:12px;color:var(--verm)}
.pulso{width:7px;height:7px;border-radius:50%;background:var(--ok);display:inline-block;
animation:bat 2s infinite}@keyframes bat{50%{opacity:.25}}
button{font:inherit;border:0;border-radius:9px;padding:9px 14px;cursor:pointer}
.btn{background:var(--roxo);color:#fff;font-weight:600}.btn:hover{background:var(--roxo2)}
.btn.sec{background:var(--chip);border:1px solid var(--linha);color:var(--txt);font-weight:500}
.crm-link{margin-left:auto;display:inline-flex;align-items:center;gap:6px;padding:6px 11px;
font-size:13px;border-radius:9px;text-decoration:none;white-space:nowrap}
.wrap{width:100%;margin:0;padding:0;display:grid;flex:1;min-height:0;overflow:hidden;
grid-template-columns:minmax(320px,400px) minmax(0,1fr);gap:0;align-items:stretch}
@media(max-width:900px){.wrap{grid-template-columns:1fr}}
.filtros{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.fbtn{background:var(--chip);border:1px solid var(--linha);color:var(--fraco);
font-size:12.5px;padding:5px 11px;display:flex;gap:6px;align-items:center;white-space:nowrap}
.fbtn:hover{border-color:var(--roxo2)}
.fbtn.on{background:var(--roxo);color:#fff;border-color:var(--roxo)}
.fbtn b{font-weight:700;font-size:11.5px;background:color-mix(in srgb,var(--txt) 10%,transparent);
padding:0 6px;border-radius:99px}
.fbtn.on b{background:#ffffff2e;color:#fff}
@media(max-width:900px){header{flex-wrap:wrap}.filtros{order:3;width:100%}}
.lista-col{height:100%;min-height:0;display:flex;flex-direction:column;background:var(--card);
border-right:1px solid var(--linha);overflow:hidden}
.bulkbar{display:flex;align-items:center;gap:9px;padding:9px 12px;border-bottom:1px solid var(--linha);
background:var(--card);position:sticky;top:0;z-index:3;min-height:49px}
.bulkcheck{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--fraco);cursor:pointer;flex:1}
.bulkcheck input,.item-check{accent-color:var(--roxo);width:16px;height:16px;cursor:pointer}
.bulk-send{padding:6px 10px;font-size:12px}.bulk-send:disabled{opacity:.45;cursor:default}
.busca{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--linha);background:var(--card)}
.busca-icone{color:var(--fraco);font-size:16px;line-height:1}
.busca input{min-width:0;flex:1;height:36px;border:1px solid var(--linha);border-radius:9px;background:var(--campo);
color:var(--txt);padding:0 10px;font:inherit;font-size:13px;outline:0}
.busca input:focus{border-color:var(--roxo)}
.busca-limpar{padding:4px 7px;background:transparent;color:var(--fraco);font-size:15px}
.busca-limpar:hover{color:var(--txt);background:var(--hover)}
.lista{display:flex;flex-direction:column;gap:0;min-height:0;flex:1;overflow:auto;background:var(--card)}
.item{background:transparent;border:0;border-bottom:1px solid var(--linha);border-radius:0;
padding:12px 16px;cursor:pointer;display:grid;grid-template-columns:18px minmax(0,1fr);gap:10px}
.item-body{min-width:0}
.item:hover{background:var(--hover)}.item.sel{background:var(--hover);box-shadow:inset 3px 0 0 var(--roxo)}
.item .top{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.item .nome{font-weight:600;font-size:14px}
.item .responsavel-tag{margin-top:4px;padding:1px 7px;font-size:11px}
.item .h{font-size:11.5px;color:var(--fraco);white-space:nowrap}
.item .msg{font-size:13px;color:var(--previa);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pill{font-size:10.5px;padding:1px 7px;border-radius:99px;border:1px solid var(--linha);color:var(--fraco)}
.pill.INTERESSADO{color:var(--alerta);border-color:#4a3a1a}
.pill.TESTE{color:var(--azul);border-color:#1e3a5f}
.pill.CONVERTIDO{color:var(--ok);border-color:#1a4a2a}
.pill.PERDIDO{color:var(--verm);border-color:#4a1a1a}
.painel{background:var(--card);border:0;border-radius:0;padding:18px 22px;
min-height:0;height:100%;position:relative;overflow:auto}
@media(max-width:900px){body{overflow:auto}.wrap{display:block;overflow:visible;flex:none}.lista-col{height:55vh}
.painel{height:auto;min-height:55vh;overflow:visible}}
.vazio{color:var(--fraco);text-align:center;padding:60px 20px}
.chat{height:clamp(340px,58vh,700px);overflow:auto;display:flex;flex-direction:column;gap:7px;margin:12px 0;padding-right:4px}
@media(max-width:900px){.chat{height:52vh;min-height:300px}}
.bolha{max-width:82%;padding:7px 11px;border-radius:11px;font-size:13.5px;white-space:pre-wrap}
.bolha.lead{background:var(--bolha-lead);align-self:flex-start;border-bottom-left-radius:3px}
.bolha.loja{background:var(--bolha-loja);align-self:flex-end;border-bottom-right-radius:3px}
.bolha .meta{font-size:10.5px;color:var(--fraco);margin-top:3px}
.bolha .meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.msg-acao{border:0;background:transparent;color:var(--roxo2);font:inherit;font-size:11px;cursor:pointer;padding:1px 3px;border-radius:4px}
.msg-acao:hover,.msg-acao:focus-visible{background:var(--chip);text-decoration:underline}
.msg-acao.excluir{color:var(--verm)}
.msg-edicao{display:flex;flex-direction:column;gap:7px;min-width:min(300px,65vw)}
.msg-edicao textarea{min-height:82px;font-size:13px}
.msg-edicao-acoes{display:flex;gap:7px;justify-content:flex-end}
.bolha .aud{color:var(--roxo2)}
.midia-audio{display:block;width:min(310px,68vw);height:38px;margin:2px 0 5px}
.midia-imagem{display:block;max-width:min(360px,68vw);max-height:330px;border-radius:8px;object-fit:contain;background:#0001}
.midia-video{display:block;max-width:min(360px,68vw);max-height:330px;border-radius:8px;background:#000}
.midia-legenda{margin-top:6px;white-space:pre-wrap}.midia-link{color:var(--roxo2);font-weight:700;text-decoration:none}
textarea{width:100%;background:var(--campo);color:var(--txt);border:1px solid var(--linha);
border-radius:10px;padding:11px;font:inherit;min-height:96px;resize:vertical}
.catalogo-rascunho{margin-top:10px}.catalogo-rascunho label{display:block;font-size:12px;color:var(--fraco);margin-bottom:5px}
.catalogo-rascunho video{display:block;width:min(360px,100%);max-height:240px;margin-top:7px;border-radius:9px;background:#000}
.acoes{display:flex;gap:9px;margin-top:11px;flex-wrap:wrap;align-items:center}
.aviso{font-size:12.5px;color:var(--fraco);margin-top:8px}
.status{display:flex;gap:6px;margin:10px 0 2px;flex-wrap:wrap}
.sbtn{background:var(--chip);border:1px solid var(--linha);color:var(--fraco);font-size:12.5px;padding:6px 12px}
.sbtn.on{background:var(--roxo);color:#fff;border-color:var(--roxo)}
.crm-card{border:1px solid var(--linha);border-radius:11px;margin-top:10px;overflow:hidden;
background:color-mix(in srgb,var(--campo) 55%,var(--card))}
.crm-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 11px;
border-bottom:1px solid var(--linha)}
.crm-heading{display:flex;align-items:baseline;gap:7px;min-width:0}
.crm-eyebrow{font-size:9px;font-weight:750;letter-spacing:.08em;color:var(--roxo2);white-space:nowrap}
.crm-title{font-size:12px;color:var(--fraco);white-space:nowrap}
.crm-controls{padding:9px 11px}
.crm-btn{padding:5px 9px;border-radius:7px;font-size:11.5px;font-weight:600;background:var(--chip);
border:1px solid var(--linha);color:var(--txt);white-space:nowrap}
.crm-btn:hover{border-color:var(--roxo);background:var(--hover)}
.crm-btn:disabled{opacity:.55;cursor:wait}
.crm-stage-control{display:flex;align-items:center;gap:7px;font-size:10.5px;color:var(--fraco);white-space:nowrap}
.crm-select{height:34px;min-width:230px;max-width:320px;border:1px solid color-mix(in srgb,var(--roxo) 38%,var(--linha));border-radius:8px;
background:var(--campo);color:var(--txt);padding:0 30px 0 10px;font-size:12px;font-weight:650;cursor:pointer}
.crm-select:hover,.crm-select:focus{border-color:var(--roxo);outline:0}
.crm-note{display:flex;align-items:center;gap:7px}
.crm-note-input{flex:1;min-width:120px;height:34px;border:1px solid var(--linha);border-radius:8px;
background:var(--campo);color:var(--txt);padding:0 10px;font:inherit;font-size:12px}
.crm-note-input:focus{border-color:var(--roxo);outline:0}
.crm-feedback{font-size:11px;min-height:16px;margin-top:5px;color:var(--ok)}
.crm-card>.err{font-size:11.5px;padding:0 11px 9px}
@media(max-width:650px){.crm-head{align-items:flex-start;flex-direction:column}.crm-stage-control{width:100%}.crm-select{flex:1;min-width:0;max-width:none}.crm-note{align-items:stretch;flex-direction:column}.crm-note-input{width:100%}}
.rapidos{border-top:1px solid var(--linha);margin-top:14px;padding-top:12px}
.rapidos h3{font-size:12px;color:var(--fraco);margin:0 0 8px;font-weight:600;
text-transform:uppercase;letter-spacing:.5px}
.chips{display:flex;gap:7px;flex-wrap:wrap}
.chip{background:var(--chip);border:1px solid var(--linha);color:var(--txt);border-radius:9px;
padding:8px 12px;font-size:13px;cursor:pointer;text-align:left}
.chip:hover{border-color:var(--roxo);background:var(--hover)}
.chip small{display:block;color:var(--fraco);font-size:11px;margin-top:2px;max-width:230px;
white-space:normal;line-height:1.35}
.chip.aud::before{content:'▶ ';color:var(--roxo2)}
.chip.combo{border-color:var(--roxo);background:var(--hover);font-weight:600}
.chip.combo::before{content:'▶▶ ';color:var(--roxo2)}
.chip.enviado{border-color:var(--ok);background:color-mix(in srgb,var(--ok) 12%,transparent)}
.chip.enviado::after{content:' ✓';color:var(--ok);font-weight:700}
.planos-scroll{max-width:100%;overflow-x:auto}.planos{width:100%;min-width:440px;border-collapse:collapse;font-size:13.5px;margin-top:2px}
.planos th,.planos td{padding:6px 8px;border-bottom:1px solid var(--linha);text-align:left}
.planos th{font-size:11px;color:var(--fraco);font-weight:700;text-transform:uppercase;letter-spacing:.35px}
.planos tr:last-child td{border-bottom:0}
.planos td:first-child{color:var(--fraco)}
.planos th:nth-child(2),.planos td:nth-child(2){text-align:center;font-weight:700;font-variant-numeric:tabular-nums}
.planos th:last-child,.planos td:last-child{text-align:right;font-variant-numeric:tabular-nums}
.planos tr:hover td{background:var(--hover)}
.obs{font-size:12px;color:var(--fraco);margin-top:7px;line-height:1.45}
.gravador{display:flex;gap:9px;align-items:center;flex-wrap:wrap}
.gravador-chat{margin:6px 0}
.mic{background:#7f1d1d;color:#fff;font-weight:600}
.mic.rec{background:#dc2626;animation:bat 1s infinite}
.tempo{font-variant-numeric:tabular-nums;color:var(--fraco);font-size:13px;min-width:42px}
.spin{display:inline-block;width:13px;height:13px;border:2px solid var(--linha);border-top-color:var(--roxo);
border-radius:50%;animation:g .7s linear infinite;vertical-align:-2px}@keyframes g{to{transform:rotate(360deg)}}
.massa{border:1px solid var(--linha);border-radius:14px;padding:0;background:var(--card);color:var(--txt);
width:min(560px,calc(100vw - 28px));box-shadow:0 20px 70px #0008}
.massa::backdrop{background:#0009;backdrop-filter:blur(2px)}
.massa-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 20px 12px}
.massa-head h2{font-size:17px;margin:0}.massa-head p{font-size:12.5px;color:var(--fraco);margin:3px 0 0}
.massa-body{padding:0 20px 18px}.massa label{display:block;font-size:12px;color:var(--fraco);margin:10px 0 5px}
.massa select{width:100%;height:40px;border:1px solid var(--linha);border-radius:9px;background:var(--campo);
color:var(--txt);padding:0 10px;font:inherit}.massa textarea{min-height:135px}
.massa-foot{display:flex;align-items:center;justify-content:flex-end;gap:9px;margin-top:14px}
.massa-progress{font-size:12.5px;color:var(--fraco);margin-top:10px;min-height:20px}
.massa-resultados{max-height:150px;overflow:auto;font-size:12px;margin-top:8px}
.massa-falha{color:#f87171;padding:3px 0}
.notificacoes{position:fixed;right:14px;top:14px;z-index:40;width:min(300px,calc(100vw - 28px));
display:flex;flex-direction:column;gap:7px;pointer-events:none}
.notificacao{width:100%;padding:9px 11px;text-align:left;background:var(--card);color:var(--txt);
border:1px solid var(--linha);border-left:3px solid var(--roxo);border-radius:10px;
box-shadow:0 8px 28px #0004;pointer-events:auto;animation:notifica-in .18s ease-out}
.notificacao:hover{background:var(--hover)}
.notificacao-titulo{display:block;font-size:12px;font-weight:700;line-height:1.3}
.notificacao-msg{display:-webkit-box;margin-top:2px;color:var(--previa);font-size:11.5px;line-height:1.35;
overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow-wrap:anywhere}
@keyframes notifica-in{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}
.ok{color:var(--ok)}.err{color:#f87171}
/* Navegacao e identidade visual do atendimento. */
[hidden]{display:none!important}[data-icon]{display:inline-flex;align-items:center}
:root{color-scheme:dark}html[data-tema="claro"]{color-scheme:light}
html:not([data-tema="claro"]) .responsavel-tag{color:#c4b5fd}
html:not([data-tema="claro"]) .responsavel-tag[data-responsavel="Dione"]{color:#93c5fd}
html:not([data-tema="claro"]) .responsavel-tag[data-responsavel=""]{color:var(--fraco)}
.ico{width:17px;height:17px;display:inline-block;flex:none;vertical-align:-3px;stroke:currentColor;
 fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
header{flex-wrap:wrap;gap:10px 14px;padding:14px 22px 0;background:var(--card)}
.marca{display:flex;align-items:center;gap:13px;margin-right:auto;min-width:0}
.marca-logo{display:block;width:168px;height:40px;object-fit:contain;object-position:left center;flex:none}
.marca-logo.escuro{display:none}
html:not([data-tema="claro"]) .marca-logo.claro{display:none}
html:not([data-tema="claro"]) .marca-logo.escuro{display:block}
.marca h1{border-left:1px solid var(--linha);padding-left:13px;white-space:nowrap}
.marca-simbolo,.avatar{display:inline-flex;align-items:center;justify-content:center;flex:none;
 color:var(--roxo);background:var(--hover);border:1px solid color-mix(in srgb,var(--roxo) 15%,var(--linha))}
.marca-simbolo{width:38px;height:38px;border-radius:12px;background:var(--roxo);color:white}
.marca-simbolo .ico{width:21px;height:21px}.marca small{display:block;font-size:10px;
 letter-spacing:1.2px;color:var(--fraco);font-weight:650}.marca h1{line-height:1.3}
header>.filtros{order:10;width:100%;flex-wrap:nowrap;overflow-x:auto;padding:4px 0 12px;scrollbar-width:thin}
.crm-link{margin-left:0}.btn,.mic{display:inline-flex;align-items:center;justify-content:center;gap:7px}
button,a,input,select,textarea{transition:background .15s,border-color .15s,box-shadow .15s}
button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,
.item:focus-visible{outline:2px solid var(--roxo2);outline-offset:3px}
.btn.sec:hover{background:var(--hover);border-color:color-mix(in srgb,var(--roxo) 40%,var(--linha))}
.btn:disabled{cursor:default}.fbtn{border-radius:8px;padding:7px 11px}.fbtn.on{box-shadow:0 3px 9px #6d28d91a}
.lista-titulo{display:flex;align-items:center;gap:8px;padding:17px 16px 7px;font-size:14px;font-weight:650}
.lista-titulo>.ico{color:var(--roxo)}.lista-total{margin-left:auto;font-size:11px;border-radius:6px;
 background:var(--chip);color:var(--fraco);padding:2px 7px;font-variant-numeric:tabular-nums}
.busca{border-bottom:0;padding:6px 14px 12px}.busca input{background:var(--chip);height:39px}
.bulkbar{position:static;min-height:46px;background:var(--chip);padding:7px 14px}
.lista-col>.busca{order:1}.lista-col>.bulkbar{order:2}.lista-col>.lista{order:3}
.responsaveis-grafico{margin-top:14px;padding:14px 16px;border:1px solid var(--linha);border-radius:12px;background:var(--card)}
.grafico-cabecalho{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:3px}
.grafico-cabecalho h2{display:flex;align-items:center;gap:7px;font-size:13px;margin:0;font-weight:650}
.grafico-cabecalho .ico{color:var(--roxo2)}.grafico-total{font-size:11px;color:var(--fraco);white-space:nowrap}
.grafico-escopo{font-size:10.5px;color:var(--fraco);margin:0 0 11px}
.grafico-linha{margin-top:9px}.grafico-rotulo{display:flex;justify-content:space-between;gap:8px;font-size:12px;margin-bottom:4px}
.grafico-rotulo>span{display:flex;align-items:center;gap:6px}.grafico-rotulo b{font-variant-numeric:tabular-nums}
.grafico-ponto{width:7px;height:7px;border-radius:50%;background:var(--serie)}
.grafico-trilha{height:6px;border-radius:99px;background:var(--chip);overflow:hidden}
.grafico-barra{height:100%;background:var(--serie);border-radius:99px;transition:width .25s}
.grafico-linha{--serie:var(--roxo2)}.grafico-linha[data-responsavel="Dione"]{--serie:var(--azul)}
.grafico-linha[data-responsavel=""]{--serie:var(--fraco)}
.grafico-etapas{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 15px}
.grafico-etapa{display:inline-flex;align-items:center;gap:7px;padding:4px 8px;border:1px solid var(--linha);
 border-radius:7px;background:var(--chip);font-size:11px;color:var(--fraco)}
.grafico-etapa b{color:var(--txt);font-variant-numeric:tabular-nums}.grafico-etapa::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--etapa-cor,var(--fraco))}
.grafico-etapa[data-etapa="INTERESSADO"]{--etapa-cor:var(--alerta)}.grafico-etapa[data-etapa="TESTE GRÁTIS"]{--etapa-cor:var(--azul)}
.grafico-etapa[data-etapa="CONVERTIDO"]{--etapa-cor:var(--ok)}.grafico-etapa[data-etapa="PERDIDO"]{--etapa-cor:var(--verm)}
.grafico-etapa[data-etapa="SEM RESPOSTA"]{--etapa-cor:var(--roxo2);border-style:dashed}
.filtro-responsavel{order:1;display:flex;align-items:center;gap:8px;padding:0 14px 12px;
 color:var(--fraco);font-size:12px}.filtro-responsavel>.ico{color:var(--roxo)}
.filtro-responsavel select{flex:1;min-width:0;padding:7px 9px;border:1px solid var(--linha);
 border-radius:8px;background:var(--campo);color:var(--txt);font:inherit;cursor:pointer}
.item{grid-template-columns:16px 34px minmax(0,1fr);padding:15px 14px;gap:9px;align-items:start}
.item-check{margin:10px 0 0}.avatar{width:34px;height:34px;border-radius:11px}
.item .nome{overflow-wrap:anywhere}.item .responsavel-tag{color:var(--roxo);gap:4px}
.item .responsavel-tag .ico{width:11px;height:11px}.item .pill{border-color:var(--linha)}
.responsavel-tag{gap:5px;font-weight:650;padding:3px 9px;color:var(--roxo);background:var(--hover);
 border-color:color-mix(in srgb,var(--roxo) 25%,var(--linha))}
.responsavel-tag[data-responsavel="Dione"]{color:var(--azul);background:color-mix(in srgb,var(--azul) 10%,var(--card));
 border-color:color-mix(in srgb,var(--azul) 28%,var(--linha))}
.responsavel-tag[data-responsavel=""]{color:var(--fraco);background:var(--chip);border-style:dashed}
.responsavel-tag .ico{width:13px;height:13px}
.cliente-topo{display:flex;align-items:center;gap:13px;padding:2px 0 12px;border-bottom:1px solid var(--linha)}
.cliente-topo .avatar{width:48px;height:48px;border-radius:15px}.cliente-topo .avatar .ico{width:25px;height:25px}
.cliente-info{min-width:0;flex:1}.cliente-nome{font-size:18px;overflow-wrap:anywhere;letter-spacing:-.3px}
.cliente-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.cliente-meta .ico{width:13px;height:13px}
.cliente-link{font-size:12px;text-decoration:none;white-space:nowrap;padding:7px 10px}
.cliente-acoes{display:flex;flex-wrap:wrap;gap:7px;justify-content:flex-end}
.painel:has(.conversa-conteudo){display:flex;padding:0;overflow:hidden}
.conversa-conteudo{flex:1;min-width:0;overflow:auto;padding:18px 22px}
.painel:has(.lead-drawer:not([hidden])) .cliente-topo{flex-wrap:wrap;align-items:flex-start}
.painel:has(.lead-drawer:not([hidden])) .cliente-info{flex-basis:calc(100% - 61px)}
.painel:has(.lead-drawer:not([hidden])) .cliente-acoes{width:100%}
.lead-drawer{width:340px;flex:none;overflow:auto;padding:18px;background:var(--card);border-left:1px solid var(--linha)}
.drawer-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:18px}
.drawer-head h2{display:flex;align-items:center;gap:7px;font-size:15px;margin:0}.drawer-head h2 .ico{color:var(--roxo)}
.drawer-fechar{padding:5px 9px}.lead-dados{margin:12px 0 18px;display:grid;gap:12px}
.lead-dados dt{font-size:11px;color:var(--fraco);margin-bottom:2px}.lead-dados dd{font-size:13px;margin:0;overflow-wrap:anywhere}
.lead-drawer .crm-head,.lead-drawer .crm-stage-control{align-items:stretch;flex-direction:column}
.lead-drawer .crm-heading{flex-wrap:wrap}.lead-drawer .crm-select{width:100%;min-width:0;max-width:none}
.lead-drawer .crm-note{align-items:stretch;flex-direction:column}.lead-drawer .crm-note-input{height:90px;min-height:90px;
 resize:vertical;padding:9px;line-height:1.5;width:100%}.crm-notas{margin-top:16px;border-top:1px solid var(--linha);padding-top:12px}
.crm-notas h3{font-size:12px;margin:0 0 9px}.crm-nota{border:1px solid var(--linha);border-radius:9px;padding:10px;margin-bottom:8px;background:var(--chip)}
.crm-nota p{font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 5px}.crm-nota time{font-size:10px;color:var(--fraco)}
.drawer-fundo{display:none}
@media(max-width:1150px){.lead-drawer{width:310px}.cliente-acoes{width:100%;justify-content:flex-start}.cliente-topo{flex-wrap:wrap}}
@media(max-width:900px){.painel:has(.conversa-conteudo){display:block;overflow:visible}.conversa-conteudo{overflow:visible;padding:16px 14px}
 .lead-drawer{position:fixed;right:0;top:0;bottom:0;width:min(360px,92vw);z-index:31;box-shadow:-12px 0 35px #0003}
 .drawer-fundo:not([hidden]){display:block;position:fixed;inset:0;background:#0005;z-index:30}}
.chat{background:var(--bg);border:1px solid var(--linha);border-radius:14px;padding:16px;
 scrollbar-width:thin;scrollbar-color:var(--linha) transparent}
.bolha{padding:10px 13px;line-height:1.55;box-shadow:0 1px 2px #00000008}
.bolha.lead{background:var(--card);border:1px solid var(--linha)}
.atalhos{gap:7px;margin:8px 0 12px}.atalhos .btn{font-size:12px;padding:7px 11px}
.editor-label{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:var(--fraco);margin:0 0 7px}
textarea:focus{border-color:var(--roxo)}.rapidos{border:1px solid var(--linha);padding:14px;border-radius:12px;background:var(--chip)}
.rapidos h3{display:flex;align-items:center;gap:7px}.vazio-inicio{display:flex;flex-direction:column;align-items:center;
 justify-content:center;min-height:65vh;padding:30px;gap:10px}.vazio-inicio .avatar{width:64px;height:64px;border-radius:20px}
.vazio-inicio .avatar .ico{width:30px;height:30px}.vazio-inicio strong{color:var(--txt);font-size:18px}
.vazio-inicio p{max-width:300px;margin:0;font-size:13px;line-height:1.7}
@media(max-width:1100px){header{gap:8px;padding:12px 14px 0}header #sync{display:none}}
@media(max-width:650px){.marca{width:100%}header .crm-link{font-size:12px}.cliente-topo{flex-wrap:wrap}
 .cliente-link{margin-left:61px}.painel{padding:16px 14px}.cliente-nome{font-size:16px}.chat{padding:12px}
 .vazio-inicio{min-height:35vh}.responsavel-select{max-width:100%}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
.cliente-acoes .cliente-link{margin-left:0}
header{flex-wrap:nowrap;align-items:center;padding-bottom:12px}
header>.filtros{order:0;flex:1 1 0;min-width:0;width:auto;padding:0}
header>#btAtualizar,header>#btSair{flex:0 0 auto;white-space:nowrap}
header>#sync{flex:0 0 auto}
header>.filtro-responsavel{order:0;flex:0 0 auto;padding:0;white-space:nowrap;margin:0}
header>.filtro-responsavel select{width:135px;flex:0 0 auto}
@media(max-width:600px){header>.filtro-responsavel{font-size:11px;gap:4px}header>.filtro-responsavel select{width:105px}}
</style></head><body>
<div class="notificacoes" id="notificacoes" aria-live="polite"></div>
<header>
  <div class="filtros" id="filtros"></div>
    <label class="filtro-responsavel" for="filtroResponsavel"><span data-icon="user"></span>Responsável
      <select id="filtroResponsavel" onchange="setResponsavelFiltro(this.value)"><option value="">Todos</option></select>
    </label>
  <button class="btn sec" id="btAtualizar" onclick="atualiza()"
          style="padding:6px 11px;font-size:13px" title="Buscar mensagens novas agora"><span data-icon="refresh"></span>Atualizar</button>

  <button class="btn sec" id="btSair" type="button" onclick="sair()" hidden><span data-icon="logout"></span>Sair</button>
  <span id="sync" style="display:none" aria-hidden="true"></span>
</header>
<div class="wrap">
  <div class="lista-col">
    <div class="lista-titulo"><span data-icon="chat"></span>Conversas <span class="lista-total" id="listaTotal">…</span></div>
    <div class="bulkbar">
      <label class="bulkcheck"><input type="checkbox" id="selTodos" onchange="marcaTodas(this.checked)">
        <span id="bulkCount">Selecionar todas</span></label>
      <button class="btn bulk-send" id="bulkOpen" onclick="abreDisparo()" disabled><span data-icon="send"></span>Disparar</button>
    </div>
    <div class="busca">
      <span class="busca-icone" data-icon="search" aria-hidden="true"></span>
      <input id="busca" type="search" placeholder="Buscar por nome ou telefone…" autocomplete="off"
        aria-label="Buscar por nome ou telefone" oninput="agendaBusca(this.value)" onkeydown="if(event.key==='Escape')limpaBusca()">
      <button class="busca-limpar" id="buscaLimpar" onclick="limpaBusca()" aria-label="Limpar pesquisa" hidden>✕</button>
    </div>

    <div class="lista" id="lista"></div>
  </div>
  <div id="painel" class="painel"><div class="vazio vazio-inicio"><span class="avatar" data-icon="chat"></span>
    <strong>Vamos conversar?</strong><p>Selecione um cliente ao lado para acompanhar a conversa e preparar sua próxima mensagem.</p></div></div>
</div>
<dialog class="massa" id="massaDialog">
  <div class="massa-head"><div><h2>Disparo em massa</h2><p id="massaResumo"></p></div>
    <button class="btn sec" onclick="fechaDisparo()" aria-label="Fechar">✕</button></div>
  <div class="massa-body">
    <label for="massaModelo">Mensagem</label>
    <select id="massaModelo" onchange="selecionaTextoMassa()"></select>
    <label for="massaTexto" id="massaTextoLabel">Revise antes de disparar</label>
    <textarea id="massaTexto" placeholder="Digite a mensagem…"></textarea>
    <div class="massa-progress" id="massaStatus"></div>
    <div class="massa-resultados" id="massaResultados"></div>
    <div class="massa-foot">
      <button class="btn sec" id="massaCancelar" onclick="fechaDisparo()">Cancelar</button>
      <button class="btn" id="massaEnviar" onclick="disparaMassa()">Disparar mensagens</button>
    </div>
  </div>
</dialog>
<script>
let pend=[], sel=null, selId=null, prontos={audios:[],textos:[],combos:[],status:[]},
    enviados=[], filtro='', filtroResponsavel='', busca='', buscaTimer=null, buscaSeq=0,
    selecionados=new Set(), disparoRodando=false;

function icone(nome){
  const paths={
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    chat:'<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 4 11.5a8.5 8.5 0 1 1 17 0Z"/><path d="M8 11h8M8 14h5"/>',
    search:'<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
    pipeline:'<rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="4" height="8" rx="1"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-13 5 3 3 5-5"/>',
    refresh:'<path d="M20 7v5h-5M4 17v-5h5M5.5 7a8 8 0 0 1 13-2L20 7M4 17l1.5 2a8 8 0 0 0 13-2"/>',
    send:'<path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    stop:'<rect x="5" y="5" width="14" height="14" rx="2"/>',
    archive:'<rect x="3" y="3" width="18" height="4" rx="1"/><path d="M5 7v14h14V7M10 11h4"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2.1Z"/>',
    tag:'<path d="M20 13 11 22 2 13V2h11l9 9-2 2Z"/><circle cx="7" cy="7" r="1"/>',
    book:'<path d="M12 5v16M3 3h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v16h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3Z"/>',
    mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
    logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5M21 12H9"/>',
    moon:'<path d="M21 12.8A9 9 0 0 1 11.2 3 9 9 0 1 0 21 12.8Z"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>'
  };
  return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${paths[nome]||paths.chat}</svg>`;
}
document.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=icone(e.dataset.icon));
function tagResponsavel(nome){return icone('user')+'<span>'+esc(nome||'Sem responsável')+'</span>';}

function aplicaTema(t){
  document.documentElement.dataset.tema=t;
  localStorage.setItem('pl_tema',t);
}
function viraTema(){ aplicaTema(document.documentElement.dataset.tema==='claro'?'escuro':'claro'); }
aplicaTema(localStorage.getItem('pl_tema') || 'claro');   // padrao: claro
document.getElementById('btSair').hidden=window.self!==window.top || !location.pathname.startsWith('/prospeccao');
async function sair(){
  const botao=document.getElementById('btSair');
  botao.disabled=true; botao.textContent='Saindo…';
  try{
    const resposta=await fetch('/prospeccao/logout',{method:'POST',credentials:'same-origin'});
    if(!resposta.ok) throw new Error('Falha ao sair');
    location.replace('/prospeccao/login');
  }catch(e){botao.disabled=false;botao.textContent='Tentar sair';}
}
function esc(s){return (s??'').toString().replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function cls(s){return (s||'').split(' ')[0]}

function atualizaResponsavel(responsavel){
  const tag=document.getElementById('responsavelTag');
  const select=document.getElementById('responsavelSelect');
  if(tag){tag.innerHTML=tagResponsavel(responsavel);tag.dataset.responsavel=responsavel||'';}
  const drawerNome=document.getElementById('drawerResponsavel');if(drawerNome)drawerNome.textContent=responsavel||'Sem responsável';
  if(select&&!select.disabled){ select.value=responsavel||''; select.dataset.saved=select.value; }
}
async function salvaResponsavel(select){
  const cid=selId, anterior=select.dataset.saved||'', erro=document.getElementById('responsavelErro');
  select.disabled=true; if(erro) erro.textContent='';
  try{
    const r=await fetch('/api/responsavel',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chatid:cid,responsavel:select.value})});
    const d=await r.json();
    if(!r.ok||!d.ok) throw new Error(d.erro||'Não foi possível salvar.');
    if(selId===cid){ select.disabled=false; atualizaResponsavel(d.responsavel); }
  }catch(e){
    if(selId===cid){ select.disabled=false; select.value=anterior;
      if(erro) erro.textContent=e.message||'Não foi possível salvar.'; }
  }
}

let notificacoesProntas=false, avisosVistos=new Set();
async function buscaNotificacoes(mostrar=true){
  try{
    const r=await fetch('/api/recebidas?limite=50&_='+Date.now(),{cache:'no-store'}); if(!r.ok) return;
    const mensagens=await r.json();
    if(!notificacoesProntas){ mensagens.forEach(m=>avisosVistos.add(m.id)); notificacoesProntas=true; return; }
    const novas=mensagens.filter(m=>!avisosVistos.has(m.id)).sort((a,b)=>a.ts-b.ts);
    mensagens.forEach(m=>avisosVistos.add(m.id));
    if(mostrar) novas.forEach(m=>mostraNotificacao(m));
    if(avisosVistos.size>300) avisosVistos=new Set(mensagens.map(m=>m.id));
  }catch(e){}
}
function mostraNotificacao(m){
  const caixa=document.getElementById('notificacoes'), aviso=document.createElement('button');
  aviso.type='button'; aviso.className='notificacao';
  const titulo=document.createElement('span'), texto=document.createElement('span');
  titulo.className='notificacao-titulo'; titulo.textContent='Nova mensagem · '+(m.nome||'Nova conversa');
  texto.className='notificacao-msg'; texto.textContent=m.texto||'Nova mensagem';
  aviso.append(titulo,texto); aviso.onclick=()=>abreConversaNotificada(m.chatid,aviso);
  caixa.appendChild(aviso);
  while(caixa.children.length>3) caixa.firstElementChild.remove();
  setTimeout(()=>aviso.remove(),5500);
}
async function abreConversaNotificada(chatid,aviso){
  let i=pend.findIndex(p=>p.chatid===chatid);
  if(i<0){ filtro=''; filtroResponsavel=''; document.getElementById('filtroResponsavel').value='';
    limpaBusca(false); await filtros(); await carrega(); i=pend.findIndex(p=>p.chatid===chatid); }
  if(i>=0) abrir(i); aviso.remove();
}

let conversaDestino=new URLSearchParams(location.search).get("chatid");
async function carrega(){
  const pedido=++buscaSeq, params=new URLSearchParams();
  if(conversaDestino) params.set('chatid',conversaDestino);
  if(busca) params.set('busca',busca); else if(filtro) params.set('status',filtro);
  if(filtroResponsavel) params.set('responsavel',filtroResponsavel);
  const r=await fetch('/api/fila'+(params.size?'?'+params.toString():''));
  const dados=await r.json(); if(pedido!==buscaSeq) return;
  pend=dados;
  document.getElementById('listaTotal').textContent=pend.length;
  const L=document.getElementById('lista'); L.innerHTML='';
  pend.forEach((p,i)=>{
    const d=document.createElement('div');
    d.className='item'+(p.chatid===selId?' sel':'');
    d.onclick=()=>abrir(i);
    d.tabIndex=0; d.setAttribute('aria-label','Abrir conversa com '+(p.nome||p.fone));
    d.onkeydown=e=>{if(e.target===d&&(e.key==='Enter'||e.key===' ')){e.preventDefault();abrir(i);}};
    d.innerHTML=`<input class="item-check" type="checkbox" aria-label="Selecionar ${esc(p.nome||p.fone)}"
      ${selecionados.has(p.chatid)?'checked':''} onclick="event.stopPropagation()"
      onchange="marca('${esc(p.chatid)}',this.checked)"><span class="avatar">${icone('user')}</span><div class="item-body">
      <div class="top"><span class="nome">${esc(p.nome||p.fone)}</span>
      <span class="h">${esc(p.ha)}</span></div>
      <span class="responsavel-tag" data-responsavel="${esc(p.responsavel||'')}">${tagResponsavel(p.responsavel)}</span>
      <div class="msg">${esc(p.ultima)}</div>
      <div style="margin-top:6px;display:flex;gap:5px">
        <span class="pill ${cls(p.status)}">${esc(p.status)}</span>
        <span class="pill">${esc(p.quando)}</span></div></div>`;
    L.appendChild(d);
  });
  if(!pend.length) L.innerHTML='<div class="vazio">'+icone('search')+'<p>Nenhuma conversa encontrada com estes filtros.</p></div>';
  if(selId){ const i=pend.findIndex(x=>x.chatid===selId); if(i>=0) sel=i; }
  atualizaBulk();
}

function agendaBusca(valor){
  conversaDestino=null;
  busca=valor.trim(); document.getElementById('buscaLimpar').hidden=!busca;
  clearTimeout(buscaTimer); buscaTimer=setTimeout(carrega,220);
}
function limpaBusca(recarregar=true){
  conversaDestino=null;
  busca=''; clearTimeout(buscaTimer);
  const campo=document.getElementById('busca'); if(campo){campo.value='';campo.focus()}
  const limpar=document.getElementById('buscaLimpar'); if(limpar)limpar.hidden=true;
  if(recarregar) carrega();
}

function marca(chatid,on){ if(on) selecionados.add(chatid); else selecionados.delete(chatid); atualizaBulk(); }
function marcaTodas(on){ pend.forEach(p=>on?selecionados.add(p.chatid):selecionados.delete(p.chatid)); carrega(); }
function atualizaBulk(){
  const n=selecionados.size, vis=pend.length, marcados=pend.filter(p=>selecionados.has(p.chatid)).length;
  const cb=document.getElementById('selTodos');
  cb.checked=vis>0&&marcados===vis; cb.indeterminate=marcados>0&&marcados<vis;
  document.getElementById('bulkCount').textContent=n?n+' selecionada'+(n===1?'':'s'):'Selecionar todas';
  document.getElementById('bulkOpen').disabled=!n||disparoRodando;
}

function abreDisparo(){
  if(!selecionados.size||disparoRodando) return;
  const select=document.getElementById('massaModelo');
  select.innerHTML='<option value="abordagem">👋 Abordagem · 2 mensagens personalizadas</option>'+
    prontos.textos.map(t=>`<option value="${esc(t.id)}">${esc(t.rotulo)}</option>`).join('')+
    '<option value="">Mensagem personalizada</option>';
  select.value=prontos.textos.some(t=>t.id==='reaquecer')?'reaquecer':(prontos.textos[0]?.id||'abordagem');
  selecionaTextoMassa();
  document.getElementById('massaStatus').textContent=''; document.getElementById('massaResultados').innerHTML='';
  document.getElementById('massaEnviar').disabled=false; document.getElementById('massaCancelar').textContent='Cancelar';
  document.getElementById('massaDialog').showModal();
}
function fechaDisparo(){ if(!disparoRodando) document.getElementById('massaDialog').close(); }
function selecionaTextoMassa(){
  const id=document.getElementById('massaModelo').value, pronto=prontos.textos.find(t=>t.id===id);
  const campo=document.getElementById('massaTexto'), abordagem=id==='abordagem';
  campo.readOnly=abordagem;
  document.getElementById('massaTextoLabel').textContent=abordagem
    ? 'Prévia — o nome de cada cliente será preenchido automaticamente'
    : 'Revise antes de disparar';
  campo.value=abordagem
    ? 'Oi [nome do cliente], aqui é '+prontos.vendedor+', da Provou Levou.\n\n'
      +'Antes de iniciarmos, você vende em loja online, física, WhatsApp, Instagram?'
    : (pronto?.texto||'');
  const n=selecionados.size;
  document.getElementById('massaResumo').textContent=n+' conversa'+(n===1?'':'s')+' selecionada'+(n===1?'':'s')+
    (abordagem?' · 2 mensagens por cliente com nome personalizado':'');
  if(!abordagem) campo.focus();
}
async function disparaMassa(){
  const texto=document.getElementById('massaTexto').value.trim(),
    modo=document.getElementById('massaModelo').value==='abordagem'?'abordagem':null;
  if(!texto) return;
  const ids=[...selecionados], bt=document.getElementById('massaEnviar'), st=document.getElementById('massaStatus');
  disparoRodando=true; bt.disabled=true; document.getElementById('massaModelo').disabled=true;
  document.getElementById('massaTexto').disabled=true; st.innerHTML='<span class="spin"></span> preparando disparo…'; atualizaBulk();
  try{
    const response=await fetch('/api/disparo',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chatids:ids,texto,modo})});
    const d=await response.json(); if(!response.ok||!d.eid) throw new Error(d.erro||'Não foi possível iniciar o disparo.');
    let fim=null;
    for(let i=0;i<600;i++){
      await new Promise(r=>setTimeout(r,500));
      fim=await (await fetch('/api/envio?eid='+encodeURIComponent(d.eid))).json();
      st.innerHTML='<span class="spin"></span> '+(fim.enviados+fim.falhas)+'/'+fim.total+' conversas processadas · '+fim.enviados+' concluídas';
      if(fim.estado==='ok'||fim.estado==='erro') break;
    }
    if(!fim||!['ok','erro'].includes(fim.estado)) throw new Error('O disparo continua em segundo plano. Atualize a tela para conferir.');
    (fim.resultados||[]).filter(x=>x.ok).forEach(x=>selecionados.delete(x.chatid));
    const falhas=(fim.resultados||[]).filter(x=>!x.ok);
    st.innerHTML=falhas.length
      ? '<span class="err">'+fim.enviados+' conversas concluídas · '+falhas.length+' falharam</span>'
      : '<span class="ok">'+fim.enviados+' conversas concluídas ✓</span>';
    document.getElementById('massaResultados').innerHTML=falhas.map(x=>
      `<div class="massa-falha">${esc(x.nome)} — ${esc(x.erro||'falhou')}</div>`).join('');
    document.getElementById('massaCancelar').textContent='Fechar';
    await carrega(); await filtros();
  }catch(e){ st.innerHTML='<span class="err">'+esc(e.message)+'</span>'; bt.disabled=false; }
  finally{
    disparoRodando=false; document.getElementById('massaModelo').disabled=false;
    document.getElementById('massaTexto').disabled=false; atualizaBulk();
  }
}

async function filtros(){
  let n={};
  try{ n=await (await fetch('/api/contagem')).json(); }catch(e){}
  if(Array.isArray(n._responsaveis))desenhaGraficoResponsaveis(n._responsaveis);
  const rot=[['','Esperando','_esperando'],
             ['_sem_resposta','Sem resposta','_sem_resposta'],
             ...prontos.status.map(s=>[s,s,s]),
             ['_ocultos','Removidos','_ocultos']];
  document.getElementById('filtros').innerHTML=rot.map(([v,r,k])=>
    `<button class="fbtn${filtro===v?' on':''}" aria-pressed="${filtro===v}" onclick="setFiltro('${v}')">${icone(
      ({'':'chat','_sem_resposta':'clock','INTERESSADO':'user','TESTE GRÁTIS':'calendar','CONVERTIDO':'check','PERDIDO':'logout','_ocultos':'logout'})[v]||'tag')}${esc(r)}
       <b>${n[k]||0}</b></button>`).join('');
}
function setFiltro(v){ conversaDestino=null; filtro=v; limpaBusca(false); filtros(); carrega(); }
function setResponsavelFiltro(v){conversaDestino=null;filtroResponsavel=v;carrega();}
let dadosGraficoResponsaveis=null;
function desenhaGraficoResponsaveis(dados){
  dadosGraficoResponsaveis=dados;
  if(!document.getElementById('graficoResponsaveis'))return;
  const total=dados.reduce((s,r)=>s+r.total,0);
  document.getElementById('graficoResponsaveisTotal').textContent=total.toLocaleString('pt-BR')+' leads';
  document.getElementById('graficoResponsaveis').innerHTML=dados.map(r=>{
    const pct=total?r.total/total*100:0;
    const rotulos={'INTERESSADO':'Interessados','TESTE GRÁTIS':'Teste grátis','CONVERTIDO':'Convertidos','PERDIDO':'Perdidos'};
    const etapas=Object.entries(r.etapas||{}).map(([etapa,n])=>`<span class="grafico-etapa" data-etapa="${esc(etapa)}">${esc(rotulos[etapa]||etapa)}<b>${n.toLocaleString('pt-BR')}</b></span>`).join('')+
      `<span class="grafico-etapa" data-etapa="SEM RESPOSTA" title="Leads aguardando resposta do cliente. Já incluídos nas etapas e no total acima.">Sem resposta<b>${(r.sem_resposta||0).toLocaleString('pt-BR')}</b></span>`;
    return `<div class="grafico-linha" data-responsavel="${esc(r.responsavel)}"><div class="grafico-rotulo"><span><i class="grafico-ponto" aria-hidden="true"></i>${esc(r.nome)}</span><b>${r.total.toLocaleString('pt-BR')}</b></div><div class="grafico-trilha" role="img" aria-label="${esc(r.nome)}: ${r.total} leads, ${pct.toLocaleString('pt-BR',{maximumFractionDigits:1})}% do total"><div class="grafico-barra" style="width:${pct}%"></div></div><div class="grafico-etapas">${etapas}</div></div>`;
  }).join('');
}

// Mensagens que voce acabou de mandar e a Uazapi ainda esta processando. Elas
// aparecem na hora, com um relogio, e somem quando a sincronizacao traz a real.
let pendentes=[];
function bolhasPend(linhas){
  const agora=Date.now();
  pendentes=pendentes.filter(x=>{
    if(x.chatid!==selId) return false;
    if(x.estado==='erro') return true;
    const achou=x.tipo==='texto' && linhas.some(l=>l.de!=='lead' && l.texto===x.texto);
    return !achou && (agora-x.t < 25000);
  });
  return pendentes.map(x=>`<div class="bolha loja">${esc(x.texto)}
    <div class="meta">${x.estado==='erro'
      ? '<span class="err">falhou: '+esc(x.erro||'')+'</span>'
      : x.estado==='ok' ? '✓ enviada' : '🕗 enviando…'}</div></div>`).join('');
}
function desenhaChat(linhas){
  const ch=document.getElementById('chat'); if(!ch) return;
  if(editandoMensagem) { ultimasLinhas=linhas; return; }
  const perto=ch.scrollHeight-ch.scrollTop-ch.clientHeight<80;
  const novo=bolhas(linhas)+bolhasPend(linhas);
  if(novo!==ch.innerHTML){ ch.innerHTML=novo; if(perto) ch.scrollTop=9e9; }
  ultimasLinhas=linhas;
}
let ultimasLinhas=[];
let editandoMensagem=null, mensagemEmAcao=null;
function iniciaEdicao(id){
  if(mensagemEmAcao) return;
  const l=ultimasLinhas.find(x=>x.id===id&&x.de==='loja');
  if(!l) return;
  editandoMensagem=id;
  const bolha=[...document.querySelectorAll('#chat .bolha[data-id]')].find(x=>x.dataset.id===id);
  if(!bolha) {editandoMensagem=null;return;}
  bolha.innerHTML='<div class="msg-edicao"><textarea aria-label="Editar mensagem"></textarea>'+
    '<div class="msg-edicao-acoes"><button class="btn sec" type="button" data-msg-action="cancelar">Cancelar</button>'+
    '<button class="btn" type="button" data-msg-action="salvar">Salvar</button></div></div>';
  const campo=bolha.querySelector('textarea');campo.value=l.texto;campo.focus();campo.setSelectionRange(campo.value.length,campo.value.length);
}
async function acaoMensagem(acao,id,texto){
  if(mensagemEmAcao) return;
  if(acao==='excluir'&&!confirm('Excluir esta mensagem para todos no WhatsApp?')) return;
  mensagemEmAcao=id;
  const st=document.getElementById('st');
  if(st) st.textContent=acao==='editar'?'Editando mensagem…':'Excluindo mensagem…';
  try{
    const r=await fetch('/api/mensagem/'+acao,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chatid:selId,id,texto})});
    const d=await r.json();
    if(!r.ok||!d.ok) throw new Error(d.erro||'Não foi possível alterar a mensagem.');
    if(st) st.innerHTML='<span class="ok">Mensagem '+(acao==='editar'?'editada':'excluída')+' ✓</span>';
  }catch(e){if(st) st.innerHTML='<span class="err">'+esc(e.message||'Falha ao alterar mensagem.')+'</span>';}
  finally{
    mensagemEmAcao=null;editandoMensagem=null;
    const cid=selId;
    const r=await fetch('/api/conversa?chatid='+encodeURIComponent(cid));
    if(r.ok&&selId===cid) desenhaChat((await r.json()).linhas);
  }
}
document.addEventListener('click',e=>{
  const b=e.target.closest('#chat [data-msg-action]');if(!b)return;
  const id=b.closest('.bolha')?.dataset.id, acao=b.dataset.msgAction;
  if(!id)return;
  if(acao==='editar') iniciaEdicao(id);
  else if(acao==='cancelar'){editandoMensagem=null;desenhaChat(ultimasLinhas);}
  else if(acao==='salvar'){
    const texto=b.closest('.bolha').querySelector('textarea')?.value.trim();
    if(!texto){alert('Digite o novo texto da mensagem.');return;}
    acaoMensagem('editar',id,texto);
  }else if(acao==='excluir') acaoMensagem('excluir',id);
});
// acompanha o envio em segundo plano e marca a bolha como enviada ou falhou
async function segue(eid,item){
  for(let i=0;i<40;i++){
    await new Promise(r=>setTimeout(r,400));
    const s=await (await fetch('/api/envio?eid='+encodeURIComponent(eid))).json();
    if(s.estado==='ok'||s.estado==='erro'){
      item.estado=s.estado; item.erro=s.erro; desenhaChat(ultimasLinhas);
      return s;
    }
  }
  return {estado:'erro',erro:'sem resposta'};
}

function conteudoBolha(l){
  if(!l.midia) return esc(l.texto);
  const url='/api/midia?id='+encodeURIComponent(l.id), rotulo=/^\[[^\]]+\]$/.test(l.texto||'');
  const legenda=!rotulo&&l.texto ? `<div class="midia-legenda">${esc(l.texto)}</div>` : '';
  if(l.tipo==='AudioMessage') return `<audio class="midia-audio" controls preload="metadata" src="${url}"></audio>${legenda}`;
  if(l.tipo==='ImageMessage'||l.tipo==='StickerMessage')
    return `<a href="${url}" target="_blank" title="Abrir imagem"><img class="midia-imagem" loading="lazy" src="${url}" alt="Imagem enviada"></a>${legenda}`;
  if(l.tipo==='VideoMessage') return `<video class="midia-video" controls preload="metadata" src="${url}"></video>${legenda}`;
  return `<a class="midia-link" href="${url}" target="_blank">📎 Abrir documento</a>${legenda}`;
}
function bolhas(linhas){
  return linhas.map(l=>{
    const enviada=l.de==='loja', texto=['Conversation','ExtendedTextMessage','TextMessage'].includes(l.tipo);
    const acoes=enviada?`${texto?'<button class="msg-acao" type="button" data-msg-action="editar" title="Editar mensagem">Editar</button>':''}<button class="msg-acao excluir" type="button" data-msg-action="excluir" title="Excluir para todos">Excluir</button>`:'';
    return `<div class="bolha ${enviada?'loja':'lead'}" data-id="${esc(l.id)}">${conteudoBolha(l)}<div class="meta">${esc(l.hora)}${l.editada?' · editada':''}${l.audio?' · <span class="aud">áudio transcrito</span>':''}${acoes}</div></div>`;
  }).join('');
}

function primeiroNome(nome){
  const limpo=(nome||'').trim();
  if(!limpo || /^\+?\d/.test(limpo)) return '';
  return limpo.split(/\s+/)[0].replace(/[,:;]+$/,'');
}

async function abrir(i){
  descarta();
  editandoMensagem=null;
  sel=i; selId=pend[i].chatid; enviados=[]; ultimasLinhas=[];
  document.querySelectorAll('.item').forEach((e,j)=>e.classList.toggle('sel',j===i));
  const p=pend[i], P=document.getElementById('painel');
  P.innerHTML='<div class="vazio"><span class="spin"></span> abrindo…</div>';
  const d=await (await fetch('/api/conversa?chatid='+encodeURIComponent(p.chatid))).json();
  if(selId!==p.chatid) return;
  ultimasLinhas=d.linhas;
  P.innerHTML=`
    <div class="conversa-conteudo">
    <div class="cliente-topo">
      <span class="avatar">${icone('user')}</span>
      <div class="cliente-info"><strong class="cliente-nome">${esc(d.nome||d.fone)}</strong>
        <div class="responsavel-linha">
          <span class="responsavel-tag" id="responsavelTag" data-responsavel="${esc(d.responsavel||'')}">${tagResponsavel(d.responsavel)}</span>
          <select class="responsavel-select" id="responsavelSelect" aria-label="Atribuir responsável" onchange="salvaResponsavel(this)" data-saved="${esc(d.responsavel||'')}">
            <option value="">Atribuir responsável</option>
            ${(prontos.responsaveis||[]).map(nome=>`<option value="${esc(nome)}" ${d.responsavel===nome?'selected':''}>${esc(nome)}</option>`).join('')}
          </select><span class="responsavel-erro" id="responsavelErro" role="status"></span>
        </div>
        <div class="tag cliente-meta">${icone('phone')}${esc(d.fone)} · ${icone('clock')} última ${esc(p.ha)} (${esc(p.quando)})</div></div>
      <div class="cliente-acoes">
      <button class="btn sec cliente-link" id="btDadosLead" onclick="toggleDadosLead()" aria-expanded="false" aria-controls="leadDrawer">${icone('user')} Dados do lead</button></div>
    </div>
    <div class="chat" id="chat">${bolhas(d.linhas)}${bolhasPend(d.linhas)}</div>
    <div class="acoes atalhos">
      <button class="btn sec" id="btAbordagem" onclick="poeAbordagem()"
        title="Prepara a abordagem inicial personalizada em duas mensagens">${icone('user')} Abordagem</button>
      <button class="btn sec" id="btCatalogo" onclick="poeCatalogo()"
        title="Prepara duas mensagens e um vídeo para aprovação">${icone('book')} Provou Catálogo</button>
      <button class="btn sec" id="btPlanos" onclick="poeTexto('tabela')"
        title="Prepara a mensagem com os valores dos sete planos para revisão">${icone('tag')} Planos</button>
      <button class="btn sec" onclick="poeTexto('reaquecer')">${icone('refresh')} Reaquecer</button>
    </div>
    <label class="editor-label" for="txt">${icone('chat')} Sua mensagem</label>
    <textarea id="txt" placeholder="Digite sua mensagem…"></textarea>
    <div class="catalogo-rascunho" id="catalogoRascunho" hidden>
      <label for="catalogoTexto2">Segunda mensagem</label>
      <textarea id="catalogoTexto2"></textarea>
      <label for="catalogoVideo">Vídeo — será enviado por último, após sua aprovação</label>
      <video id="catalogoVideo" controls preload="metadata" src="/api/catalogo/video"></video>
    </div>
    <div class="gravador gravador-chat" id="gravadorChat" style="display:none">
      <span class="tempo" id="tempoChat">0:00</span>
      <audio id="previaChat" controls style="display:none;height:34px;max-width:100%"></audio>
      <button class="btn" id="envAudChat" style="display:none" onclick="enviaGravado(false)">Enviar áudio</button>
      <button class="btn sec" id="descAudChat" style="display:none" onclick="descarta()">Descartar</button>
    </div>
    <div class="acoes">
      <button class="btn" id="ok" onclick="enviar()">${icone('send')} Aprovar e enviar</button>
      <button class="btn sec" onclick="proxima()">${icone('check')} Concluir</button>
      <button class="btn sec" id="btnOcultar" onclick="ocultar(${d.oculto?'false':'true'})"
        title="Some da fila mesmo que a pessoa mande mensagem nova">${
        d.oculto ? icone('refresh')+' Restaurar na fila' : icone('archive')+' Remover da fila'}</button>
      <button class="mic" id="micChat" onclick="toggleMic()" title="Gravar áudio">${icone('mic')} Gravar</button>
      <span id="st" class="aviso"></span>
    </div>
    <div class="rapidos">
      <h3>${icone('tag')} Planos — para consultar</h3>
      <div class="planos-scroll"><table class="planos"><thead><tr><th>Plano</th><th>Mensalidade</th><th>Provas</th><th>Por prova</th></tr></thead><tbody>${prontos.planos.map(p=>
        `<tr><td>${esc(p.nome)}</td><td>${esc(p.preco)}</td><td>${esc(p.fotos)}</td><td>${esc(p.por_prova)}</td></tr>`).join('')}</tbody></table></div>
      <div class="obs">Sem custo de instalação · integração no mesmo dia · 7 dias grátis.</div>
    </div>
</div>
    <div class="drawer-fundo" id="drawerFundo" hidden onclick="toggleDadosLead(false)"></div>
    <aside class="lead-drawer" id="leadDrawer" aria-label="Dados do lead" hidden>
      <div class="drawer-head"><h2>${icone('user')} Dados do lead</h2><button class="btn sec drawer-fechar" id="fechaDadosLead" onclick="toggleDadosLead(false)" aria-label="Fechar dados do lead">✕</button></div>
      <dl class="lead-dados"><div><dt>Cliente</dt><dd>${esc(d.nome||d.fone)}</dd></div>
      <div><dt>Telefone</dt><dd>${esc(d.fone)}</dd></div>
      <div><dt>Responsável pela conversa</dt><dd id="drawerResponsavel">${esc(d.responsavel||'Sem responsável')}</dd></div></dl>
      <section id="crm" class="crm-card" aria-live="polite"><div class="crm-head"><span class="crm-title">Carregando dados do CRM…</span></div></section>
    </aside>`;
  document.getElementById('chat').scrollTop=9e9;
  if(dadosGraficoResponsaveis)desenhaGraficoResponsaveis(dadosGraficoResponsaveis);
  crmNotas=[];
}

function toggleDadosLead(abrir){
  const drawer=document.getElementById('leadDrawer');if(!drawer)return;
  const aberto=abrir===undefined?drawer.hidden:abrir;
  drawer.hidden=!aberto;document.getElementById('drawerFundo').hidden=!aberto;
  const botao=document.getElementById('btDadosLead');botao.setAttribute('aria-expanded',String(aberto));
  if(aberto){document.getElementById('fechaDadosLead').focus();if(!drawer.dataset.carregado)carregaCRM();}
  else botao.focus();
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('leadDrawer')?.hidden===false)toggleDadosLead(false);});

let crmOcupado=false, crmConsulta=0, crmNotas=[];
function dataCRM(valor){if(!valor)return 'Não informado';const d=new Date(valor);return isNaN(d)?'Não informado':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});}
function desenhaNotas(notas){
  crmNotas=notas||[];const box=document.getElementById('crmNotas');if(!box)return;
  box.innerHTML='<h3>Últimas observações</h3>'+(crmNotas.length?crmNotas.map(n=>
    `<article class="crm-nota"><p>${esc(n.conteudo)}</p><time>${esc(dataCRM(n.created_at))}</time></article>`).join(''):
    '<p class="tag">Nenhuma observação registrada.</p>');
}
function desenhaCRM(d){
  const box=document.getElementById('crm'); if(!box) return;
  const rascunho=box.querySelector('.crm-note-input')?.value||'';
  const lead=d.lead;
  box.innerHTML='<div class="crm-head"><div class="crm-heading"><span class="crm-eyebrow">QUANTIC DASH</span>'+
    '<span class="crm-title">Pipeline Atendimento · principal</span></div></div>'+
    '<div class="crm-controls"></div>';
  const head=box.querySelector('.crm-head'), controls=box.querySelector('.crm-controls');
  if(!lead){
    controls.innerHTML='<p class="tag">Este cliente ainda não tem uma oportunidade vinculada.</p>';
    const b=document.createElement('button'); b.className='crm-btn'; b.textContent='Registrar no CRM';
    b.onclick=()=>salvaCRM('/api/crm/registrar'); controls.appendChild(b); return;
  }
  const stage=document.createElement('label'); stage.className='crm-stage-control';
  stage.appendChild(document.createTextNode('Etapa no Pipeline Atendimento'));
  const atual=d.pipeline?.status??'';
  const select=document.createElement('select'); select.dataset.saved=atual; select.className='crm-select'; select.setAttribute('aria-label','Etapa no Pipeline Atendimento');
  if(!Object.hasOwn(d.pipeline?.etapas||{},atual)){const option=new Option(atual==='_ocultos'?'Removidos':atual==='_sem_resposta'?'Sem resposta':'Esperando',atual);option.disabled=true;option.selected=true;select.add(option);}
  for(const [value,label] of Object.entries(d.pipeline?.etapas||{})){
    const option=new Option(label,value); option.selected=value===atual; select.add(option);
  }
  select.onchange=()=>salvaCRM('/api/crm/etapa',select.value);
  stage.appendChild(select); head.appendChild(stage);

  const dados=document.createElement('dl');dados.className='lead-dados';
  const instagram=(lead.instagram||'').startsWith('whatsapp_')?'':lead.instagram;
  dados.innerHTML=[['Loja no CRM',lead.nome_loja],['E-mail',lead.email],['Instagram',instagram],
    ['Site',lead.site],['Origem',lead.fonte_oportunidade],['Cadastro no CRM',dataCRM(lead.created_at)]].map(([k,v])=>
    `<div><dt>${esc(k)}</dt><dd>${esc(v||'Não informado')}</dd></div>`).join('');
  controls.appendChild(dados);
  if(lead.notas){const nota=document.createElement('div');nota.className='crm-nota';nota.innerHTML='<p>'+esc(lead.notas)+'</p>';controls.appendChild(nota);}

  const form=document.createElement('form'); form.className='crm-note';
  const input=document.createElement('textarea'); input.className='crm-note-input';input.value=rascunho;
  input.id='crmObservacao';const label=document.createElement('label');label.htmlFor=input.id;label.className='tag';label.textContent='Nova observação';
  input.maxLength=2000; input.placeholder='Adicionar observação à oportunidade…';
  input.setAttribute('aria-label','Observação da oportunidade no CRM');
  const button=document.createElement('button'); button.className='crm-btn'; button.type='submit'; button.textContent='Salvar observação';
  form.append(label,input,button); form.onsubmit=e=>salvaObservacao(e,form);
  const feedback=document.createElement('div'); feedback.className='crm-feedback'; feedback.setAttribute('role','status');
  controls.prepend(form,feedback);
  const historico=document.createElement('div');historico.className='crm-notas';historico.id='crmNotas';controls.appendChild(historico);
  desenhaNotas(d.notas||crmNotas);
}
async function carregaCRM(chatid=selId){
  if(!chatid || crmOcupado || document.getElementById('leadDrawer')?.hidden!==false) return;
  if(document.activeElement?.classList.contains('crm-note-input'))return;
  if(document.querySelector('.crm-note-input')?.value.trim())return;
  const consulta=++crmConsulta;
  try{
    const response=await fetch('/api/crm?chatid='+encodeURIComponent(chatid));
    const d=await response.json(); if(!response.ok || d.erro) throw new Error(d.erro||'Falha ao consultar CRM');
    if(selId===chatid && consulta===crmConsulta && !crmOcupado){desenhaCRM(d);document.getElementById('leadDrawer').dataset.carregado='1';}
  }catch(e){
    if(selId!==chatid || consulta!==crmConsulta || crmOcupado) return;
    const box=document.getElementById('crm'); if(!box) return;
    box.innerHTML='<div class="crm-head"><div class="crm-heading"><span class="crm-eyebrow">QUANTIC DASH</span>'+
      '<span class="crm-title">CRM indisponível</span></div></div>'+
      '<div class="err">'+esc(e.message)+'</div><div class="crm-controls"></div>';
    const b=document.createElement('button'); b.className='crm-btn'; b.textContent='Tentar novamente';
    box.querySelector('.crm-controls').appendChild(b);
    b.onclick=()=>carregaCRM(chatid);
  }
}
async function salvaCRM(path,status){
  if(crmOcupado || !selId) return;
  const chatid=selId; crmOcupado=true; ++crmConsulta;
  const box=document.getElementById('crm');
  box.querySelectorAll('button,select').forEach(b=>b.disabled=true);
  try{
    const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chatid,status})});
    const d=await response.json(); if(!response.ok || d.erro) throw new Error(d.erro||'Não foi possível salvar no CRM');
    if(selId===chatid) desenhaCRM(d);
    carrega(); filtros();
  }catch(e){
    if(selId===chatid){
      box.querySelector('.err')?.remove();
      const error=document.createElement('div'); error.className='err'; error.textContent=e.message; box.appendChild(error);
      box.querySelectorAll('button,select').forEach(b=>b.disabled=false);
    }
  }finally{
    crmOcupado=false;
    if(selId!==chatid) carregaCRM();
  }
}
async function salvaObservacao(event,form){
  event.preventDefault();
  if(crmOcupado || !selId) return;
  const input=form.querySelector('.crm-note-input'), texto=input.value.trim();
  if(!texto){ input.focus(); return; }
  const chatid=selId, feedback=form.nextElementSibling; crmOcupado=true; ++crmConsulta;
  form.querySelectorAll('button,textarea').forEach(el=>el.disabled=true);
  feedback.className='crm-feedback'; feedback.textContent='Salvando…';
  try{
    const response=await fetch('/api/crm/observacao',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chatid,texto})});
    const d=await response.json(); if(!response.ok || d.erro) throw new Error(d.erro||'Não foi possível salvar a observação');
    if(selId===chatid){ input.value=''; feedback.textContent='Observação salva no CRM.';desenhaNotas([d.note,...crmNotas].slice(0,20)); }
  }catch(e){
    if(selId===chatid){ feedback.className='crm-feedback err'; feedback.textContent=e.message; }
  }finally{
    crmOcupado=false;
    if(selId===chatid) form.querySelectorAll('button,textarea').forEach(el=>el.disabled=false);
    else carregaCRM();
  }
}
setInterval(()=>{
  const select=document.querySelector('#crm select');
  if(!document.querySelector('#crm select:focus') && (!select || select.value===select.dataset.saved)) carregaCRM();
},30000);

async function ocultar(oc){
  const p=pend[sel], st=document.getElementById('st');
  if(oc && !confirm('Remover "'+(p.nome||p.fone)+'" da fila?\n\n'
     +'Ela some do painel mesmo que mande mensagem nova. '
     +'Dá pra restaurar depois no filtro "Removidos".')) return;
  await fetch('/api/ocultar',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chatid:p.chatid,oculto:oc})});
  st.innerHTML='<span class="ok">'+(oc?'removida da fila':'restaurada')+'</span>';
  selId=null; sel=null;
  await carrega(); await filtros();
  document.getElementById('painel').innerHTML=
    '<div class="vazio">'+(oc?'Conversa removida.':'Restaurada.')+' Escolha a próxima.</div>';
}
async function mudaStatus(s,b){
  await fetch('/api/status',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chatid:pend[sel].chatid,status:s})});
  document.querySelectorAll('.sbtn').forEach(x=>x.classList.toggle('on',x===b));
  document.getElementById('st').innerHTML='<span class="ok">status: '+esc(s)+'</span>';
  carrega();
}
async function enviar(){
  const campo=document.getElementById('txt'), texto=campo.value.trim(); if(!texto) return;
  const modo=campo.dataset.modo, segundo=modo==='catalogo'
    ? document.getElementById('catalogoTexto2').value.trim() : '';
  const st=document.getElementById('st'), botao=document.getElementById('ok');
  if(modo==='catalogo'&&!segundo){
    st.innerHTML='<span class="err">Revise também a segunda mensagem antes de enviar.</span>'; return;
  }
  const textos=modo==='catalogo' ? [texto,segundo]
    : modo==='abordagem' ? texto.split(/\n\s*\n/).map(t=>t.trim()).filter(Boolean) : [texto];
  const conversa=selId, fone=pend[sel].fone;
  campo.value=''; delete campo.dataset.modo;
  const rascunho=document.getElementById('catalogoRascunho');
  if(rascunho) rascunho.hidden=true;
  botao.disabled=true; st.textContent='';
  let enviadas=0, erro='', videoTentado=false;
  try{
    for(const t of textos){
      const item={chatid:conversa,tipo:'texto',texto:t,estado:'enviando',t:Date.now()};
      pendentes.push(item); desenhaChat(ultimasLinhas);   // aparece na hora
      const d=await (await fetch('/api/enviar',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({chatid:conversa,fone,texto:t})})).json();
      if(!d.eid){ item.estado='erro'; item.erro=d.erro||'falhou'; desenhaChat(ultimasLinhas); erro=item.erro; break; }
      const r=await segue(d.eid,item);
      if(r.estado==='erro'){ erro=r.erro||'falhou'; break; }
      enviadas++;
    }
    if(modo==='catalogo'&&!erro){
      videoTentado=true;
      const item={chatid:conversa,tipo:'video',texto:'🎬 Vídeo do Provou Catálogo',estado:'enviando',t:Date.now()};
      pendentes.push(item); desenhaChat(ultimasLinhas);
      const d=await (await fetch('/api/catalogo/video',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({fone})})).json();
      if(!d.eid){item.estado='erro';item.erro=d.erro||'falhou';desenhaChat(ultimasLinhas);erro=item.erro;}
      else{
        const r=await segue(d.eid,item);
        if(r.estado==='erro') erro=r.erro||'falhou';
      }
    }
  }catch(e){ erro=e.message||'falhou';
  }finally{
    botao.disabled=false; botao.innerHTML=icone('send')+' Aprovar e enviar';
  }
  if(modo==='catalogo'&&erro) erro=videoTentado
    ? 'As duas mensagens foram enviadas, mas o vídeo falhou: '+erro
    : enviadas+' de 2 mensagens enviadas; vídeo não enviado. '+erro;
  st.innerHTML=erro ? '<span class="err">'+esc(erro)+'</span>'
    : '<span class="ok">'+(modo==='catalogo'?'2 mensagens + vídeo enviados ✓':
      enviadas+' mensagem'+(enviadas===1?'':'s')+' enviada'+(enviadas===1?'':'s')+' ✓')+'</span>';
}
async function mandaAudio(id,botao){
  const st=document.getElementById('st'), a=prontos.audios.find(x=>x.id===id);
  botao.disabled=true;
  const item={chatid:selId,tipo:'audio',texto:'🎧 '+a.rotulo+' ('+a.seg+'s)',
              estado:'enviando',t:Date.now()};
  pendentes.push(item); desenhaChat(ultimasLinhas);
  const d=await (await fetch('/api/audio',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({fone:pend[sel].fone,id})})).json();
  botao.disabled=false;
  if(!d.eid){ item.estado='erro'; item.erro=d.erro||'falhou'; desenhaChat(ultimasLinhas); return; }
  botao.classList.add('enviado'); enviados.push(a.rotulo);
  const r=await segue(d.eid,item);
  st.innerHTML = r.estado==='erro'
    ? '<span class="err">'+esc(r.erro||'')+'</span>'
    : '<span class="ok">enviado: '+esc(enviados.join(' → '))+'</span>';
}
async function mandaCombo(id,botao){
  const p=pend[sel], st=document.getElementById('st'), c=prontos.combos.find(x=>x.id===id);
  botao.disabled=true; st.innerHTML='<span class="spin"></span> enviando '+c.audios.length+' áudios…';
  const d=await (await fetch('/api/combo',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({fone:p.fone,id})})).json();
  if(!d.ok){ st.innerHTML='<span class="err">'+esc(d.erro)+'</span>'; botao.disabled=false; return; }
  for(let i=0;i<40;i++){
    await new Promise(r=>setTimeout(r,700));
    const s2=await (await fetch('/api/combo_status?fone='+encodeURIComponent(p.fone))).json();
    const f=(s2.enviados||[]);
    if(s2.estado==='ok'){ botao.classList.add('enviado'); enviados.push(...f);
      st.innerHTML='<span class="ok">enviado: '+esc(f.join(' → '))+'</span>'; break; }
    if(s2.estado==='erro'){ st.innerHTML='<span class="err">parou em '+f.length+'/'+
      c.audios.length+' — '+esc(s2.erro)+'</span>'; break; }
    st.innerHTML='<span class="spin"></span> '+f.length+'/'+c.audios.length;
  }
  botao.disabled=false;
}
function poeCatalogo(){
  const textos=prontos.catalogo||[];
  if(textos.length!==2) return;
  const campo=document.getElementById('txt');
  campo.value=textos[0]; campo.dataset.modo='catalogo';
  document.getElementById('catalogoTexto2').value=textos[1];
  document.getElementById('catalogoRascunho').hidden=false;
  document.getElementById('ok').innerHTML=icone('send')+' Aprovar e enviar 2 mensagens + vídeo';
  document.getElementById('st').textContent='Revise as duas mensagens e o vídeo antes de enviar.';
  campo.focus();
}
function poeTexto(id){ const t=prontos.textos.find(x=>x.id===id);
  const c=document.getElementById('txt');
  c.value=t.texto; delete c.dataset.modo;
  document.getElementById('catalogoRascunho').hidden=true; c.focus();
  const b=document.getElementById('ok'); if(b)b.innerHTML=icone('send')+' Aprovar e enviar'; }
function poeAbordagem(){
  const nome=primeiroNome(pend[sel]?.nome), c=document.getElementById('txt');
  c.value='Oi'+(nome?' '+nome:'')+', aqui é '+prontos.vendedor+', da Provou Levou.\n\n'
    +'Antes de iniciarmos, você vende em loja online, física, WhatsApp, Instagram?';
  document.getElementById('catalogoRascunho').hidden=true;
  c.dataset.modo='abordagem'; c.focus();
  document.getElementById('ok').innerHTML=icone('send')+' Aprovar e enviar 2 mensagens';
}
function proxima(){ descarta(); selId=null; sel=null; carrega();
  document.getElementById('painel').innerHTML='<div class="vazio">Escolha a próxima.</div>'; }

let rec=null,pedacos=[],t0=0,cron=null,blobGravado=null,audioUrl=null,gravadoEnviando=false;
function sincronizaGravador(){
  const gravando=rec&&rec.state==='recording', pronto=!!blobGravado;
  ['micChat'].forEach(id=>{const b=document.getElementById(id);if(b){b.innerHTML=gravando?icone('stop')+' Parar':icone('mic')+' Gravar';b.classList.toggle('rec',!!gravando);}});
  ['previaChat'].forEach(id=>{const p=document.getElementById(id);if(p){p.style.display=pronto?'':'none';if(pronto&&p.getAttribute('src')!==audioUrl)p.src=audioUrl;}});
  ['envAudChat','descAudChat'].forEach(id=>{const b=document.getElementById(id);if(b)b.style.display=pronto?'':'none';});
  const box=document.getElementById('gravadorChat');if(box)box.style.display=gravando||pronto?'':'none';
}
async function toggleMic(){
  if(gravadoEnviando) return;
  const st=document.getElementById('st'), chatid=selId;
  if(rec&&rec.state==='recording'){ rec.stop(); return; }
  let stream;
  try{ stream=await navigator.mediaDevices.getUserMedia({audio:true}); }
  catch(e){ st.innerHTML='<span class="err">microfone: '+esc(e.name)+'</span>'; return; }
  if(selId!==chatid){stream.getTracks().forEach(t=>t.stop());return;}
  descarta(); pedacos=[]; blobGravado=null; rec=new MediaRecorder(stream);
  rec.ondataavailable=e=>{ if(e.data.size) pedacos.push(e.data); };
  rec.onstop=()=>{ clearInterval(cron); stream.getTracks().forEach(t=>t.stop());
    blobGravado=new Blob(pedacos,{type:rec.mimeType||'audio/webm'});
    audioUrl=URL.createObjectURL(blobGravado); sincronizaGravador(); };
  rec.start(); t0=Date.now(); sincronizaGravador();
  cron=setInterval(()=>{ const s=Math.floor((Date.now()-t0)/1000);
    ['tempoChat'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}); },200);
}
function descarta(){ blobGravado=null;
  clearInterval(cron);
  if(rec){rec.onstop=null;if(rec.state==='recording')rec.stop();rec.stream.getTracks().forEach(t=>t.stop());rec=null;}
  if(audioUrl){URL.revokeObjectURL(audioUrl);audioUrl=null;}
  ['tempoChat'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent='0:00';});
  sincronizaGravador(); }
async function enviaGravado(teste){
  if(!blobGravado||gravadoEnviando) return;
  gravadoEnviando=true;
  const chatid=selId, fone=pend[sel].fone, blob=blobGravado;
  const st=document.getElementById('st');
  const botoes=['envAudChat','micChat','descAudChat'].map(id=>document.getElementById(id)).filter(Boolean);
  botoes.forEach(b=>b.disabled=true);
  try{
  st.innerHTML='<span class="spin"></span> enviando áudio'+(teste?' pra você':'')+'…';
  const b64=await new Promise((resolve,reject)=>{const fr=new FileReader();
    fr.onerror=()=>reject(new Error('Não foi possível ler o áudio.'));
    fr.onload=()=>resolve(fr.result.split(',')[1]); fr.readAsDataURL(blob);});
  const seg=document.getElementById('tempoChat').textContent;
  const d=await (await fetch('/api/gravado',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({fone,b64,seg,teste})})).json();
  if(selId!==chatid) return;
  if(d.ok){ st.innerHTML='<span class="ok">áudio enviado'+(teste?' pra você':'')+' ✓</span>';
    if(!teste){ enviados.push('áudio '+seg); descarta(); } }
  else st.innerHTML='<span class="err">'+esc(d.erro||'')+'</span>';
  }catch(e){if(selId===chatid)st.innerHTML='<span class="err">Não foi possível enviar o áudio. Tente novamente.</span>';}
  finally{gravadoEnviando=false;botoes.forEach(b=>b.disabled=false);}
}

// O painel ja sincroniza sozinho a cada poucos segundos. Este botao serve pra
// quando voce nao quer esperar: forca a busca na Uazapi e redesenha a tela.
let atualizando=false;
async function atualiza(){
  if(atualizando) return;
  atualizando=true;
  const b=document.getElementById('btAtualizar'), antes=b.innerHTML;
  b.disabled=true; b.innerHTML='<span class="pulso"></span> buscando…';
  try{
    const d=await (await fetch('/api/atualizar',{method:'POST'})).json();
    await filtros(); await carrega();
    if(selId){
      const c=await (await fetch('/api/conversa?chatid='+encodeURIComponent(selId))).json();
      const ch=document.getElementById('chat');
      if(ch){ ch.innerHTML=bolhas(c.linhas); ch.scrollTop=9e9; }
    }
    b.innerHTML = d.erro ? '<span class="err">erro</span>'
                : d.novas ? '✅ '+d.novas+' nova(s)' : '✅ em dia';
  }catch(e){ b.innerHTML='<span class="err">falhou</span>'; }
  setTimeout(()=>{ b.innerHTML=antes; b.disabled=false; atualizando=false; },2200);
}

(async()=>{ prontos=await (await fetch('/api/prontos')).json();
  document.getElementById('filtroResponsavel').innerHTML='<option value="">Todos</option>'+
    (prontos.responsaveis||[]).map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('')+
    '<option value="_sem_responsavel">Sem responsável</option>';
  await filtros(); await carrega();
  if(conversaDestino){const i=pend.findIndex(p=>p.chatid===conversaDestino);if(i>=0)await abrir(i);else document.getElementById("painel").textContent="Conversa não encontrada.";}
  await buscaNotificacoes(false); conectaEventos(); })();

let eventosTelaAtivos=false, atualizacaoEvento=null;
async function atualizaPorEvento(){
  if(atualizacaoEvento) return;
  atualizacaoEvento=setTimeout(async()=>{
    atualizacaoEvento=null;
    await Promise.all([carrega(),filtros(),buscaNotificacoes()]);
    if(!selId||!document.getElementById('chat')) return;
    const cid=selId;
    try{
      const r=await fetch('/api/conversa?chatid='+encodeURIComponent(cid));
      if(r.ok&&selId===cid){ const d=await r.json(); desenhaChat(d.linhas); atualizaResponsavel(d.responsavel); }
    }catch(e){}
  },40);
}
function conectaEventos(){
  const es=new EventSource('/api/events');
  es.onopen=()=>{ eventosTelaAtivos=true; };
  es.onmessage=()=>atualizaPorEvento();
  es.onerror=()=>{ eventosTelaAtivos=false; };
}
// Recuperacao para queda de conexao: com eventos ativos estas consultas nao rodam.
setInterval(()=>{ if(!eventosTelaAtivos){ carrega(); filtros(); buscaNotificacoes(); } },5000);
let chatAtualizando=false;
setInterval(async()=>{
  if(eventosTelaAtivos||chatAtualizando||!selId||!document.getElementById('chat')||document.hidden) return;
  const cid=selId; chatAtualizando=true;
  try{
    const r=await fetch('/api/conversa?chatid='+encodeURIComponent(cid));
    if(!r.ok) return;
    const d=await r.json();
    if(selId===cid){ desenhaChat(d.linhas); atualizaResponsavel(d.responsavel); }
  }catch(e){}finally{chatAtualizando=false;}
},1500);
setInterval(async()=>{ const s=await (await fetch('/api/sync')).json();
  document.getElementById('sync').innerHTML=s.erro
    ? '<span class="err">sync: '+esc(s.erro)+'</span>'
    : '<span class="pulso"></span> '+(s.events?.connected?'eventos ao vivo':'sincronizando')+' · '+esc(s.ultimo||'');
  if(s.crm?.erro) document.getElementById('sync').innerHTML+=' · <span class="err">'+esc(s.crm.erro)+'</span>'; },5000);
</script></body></html>"""


# ─────────────────────────── servidor ───────────────────────────
class H(BaseHTTPRequestHandler):
    def _send(self, code, corpo, tipo="application/json; charset=utf-8"):
        b = corpo if isinstance(corpo, bytes) else corpo.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def log_message(self, *a):
        pass

    def _send_media(self, corpo, mime):
        inicio, fim, codigo = 0, len(corpo) - 1, 200
        intervalo = self.headers.get("Range", "")
        m = re.fullmatch(r"bytes=(\d*)-(\d*)", intervalo)
        if m and len(corpo):
            if m.group(1):
                inicio = int(m.group(1))
                fim = min(int(m.group(2)), fim) if m.group(2) else fim
            elif m.group(2):
                inicio = max(0, len(corpo) - int(m.group(2)))
            if inicio > fim or inicio >= len(corpo):
                self.send_response(416)
                self.send_header("Content-Range", "bytes */%d" % len(corpo))
                self.end_headers()
                return
            codigo = 206
        trecho = corpo[inicio:fim + 1]
        self.send_response(codigo)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(trecho)))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "private, max-age=86400")
        if codigo == 206:
            self.send_header("Content-Range", "bytes %d-%d/%d" % (inicio, fim, len(corpo)))
        self.end_headers()
        self.wfile.write(trecho)

    def do_GET(self):
        try:
            p = urllib.parse.urlparse(self.path)
            q = urllib.parse.parse_qs(p.query)
            if p.path == "/":
                return self._send(200, PAGINA, "text/html; charset=utf-8")
            if p.path == "/api/catalogo/video":
                with open(CATALOGO_VIDEO, "rb") as video:
                    return self._send_media(video.read(), "video/mp4")
            if p.path == "/api/midia":
                try:
                    corpo, mime = carrega_midia((q.get("id") or [""])[0])
                    return self._send_media(corpo, mime)
                except ValueError as e:
                    return self._send(404, json.dumps({"erro": str(e)}, ensure_ascii=False))
                except Exception as e:
                    return self._send(502, json.dumps({"erro": str(e)[:200]}, ensure_ascii=False))
            if p.path == "/api/events":
                try:
                    last = int(self.headers.get("Last-Event-ID") or (q.get("after") or [0])[0])
                except (TypeError, ValueError):
                    last = 0
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                self.send_header("Cache-Control", "no-cache, no-transform")
                self.end_headers()
                try:
                    self.wfile.write(b"retry: 1000\n\n")
                    self.wfile.flush()
                    while True:
                        revision = UI_EVENTS.wait(last, timeout=20)
                        if revision > last:
                            self.wfile.write(("id: %d\ndata: refresh\n\n" % revision).encode("utf-8"))
                            last = revision
                        else:
                            self.wfile.write(b": keepalive\n\n")
                        self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    pass
                return
            if p.path == "/api/crm":
                return self._send(200, json.dumps(dados_pipeline(q["chatid"][0]), ensure_ascii=False))
            if p.path == "/api/prontos":
                return self._send(200, json.dumps(
                    {"audios": AUDIOS, "textos": TEXTOS, "combos": COMBOS,
                     "catalogo": CATALOGO_MENSAGENS, "status": STATUS,
                     "planos": PLANOS, "responsaveis": RESPONSAVEIS,
                     "vendedor": nome_vendedor(self.headers.get("X-Prospeccao-User"))},
                    ensure_ascii=False))
            if p.path == "/api/sync":
                return self._send(200, json.dumps({**SYNC, "crm": CRM_CLIENT.sync_status, "events": dict(LIVE_EVENTS.status)}, ensure_ascii=False))
            if p.path == "/api/contagem":
                return self._send(200, json.dumps(contagem(), ensure_ascii=False))
            if p.path == "/api/metas/config":
                return self._send(200, json.dumps({"goals": read_goals(DB),
                    "canEdit": self.headers.get("X-Prospeccao-User") == "lucas"}, ensure_ascii=False))
            if p.path == "/api/metas/conversas":
                return self._send(200, json.dumps(metas_conversas(
                    (q.get("since") or [""])[0], (q.get("until") or [""])[0]), ensure_ascii=False))
            if p.path == "/api/fila":
                return self._send(200, json.dumps(fila((q.get("status") or [None])[0],
                                                       (q.get("busca") or [None])[0],
                                                       (q.get("responsavel") or [None])[0],
                                                       (q.get("chatid") or [None])[0]),
                                                  ensure_ascii=False))
            if p.path == "/api/recebidas":
                return self._send(200, json.dumps(
                    recebidas_recentes((q.get("limite") or [50])[0]), ensure_ascii=False))
            if p.path == "/api/conversa":
                return self._send(200, json.dumps(conversa(q["chatid"][0]), ensure_ascii=False))
            if p.path == "/api/sugestao":
                d = conversa(q["chatid"][0])
                return self._send(200, json.dumps(
                    {"sugestao": sugere(d["linhas"], d["nome"])}, ensure_ascii=False))
            if p.path == "/api/envio":
                return self._send(200, json.dumps(
                    ENVIOS.get(q["eid"][0], {"estado": "desconhecido"}), ensure_ascii=False))
            if p.path == "/api/combo_status":
                return self._send(200, json.dumps(
                    COMBO_STATUS.get(q["fone"][0], {"estado": "desconhecido"}), ensure_ascii=False))
            self._send(404, "{}")
        except Exception as e:
            self._send(500, json.dumps({"erro": str(e)[:300]}, ensure_ascii=False))

    def _fundo(self, tarefa):
        """Dispara o envio numa thread e responde na hora. A Uazapi leva 1-3s
        de proposito (anti-bloqueio); esperar por ela travava a tela."""
        eid = uuid.uuid4().hex[:12]
        ENVIOS[eid] = {"estado": "enviando", "erro": ""}

        def roda():
            try:
                tarefa()
                ENVIOS[eid] = {"estado": "ok", "erro": ""}
            except Exception as e:
                ENVIOS[eid] = {"estado": "erro", "erro": str(e)[:150]}

        threading.Thread(target=roda, daemon=True).start()
        return self._send(200, json.dumps({"ok": True, "eid": eid}))

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            bruto = self.rfile.read(n).decode("utf-8") if n else ""
            d = json.loads(bruto) if bruto.strip() else {}   # /api/atualizar vai sem corpo
            if self.path == "/api/metas/config":
                origin = self.headers.get("Origin")
                if self.headers.get("Content-Type", "").split(";")[0] != "application/json" or (
                        origin and urllib.parse.urlparse(origin).netloc != self.headers.get("Host")):
                    return self._send(403, json.dumps({"erro": "Origem ou formato inválido."}))
                try:
                    goals = save_goals(DB, self.headers.get("X-Prospeccao-User"), d)
                    return self._send(200, json.dumps({"goals": goals, "canEdit": True}))
                except PermissionError as e:
                    return self._send(403, json.dumps({"erro": str(e)}))
                except ValueError as e:
                    return self._send(400, json.dumps({"erro": str(e)}))
            if self.path in ("/api/mensagem/editar", "/api/mensagem/excluir"):
                origin = self.headers.get("Origin")
                if self.headers.get("Content-Type", "").split(";")[0] != "application/json" or (
                        origin and urllib.parse.urlparse(origin).netloc != self.headers.get("Host")):
                    return self._send(403, json.dumps({"erro": "Origem ou formato inválido."}))
                try:
                    altera_mensagem(d.get("chatid"), d.get("id"), self.path.rsplit("/", 1)[-1],
                                   d.get("texto"))
                    return self._send(200, json.dumps({"ok": True}))
                except ValueError as e:
                    return self._send(400, json.dumps({"erro": str(e)}, ensure_ascii=False))
                except Exception as e:
                    return self._send(502, json.dumps({"erro": str(e)[:200]}, ensure_ascii=False))
            if self.path in ("/api/crm/registrar", "/api/crm/etapa", "/api/crm/observacao"):
                if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                    return self._send(415, json.dumps({"erro": "Use application/json."}))
                origin = self.headers.get("Origin")
                if origin and urllib.parse.urlparse(origin).netloc != self.headers.get("Host"):
                    return self._send(403, json.dumps({"erro": "Origem inválida."}))
                try:
                    if self.path.endswith("/observacao"):
                        note = CRM_CLIENT.add_note(d["chatid"], d.get("texto"))
                        return self._send(200, json.dumps({"ok": True, "note": note}, ensure_ascii=False))
                    if self.path.endswith("/etapa"):
                        data = move_pipeline_dados(d["chatid"], d["status"])
                    else:
                        CRM_CLIENT.ensure(d["chatid"], create=True)
                        data = dados_pipeline(d["chatid"])
                    return self._send(200, json.dumps(data, ensure_ascii=False))
                except Exception as e:
                    return self._send(400, json.dumps({"erro": str(e)[:200]}, ensure_ascii=False))
            if self.path == "/api/status":
                origin = self.headers.get("Origin")
                if self.headers.get("Content-Type", "").split(";")[0] != "application/json" or (
                        origin and urllib.parse.urlparse(origin).netloc != self.headers.get("Host")):
                    return self._send(403, json.dumps({"erro": "Origem ou formato inválido."}))
                mapping = {"MENSAGEM 1": "mensagem_1", "MENSAGEM 2": "mensagem_2", "MENSAGEM 3": "mensagem_3", "STAND-BY": "stand_by", "INTERESSADO": "interessado", "TESTE GRÁTIS": "testando",
                           "CONVERTIDO": "fechou", "PERDIDO": "perdida"}
                if d["status"] == "CONVERTIDO" and "plano" in d:
                    try:
                        return self._send(200, json.dumps(salva_plano_fechado(d["chatid"], d["plano"], d.get("valor_centavos"))))
                    except (ValueError, RuntimeError) as e:
                        return self._send(400, json.dumps({"erro": str(e)}, ensure_ascii=False))
                CRM_CLIENT.change(d["chatid"], mapping[d["status"]])
                return self._send(200, json.dumps({"ok": True}))
            if self.path == "/api/responsavel":
                origin = self.headers.get("Origin")
                if self.headers.get("Content-Type", "").split(";")[0] != "application/json" or (
                        origin and urllib.parse.urlparse(origin).netloc != self.headers.get("Host")):
                    return self._send(403, json.dumps({"erro": "Origem ou formato inválido."}))
                try:
                    responsavel = atribui_responsavel(d.get("chatid"), d.get("responsavel"))
                    return self._send(200, json.dumps({"ok": True, "responsavel": responsavel},
                                                      ensure_ascii=False))
                except ValueError as e:
                    return self._send(400, json.dumps({"erro": str(e)}, ensure_ascii=False))
            if self.path == "/api/ocultar":
                c = con()
                c.execute("UPDATE leads SET oculto=?, atualizado=? WHERE chatid=?",
                          (1 if d.get("oculto", True) else 0,
                           datetime.now(BRT).isoformat(), d["chatid"]))
                c.commit()
                print("  %s da fila: %s" % ("removido" if d.get("oculto", True) else "restaurado",
                                            d["chatid"].split("@")[0]))
                return self._send(200, json.dumps({"ok": True}))
            if self.path == "/api/atualizar":
                try:
                    n = sincroniza()
                    SYNC.update({"ultimo": datetime.now(BRT).strftime("%H:%M:%S"),
                                 "novas": n, "erro": ""})
                    return self._send(200, json.dumps({"novas": n}))
                except Exception as e:
                    SYNC["erro"] = str(e)[:120]
                    return self._send(200, json.dumps({"erro": str(e)[:120]},
                                                      ensure_ascii=False))
            if self.path == "/api/enviar":
                usuario = self.headers.get("X-Prospeccao-User")
                return self._fundo(lambda: envia_texto(d.get("chatid"), d["fone"], d["texto"],
                                                       nome_responsavel(usuario)))
            if self.path == "/api/disparo":
                origin = self.headers.get("Origin")
                if self.headers.get("Content-Type", "").split(";")[0] != "application/json" or (
                        origin and urllib.parse.urlparse(origin).netloc != self.headers.get("Host")):
                    return self._send(403, json.dumps({"erro": "Origem ou formato inválido."}))
                try:
                    usuario = self.headers.get("X-Prospeccao-User")
                    eid = inicia_disparo_massa(
                        d.get("chatids"), d.get("texto"), d.get("modo"),
                        nome_vendedor(usuario), nome_responsavel(usuario))
                    return self._send(200, json.dumps({"ok": True, "eid": eid}))
                except ValueError as e:
                    return self._send(400, json.dumps({"erro": str(e)}, ensure_ascii=False))
            if self.path == "/api/catalogo":
                return self._fundo(lambda: envia_midia_atendimento(lambda: manda_catalogo(d["fone"]), d["fone"], nome_responsavel(self.headers.get("X-Prospeccao-User"))))
            if self.path == "/api/catalogo/video":
                return self._fundo(lambda: envia_midia_atendimento(lambda: manda_video_catalogo(d["fone"]), d["fone"], nome_responsavel(self.headers.get("X-Prospeccao-User"))))
            if self.path == "/api/audio":
                a = next((x for x in AUDIOS if x["id"] == d["id"]), None)
                return self._fundo(lambda: envia_midia_atendimento(lambda: manda_audio(d["fone"], a), d["fone"], nome_responsavel(self.headers.get("X-Prospeccao-User"))))
            if self.path == "/api/gravado":
                fone = MEU_NUMERO if d.get("teste") else d["fone"]
                envia_midia_atendimento(lambda: uz("/send/media", {"number": fone, "type": "ptt", "file": d["b64"]}), fone, nome_responsavel(self.headers.get("X-Prospeccao-User")), bool(d.get("teste")))
                print("  -> áudio gravado (%s) para %s" % (d.get("seg", "?"), fone))
                return self._send(200, json.dumps({"ok": True, "para": fone}))
            if self.path == "/api/combo":
                combo = next((c for c in COMBOS if c["id"] == d["id"]), None)
                fone = d["fone"]

                def roda():
                    st = COMBO_STATUS[fone] = {"estado": "enviando", "enviados": [], "erro": ""}
                    for aid in combo["audios"]:
                        a = next((x for x in AUDIOS if x["id"] == aid), None)
                        try:
                            envia_midia_atendimento(lambda: manda_audio(fone, a), fone, nome_responsavel(self.headers.get("X-Prospeccao-User")))
                            st["enviados"].append(a["rotulo"])
                        except Exception as e:
                            st.update({"estado": "erro", "erro": str(e)[:150]})
                            return
                    st["estado"] = "ok"

                threading.Thread(target=roda, daemon=True).start()
                return self._send(200, json.dumps({"ok": True}))
            self._send(404, "{}")
        except Exception as e:
            self._send(200, json.dumps({"ok": False, "erro": str(e)[:200]}, ensure_ascii=False))


if __name__ == "__main__":
    cria_banco()
    migra_cache_antigo()
    if not GEMINI_KEY:
        print("AVISO: sem GEMINI_KEY — sem transcrição e sem sugestão de IA.\n")
    threading.Thread(target=LIVE_EVENTS.loop, daemon=True).start()
    threading.Thread(target=loop_sync, daemon=True).start()
    threading.Thread(target=CRM_CLIENT.loop, daemon=True).start()
    print("\nPainel de Atendimento em  http://localhost:%d" % PORTA)
    print("Ctrl+C para parar.\n")
    # "localhost" no Windows resolve para ::1 (IPv6) ANTES de 127.0.0.1. Se o
    # servidor so escuta em IPv4, o navegador tenta o IPv6, espera dar timeout e
    # so entao usa o IPv4 — 2 segundos de atraso em CADA requisicao. Escutamos
    # nos dois, so na maquina local.
    servidores = []
    for familia, endereco in ((socket.AF_INET, ("127.0.0.1", PORTA)),
                              (socket.AF_INET6, ("::1", PORTA))):
        try:
            class S(ThreadingHTTPServer):
                address_family = familia
                daemon_threads = True
            servidores.append(S(endereco, H))
        except OSError as e:
            print("  aviso: nao consegui escutar em %s (%s)" % (endereco[0], e))
    for sv in servidores[1:]:
        threading.Thread(target=sv.serve_forever, daemon=True).start()
    servidores[0].serve_forever()
