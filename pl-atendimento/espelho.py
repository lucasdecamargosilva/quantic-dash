"""Espelha o painel.db (mensagens + leads do Pipeline de Atendimento) no Supabase.

Grava pela RPC pl_atend_espelha (chave PL_IA_KEY); as tabelas pl_atend_mensagens e
pl_atend_leads só são lidas com service_role. Na 1ª passada manda todo o histórico;
depois, a cada minuto, só mensagens novas (por rowid) e leads que mudaram.
"""
import hashlib
import json
import os
import sqlite3
import time
import urllib.request

INTERVALO = 60
LOTE = 400


def _rpc(url, key, chave, mensagens, leads):
    body = json.dumps({"p_chave": chave, "p_mensagens": mensagens, "p_leads": leads}).encode("utf-8")
    r = urllib.request.Request(url.rstrip("/") + "/rest/v1/rpc/pl_atend_espelha", data=body, method="POST",
                               headers={"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=120) as x:
        return json.loads(x.read().decode("utf-8"))


def _cursor(c, nome, valor=None):
    c.execute("CREATE TABLE IF NOT EXISTS espelho_cursor (nome TEXT PRIMARY KEY, valor INTEGER)")
    if valor is None:
        r = c.execute("SELECT valor FROM espelho_cursor WHERE nome=?", (nome,)).fetchone()
        return r[0] if r else 0
    c.execute("INSERT INTO espelho_cursor(nome,valor) VALUES(?,?) ON CONFLICT(nome) DO UPDATE SET valor=excluded.valor", (nome, valor))
    c.commit()


def passada(db_path, url, key, chave, enviados_leads):
    c = sqlite3.connect(db_path, timeout=30)
    c.row_factory = sqlite3.Row
    try:
        total = 0
        ultimo = _cursor(c, "msg_rowid")
        while True:
            rows = c.execute("SELECT rowid, messageid, chatid, ts, from_me, tipo, texto, file_url, segundos, excluida "
                             "FROM mensagens WHERE rowid > ? ORDER BY rowid LIMIT ?", (ultimo, LOTE)).fetchall()
            if not rows:
                break
            _rpc(url, key, chave, [{k: r[k] for k in r.keys() if k != "rowid"} for r in rows], [])
            ultimo = rows[-1]["rowid"]
            _cursor(c, "msg_rowid", ultimo)
            total += len(rows)
        leads = [dict(r) for r in c.execute(
            "SELECT l.chatid, l.fone, l.nome, l.status, l.responsavel, l.ultimo_ts, l.ultimo_de, COALESCE(l.oculto,0) oculto, "
            "k.lead_id, p.plano, p.valor_centavos, p.fechado_em FROM leads l "
            "LEFT JOIN crm_links k ON k.chatid = l.chatid LEFT JOIN planos_fechados p ON p.chatid = l.chatid")]
        mudou = []
        for l in leads:
            h = hashlib.md5(json.dumps(l, sort_keys=True, default=str).encode()).hexdigest()
            if enviados_leads.get(l["chatid"]) != h:
                mudou.append((l, h))
        for i in range(0, len(mudou), LOTE):
            parte = mudou[i:i + LOTE]
            _rpc(url, key, chave, [], [l for l, _ in parte])
            for l, h in parte:
                enviados_leads[l["chatid"]] = h
        return total, len(mudou)
    finally:
        c.close()


def loop(db_path, url, key):
    chave = os.environ.get("PL_IA_KEY", "")
    if not (url and key and chave):
        print("  aviso: espelho do painel desligado (falta PL_CRM_URL/PL_CRM_KEY/PL_IA_KEY)")
        return
    enviados_leads = {}
    while True:
        try:
            m, l = passada(db_path, url, key, chave, enviados_leads)
            if m or l:
                print("  espelho Supabase: %d mensagens, %d leads" % (m, l))
        except Exception as e:
            print("  aviso: espelho Supabase falhou (%s)" % str(e)[:160])
        time.sleep(INTERVALO)
