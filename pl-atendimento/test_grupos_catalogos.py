from unittest.mock import Mock, patch
import painel
import grupos_catalogos
from test_busca import BuscaTest


class GruposTest(BuscaTest):
    def setUp(self):
        super().setUp()
        c = painel.con()
        c.execute("UPDATE leads SET responsavel='Dione' WHERE chatid='b'")
        c.execute("INSERT INTO grupos_catalogos(chatid,lead_chatid,nome,responsavel) VALUES('123@g.us','b','Grupo Loja','Dione')")
        c.commit()

    def test_visibilidade_sem_inflar_leads(self):
        before = painel.contagem()
        rows = painel.fila('TESTE GRÁTIS',usuario='dione')
        self.assertEqual(['b','123@g.us'], [r['chatid'] for r in rows])
        self.assertTrue(rows[-1]['grupo'])
        self.assertFalse(any(r.get('grupo') for r in painel.fila(usuario='dione')))
        self.assertFalse(any(r.get('grupo') for r in painel.fila('TESTE GRÁTIS',usuario='outro')))
        self.assertEqual(before, painel.contagem())
        self.assertEqual([], painel.fila('TESTE GRÁTIS',responsavel='Lucas',usuario='dione'))

    def test_grupo_abre_so_para_responsavel_e_admin(self):
        self.assertTrue(painel.conversa('123@g.us','dione')['grupo'])
        self.assertTrue(painel.conversa('123@g.us','lucas')['grupo'])
        with self.assertRaises(ValueError):
            painel.conversa('123@g.us','outro')
        with self.assertRaises(ValueError):
            painel.valida_destinatario('123@g.us','5511987654321')

    def test_sync_isolado_idempotente_sem_criar_lead(self):
        uz = Mock(return_value={'messages':[
            {'messageid':'g1','chatid':'123@g.us','messageTimestamp':1700000000,'text':'teste'},
            {'messageid':'errada','chatid':'456@g.us','messageTimestamp':1700000000,'text':'outro'}]})
        self.assertEqual(1,grupos_catalogos.sync(painel.con(),uz))
        self.assertEqual(0,grupos_catalogos.sync(painel.con(),uz))
        self.assertEqual(3,painel.con().execute('SELECT count(*) FROM leads').fetchone()[0])
        self.assertEqual(1,len(painel.conversa('123@g.us','dione')['linhas']))
        self.assertEqual(0,painel.con().execute('SELECT count(*) FROM atendimentos_iniciados').fetchone()[0])

    def test_desconexao_preserva_historico(self):
        uz=Mock(side_effect=RuntimeError('indisponivel'))
        grupos_catalogos.sync(painel.con(),uz)
        self.assertIn('reconexão',painel.conversa('123@g.us','dione')['erro_sync'])
