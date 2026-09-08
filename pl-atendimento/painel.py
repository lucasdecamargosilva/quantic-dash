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
from crm_bridge import CRM, ETAPAS
from live_events import EventHub, LiveEvents
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

STATUS = ["INTERESSADO", "TESTE GRÁTIS", "CONVERTIDO", "PERDIDO"]
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

Planos (mensais, por quantidade de provas):
  25 provas = R$ 39 · 60 = R$ 69 · 120 = R$ 119 · 300 = R$ 229
  550 provas = R$ 399 · 1.100 = R$ 699 · 2.000 = R$ 1.190
Cada prova feita por um cliente desconta uma do pacote. São 7 dias grátis para testar;
no fim do teste recomendamos o pacote pelo volume real. Acima de 2.000 provas o plano
é sob medida — nesse caso diga que vai verificar, não invente valor.

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
 {"id": "pacoteprovas", "rotulo": "Valores + pacote de provas", "seg": 29,
  "url": "https://quantic.uazapi.com/files/c518fef5682458bb53099c6842230407b9648ab99b0e9e449884ad5eb505eca5.mp3",
  "resumo": "Explica o modelo de pacote e cita R$ 39/25 até R$ 229/300. NÃO menciona os pacotes de 550, 1.100 e 2.000 — pra esses, mande a tabela por escrito."},
]

# Tabela pra CONSULTA na tela — o Lucas olha enquanto conversa.
# (o texto de envio fica em TEXTOS['tabela'])
PLANOS = [
 {"provas": "25",    "preco": "R$ 39"},
 {"provas": "60",    "preco": "R$ 69"},
 {"provas": "120",   "preco": "R$ 119"},
 {"provas": "300",   "preco": "R$ 229"},
 {"provas": "550",   "preco": "R$ 399"},
 {"provas": "1.100", "preco": "R$ 699"},
 {"provas": "2.000", "preco": "R$ 1.190"},
]

COMBOS = [
 {"id": "combo_catalogo", "rotulo": "Combo: Catálogo → Valores → 7 dias",
  "audios": ["indicacatalogo", "pacoteprovas", "setedias"]},
]

CATALOGO_MENSAGENS = [
 "Perfeito, então o ideal para você seria o Provou Catálogo",
 "O Provou Catálogo funciona de forma simples: o lojista recebe um acesso próprio para "
 "cadastrar as fotos, nomes, preços e informações dos produtos. Depois, é só compartilhar "
 "o link do catálogo pelo WhatsApp, Instagram ou onde preferir. O cliente acessa, escolhe "
 "um produto, envia uma foto e se vê usando a peça com o provador virtual por IA.\n\n"
 "A instalação não tem custo e os planos começam em R$ 39 por mês\n\n"
 "Nós disponibilizamos 7 dias grátis para você testar o catálogo, só precisamos que nos "
 "envie o logo da loja, e-mail e o WhatsApp da loja para criarmos o catálogo.",
]

TEXTOS = [
 {"id": "reaquecer", "rotulo": "Reaquecer",
  "texto": "Oi, Conseguiu dar uma olhada no que te enviei sobre o Provador Virtual?"},
 {"id": "tabela", "rotulo": "Tabela de planos",
  "texto": "Nossos pacotes são mensais, por quantidade de provas:\n\n"
           "*25 provas* — R$ 39\n"
           "*60 provas* — R$ 69\n"
           "*120 provas* — R$ 119\n"
           "*300 provas* — R$ 229\n"
           "*550 provas* — R$ 399\n"
           "*1.100 provas* — R$ 699\n"
           "*2.000 provas* — R$ 1.190\n\n"
           "Cada prova que um cliente faz desconta uma do pacote. Não tem custo de "
           "instalação, a integração a gente faz no mesmo dia e você testa 7 dias grátis "
           "antes de escolher o pacote."},
 {"id": "dadoscatalogo", "rotulo": "Pedir logo + e-mail",
  "texto": "Pra eu montar o seu catálogo preciso só de duas coisas: o *logo da loja* "
           "(de preferência em arquivo, sem fundo) e um *e-mail* pro login. Pode mandar por aqui 😊"},
]


