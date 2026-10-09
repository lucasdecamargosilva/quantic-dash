"""Jev (TypeSafe) organizando o funil de prospecção pelas conversas do WhatsApp.

Para cada conversa com mensagem nova (e, na 1ª passada, todas as do funil), lê as últimas
mensagens (áudio do lojista vira texto pelo transcritor do painel) e pergunta ao Jev em que
etapa o lojista está. Só avança, nunca volta. Com confiança >= 0,9 em etapas seguras
(Em conversa, Interessado, Aguardando dados, Stand-by) MOVE SOZINHO; de 0,8 a 0,9, ou
Perdido, vira SUGESTÃO na conversa (a Dione aplica ou ignora). Tudo fica registrado em
etapa_sugestao (decisao: auto / aplicada / ignorada) e espelhado no Supabase.
"""
import json
import os
import re
import sqlite3
import time
import urllib.request

CONFIANCA = 0.8          # mostra sugestão
CONFIANCA_AUTO = 0.9     # move sozinho (exceto Perdido)
AUTO_OK = {"EM CONVERSA", "INTERESSADO", "AGUARDANDO DADOS", "STAND-BY"}
# Texto pronto que o WhatsApp preenche quando o lojista clica no anúncio: não é interesse real ainda.
ANUNCIO = re.compile(r"(?i)^\s*oi!?\s*gostaria de saber mais sobre o (provador virtual|provou cat[aá]logo)")
INTERVALO = 20
POR_PASSADA = 8

CRITERIOS = {
    "novo": "Lojista ainda não conversou de verdade: só clicou no anúncio, só cumprimentou, mandou ok/emoji, ou ainda não respondeu nossa abordagem",
    "em_conversa": "Lojista está conversando: respondeu nossas perguntas (onde vende, plataforma, tipo de loja) ou tirou uma dúvida inicial, sem pedir preço nem demonstrar interesse claro",
    "interessado": "Lojista demonstrou interesse: perguntou preço, como funciona, pediu detalhes, pediu ligação/reunião ou disse que quer conhecer",
    "aguardando_dados": "Lojista aceitou testar / pediu para montar o catálogo ou instalar, ou mandou logo, e-mail ou dados para criarmos o teste",
    "stand_by": "Lojista pediu para falar depois, agora não pode, está viajando, vai pensar, retomar em outro momento",
    "perdido": "Lojista disse que não tem interesse, não quer, já tem solução, achou caro e desistiu, ou pediu para parar de mandar mensagem",
}
ETAPA = {"em_conversa": "EM CONVERSA", "interessado": "INTERESSADO", "aguardando_dados": "AGUARDANDO DADOS",
         "stand_by": "STAND-BY", "perdido": "PERDIDO"}
# De onde cada etapa pode partir (só avanço; nunca puxa um lead de volta).
PODE_SAIR_DE = {
    "EM CONVERSA": {"NOVO", "STAND-BY"},
    "INTERESSADO": {"NOVO", "EM CONVERSA", "STAND-BY"},
    "AGUARDANDO DADOS": {"NOVO", "EM CONVERSA", "INTERESSADO", "STAND-BY"},
    "STAND-BY": {"NOVO", "EM CONVERSA", "INTERESSADO", "AGUARDANDO DADOS"},
    "PERDIDO": {"NOVO", "EM CONVERSA", "INTERESSADO", "AGUARDANDO DADOS", "STAND-BY"},
}
AVALIA = ("NOVO", "EM CONVERSA", "INTERESSADO", "AGUARDANDO DADOS", "STAND-BY")


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
        if t and not m["from_me"] and ANUNCIO.search(t):
            t = "(clicou no anúncio; mensagem automática, ainda sem resposta própria)"
        if t:
            linhas.append(("NÓS" if m["from_me"] else "LOJISTA") + ": " + t[:400])
    return linhas


def passada(db_path, transcreve, mover=None):
    chave = os.environ.get("JEV_API_KEY", "")
    if not chave:
        return 0
    c = sqlite3.connect(db_path, timeout=30)
    c.row_factory = sqlite3.Row
    try:
        init(c)
        alvos = c.execute(
            "SELECT l.chatid, l.status, l.ultimo_ts FROM leads l LEFT JOIN etapa_sugestao s ON s.chatid = l.chatid "
            "WHERE COALESCE(l.oculto,0) = 0 AND l.chatid NOT LIKE '%@g.us' "
            "AND COALESCE(l.status,'NOVO') IN (" + ",".join("'%s'" % x for x in AVALIA) + ") "
            "AND (s.chatid IS NULL OR s.ultimo_ts < l.ultimo_ts) "
            # quem respondeu agora vem primeiro; depois o resto do funil (1ª passada)
            "ORDER BY (l.ultimo_de = 'lead') DESC, l.ultimo_ts DESC LIMIT ?", (POR_PASSADA,)).fetchall()
        feitos = 0
        for a in alvos:
            conversa = _conversa(c, a["chatid"], transcreve)
            etapa, conf = None, 0.0
            proprias = [x for x in conversa if x.startswith("LOJISTA") and "mensagem automática" not in x]
            if proprias:
                try:
                    escolha, conf = _jev(conversa, chave)
                    alvo = ETAPA.get(escolha)
                    if alvo and conf >= CONFIANCA and alvo != a["status"] and (a["status"] or "NOVO") in PODE_SAIR_DE[alvo]:
                        etapa = alvo
                except Exception as e:
                    print("  aviso: sugestão de etapa falhou (%s)" % str(e)[:120])
                    continue
            decisao = None
            if etapa and mover and conf >= CONFIANCA_AUTO and etapa in AUTO_OK:
                try:
                    mover(a["chatid"], etapa)
                    decisao = "auto"
                except Exception as e:
                    print("  aviso: Jev não conseguiu mover %s (%s)" % (a["chatid"][-12:], str(e)[:100]))
            # grava mesmo sem sugestão: marca a mensagem como avaliada e não repete a chamada
            c.execute("INSERT INTO etapa_sugestao(chatid,etapa,conf,status_antes,ultimo_ts,criado_ts,decisao,decidido_ts,decidido_por) "
                      "VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(chatid) DO UPDATE SET etapa=excluded.etapa, conf=excluded.conf, "
                      "status_antes=excluded.status_antes, ultimo_ts=excluded.ultimo_ts, criado_ts=excluded.criado_ts, "
                      "decisao=excluded.decisao, decidido_ts=excluded.decidido_ts, decidido_por=excluded.decidido_por",
                      (a["chatid"], etapa, conf, a["status"], a["ultimo_ts"], int(time.time()),
                       decisao, int(time.time()) if decisao else None, "jev" if decisao else None))
            c.commit()
            feitos += 1
        return feitos
    finally:
        c.close()


def loop(db_path, transcreve, avisa, mover=None):
    if not os.environ.get("JEV_API_KEY"):
        print("  aviso: sugestão de etapa desligada (sem JEV_API_KEY)")
        return
    while True:
        try:
            if passada(db_path, transcreve, mover):
                avisa()
        except Exception as e:
            print("  aviso: sugestão de etapa falhou (%s)" % str(e)[:160])
        time.sleep(INTERVALO)


def pendente(c, chatid, status_atual):
    """Sugestão ainda válida para mostrar na conversa (some se a etapa já mudou)."""
    r = c.execute("SELECT etapa, conf, status_antes FROM etapa_sugestao WHERE chatid=? AND decisao IS NULL AND etapa IS NOT NULL",
                  (chatid,)).fetchone()
    if not r or (r["status_antes"] or "NOVO") != (status_atual or "NOVO"):
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
