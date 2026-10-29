"""Tarefas pessoais do CRM (aba Tarefas). Cada login vê e mexe só nas suas:
o dono vem do X-Prospeccao-User que o proxy grava a partir da sessão, nunca do corpo."""
import uuid
from datetime import datetime, timezone, timedelta

BRT = timezone(timedelta(hours=-3))
DONOS = {"lucas": "Lucas", "dione": "Dione"}
PRIORIDADES = ("baixa", "normal", "alta")
ESTADOS = ("a_fazer", "em_progresso", "feito")   # colunas do quadro


def initialize(c):
    c.execute('''CREATE TABLE IF NOT EXISTS tarefas (
        id TEXT PRIMARY KEY, dono TEXT NOT NULL, titulo TEXT NOT NULL, notas TEXT DEFAULT '',
        prazo TEXT, prioridade TEXT DEFAULT 'normal', feita INTEGER DEFAULT 0,
        criada_em TEXT NOT NULL, atualizada_em TEXT NOT NULL, feita_em TEXT)''')
    c.execute("CREATE INDEX IF NOT EXISTS ix_tarefas_dono ON tarefas(dono, feita)")
    if "estado" not in [r[1] for r in c.execute("PRAGMA table_info(tarefas)")]:
        c.execute("ALTER TABLE tarefas ADD COLUMN estado TEXT DEFAULT 'a_fazer'")
        c.execute("UPDATE tarefas SET estado = CASE WHEN feita=1 THEN 'feito' ELSE 'a_fazer' END")
    # hora + alarme (migração aditiva: colunas opcionais, nada é apagado)
    cols = [r[1] for r in c.execute("PRAGMA table_info(tarefas)")]
    for col, tipo in (("hora", "TEXT"), ("aviso_min", "INTEGER"), ("aviso_em", "TEXT"),
                      ("aviso_disparado_em", "TEXT"), ("adiado_ate", "TEXT")):
        if col not in cols:
            c.execute(f"ALTER TABLE tarefas ADD COLUMN {col} {tipo}")
    c.execute("CREATE INDEX IF NOT EXISTS ix_tarefas_aviso ON tarefas(dono, aviso_disparado_em, aviso_em)")
    c.commit()


def _dono(usuario):
    dono = DONOS.get((usuario or "").strip().lower())
    if not dono:
        raise PermissionError("Login sem acesso às tarefas.")
    return dono


def lista(c, usuario):
    dono = _dono(usuario)
    rows = c.execute("SELECT * FROM tarefas WHERE dono=? ORDER BY feita, "
                     "CASE WHEN prazo IS NULL OR prazo='' THEN 1 ELSE 0 END, prazo, criada_em DESC", (dono,)).fetchall()
    return {"dono": dono, "tarefas": [dict(r) for r in rows]}


def salva(c, usuario, d):
    dono = _dono(usuario)
    titulo = str(d.get("titulo") or "").strip()[:200]
    if not titulo:
        raise ValueError("Escreva o que precisa ser feito.")
    notas = str(d.get("notas") or "")[:5000]
    prazo = str(d.get("prazo") or "").strip()[:10] or None
    if prazo:
        try:
            datetime.strptime(prazo, "%Y-%m-%d")
        except ValueError:
            raise ValueError("Prazo inválido.")
    hora = str(d.get("hora") or "").strip()[:5] or None
    if hora:
        try:
            datetime.strptime(hora, "%H:%M")
        except ValueError:
            raise ValueError("Hora inválida.")
        if not prazo:
            raise ValueError("Escolha a data para usar a hora.")
    aviso_min = _aviso_min(d.get("aviso_min"), hora)
    aviso_em = _aviso_em(prazo, hora, aviso_min)
    prioridade = d.get("prioridade") if d.get("prioridade") in PRIORIDADES else "normal"
    agora = datetime.now(BRT).isoformat()
    tid = str(d.get("id") or "").strip()
    if tid:
        atual = c.execute("SELECT feita, estado, aviso_em FROM tarefas WHERE id=? AND dono=?", (tid, dono)).fetchone()
        if not atual:
            raise ValueError("Tarefa não encontrada.")
        if d.get("estado") in ESTADOS:
            estado = d["estado"]
        elif "feita" in d:
            estado = "feito" if d.get("feita") else "a_fazer"
        else:
            estado = atual["estado"] or ("feito" if atual["feita"] else "a_fazer")
        feita = estado == "feito"
        c.execute("UPDATE tarefas SET titulo=?, notas=?, prazo=?, prioridade=?, feita=?, estado=?, atualizada_em=?, "
                  "feita_em=CASE WHEN ?=1 THEN COALESCE(feita_em, ?) ELSE NULL END WHERE id=? AND dono=?",
                  (titulo, notas, prazo, prioridade, int(feita), estado, agora, int(feita), agora, tid, dono))
        if "hora" in d or "aviso_min" in d:   # cartão arrastado sem esses campos não mexe no alarme
            mudou = (atual["aviso_em"] or None) != aviso_em
            c.execute("UPDATE tarefas SET hora=?, aviso_min=?, aviso_em=?" +
                      (", aviso_disparado_em=NULL, adiado_ate=NULL" if mudou else "") + " WHERE id=? AND dono=?",
                      (hora, aviso_min, aviso_em, tid, dono))
    else:
        tid = uuid.uuid4().hex[:12]
        estado = d.get("estado") if d.get("estado") in ("a_fazer", "em_progresso") else "a_fazer"
        c.execute("INSERT INTO tarefas(id,dono,titulo,notas,prazo,prioridade,feita,estado,criada_em,atualizada_em,"
                  "hora,aviso_min,aviso_em) VALUES(?,?,?,?,?,?,0,?,?,?,?,?,?)",
                  (tid, dono, titulo, notas, prazo, prioridade, estado, agora, agora, hora, aviso_min, aviso_em))
    c.commit()
    return {"ok": True, "id": tid}