# ─────────────────────────── banco ───────────────────────────
DB = os.path.join(AQUI, "painel.db")
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
      ultimo_ts INTEGER, ultimo_de TEXT, atualizado TEXT);
    CREATE INDEX IF NOT EXISTS ix_lead_ts ON leads(ultimo_ts);
    CREATE TABLE IF NOT EXISTS transcricoes (url TEXT PRIMARY KEY, texto TEXT);
    """)
    CRM_CLIENT.setup()
    # migracao: bancos criados antes do "remover da fila" nao tem essa coluna
    if "oculto" not in [r[1] for r in c.execute("PRAGMA table_info(leads)")]:
        c.execute("ALTER TABLE leads ADD COLUMN oculto INTEGER DEFAULT 0")
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


# A Uazapi APAGA os arquivos depois de poucos dias: a URL do audio volta 404 e o
# /send/media responde 500. Por isso os audios padrao ficam GRAVADOS AQUI, em
# audios/<id>.mp3, e vao como base64. A URL so serve de reserva.
DIR_AUDIOS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audios")


def fonte_audio(a):
    """O que mandar no campo 'file': o mp3 salvo aqui (base64) ou a URL de reserva."""
    caminho = os.path.join(DIR_AUDIOS, a["id"] + ".mp3")
    if os.path.exists(caminho):
        with open(caminho, "rb") as f:
            return "data:audio/mpeg;base64," + base64.b64encode(f.read()).decode()
    return a["url"]


def manda_audio(fone, a):
    return uz("/send/media", {"number": fone, "type": "ptt", "file": fonte_audio(a)})


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
                " VALUES(?,?,?,'INTERESSADO',?,?,?)"
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


def fila(status=None):
    c = con()
    if status == "_ocultos":
        linhas = c.execute("SELECT * FROM leads WHERE oculto=1 ORDER BY ultimo_ts DESC").fetchall()
    elif status == "_sem_resposta_hoje":
        agora = datetime.now(BRT)
        inicio = int(agora.replace(hour=0, minute=0, second=0, microsecond=0).timestamp() * 1000)
        fim = inicio + 86400000
        linhas = c.execute(
            "SELECT * FROM leads WHERE ultimo_de='nos' AND ultimo_ts>=? AND ultimo_ts<?"
            " AND COALESCE(oculto,0)=0 AND status NOT IN ('CONVERTIDO','PERDIDO')"
            + SEM_SUPORTE + " ORDER BY ultimo_ts DESC", (inicio, fim)).fetchall()
    elif status:
        linhas = c.execute("SELECT * FROM leads WHERE status=? AND COALESCE(oculto,0)=0"
                           + SEM_SUPORTE +
                           " ORDER BY ultimo_ts DESC", (status,)).fetchall()
    else:
        linhas = c.execute(
            "SELECT * FROM leads WHERE ultimo_de='lead' AND COALESCE(oculto,0)=0"
            " AND status NOT IN ('CONVERTIDO','PERDIDO')"
            + SEM_SUPORTE + " ORDER BY ultimo_ts DESC").fetchall()
    out = []
    for r in linhas:
        u = c.execute("SELECT tipo,texto,segundos FROM mensagens WHERE chatid=?"
                      " ORDER BY ts DESC LIMIT 1", (r["chatid"],)).fetchone()
        dt = quando(r["ultimo_ts"])
        out.append({"chatid": r["chatid"], "fone": r["fone"], "nome": r["nome"],
                    "status": r["status"], "quando": dt.strftime("%d/%m %H:%M"),
                    "ha": humano(dt),
                    "ultima": (u["texto"] if u and u["texto"]
                               else rotulo(u["tipo"], u["segundos"]) if u else "")})
    return out


def contagem():
    c = con()
    d = {r["status"]: r["n"] for r in
         c.execute("SELECT status, COUNT(*) n FROM leads WHERE COALESCE(oculto,0)=0"
                   + SEM_SUPORTE + " GROUP BY status")}
    d["_esperando"] = c.execute(
        "SELECT COUNT(*) n FROM leads WHERE ultimo_de='lead' AND COALESCE(oculto,0)=0"
        " AND status NOT IN ('CONVERTIDO','PERDIDO')" + SEM_SUPORTE).fetchone()["n"]
    agora = datetime.now(BRT)
    inicio = int(agora.replace(hour=0, minute=0, second=0, microsecond=0).timestamp() * 1000)
    fim = inicio + 86400000
    d["_sem_resposta_hoje"] = c.execute(
        "SELECT COUNT(*) n FROM leads WHERE ultimo_de='nos' AND ultimo_ts>=? AND ultimo_ts<?"
        " AND COALESCE(oculto,0)=0 AND status NOT IN ('CONVERTIDO','PERDIDO')"
        + SEM_SUPORTE, (inicio, fim)).fetchone()["n"]
    d["_ocultos"] = c.execute(
        "SELECT COUNT(*) n FROM leads WHERE oculto=1").fetchone()["n"]
    return d


def conversa(chatid):
    c = con()
    lead = c.execute("SELECT * FROM leads WHERE chatid=?", (chatid,)).fetchone()
    ms = c.execute("SELECT * FROM mensagens WHERE chatid=? ORDER BY ts", (chatid,)).fetchall()
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
        linhas.append({"de": "loja" if m["from_me"] else "lead",
                       "hora": quando(m["ts"]).strftime("%d/%m %H:%M"),
                       "texto": t, "audio": aud})
    return {"linhas": linhas, "status": lead["status"] if lead else "INTERESSADO",
            "oculto": bool(lead and (lead["oculto"] if "oculto" in lead.keys() else 0)),
            "nome": lead["nome"] if lead else "", "fone": lead["fone"] if lead else "",
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
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);
font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif}
header{position:sticky;top:0;background:var(--topo);backdrop-filter:blur(8px);
border-bottom:1px solid var(--linha);padding:12px 20px;display:flex;gap:14px;align-items:center;z-index:9}
h1{font-size:17px;margin:0;font-weight:650}
.tag{font-size:12px;color:var(--fraco)}
.pulso{width:7px;height:7px;border-radius:50%;background:var(--ok);display:inline-block;
animation:bat 2s infinite}@keyframes bat{50%{opacity:.25}}
button{font:inherit;border:0;border-radius:9px;padding:9px 14px;cursor:pointer}
.btn{background:var(--roxo);color:#fff;font-weight:600}.btn:hover{background:var(--roxo2)}
.btn.sec{background:var(--chip);border:1px solid var(--linha);color:var(--txt);font-weight:500}
.wrap{max-width:1500px;margin:0 auto;padding:16px 20px;display:grid;
grid-template-columns:minmax(300px,380px) 1fr;gap:18px;align-items:start}
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
.lista{display:flex;flex-direction:column;gap:8px;max-height:calc(100vh - 120px);overflow:auto}
.item{background:var(--card);border:1px solid var(--linha);border-radius:11px;padding:11px 13px;cursor:pointer}
.item:hover{border-color:var(--roxo2)}.item.sel{border-color:var(--roxo);background:var(--hover)}
.item .top{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.item .nome{font-weight:600;font-size:14px}
.item .h{font-size:11.5px;color:var(--fraco);white-space:nowrap}
.item .msg{font-size:13px;color:var(--previa);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pill{font-size:10.5px;padding:1px 7px;border-radius:99px;border:1px solid var(--linha);color:var(--fraco)}
.pill.INTERESSADO{color:var(--alerta);border-color:#4a3a1a}
.pill.TESTE{color:var(--azul);border-color:#1e3a5f}
.pill.CONVERTIDO{color:var(--ok);border-color:#1a4a2a}
.pill.PERDIDO{color:var(--verm);border-color:#4a1a1a}
.painel{background:var(--card);border:1px solid var(--linha);border-radius:13px;padding:16px 18px;
position:sticky;top:70px}
.vazio{color:var(--fraco);text-align:center;padding:60px 20px}
.chat{max-height:42vh;overflow:auto;display:flex;flex-direction:column;gap:7px;margin:12px 0;padding-right:4px}
.bolha{max-width:82%;padding:7px 11px;border-radius:11px;font-size:13.5px;white-space:pre-wrap}
.bolha.lead{background:var(--bolha-lead);align-self:flex-start;border-bottom-left-radius:3px}
.bolha.loja{background:var(--bolha-loja);align-self:flex-end;border-bottom-right-radius:3px}
.bolha .meta{font-size:10.5px;color:var(--fraco);margin-top:3px}
.bolha .aud{color:var(--roxo2)}
textarea{width:100%;background:var(--campo);color:var(--txt);border:1px solid var(--linha);
border-radius:10px;padding:11px;font:inherit;min-height:96px;resize:vertical}
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
.planos{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:2px}
.planos td{padding:5px 8px;border-bottom:1px solid var(--linha)}
.planos tr:last-child td{border-bottom:0}
.planos td:first-child{color:var(--fraco)}
.planos td:last-child{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.planos tr:hover td{background:var(--hover)}
.obs{font-size:12px;color:var(--fraco);margin-top:7px;line-height:1.45}
.gravador{display:flex;gap:9px;align-items:center;flex-wrap:wrap}
.mic{background:#7f1d1d;color:#fff;font-weight:600}
.mic.rec{background:#dc2626;animation:bat 1s infinite}
.tempo{font-variant-numeric:tabular-nums;color:var(--fraco);font-size:13px;min-width:42px}
.spin{display:inline-block;width:13px;height:13px;border:2px solid var(--linha);border-top-color:var(--roxo);
border-radius:50%;animation:g .7s linear infinite;vertical-align:-2px}@keyframes g{to{transform:rotate(360deg)}}
.ok{color:var(--ok)}.err{color:#f87171}
</style></head><body>
<header>
  <h1>Atendimento</h1>
  <div class="filtros" id="filtros"></div>
  <button class="btn sec" id="btAtualizar" onclick="atualiza()"
          style="margin-left:auto;padding:6px 11px;font-size:13px" title="Buscar mensagens novas agora">🔄 Atualizar</button>
  <button class="btn sec" id="tema" onclick="viraTema()" style="padding:6px 11px;font-size:13px">🌙</button>
  <span class="tag" id="sync"><span class="pulso"></span> ao vivo</span>
</header>
<div class="wrap">
  <div class="lista" id="lista"></div>
  <div id="painel" class="painel"><div class="vazio">Escolha uma conversa.</div></div>
</div>
<script>
let pend=[], sel=null, selId=null, prontos={audios:[],textos:[],combos:[],status:[]},
    enviados=[], filtro='';

function aplicaTema(t){
  document.documentElement.dataset.tema=t;
  document.getElementById('tema').textContent = t==='claro' ? '🌙' : '☀️';
  localStorage.setItem('pl_tema',t);
}
function viraTema(){ aplicaTema(document.documentElement.dataset.tema==='claro'?'escuro':'claro'); }
aplicaTema(localStorage.getItem('pl_tema') || 'claro');   // padrao: claro

function esc(s){return (s??'').toString().replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function cls(s){return (s||'').split(' ')[0]}

async function carrega(){
  const r=await fetch('/api/fila'+(filtro?('?status='+encodeURIComponent(filtro)):''));
  pend=await r.json();
  const L=document.getElementById('lista'); L.innerHTML='';
  pend.forEach((p,i)=>{
    const d=document.createElement('div');
    d.className='item'+(p.chatid===selId?' sel':'');
    d.onclick=()=>abrir(i);
    d.innerHTML=`<div class="top"><span class="nome">${esc(p.nome||p.fone)}</span>
      <span class="h">${esc(p.ha)}</span></div>
      <div class="msg">${esc(p.ultima)}</div>
      <div style="margin-top:6px;display:flex;gap:5px">
        <span class="pill ${cls(p.status)}">${esc(p.status)}</span>
        <span class="pill">${esc(p.quando)}</span></div>`;
    L.appendChild(d);
  });
  if(selId){ const i=pend.findIndex(x=>x.chatid===selId); if(i>=0) sel=i; }
}

async function filtros(){
  let n={};
  try{ n=await (await fetch('/api/contagem')).json(); }catch(e){}
  const rot=[['','Esperando','_esperando'],
             ['_sem_resposta_hoje','Sem resposta hoje','_sem_resposta_hoje'],
             ...prontos.status.map(s=>[s,s,s]),
             ['_ocultos','Removidos','_ocultos']];
  document.getElementById('filtros').innerHTML=rot.map(([v,r,k])=>
    `<button class="fbtn${filtro===v?' on':''}" onclick="setFiltro('${v}')">${esc(r)}
       <b>${n[k]||0}</b></button>`).join('');
}
function setFiltro(v){ filtro=v; filtros(); carrega(); }

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
  const perto=ch.scrollHeight-ch.scrollTop-ch.clientHeight<80;
  const novo=bolhas(linhas)+bolhasPend(linhas);
  if(novo!==ch.innerHTML){ ch.innerHTML=novo; if(perto) ch.scrollTop=9e9; }
  ultimasLinhas=linhas;
}
let ultimasLinhas=[];
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

function bolhas(linhas){
  return linhas.map(l=>`<div class="bolha ${l.de==='lead'?'lead':'loja'}">${esc(l.texto)}
    <div class="meta">${esc(l.hora)}${l.audio?' · <span class="aud">áudio transcrito</span>':''}</div>
  </div>`).join('');
}

async function abrir(i){
  sel=i; selId=pend[i].chatid; enviados=[]; ultimasLinhas=[];
  document.querySelectorAll('.item').forEach((e,j)=>e.classList.toggle('sel',j===i));
  const p=pend[i], P=document.getElementById('painel');
  P.innerHTML='<div class="vazio"><span class="spin"></span> abrindo…</div>';
  const d=await (await fetch('/api/conversa?chatid='+encodeURIComponent(p.chatid))).json();
  if(selId!==p.chatid) return;
  ultimasLinhas=d.linhas;
  P.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
      <div><strong>${esc(d.nome||d.fone)}</strong>
        <div class="tag">${esc(d.fone)} · última ${esc(p.ha)} (${esc(p.quando)})</div></div>
      <a class="tag" href="https://wa.me/${esc(d.fone)}" target="_blank">WhatsApp ↗</a>
    </div>
    <section id="crm" class="crm-card" aria-live="polite"><div class="crm-head"><span class="crm-title">Carregando etapa do CRM…</span></div></section>
    <div class="chat" id="chat">${bolhas(d.linhas)}${bolhasPend(d.linhas)}</div>
    <div class="acoes" style="margin:8px 0 14px">
      <button class="btn sec" id="btCatalogo" onclick="mandaCatalogo(this)"
        title="Envia a apresentação do Provou Catálogo em duas mensagens separadas">💬 Provou Catálogo</button>
      ${prontos.combos.map(c=>`<button class="btn sec" onclick="mandaCombo('${c.id}',this)">🎧 Combo de áudios</button>`).join('')}
    </div>
    <textarea id="txt" placeholder="Digite sua mensagem…"></textarea>
    <div class="acoes">
      <button class="btn" id="ok" onclick="enviar()">Aprovar e enviar</button>
      <button class="btn sec" onclick="proxima()">Concluir</button>
      <button class="btn sec" id="btnOcultar" onclick="ocultar(${d.oculto?'false':'true'})"
        title="Some da fila mesmo que a pessoa mande mensagem nova">${
        d.oculto ? '↩︎ Restaurar na fila' : '🚫 Remover da fila'}</button>
      <span id="st" class="aviso"></span>
    </div>
    <div class="rapidos">
      <h3>Planos — para consultar</h3>
      <table class="planos">${prontos.planos.map(p=>
        `<tr><td>${esc(p.provas)} provas/mês</td><td>${esc(p.preco)}</td></tr>`).join('')}</table>
      <div class="obs">Cada prova feita por um cliente desconta uma do pacote.
        Sem custo de instalação · integração no mesmo dia · 7 dias grátis.<br>
        Acima de 2.000 provas o plano é sob medida.</div>
      <h3 style="margin-top:14px">Sequência pronta</h3>
      <div class="chips">${prontos.combos.map(c=>`
        <button class="chip combo" onclick="mandaCombo('${c.id}',this)">${esc(c.rotulo)}
          <small>os ${c.audios.length} áudios em ordem</small></button>`).join('')}</div>
      <h3 style="margin-top:14px">Áudios avulsos</h3>
      <div class="chips">${prontos.audios.map(a=>`
        <button class="chip aud" onclick="mandaAudio('${a.id}',this)">${esc(a.rotulo)} · ${a.seg}s
          <small>${esc(a.resumo)}</small></button>`).join('')}</div>
      <h3 style="margin-top:14px">Gravar áudio</h3>
      <div class="gravador">
        <button class="mic" id="mic" onclick="toggleMic()">🎙️ Gravar</button>
        <span class="tempo" id="tempo">0:00</span>
        <audio id="previa" controls style="display:none;height:34px"></audio>
        <button class="btn" id="envAud" style="display:none" onclick="enviaGravado(false)">Enviar</button>
        <button class="btn sec" id="testAud" style="display:none" onclick="enviaGravado(true)">Testar em mim</button>
        <button class="btn sec" id="descAud" style="display:none" onclick="descarta()">Descartar</button>
      </div>
      <h3 style="margin-top:14px">Textos prontos</h3>
      <div class="chips">${prontos.textos.map(t=>`
        <button class="chip" onclick="poeTexto('${t.id}')">${esc(t.rotulo)}</button>`).join('')}</div>
    </div>`;
  document.getElementById('chat').scrollTop=9e9;
  carregaCRM(p.chatid);
}

let crmOcupado=false, crmConsulta=0;
function desenhaCRM(d){
  const box=document.getElementById('crm'); if(!box) return;
  const lead=d.lead;
  box.innerHTML='<div class="crm-head"><div class="crm-heading"><span class="crm-eyebrow">QUANTIC DASH</span>'+
    '<span class="crm-title">Oportunidade no CRM</span></div></div>'+
    '<div class="crm-controls"></div>';
  const head=box.querySelector('.crm-head'), controls=box.querySelector('.crm-controls');
  if(!lead){
    const b=document.createElement('button'); b.className='crm-btn'; b.textContent='Registrar no CRM';
    b.onclick=()=>salvaCRM('/api/crm/registrar'); controls.appendChild(b); return;
  }
  const stage=document.createElement('label'); stage.className='crm-stage-control';
  stage.appendChild(document.createTextNode('Etapa'));
  const select=document.createElement('select'); select.dataset.saved=lead.status; select.className='crm-select'; select.setAttribute('aria-label','Etapa no CRM');
  for(const [value,label] of Object.entries(d.etapas)){
    const option=new Option(label,value); option.selected=value===lead.status; select.add(option);
  }
  select.onchange=()=>salvaCRM('/api/crm/etapa',select.value);
  stage.appendChild(select); head.appendChild(stage);

  const form=document.createElement('form'); form.className='crm-note';
  const input=document.createElement('input'); input.className='crm-note-input'; input.type='text';
  input.maxLength=2000; input.placeholder='Adicionar observação à oportunidade…';
  input.setAttribute('aria-label','Observação da oportunidade no CRM');
  const button=document.createElement('button'); button.className='crm-btn'; button.type='submit'; button.textContent='Salvar observação';
  form.append(input,button); form.onsubmit=e=>salvaObservacao(e,form);
  const feedback=document.createElement('div'); feedback.className='crm-feedback'; feedback.setAttribute('role','status');
  controls.append(form,feedback);
}
async function carregaCRM(chatid=selId){
  if(!chatid || crmOcupado) return;
  const consulta=++crmConsulta;
  try{
    const response=await fetch('/api/crm?chatid='+encodeURIComponent(chatid));
    const d=await response.json(); if(!response.ok || d.erro) throw new Error(d.erro||'Falha ao consultar CRM');
    if(selId===chatid && consulta===crmConsulta && !crmOcupado) desenhaCRM(d);
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
  form.querySelectorAll('button,input').forEach(el=>el.disabled=true);
  feedback.className='crm-feedback'; feedback.textContent='Salvando…';
  try{
    const response=await fetch('/api/crm/observacao',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chatid,texto})});
    const d=await response.json(); if(!response.ok || d.erro) throw new Error(d.erro||'Não foi possível salvar a observação');
    if(selId===chatid){ input.value=''; feedback.textContent='Observação salva no CRM.'; }
  }catch(e){
    if(selId===chatid){ feedback.className='crm-feedback err'; feedback.textContent=e.message; }
  }finally{
    crmOcupado=false;
    if(selId===chatid) form.querySelectorAll('button,input').forEach(el=>el.disabled=false);
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
  const cx=document.getElementById('txt'), t=cx.value.trim(); if(!t) return;
  const st=document.getElementById('st');
  cx.value='';                                  // ja libera pra digitar a proxima
  const item={chatid:selId,tipo:'texto',texto:t,estado:'enviando',t:Date.now()};
  pendentes.push(item); desenhaChat(ultimasLinhas);   // aparece na hora
  st.textContent='';
  const d=await (await fetch('/api/enviar',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({fone:pend[sel].fone,texto:t})})).json();
  if(!d.eid){ item.estado='erro'; item.erro=d.erro||'falhou'; desenhaChat(ultimasLinhas); return; }
  const r=await segue(d.eid,item);
  if(r.estado==='erro') st.innerHTML='<span class="err">'+esc(r.erro||'')+'</span>';
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
async function mandaCatalogo(botao){
  const st=document.getElementById('st'), textos=prontos.catalogo||[];
  if(textos.length!==2) return;
  botao.disabled=true; st.innerHTML='<span class="spin"></span> enviando 2 mensagens…';
  const items=textos.map(t=>({chatid:selId,tipo:'texto',texto:t,estado:'enviando',t:Date.now()}));
  pendentes.push(...items); desenhaChat(ultimasLinhas);
  const d=await (await fetch('/api/catalogo',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({fone:pend[sel].fone})})).json();
  if(!d.eid){
    items.forEach(x=>{x.estado='erro';x.erro=d.erro||'falhou'});
    desenhaChat(ultimasLinhas); st.innerHTML='<span class="err">'+esc(d.erro||'falhou')+'</span>';
    botao.disabled=false; return;
  }
  const r=await segue(d.eid,items[1]);
  items.forEach(x=>{x.estado=r.estado;x.erro=r.erro||''}); desenhaChat(ultimasLinhas);
  if(r.estado==='ok'){
    botao.classList.add('enviado'); st.innerHTML='<span class="ok">2 mensagens enviadas ✓</span>';
  } else st.innerHTML='<span class="err">'+esc(r.erro||'falhou')+'</span>';
  botao.disabled=false;
}
function poeTexto(id){ const t=prontos.textos.find(x=>x.id===id);
  const c=document.getElementById('txt'); c.value=t.texto; c.focus(); }
function proxima(){ selId=null; sel=null; carrega();
  document.getElementById('painel').innerHTML='<div class="vazio">Escolha a próxima.</div>'; }

let rec=null,pedacos=[],t0=0,cron=null,blobGravado=null;
async function toggleMic(){
  const b=document.getElementById('mic'), st=document.getElementById('st');
  if(rec&&rec.state==='recording'){ rec.stop(); return; }
  let stream;
  try{ stream=await navigator.mediaDevices.getUserMedia({audio:true}); }
  catch(e){ st.innerHTML='<span class="err">microfone: '+esc(e.name)+'</span>'; return; }
  pedacos=[]; blobGravado=null; rec=new MediaRecorder(stream);
  rec.ondataavailable=e=>{ if(e.data.size) pedacos.push(e.data); };
  rec.onstop=()=>{ clearInterval(cron); stream.getTracks().forEach(t=>t.stop());
    blobGravado=new Blob(pedacos,{type:rec.mimeType||'audio/webm'});
    const p=document.getElementById('previa'); p.src=URL.createObjectURL(blobGravado); p.style.display='';
    ['envAud','testAud','descAud'].forEach(i=>document.getElementById(i).style.display='');
    b.textContent='🎙️ Gravar'; b.classList.remove('rec'); };
  rec.start(); t0=Date.now(); b.textContent='⏹ Parar'; b.classList.add('rec');
  document.getElementById('previa').style.display='none';
  ['envAud','testAud','descAud'].forEach(i=>document.getElementById(i).style.display='none');
  cron=setInterval(()=>{ const s=Math.floor((Date.now()-t0)/1000);
    document.getElementById('tempo').textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); },200);
}
function descarta(){ blobGravado=null;
  document.getElementById('previa').style.display='none';
  document.getElementById('tempo').textContent='0:00';
  ['envAud','testAud','descAud'].forEach(i=>document.getElementById(i).style.display='none'); }
async function enviaGravado(teste){
  if(!blobGravado) return;
  const st=document.getElementById('st');
  const bt=document.getElementById(teste?'testAud':'envAud'); bt.disabled=true;
  st.innerHTML='<span class="spin"></span> enviando áudio'+(teste?' pra você':'')+'…';
  const b64=await new Promise(r=>{const fr=new FileReader();
    fr.onload=()=>r(fr.result.split(',')[1]); fr.readAsDataURL(blobGravado);});
  const seg=document.getElementById('tempo').textContent;
  const d=await (await fetch('/api/gravado',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({fone:pend[sel].fone,b64,seg,teste})})).json();
  bt.disabled=false;
  if(d.ok){ st.innerHTML='<span class="ok">áudio enviado'+(teste?' pra você':'')+' ✓</span>';
    if(!teste){ enviados.push('áudio '+seg); descarta(); } }
  else st.innerHTML='<span class="err">'+esc(d.erro||'')+'</span>';
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

(async()=>{ prontos=await (await fetch('/api/prontos')).json(); await filtros(); await carrega(); conectaEventos(); })();

let eventosTelaAtivos=false, atualizacaoEvento=null;
async function atualizaPorEvento(){
  if(atualizacaoEvento) return;
  atualizacaoEvento=setTimeout(async()=>{
    atualizacaoEvento=null;
    await Promise.all([carrega(),filtros()]);
    if(!selId||!document.getElementById('chat')) return;
    const cid=selId;
    try{
      const r=await fetch('/api/conversa?chatid='+encodeURIComponent(cid));
      if(r.ok&&selId===cid) desenhaChat((await r.json()).linhas);
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
setInterval(()=>{ if(!eventosTelaAtivos){ carrega(); filtros(); } },5000);
let chatAtualizando=false;
setInterval(async()=>{
  if(eventosTelaAtivos||chatAtualizando||!selId||!document.getElementById('chat')||document.hidden) return;
  const cid=selId; chatAtualizando=true;
  try{
    const r=await fetch('/api/conversa?chatid='+encodeURIComponent(cid));
    if(!r.ok) return;
    const d=await r.json();
    if(selId===cid) desenhaChat(d.linhas);
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

    def do_GET(self):
        try:
            p = urllib.parse.urlparse(self.path)
            q = urllib.parse.parse_qs(p.query)
            if p.path == "/":
                return self._send(200, PAGINA, "text/html; charset=utf-8")
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
                lead = CRM_CLIENT.ensure(q["chatid"][0])
                return self._send(200, json.dumps({"lead": lead, "etapas": ETAPAS}, ensure_ascii=False))
            if p.path == "/api/prontos":
                return self._send(200, json.dumps(
                    {"audios": AUDIOS, "textos": TEXTOS, "combos": COMBOS,
                     "catalogo": CATALOGO_MENSAGENS, "status": STATUS,
                     "planos": PLANOS},
                    ensure_ascii=False))
            if p.path == "/api/sync":
                return self._send(200, json.dumps({**SYNC, "crm": CRM_CLIENT.sync_status, "events": dict(LIVE_EVENTS.status)}, ensure_ascii=False))
            if p.path == "/api/contagem":
                return self._send(200, json.dumps(contagem(), ensure_ascii=False))
            if p.path == "/api/fila":
                return self._send(200, json.dumps(fila((q.get("status") or [None])[0]),
                                                  ensure_ascii=False))
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
                    lead = (CRM_CLIENT.change(d["chatid"], d["status"])
                            if self.path.endswith("/etapa") else CRM_CLIENT.ensure(d["chatid"], create=True))
                    return self._send(200, json.dumps({"lead": lead, "etapas": ETAPAS}, ensure_ascii=False))
                except Exception as e:
                    return self._send(400, json.dumps({"erro": str(e)[:200]}, ensure_ascii=False))
            if self.path == "/api/status":
                origin = self.headers.get("Origin")
                if self.headers.get("Content-Type", "").split(";")[0] != "application/json" or (
                        origin and urllib.parse.urlparse(origin).netloc != self.headers.get("Host")):
                    return self._send(403, json.dumps({"erro": "Origem ou formato inválido."}))
                mapping = {"INTERESSADO": "interessado", "TESTE GRÁTIS": "testando",
                           "CONVERTIDO": "fechou", "PERDIDO": "perdida"}
                CRM_CLIENT.change(d["chatid"], mapping[d["status"]])
                return self._send(200, json.dumps({"ok": True}))
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
                return self._fundo(lambda: uz("/send/text",
                                              {"number": d["fone"], "text": d["texto"]}))
            if self.path == "/api/catalogo":
                def envia_catalogo():
                    for texto in CATALOGO_MENSAGENS:
                        uz("/send/text", {"number": d["fone"], "text": texto})
                return self._fundo(envia_catalogo)
            if self.path == "/api/audio":
                a = next((x for x in AUDIOS if x["id"] == d["id"]), None)
                return self._fundo(lambda: manda_audio(d["fone"], a))
            if self.path == "/api/gravado":
                fone = MEU_NUMERO if d.get("teste") else d["fone"]
                uz("/send/media", {"number": fone, "type": "ptt", "file": d["b64"]})
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
                            manda_audio(fone, a)
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
