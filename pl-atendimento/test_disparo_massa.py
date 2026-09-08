import os
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

import painel


class DisparoMassaTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db = painel.DB
        self.old_local = painel._local
        painel.DB = os.path.join(self.tmp.name, "painel.db")
        painel._local = threading.local()
        painel.ENVIOS.clear()
        painel.cria_banco()
        c = painel.con()
        c.executemany(
            "INSERT INTO leads(chatid,fone,nome,status,ultimo_ts,ultimo_de,atualizado) "
            "VALUES(?,?,?,?,?,?,?)",
            [
                ("a@s.whatsapp.net", "5511000000001", "Loja A", "INTERESSADO", 1, "lead", ""),
                ("b@s.whatsapp.net", "5511000000002", "Loja B", "INTERESSADO", 2, "lead", ""),
            ],
        )
        c.commit()

    def tearDown(self):
        if hasattr(painel._local, "c"):
            painel._local.c.close()
        painel.DB = self.old_db
        painel._local = self.old_local
        painel.ENVIOS.clear()
        self.tmp.cleanup()

    def wait(self, eid):
        limite = time.time() + 2
        while painel.ENVIOS[eid]["estado"] == "enviando" and time.time() < limite:
            time.sleep(0.01)
        return painel.ENVIOS[eid]

    def test_deduplica_alvos_e_expoe_falha_individual(self):
        def envia(_path, body):
            if body["number"].endswith("2"):
                raise RuntimeError("instância desconectada")

        with patch.object(painel, "uz", side_effect=envia) as mock_uz:
            eid = painel.inicia_disparo_massa(
                ["a@s.whatsapp.net", "a@s.whatsapp.net", "b@s.whatsapp.net"], "  Olá  "
            )
            estado = self.wait(eid)

        self.assertEqual(2, mock_uz.call_count)
        self.assertEqual("erro", estado["estado"])
        self.assertEqual(1, estado["enviados"])
        self.assertEqual(1, estado["falhas"])
        self.assertEqual("Loja B", estado["resultados"][1]["nome"])
        self.assertIn("desconectada", estado["resultados"][1]["erro"])

    def test_rejeita_conversa_que_nao_existe(self):
        with self.assertRaisesRegex(ValueError, "não existem mais"):
            painel.inicia_disparo_massa(["sumiu@s.whatsapp.net"], "Olá")

    def test_rejeita_mensagem_vazia_e_limite(self):
        with self.assertRaisesRegex(ValueError, "mensagem"):
            painel.inicia_disparo_massa(["a@s.whatsapp.net"], "  ")
        with self.assertRaisesRegex(ValueError, "limite"):
            painel.inicia_disparo_massa(
                ["%d@s.whatsapp.net" % i for i in range(painel.MAX_DISPARO_MASSA + 1)], "Olá"
            )


if __name__ == "__main__":
    unittest.main()