AVISOS_MIN = (0, 15, 30, 60, 120, 1440)   # na hora, 15 min, 30 min, 1 h, 2 h, 1 dia antes (+ personalizado)


def _aviso_min(v, hora):
    """Minutos de antecedência do alarme; None = sem aviso. Sem hora não há alarme."""
    if v is None or v == "" or not hora:
        return None
    try:
        n = int(v)
    except (TypeError, ValueError):
        raise ValueError("Aviso inválido.")
    if n < 0 or n > 60 * 24 * 30:
        raise ValueError("Aviso: até 30 dias antes.")
    return n


def _aviso_em(prazo, hora, aviso_min):
    if aviso_min is None or not prazo or not hora:
        return None
    quando = datetime.strptime(f"{prazo} {hora}", "%Y-%m-%d %H:%M").replace(tzinfo=BRT)
    return (quando - timedelta(minutes=aviso_min)).isoformat()


def avisos(c, usuario):
    """Alarmes devidos (até 24 h de atraso) e ainda não disparados. Já marca como disparados
    na mesma transação, pra duas abas abertas não tocarem o mesmo aviso."""
    dono = _dono(usuario)
    agora = datetime.now(BRT)
    limite = (agora - timedelta(hours=24)).isoformat()
    rows = c.execute("SELECT id, titulo, notas, prazo, hora, aviso_min, aviso_em, adiado_ate FROM tarefas "
                     "WHERE dono=? AND estado!='feito' AND aviso_em IS NOT NULL AND aviso_disparado_em IS NULL "
                     "AND COALESCE(adiado_ate, aviso_em) >= ?", (dono, limite)).fetchall()
    devidos = [dict(r) for r in rows if datetime.fromisoformat(r["adiado_ate"] or r["aviso_em"]) <= agora]
    for r in devidos:
        c.execute("UPDATE tarefas SET aviso_disparado_em=? WHERE id=? AND dono=?", (agora.isoformat(), r["id"], dono))
    c.commit()
    return {"avisos": devidos, "agora": agora.isoformat()}


def adia(c, usuario, tid, minutos=10):
    dono = _dono(usuario)
    try:
        m = max(1, min(int(minutos or 10), 24 * 60))
    except (TypeError, ValueError):
        m = 10
    ate = (datetime.now(BRT) + timedelta(minutes=m)).isoformat()
    n = c.execute("UPDATE tarefas SET adiado_ate=?, aviso_disparado_em=NULL WHERE id=? AND dono=?",
                  (ate, str(tid or ""), dono)).rowcount
    c.commit()
    if not n:
        raise ValueError("Tarefa não encontrada.")
    return {"ok": True, "adiado_ate": ate}


def exclui(c, usuario, tid):
    dono = _dono(usuario)
    n = c.execute("DELETE FROM tarefas WHERE id=? AND dono=?", (str(tid or ""), dono)).rowcount
    c.commit()
    if not n:
        raise ValueError("Tarefa não encontrada.")
    return {"ok": True}
