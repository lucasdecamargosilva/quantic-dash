import base64
import os
import tempfile
import threading
import unittest
from unittest.mock import patch

import painel


class MidiasTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db = painel.DB
        self.old_dir_midias = painel.DIR_MIDIAS
        self.old_local = painel._local
        painel.DB = os.path.join(self.tmp.name, "painel.db")
        painel.DIR_MIDIAS = os.path.join(self.tmp.name, "midias")
        painel._local = threading.local()
        painel.cria_banco()
        c = painel.con()
        c.execute(
            "INSERT INTO leads(chatid,fone,nome,status,ultimo_ts,ultimo_de,atualizado) "
            "VALUES(?,?,?,?,?,?,?)",
            ("loja", "5511", "Loja", "INTERESSADO", 1, "lead", ""),
        )
        c.executemany(
            "INSERT INTO mensagens(messageid,chatid,ts,from_me,tipo,texto,file_url,segundos) "
            "VALUES(?,?,?,?,?,?,?,?)",
            [
                ("audio-1", "loja", 1, 0, "AudioMessage", "", "https://meta/audio.enc", 4),
                ("imagem-1", "loja", 2, 0, "ImageMessage", "Uma armação", "https://meta/imagem.enc", 0),
            ],
        )
        c.commit()

    def tearDown(self):
        if hasattr(painel._local, "c"):
            painel._local.c.close()
        painel.DB = self.old_db
        painel.DIR_MIDIAS = self.old_dir_midias
        painel._local = self.old_local
        self.tmp.cleanup()

    def test_conversa_expoe_midias_sem_vazar_url_do_whatsapp(self):
        with patch.object(painel, "transcreve", return_value=""):
            linhas = painel.conversa("loja")["linhas"]

        self.assertEqual(["audio-1", "imagem-1"], [x["id"] for x in linhas])
        self.assertTrue(all(x["midia"] for x in linhas))
        self.assertEqual("ImageMessage", linhas[1]["tipo"])
        self.assertNotIn("file_url", linhas[1])

    def test_baixa_e_reutiliza_midia_decodificada(self):
        resposta = {"mimetype": "audio/mpeg", "base64Data": base64.b64encode(b"mp3-data").decode()}
        with patch.object(painel, "uz", return_value=resposta) as mock_uz:
            primeira = painel.carrega_midia("audio-1")
            segunda = painel.carrega_midia("audio-1")

        self.assertEqual((b"mp3-data", "audio/mpeg"), primeira)
        self.assertEqual(primeira, segunda)
        mock_uz.assert_called_once_with("/message/download", {
            "id": "audio-1", "return_base64": True, "return_link": False,
            "generate_mp3": True,
        })

    def test_rejeita_id_que_nao_pertence_ao_historico(self):
        with self.assertRaisesRegex(ValueError, "não encontrada"):
            painel.carrega_midia("desconhecida")


if __name__ == "__main__":
    unittest.main()
