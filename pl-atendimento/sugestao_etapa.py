"""Sugestão de etapa pelo Jev (TypeSafe) quando o lojista responde no WhatsApp.

Lê as últimas mensagens da conversa (áudio do lojista vira texto pelo transcritor do
painel), pergunta ao Jev em que etapa o lojista está e, se tiver confiança >= 0,8 e for
um avanço válido, grava uma sugestão. Nada muda sozinho: a Dione aplica ou ignora na
tela, e a decisão fica registrada para medir o acerto.
"""
import json
import os
import sqlite3
import time
import urllib.request

CONFIANCA = 0.8
INTERVALO = 20
POR_PASSADA = 8

CRITERIOS = {
    "mensagem": "Lojista ainda não demonstrou interesse claro: só cumprimentou, respondeu genérico, mandou ok/emoji, ou ainda não respondeu nossa abordagem",
    "interessado": "Lojista demonstrou interesse: perguntou preço, como funciona, pediu detalhes ou disse que quer conhecer",
    "teste_gratis": "Lojista aceitou testar / pediu para montar o catálogo ou instalar, ou mandou logo, e-mail ou dados para criarmos o teste",
    "stand_by": "Lojista pediu para falar depois, agora não pode, está viajando, vai pensar, retomar em outro momento",
    "perdido": "Lojista disse que não tem interesse, não quer, já tem solução, ou pediu para parar de mandar mensagem",
}
ETAPA = {"interessado": "INTERESSADO", "teste_gratis": "TESTE GRÁTIS", "stand_by": "STAND-BY", "perdido": "PERDIDO"}
# De onde cada sugestão pode partir (só avanço; nunca puxa um lead em teste de volta pra "Interessado").
INICIO = {"SEM ETAPA", "MENSAGEM 1", "MENSAGEM 2", "MENSAGEM 3", "CONTATAR", "STAND-BY", None, ""}
PODE_SAIR_DE = {
    "INTERESSADO": INICIO,
    "TESTE GRÁTIS": INICIO | {"INTERESSADO"},
    "STAND-BY": (INICIO - {"STAND-BY"}) | {"INTERESSADO", "TESTE GRÁTIS"},
    "PERDIDO": INICIO | {"INTERESSADO", "TESTE GRÁTIS"},
}


def init(c):
    c.execute("CREATE TABLE IF NOT EXISTS etapa_sugestao (chatid TEXT PRIMARY KEY, etapa TEXT, conf REAL, "
              "status_antes TEXT, ultimo_ts INTEGER, criado_ts INTEGER, decisao TEXT, decidido_ts INTEGER, decidido_por TEXT)")
    c.commit()


