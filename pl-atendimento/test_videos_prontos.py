import base64
import os
import tempfile
import threading
import unittest
from unittest.mock import patch

import painel


class VideosProntosTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old = (painel.DB, painel.DIR_VIDEOS_PRONTOS, painel._local)
        painel.DB = os.path.join(self.tmp.name, "painel.db")
        painel.DIR_VIDEOS_PRONTOS = os.path.join(self.tmp.name, "videos_prontos")
        painel._local = threading.local()
        painel.cria_banco()

    def tearDown(self):
        if hasattr(painel._local, "c"):
            painel._local.c.close()
        painel.DB, painel.DIR_VIDEOS_PRONTOS, painel._local = self.old
        self.tmp.cleanup()

    def _cria(self, **extra):
        dados = {"rotulo": "Como funciona", "legenda": "Olha só 👇", "mime": "video/mp4",
                 "b64": "data:video/mp4;base64," + base64.b64encode(b"x" * 4000).decode()}
        dados.update(extra)
        return painel.salva_video_pronto(dados, "dione")

    def test_cria_edita_e_exclui(self):
        itens = self._cria()
        self.assertEqual(1, len(itens))
        v = itens[0]
        self.assertRegex(v["id"], r"^v_[0-9a-f]{8}$")
        self.assertEqual(("Como funciona", "Olha só 👇", 4000), (v["rotulo"], v["legenda"], v["tamanho"]))
        self.assertTrue(os.path.exists(painel.caminho_video_pronto(v["id"])))

        itens = painel.salva_video_pronto({"id": v["id"], "rotulo": "Novo nome", "legenda": ""}, "dione")
        self.assertEqual(("Novo nome", ""), (itens[0]["rotulo"], itens[0]["legenda"]))

        self.assertEqual([], painel.exclui_video_pronto(v["id"]))
        self.assertFalse(os.path.exists(painel.caminho_video_pronto(v["id"])))

    def test_recusa_sem_nome_vazio_grande_ou_nao_video(self):
        with self.assertRaises(ValueError):
            self._cria(rotulo=" ")
        with self.assertRaises(ValueError):
            self._cria(b64=base64.b64encode(b"x").decode())
        with self.assertRaises(ValueError):
            self._cria(mime="audio/mpeg")
        with patch.object(painel, "MAX_VIDEO_BYTES", 100):
            with self.assertRaises(ValueError):
                self._cria()
        with self.assertRaises(ValueError):
            painel.caminho_video_pronto("../painel.db")

    def test_manda_video_com_legenda(self):
        v = self._cria()[0]
        with patch.object(painel, "uz", return_value={"ok": True}) as uz:
            painel.manda_video("5511999999999", v)
        rota, corpo = uz.call_args[0]
        self.assertEqual("/send/media", rota)
        self.assertEqual("video", corpo["type"])
        self.assertEqual("Olha só 👇", corpo["text"])
        self.assertTrue(corpo["file"].startswith("data:video/mp4;base64,"))

    def test_sem_legenda_nao_manda_texto(self):
        v = self._cria(legenda="")[0]
        with patch.object(painel, "uz", return_value={}) as uz:
            painel.manda_video("5511", v)
        self.assertNotIn("text", uz.call_args[0][1])


if __name__ == "__main__":
    unittest.main()
