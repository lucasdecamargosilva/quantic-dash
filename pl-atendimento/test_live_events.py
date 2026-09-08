import io
import sqlite3
import unittest
from live_events import events, ingest

class LiveEventsTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript('CREATE TABLE mensagens(messageid TEXT PRIMARY KEY,chatid TEXT,ts INTEGER,from_me INTEGER,tipo TEXT,texto TEXT,file_url TEXT,segundos INTEGER); CREATE TABLE leads(chatid TEXT PRIMARY KEY,fone TEXT,nome TEXT,status TEXT,ultimo_ts INTEGER,ultimo_de TEXT,atualizado TEXT,oculto INTEGER DEFAULT 0);')
        self.cid = '5511999999999@s.whatsapp.net'
        self.payload = {'EventType':'messages','chat':{'wa_name':'Test'}, 'message':{'messageid':'m1','chatid':self.cid,'text':'Hello','messageTimestamp':1788800000000,'fromMe':False,'messageType':'Conversation'}}

    def tearDown(self):
        self.db.close()

    def test_deduplicate(self):
        self.assertTrue(ingest(lambda:self.db,self.payload))
        self.assertFalse(ingest(lambda:self.db,self.payload))
        self.assertEqual(self.db.execute('SELECT count(*) FROM mensagens').fetchone()[0],1)

    def test_older_event_preserves_position_stage_and_hidden(self):
        ingest(lambda:self.db,self.payload)
        self.db.execute("UPDATE leads SET status='TESTE GRÁTIS',oculto=1")
        self.payload['message'].update(messageid='older',messageTimestamp=1788700000000,fromMe=True)
        ingest(lambda:self.db,self.payload)
        self.assertEqual(self.db.execute('SELECT ultimo_ts,ultimo_de,status,oculto FROM leads').fetchone(),(1788800000000,'lead','TESTE GRÁTIS',1))
        self.assertEqual(self.db.execute('SELECT count(*) FROM mensagens').fetchone()[0],2)

    def test_outgoing_and_seconds_timestamp(self):
        self.payload['message'].update(fromMe=True,messageTimestamp=1788800000)
        ingest(lambda:self.db,self.payload)
        self.assertEqual(self.db.execute('SELECT ultimo_ts,ultimo_de FROM leads').fetchone(),(1788800000000,'nos'))

    def test_ignore_groups_and_non_message(self):
        self.payload['message']['isGroup']=True
        self.assertFalse(ingest(lambda:self.db,self.payload))
        self.assertFalse(ingest(lambda:self.db,{'type':'connected'}))
        self.assertEqual(self.db.execute('SELECT count(*) FROM mensagens').fetchone()[0],0)

    def test_sse_multiline_and_keepalive(self):
        stream=io.BytesIO(b': ping\n\nid: 1\ndata: {"EventType":\ndata: "messages"}\n\n')
        self.assertEqual(list(events(stream)),[{'EventType':'messages'}])

if __name__ == '__main__':
    unittest.main()
