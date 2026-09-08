import sqlite3
import unittest
from crm_bridge import CRM, anuncio, telefone


class BridgeTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.executescript('CREATE TABLE leads(chatid TEXT, fone TEXT, nome TEXT, status TEXT, oculto INTEGER, ultimo_ts INTEGER);'
                             'CREATE TABLE mensagens(chatid TEXT, texto TEXT, from_me INTEGER, ts INTEGER);')
        self.cid = '5511987654321@s.whatsapp.net'
        self.db.execute('INSERT INTO leads VALUES (?,?,?,?,0,1)', (self.cid, '5511987654321', 'Loja', 'INTERESSADO'))
        self.db.execute('INSERT INTO mensagens VALUES (?,?,0,1)', (self.cid, 'Oi! Gostaria de saber mais sobre o Provou Catálogo!'))
        self.crm = CRM(lambda: self.db)
        self.crm.setup()
        self.rows = []
        self.custom = {}
        self.interactions = []
        self.fail_write = False
        self.crm.request = self.remote

    def tearDown(self):
        self.db.close()

    def remote(self, table, query=None, method='GET', body=None, prefer=None):
        query = query or {}
        if self.fail_write and method != 'GET':
            raise RuntimeError('offline')
        if table == 'interacoes':
            if method == 'POST':
                row = dict(body, id='note-' + str(len(self.interactions) + 1))
                self.interactions.append(row)
                return [dict(row)] if prefer == 'return=representation' else None
            return [dict(r) for r in self.interactions]
        if table == 'crm_lead_etapas':
            if method == 'POST':
                self.custom[body['lead_id']] = body['status']
            elif method == 'DELETE':
                self.custom.pop(query['lead_id'][3:], None)
            else:
                value = self.custom.get(query['lead_id'][3:])
                return [{'status': value}] if value else []
            return None
        if method == 'POST':
            if not any(r['instagram'] == body['instagram'] for r in self.rows):
                self.rows.append(dict(body, id=str(len(self.rows) + 1)))
            return None
        rows = self.rows
        for key in ('id', 'instagram'):
            if key in query:
                rows = [r for r in rows if r[key] == query[key][3:]]
        if method == 'PATCH':
            for row in rows:
                row.update(body)
        return [dict(r) for r in rows]

    def test_detection_and_phone(self):
        self.assertTrue(anuncio('Olá! Quero saber mais sobre o Provador Virtual!'))
        self.assertFalse(anuncio('Olá! Tive um problema ao usar o provador.'))
        self.assertEqual(telefone('+55 (11) 98765-4321'), telefone('11 8765-4321'))

    def test_lookup_does_not_create(self):
        self.assertIsNone(self.crm.ensure(self.cid))
        self.assertEqual(self.rows, [])

    def test_existing_formatted_phone_preserves_stage(self):
        self.rows.append({'id': 'existing', 'telefone': '+55 (11) 8765-4321', 'status': 'fechou'})
        self.assertEqual(self.crm.ensure(self.cid, True)['status'], 'fechou')
        self.assertEqual(len(self.rows), 1)

    def test_duplicate_phone_requires_resolution(self):
        self.rows.extend([{'id': str(i), 'telefone': '5511987654321'} for i in (1, 2)])
        with self.assertRaisesRegex(ValueError, 'mais de um'):
            self.crm.ensure(self.cid, True)

    def test_auto_sync_idempotent_and_custom_status(self):
        self.crm.sync()
        self.crm.sync()
        self.assertEqual(len(self.rows), 1)
        self.assertEqual(self.rows[0]['status'], 'meta')
        self.assertEqual(self.rows[0]['fonte_oportunidade'], 'Meta')
        self.assertEqual(self.crm.change(self.cid, 'testou_e_saiu')['status'], 'testou_e_saiu')
        self.assertEqual(self.rows[0]['status'], 'stand_by')
        self.assertEqual(self.crm.change(self.cid, 'fechou')['status'], 'fechou')
        self.assertEqual(self.custom, {})
        self.assertEqual(self.db.execute('SELECT status FROM leads').fetchone()[0], 'CONVERTIDO')

    def test_catalog_trial_is_custom_stage(self):
        self.crm.ensure(self.cid, True)
        saved = self.crm.change(self.cid, 'teste_catalogo_7_dias')
        self.assertEqual(saved['status'], 'teste_catalogo_7_dias')
        self.assertEqual(self.rows[0]['status'], 'testando')
        self.assertEqual(self.custom[self.rows[0]['id']], 'teste_catalogo_7_dias')
        self.assertEqual(self.db.execute('SELECT status FROM leads').fetchone()[0], 'TESTE GRÁTIS')

    def test_external_stage_reflected_locally(self):
        self.crm.ensure(self.cid, True)
        self.rows[0]['status'] = 'testando'
        self.assertEqual(self.crm.ensure(self.cid)['status'], 'testando')
        self.assertEqual(self.db.execute('SELECT status FROM leads').fetchone()[0], 'TESTE GRÁTIS')

    def test_failed_create_retried(self):
        self.fail_write = True
        self.crm.sync()
        self.assertTrue(self.crm.sync_status['erro'])
        self.assertEqual(self.db.execute('SELECT count(*) FROM crm_links').fetchone()[0], 0)
        self.fail_write = False
        self.crm.sync()
        self.assertEqual(len(self.rows), 1)
        self.assertFalse(self.crm.sync_status['erro'])

    def test_preserve_local_conversion(self):
        self.db.execute("UPDATE leads SET status='CONVERTIDO'")
        self.crm.sync()
        self.assertEqual(self.rows[0]['status'], 'fechou')

    def test_invalid_status_rejected_before_creation(self):
        with self.assertRaises(ValueError):
            self.crm.change(self.cid, 'invalid')
        self.assertEqual(self.rows, [])

    def test_support_not_imported(self):
        self.db.execute("UPDATE mensagens SET texto='Olá! Tive um problema ao usar o provador.'")
        self.crm.sync()
        self.assertEqual(self.rows, [])

    def test_failed_update_not_reported_as_success(self):
        self.crm.ensure(self.cid, True)
        self.fail_write = True
        with self.assertRaises(RuntimeError):
            self.crm.change(self.cid, 'fechou')
        self.assertEqual(self.rows[0]['status'], 'meta')

    def test_note_is_registered_in_opportunity_history(self):
        self.crm.ensure(self.cid, True)
        note = self.crm.add_note(self.cid, '  Retornar amanhã às 10h.  ')
        self.assertEqual(note['conteudo'], 'Retornar amanhã às 10h.')
        self.assertEqual(note['tipo'], 'nota')
        self.assertEqual(note['lead_id'], self.rows[0]['id'])
        self.assertIn('updated_at', self.rows[0])

    def test_empty_note_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Digite uma observação'):
            self.crm.add_note(self.cid, '   ')
        self.assertEqual(self.interactions, [])


if __name__ == '__main__':
    unittest.main()
