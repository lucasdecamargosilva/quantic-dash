"""Grupos de acompanhamento; não são leads nem oportunidades comerciais."""
import time


def initialize(c):
    c.execute('''CREATE TABLE IF NOT EXISTS grupos_catalogos (
        chatid TEXT PRIMARY KEY, lead_chatid TEXT NOT NULL, nome TEXT NOT NULL,
        responsavel TEXT NOT NULL, ultimo_sync INTEGER DEFAULT 0, erro TEXT DEFAULT '')''')
    c.commit()


def visible(c, user):
    rows = c.execute('''SELECT g.*, COALESCE(NULLIF(l.responsavel,''),g.responsavel) dono
        FROM grupos_catalogos g LEFT JOIN leads l ON l.chatid=g.lead_chatid''').fetchall()
    return [dict(r) for r in rows if user == 'lucas' or
            (user == 'dione' and r['dono'] == 'Dione')]


def sync(c, uz):
    changed = 0
    for row in c.execute('SELECT * FROM grupos_catalogos').fetchall():
        try:
            data = uz('/message/find', {'operator':'AND', 'chatid':row['chatid'],
                      'sort':'-messageTimestamp', 'limit':100})
            for msg in data.get('messages') or []:
                # Nunca misturar mensagens de outros chats, mesmo se o provedor errar.
                if msg.get('chatid') != row['chatid'] or msg.get('status') == 'Deleted':
                    continue
                mid = msg.get('messageid') or msg.get('id')
                if not mid:
                    continue
                ts = int(msg.get('messageTimestamp') or 0)
                if ts < 100_000_000_000:
                    ts *= 1000
                content = msg.get('content') or {}
                if not isinstance(content, dict):
                    content = {}
                changed += c.execute('''INSERT OR IGNORE INTO mensagens
                    (messageid,chatid,ts,from_me,tipo,texto,file_url,segundos)
                    VALUES(?,?,?,?,?,?,?,?)''', (mid,row['chatid'],ts,int(bool(msg.get('fromMe'))),
                    msg.get('messageType'),msg.get('text') or '',msg.get('fileURL'),content.get('seconds'))).rowcount
            c.execute("UPDATE grupos_catalogos SET ultimo_sync=?,erro='' WHERE chatid=?",
                      (int(time.time()),row['chatid']))
        except Exception:
            c.execute("UPDATE grupos_catalogos SET erro='Aguardando reconexão do WhatsApp' WHERE chatid=?", (row['chatid'],))
        c.commit()
    return changed
