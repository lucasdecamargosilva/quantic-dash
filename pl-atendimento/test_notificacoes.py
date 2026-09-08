import os
import tempfile
import threading
import unittest

import painel


class NotificacoesTest(unittest.TestCase):
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
                ("visivel", "5511", "Loja Visível", "INTERESSADO", 3, "lead", "", 0),
                ("oculto", "5522", "Loja Oculta", "INTERESSADO", 4, "lead", "", 1),
            ],
        )
        c.executemany(
            "INSERT INTO mensagens(messageid,chatid,ts,from_me,tipo,texto,file_url,segundos) "
            "VALUES(?,?,?,?,?,?,?,?)",
            [
                ("recebida", "visivel", 3, 0, "Conversation", "Quero saber mais", "", 0),
                ("enviada", "visivel", 4, 1, "Conversation", "Posso ajudar", "", 0),
                ("oculta", "oculto", 5, 0, "Conversation", "Não deve avisar", "", 0),
                ("audio", "visivel", 6, 0, "AudioMessage", "", "audio.mp3", 8),
            ],
        )
        c.commit()

    def tearDown(self):
        if hasattr(painel._local, "c"):
            painel._local.c.close()
        painel.DB = self.old_db
        painel._local = self.old_local
        self.tmp.cleanup()

    def test_lista_apenas_recebidas_visiveis_com_previa(self):
        mensagens = painel.recebidas_recentes()

        self.assertEqual(["audio", "recebida"], [m["id"] for m in mensagens])
        self.assertEqual("Loja Visível", mensagens[0]["nome"])
        self.assertEqual("[áudio de 8s]", mensagens[0]["texto"])
        self.assertEqual("Quero saber mais", mensagens[1]["texto"])


if __name__ == "__main__":
    unittest.main()
