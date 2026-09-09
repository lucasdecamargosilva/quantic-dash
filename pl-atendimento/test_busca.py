import os
import tempfile
import threading
import unittest

import painel


class BuscaTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db = painel.DB
        self.old_local = painel._local
        painel.DB = os.path.join(self.tmp.name, "painel.db")
        painel._local = threading.local()
        painel.cria_banco()
        c = painel.con()
        c.executemany(
            "INSERT INTO leads(chatid,fone,nome,status,ultimo_ts,ultimo_de,atualizado,oculto) "
            "VALUES(?,?,?,?,?,?,?,?)",
            [
                ("a", "5511987654321", "Ótica Visão", "INTERESSADO", 3, "lead", "", 0),
                ("b", "552199998888", "Loja Central", "TESTE GRÁTIS", 2, "lead", "", 0),
                ("c", "553188887777", "Ótica Oculta", "INTERESSADO", 1, "lead", "", 1),
            ],
        )
        c.executemany(
            "INSERT INTO mensagens(messageid,chatid,ts,from_me,tipo,texto,file_url,segundos) "
            "VALUES(?,?,?,?,?,?,?,?)",
            [
                ("ma", "a", 3, 0, "Conversation", "Olá", "", 0),
                ("mb", "b", 2, 0, "Conversation", "Oi", "", 0),
                ("mc", "c", 1, 0, "Conversation", "Oi", "", 0),
            ],
        )
        c.commit()

    def tearDown(self):
        if hasattr(painel._local, "c"):
            painel._local.c.close()
        painel.DB = self.old_db
        painel._local = self.old_local
        self.tmp.cleanup()

    def test_busca_nome_sem_exigir_acento(self):
        self.assertEqual(["a"], [x["chatid"] for x in painel.fila(busca="otica visao")])

    def test_busca_telefone_aceita_formatacao(self):
        self.assertEqual(["b"], [x["chatid"] for x in painel.fila(busca="(21) 9999-8888")])

    def test_busca_percorre_etapas_e_nao_mostra_removidos(self):
        self.assertEqual(["b"], [x["chatid"] for x in painel.fila("INTERESSADO", "central")])
        self.assertEqual([], painel.fila(busca="oculta"))


if __name__ == "__main__":
    unittest.main()
