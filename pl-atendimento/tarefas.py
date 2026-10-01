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
    prioridade = d.get("prioridade") if d.get("prioridade") in PRIORIDADES else "normal"
    agora = datetime.now(BRT).isoformat()
    tid = str(d.get("id") or "").strip()
    if tid:
        atual = c.execute("SELECT feita, estado FROM tarefas WHERE id=? AND dono=?", (tid, dono)).fetchone()
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
    else:
        tid = uuid.uuid4().hex[:12]
        estado = d.get("estado") if d.get("estado") in ("a_fazer", "em_progresso") else "a_fazer"
        c.execute("INSERT INTO tarefas(id,dono,titulo,notas,prazo,prioridade,feita,estado,criada_em,atualizada_em) "
                  "VALUES(?,?,?,?,?,?,0,?,?,?)", (tid, dono, titulo, notas, prazo, prioridade, estado, agora, agora))
    c.commit()
    return {"ok": True, "id": tid}


def exclui(c, usuario, tid):
    dono = _dono(usuario)
    n = c.execute("DELETE FROM tarefas WHERE id=? AND dono=?", (str(tid or ""), dono)).rowcount
    c.commit()
    if not n:
        raise ValueError("Tarefa não encontrada.")
    return {"ok": True}
