import json
import sqlite3
import time

METRICS = ("conversations", "trials", "closed")
PERIODS = ("weekly", "monthly")


def read_goals(db):
    c = sqlite3.connect(db, timeout=30)
    try:
        c.execute("CREATE TABLE IF NOT EXISTS metas_config (owner TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL)")
        c.execute("INSERT OR IGNORE INTO metas_config VALUES(?,?,?,?)",
                  ("Dione", json.dumps({"weekly": {"conversations": None, "trials": 25, "closed": None},
                                       "monthly": {"conversations": None, "trials": None, "closed": 5}}), 0, "initial"))
        c.commit()
        return {owner: json.loads(payload) for owner, payload in c.execute("SELECT owner,payload FROM metas_config")}
    finally:
        c.close()


def save_goals(db, user, data):
    if user != "lucas":
        raise PermissionError("Somente Lucas pode definir metas.")
    if not isinstance(data, dict) or data.get("owner") not in ("Lucas", "Dione"):
        raise ValueError("Selecione um responsável válido.")
    goals = data.get("goals")
    if not isinstance(goals, dict) or set(goals) != set(PERIODS):
        raise ValueError("Informe as metas semanais e mensais.")
    for period in PERIODS:
        values = goals[period]
        if not isinstance(values, dict) or set(values) != set(METRICS):
            raise ValueError("Informe os três indicadores de cada período.")
        if any(v is not None and (type(v) is not int or v < 0 or v > 1000000) for v in values.values()):
            raise ValueError("As metas devem ser números inteiros de 0 a 1.000.000.")
    read_goals(db)
    c = sqlite3.connect(db, timeout=30)
    try:
        c.execute("INSERT INTO metas_config VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
                  (data["owner"], json.dumps(goals), int(time.time()), user))
        c.commit()
    finally:
        c.close()
    return read_goals(db)
