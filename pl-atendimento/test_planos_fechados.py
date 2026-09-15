from unittest.mock import patch
from test_busca import BuscaTest
import painel

class PlanoFechadoTest(BuscaTest):
    def test_valida_antes_de_converter(self):
        with patch.object(painel.CRM_CLIENT, "change") as change:
            for plan, value in [("Inexistente",3900),("Essencial",0),("Essencial",True),("Essencial",39.1)]:
                with self.assertRaises(ValueError):
                    painel.salva_plano_fechado("a",plan,value)
            change.assert_not_called()

    def test_salva_edita_e_preserva_data_de_fechamento(self):
        with patch.object(painel.CRM_CLIENT,"change",return_value={"id":"crm-a"}):
            painel.salva_plano_fechado("a","Essencial",3500)
            first=painel.fila(chatid="a")[0]["venda"]
            painel.salva_plano_fechado("a","Profissional",15900)
        saved=painel.fila(chatid="a")[0]["venda"]
        self.assertEqual("Profissional",saved["plano"])
        self.assertEqual(15900,saved["valor_centavos"])
        self.assertEqual(first["fechado_em"],saved["fechado_em"])
        self.assertEqual("crm-a",saved["lead_id"])

    def test_falha_crm_nao_salva_plano(self):
        with patch.object(painel.CRM_CLIENT,"change",side_effect=RuntimeError("falhou")):
            with self.assertRaises(RuntimeError):painel.salva_plano_fechado("a","Essencial",3900)
        self.assertIsNone(painel.fila(chatid="a")[0]["venda"])

    def test_audio_conta_so_envio_real_bem_sucedido(self):
        painel.envia_midia_atendimento(lambda: {}, "5511987654321", "Dione", teste=True)
        self.assertEqual(0,painel.con().execute("SELECT count(*) FROM atendimentos_iniciados").fetchone()[0])
        painel.envia_midia_atendimento(lambda: {}, "5511987654321", "Dione")
        painel.envia_midia_atendimento(lambda: {}, "5511987654321", "Dione")
        self.assertEqual(1,painel.con().execute("SELECT count(*) FROM atendimentos_iniciados").fetchone()[0])

    def test_migracao_preserva_envios_e_ignora_atribuicoes(self):
        c=painel.con()
        c.execute("DELETE FROM metricas_migracoes")
        c.execute("INSERT INTO conversas_iniciadas VALUES('a',1789434000,'Dione')")
        c.execute("INSERT INTO conversas_atribuidas VALUES('b','Lucas',1789434000)")
        c.commit()
        painel.cria_banco()
        painel.cria_banco()
        rows=c.execute("SELECT chatid,responsavel FROM atendimentos_iniciados").fetchall()
        self.assertEqual([('a','Dione')],[(r[0],r[1]) for r in rows])
