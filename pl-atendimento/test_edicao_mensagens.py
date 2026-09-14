import os
import tempfile
import threading
import unittest
from unittest.mock import patch

import painel


class EdicaoMensagensTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db, self.old_local = painel.DB, painel._local
        painel.DB = os.path.join(self.tmp.name, "painel.db")
        painel._local = threading.local()
        painel.cria_banco()
        c = painel.con()
        c.execute("INSERT INTO leads(chatid,fone,nome,status,ultimo_ts,ultimo_de) "
                  "VALUES('loja','5511','Loja','INTERESSADO',3,'nos')")
        c.executemany("INSERT INTO mensagens(messageid,chatid,ts,from_me,tipo,texto,file_url) "
                      "VALUES(?,?,?,?,?,?,?)", [
            ("texto", "loja", 1, 1, "Conversation", "Olá", None),
            ("foto", "loja", 2, 1, "ImageMessage", "Foto", "https://example.com/foto"),
            ("recebida", "loja", 3, 0, "Conversation", "Oi", None),
        ])
        c.commit()

    def tearDown(self):
        if hasattr(painel._local, "c"):
            painel._local.c.close()
        painel.DB, painel._local = self.old_db, self.old_local
        self.tmp.cleanup()

    def test_edita_texto_no_whatsapp_e_no_historico(self):
        with patch.object(painel, "uz", return_value={"success": True}) as uz:
            painel.altera_mensagem("loja", "texto", "editar", " Olá, Maria ")
        uz.assert_called_once_with("/message/edit", {"id": "texto", "text": "Olá, Maria"})
        linha = painel.conversa("loja")["linhas"][0]
        self.assertEqual("Olá, Maria", linha["texto"])
        self.assertTrue(linha["editada"])

    def test_exclui_midia_sem_recriar_no_historico(self):
        with patch.object(painel, "uz", return_value={"success": True}) as uz:
            painel.altera_mensagem("loja", "foto", "excluir")
        uz.assert_called_once_with("/message/delete", {"id": "foto"})
        self.assertEqual(["texto", "recebida"], [m["id"] for m in painel.conversa("loja")["linhas"]])
        c = painel.con()
        self.assertEqual(1, c.execute("SELECT excluida FROM mensagens WHERE messageid='foto'").fetchone()[0])
        c.execute("INSERT OR IGNORE INTO mensagens(messageid,chatid) VALUES('foto','loja')")
        self.assertEqual(["texto", "recebida"], [m["id"] for m in painel.conversa("loja")["linhas"]])

    def test_rejeita_recebida_midia_e_falha_remota_sem_alterar_local(self):
        with patch.object(painel, "uz") as uz:
            with self.assertRaises(ValueError):
                painel.altera_mensagem("loja", "recebida", "excluir")
            with self.assertRaises(ValueError):
                painel.altera_mensagem("loja", "foto", "editar", "novo")
            with self.assertRaises(ValueError):
                painel.altera_mensagem("outra", "texto", "excluir")
            uz.assert_not_called()
        with patch.object(painel, "uz", return_value={"success": False}):
            with self.assertRaises(RuntimeError):
                painel.altera_mensagem("loja", "texto", "editar", "novo")
        self.assertEqual("Olá", painel.conversa("loja")["linhas"][0]["texto"])


if __name__ == "__main__":
    unittest.main()
