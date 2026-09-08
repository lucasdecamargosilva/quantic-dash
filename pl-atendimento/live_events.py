"""UAZAPI push events over outbound SSE; credentials never enter the browser."""
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone


def events(response):
    data = []
    size = 0
    for raw in response:
        line = raw.decode('utf-8').rstrip('\r\n')
        if not line:
            if data:
                yield json.loads('\n'.join(data))
            data, size = [], 0
        elif line.startswith('data:'):
            part = line[5:].lstrip(' ')
            size += len(part)
            if size > 2_000_000:
                raise ValueError('Event too large')
            data.append(part)


def ingest(connect, payload):
    if not isinstance(payload, dict) or payload.get('EventType', payload.get('eventType')) != 'messages':
        return False
    msg, chat = payload.get('message'), payload.get('chat') or {}
    if not isinstance(msg, dict) or not isinstance(chat, dict):
        return False
    cid = msg.get('chatid') or chat.get('wa_chatid') or ''
    mid = msg.get('messageid') or msg.get('id')
    if not mid or not cid.endswith('@s.whatsapp.net') or msg.get('isGroup') or chat.get('wa_isGroup'):
        return False
    if msg.get('status') == 'Deleted':
        return False
    ts = int(msg.get('messageTimestamp') or 0)
    if ts <= 0:
        return False
    if ts < 100_000_000_000:
        ts *= 1000
    content = msg.get('content') or {}
    if not isinstance(content, dict):
        content = {}
    me = bool(msg.get('fromMe'))
    phone = re.sub(r'\D', '', chat.get('phone') or cid.split('@')[0])
    name = chat.get('wa_name') or chat.get('name') or chat.get('wa_contactName') or (msg.get('senderName') if not me else '') or phone
    c = connect()
    with c:
        inserted = c.execute('INSERT OR IGNORE INTO mensagens '
            '(messageid,chatid,ts,from_me,tipo,texto,file_url,segundos) VALUES(?,?,?,?,?,?,?,?)',
            (mid, cid, ts, int(me), msg.get('messageType'), (msg.get('text') or '').strip(),
             msg.get('fileURL') or content.get('URL') or content.get('url'), content.get('seconds'))).rowcount
        c.execute("INSERT INTO leads(chatid,fone,nome,status,ultimo_ts,ultimo_de,atualizado) "
            "VALUES(?,?,?,'INTERESSADO',?,?,?) ON CONFLICT(chatid) DO UPDATE SET "
            "nome=excluded.nome,fone=excluded.fone,ultimo_ts=excluded.ultimo_ts,"
            "ultimo_de=excluded.ultimo_de,atualizado=excluded.atualizado "
            "WHERE excluded.ultimo_ts >= COALESCE(leads.ultimo_ts,0)",
            (cid, phone, name, ts, 'nos' if me else 'lead', datetime.now(timezone.utc).isoformat()))
    return bool(inserted)


class LiveEvents:
    def __init__(self, base_url, token, connect, notify):
        self.url = base_url + '/sse?' + urllib.parse.urlencode({'token': token, 'events': 'messages'})
        self.connect, self.notify = connect, notify
        self.status = {'connected': False, 'received': 0, 'stored': 0, 'last_event': None, 'error': ''}

    def loop(self):
        delay = 1
        while True:
            try:
                req = urllib.request.Request(self.url, headers={'Accept': 'text/event-stream'})
                with urllib.request.urlopen(req, timeout=60) as response:
                    if 'text/event-stream' not in response.headers.get('Content-Type', ''):
                        raise ValueError('Unexpected stream response')
                    self.status.update(connected=True, error='')
                    delay = 1
                    for payload in events(response):
                        if not isinstance(payload, dict) or payload.get('EventType', payload.get('eventType')) != 'messages':
                            continue
                        self.status['received'] += 1
                        self.status['last_event'] = datetime.now(timezone.utc).isoformat()
                        if ingest(self.connect, payload):
                            self.status['stored'] += 1
                            self.notify()
                self.status.update(connected=False, error='Reconectando eventos; sincronização de segurança ativa.')
            except Exception:
                # Exception URLs can contain the API token. Never log raw errors.
                self.status.update(connected=False, error='Reconectando eventos; sincronização de segurança ativa.')
            time.sleep(delay)
            delay = min(delay * 2, 30)
