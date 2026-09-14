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

    def test_abordagem_personaliza_nome_e_remetente_em_duas_mensagens(self):
        chamadas = []
        c = painel.con()
        c.execute("UPDATE leads SET nome=? WHERE chatid=?", ("Maria Silva", "b@s.whatsapp.net"))
        c.commit()

        def envia(path, body):
            chamadas.append((path, body.copy()))

        with patch.object(painel, "uz", side_effect=envia):
            eid = painel.inicia_disparo_massa(
                ["a@s.whatsapp.net", "b@s.whatsapp.net"], "prévia", "abordagem", "a Dione"
            )
            estado = self.wait(eid)

        self.assertEqual("ok", estado["estado"])
        self.assertEqual(2, estado["enviados"])
        self.assertEqual(["/send/text"] * 4, [item[0] for item in chamadas])
        self.assertEqual(
            ["Oi Loja, aqui é a Dione, da Provou Levou.", painel.ABORDAGEM_SEGUNDA,
             "Oi Maria, aqui é a Dione, da Provou Levou.", painel.ABORDAGEM_SEGUNDA],
            [item[1]["text"] for item in chamadas],
        )
        self.assertEqual(
            ["5511000000001", "5511000000001", "5511000000002", "5511000000002"],
            [item[1]["number"] for item in chamadas],
        )

    def test_abordagem_sem_nome_e_falha_na_segunda_mensagem(self):
        c = painel.con()
        c.execute("UPDATE leads SET nome=? WHERE chatid=?", ("5511000000001", "a@s.whatsapp.net"))
        c.commit()
        chamadas = []

        def envia(_path, body):
            chamadas.append(body["text"])
            if len(chamadas) == 2:
                raise RuntimeError("instância desconectada")

        with patch.object(painel, "uz", side_effect=envia):
            eid = painel.inicia_disparo_massa(["a@s.whatsapp.net"], "", "abordagem", "o Lucas")
            estado = self.wait(eid)

        self.assertEqual("Oi, aqui é o Lucas, da Provou Levou.", chamadas[0])
        self.assertEqual("erro", estado["estado"])
        self.assertEqual(1, estado["falhas"])
        self.assertEqual(1, estado["resultados"][0]["mensagens_enviadas"])
        self.assertIn("primeira mensagem foi enviada", estado["resultados"][0]["erro"])

    def test_rejeita_modelo_desconhecido(self):
        with self.assertRaisesRegex(ValueError, "Modelo"):
            painel.inicia_disparo_massa(["a@s.whatsapp.net"], "Olá", "desconhecido")

    def test_nome_da_abordagem_segue_login(self):
        self.assertEqual("a Dione", painel.nome_vendedor("dione"))
        self.assertEqual("o Lucas", painel.nome_vendedor("lucas"))

    def test_catalogo_envia_duas_mensagens_e_video_por_ultimo(self):
        chamadas = []

        def envia(path, body):
            chamadas.append((path, body))

        with patch.object(painel, "uz", side_effect=envia), patch.object(
            painel, "fonte_video_catalogo", return_value="data:video/mp4;base64,AAAA"
        ):
            painel.manda_catalogo("5511000000001")

        self.assertEqual(["/send/text", "/send/text", "/send/media"], [c[0] for c in chamadas])
        self.assertEqual("video", chamadas[-1][1]["type"])
        self.assertEqual("data:video/mp4;base64,AAAA", chamadas[-1][1]["file"])

    def test_video_do_catalogo_pode_ser_enviado_apos_aprovacao_dos_textos(self):
        with patch.object(painel, "uz") as mock_uz, patch.object(
            painel, "fonte_video_catalogo", return_value="data:video/mp4;base64,AAAA"
        ):
            painel.manda_video_catalogo("5511000000001")

        mock_uz.assert_called_once_with("/send/media", {
            "number": "5511000000001", "type": "video",
            "file": "data:video/mp4;base64,AAAA",
        })


if __name__ == "__main__":
    unittest.main()