def _jev(conversa, chave):
    body = {"model": "jev-latest",
            "state": "Conversa de prospecção no WhatsApp entre NÓS (Provou Levou, provador virtual para lojas) e um LOJISTA:\n" + "\n".join(conversa),
            "questions": {"etapa": {"type": "choice", "instructions": "Em que etapa do funil está este lojista, pelo que ele disse?",
                                    "criteria": CRITERIOS}}}
    r = urllib.request.Request("https://api.typesafe.ai/v1/systemone", data=json.dumps(body).encode("utf-8"), method="POST",
                               headers={"Authorization": "Bearer " + chave, "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=15) as x:
        a = json.loads(x.read().decode("utf-8"))["answers"]["etapa"]
    return a["choice"], float(a["confidence"])


def _conversa(c, chatid, transcreve):
    ms = c.execute("SELECT from_me, tipo, texto, file_url FROM mensagens WHERE chatid=? AND excluida=0 "
                   "ORDER BY ts DESC LIMIT 12", (chatid,)).fetchall()
    linhas = []
    for m in reversed(ms):
        t = (m["texto"] or "").strip()
        if not t and m["tipo"] == "AudioMessage":
            t = ("[áudio] " + (transcreve(m["file_url"]) or "")).strip() if (not m["from_me"] and m["file_url"]) else "[áudio]"
        elif not t:
            t = {"ImageMessage": "[imagem]", "DocumentMessage": "[arquivo]", "VideoMessage": "[vídeo]"}.get(m["tipo"], "")
        if t:
            linhas.append(("NÓS" if m["from_me"] else "LOJISTA") + ": " + t[:400])
    return linhas


def passada(db_path, transcreve):
    chave = os.environ.get("JEV_API_KEY", "")
    if not chave:
        return 0
    c = sqlite3.connect(db_path, timeout=30)
    c.row_factory = sqlite3.Row
    try:
        init(c)
        alvos = c.execute(
            "SELECT l.chatid, l.status, l.ultimo_ts FROM leads l LEFT JOIN etapa_sugestao s ON s.chatid = l.chatid "
            "WHERE l.ultimo_de = 'lead' AND COALESCE(l.oculto,0) = 0 AND l.chatid NOT LIKE '%@g.us' "
            "AND COALESCE(l.status,'SEM ETAPA') IN ('SEM ETAPA','MENSAGEM 1','MENSAGEM 2','MENSAGEM 3','CONTATAR','STAND-BY','INTERESSADO','TESTE GRÁTIS') "
            "AND (s.chatid IS NULL OR s.ultimo_ts < l.ultimo_ts) ORDER BY l.ultimo_ts DESC LIMIT ?", (POR_PASSADA,)).fetchall()
        feitos = 0
        for a in alvos:
            conversa = _conversa(c, a["chatid"], transcreve)
            etapa, conf = None, 0.0
            if any(x.startswith("LOJISTA") for x in conversa):
                try:
                    escolha, conf = _jev(conversa, chave)
                    alvo = ETAPA.get(escolha)
                    if alvo and conf >= CONFIANCA and alvo != a["status"] and a["status"] in PODE_SAIR_DE[alvo]:
                        etapa = alvo
                except Exception as e:
                    print("  aviso: sugestão de etapa falhou (%s)" % str(e)[:120])
                    continue
            # grava mesmo sem sugestão: marca a mensagem como avaliada e não repete a chamada
            c.execute("INSERT INTO etapa_sugestao(chatid,etapa,conf,status_antes,ultimo_ts,criado_ts,decisao,decidido_ts,decidido_por) "
                      "VALUES(?,?,?,?,?,?,NULL,NULL,NULL) ON CONFLICT(chatid) DO UPDATE SET etapa=excluded.etapa, conf=excluded.conf, "
                      "status_antes=excluded.status_antes, ultimo_ts=excluded.ultimo_ts, criado_ts=excluded.criado_ts, "
                      "decisao=NULL, decidido_ts=NULL, decidido_por=NULL",
                      (a["chatid"], etapa, conf, a["status"], a["ultimo_ts"], int(time.time())))
            c.commit()
            feitos += 1
        return feitos
    finally:
        c.close()


def loop(db_path, transcreve, avisa):
    if not os.environ.get("JEV_API_KEY"):
        print("  aviso: sugestão de etapa desligada (sem JEV_API_KEY)")
        return
    while True:
        try:
            if passada(db_path, transcreve):
                avisa()
        except Exception as e:
            print("  aviso: sugestão de etapa falhou (%s)" % str(e)[:160])
        time.sleep(INTERVALO)


def pendente(c, chatid, status_atual):
    """Sugestão ainda válida para mostrar na conversa (some se a etapa já mudou)."""
    r = c.execute("SELECT etapa, conf, status_antes FROM etapa_sugestao WHERE chatid=? AND decisao IS NULL AND etapa IS NOT NULL",
                  (chatid,)).fetchone()
    if not r or (r["status_antes"] or "SEM ETAPA") != (status_atual or "SEM ETAPA"):
        return None
    return {"etapa": r["etapa"], "conf": round(r["conf"], 2)}


def decide(c, chatid, acao, usuario):
    if acao not in ("aplicada", "ignorada"):
        raise ValueError("Ação inválida.")
    r = c.execute("SELECT etapa FROM etapa_sugestao WHERE chatid=? AND decisao IS NULL AND etapa IS NOT NULL", (chatid,)).fetchone()
    if not r:
        raise ValueError("Essa sugestão não está mais disponível.")
    c.execute("UPDATE etapa_sugestao SET decisao=?, decidido_ts=?, decidido_por=? WHERE chatid=?",
              (acao, int(time.time()), (usuario or "").lower(), chatid))
    c.commit()
    return r["etapa"]
