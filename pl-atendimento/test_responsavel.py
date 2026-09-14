import os
import sqlite3
import tempfile
import threading
import unittest

import painel


class ResponsavelTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db, self.old_local = painel.DB, painel._local
        painel.DB = os.path.join(self.tmp.name, "painel.db")
        painel._local = threading.local()

    def tearDown(self):
        if hasattr(painel._local, "c"):
            painel._local.c.close()
        painel.DB, painel._local = self.old_db, self.old_local
        self.tmp.cleanup()

    def test_migracao_e_atribuicao_persistem_na_conversa(self):
        antigo = sqlite3.connect(painel.DB)
        antigo.execute("CREATE TABLE leads (chatid TEXT PRIMARY KEY, fone TEXT, nome TEXT, "
                       "status TEXT, ultimo_ts INTEGER, ultimo_de TEXT, atualizado TEXT)")
        antigo.execute("INSERT INTO leads VALUES (?,?,?,?,?,?,?)",
                       ("loja@s.whatsapp.net", "5511000000001", "Loja", "INTERESSADO", 1, "lead", ""))
        antigo.commit()
        antigo.close()

        painel.cria_banco()
        self.assertIsNone(painel.conversa("loja@s.whatsapp.net")["responsavel"])
        self.assertEqual("Dione", painel.atribui_responsavel("loja@s.whatsapp.net", "Dione"))
        self.assertEqual("Dione", painel.conversa("loja@s.whatsapp.net")["responsavel"])
        self.assertEqual("Dione", painel.fila()[0]["responsavel"])
        painel.atribui_responsavel("loja@s.whatsapp.net", "")
        self.assertIsNone(painel.conversa("loja@s.whatsapp.net")["responsavel"])

    def test_rejeita_responsavel_invalido_e_conversa_ausente(self):
        painel.cria_banco()
        with self.assertRaisesRegex(ValueError, "Responsável inválido"):
            painel.atribui_responsavel("loja@s.whatsapp.net", "Outra pessoa")
        with self.assertRaisesRegex(ValueError, "Conversa não encontrada"):
            painel.atribui_responsavel("loja@s.whatsapp.net", "Lucas")
