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

    def test_primeiro_envio_registra_uma_conversa_para_o_responsavel(self):
        with patch.object(painel, "uz"):
            painel.envia_texto("a@s.whatsapp.net", "5511000000001", "Oi", "Dione")
            painel.envia_texto("a@s.whatsapp.net", "5511000000001", "Tudo bem?", "Lucas")

        registro = painel.con().execute("SELECT responsavel FROM conversas_iniciadas").fetchall()
        self.assertEqual(["Dione"], [r["responsavel"] for r in registro])

    def test_metas_contam_atribuicao_na_data_certa_sem_duplicar(self):
        # First message predates the assignment and must not date the metric.
        c = painel.con()
        c.execute("INSERT INTO mensagens(messageid,chatid,ts,from_me) VALUES(?,?,?,1)",
                  ("antiga", "a@s.whatsapp.net", 1786380230557))
        c.commit()
        with patch.object(painel.time, "time", return_value=1789434000):
            painel.atribui_responsavel("a@s.whatsapp.net", "Dione")
            painel.atribui_responsavel("a@s.whatsapp.net", "Dione")
            painel.atribui_responsavel("a@s.whatsapp.net", None)
            painel.atribui_responsavel("a@s.whatsapp.net", "Dione")
        self.assertEqual([{"responsavel":"Dione","dia":"2026-09-14","total":1}],
                         painel.metas_conversas("2026-09-14", "2026-09-14"))
        self.assertEqual([], painel.metas_conversas("2026-08-01", "2026-08-31"))

    def test_troca_de_responsavel_preserva_historico(self):
        with patch.object(painel.time, "time", return_value=1789434000):
            painel.atribui_responsavel("a@s.whatsapp.net", "Dione")
            painel.atribui_responsavel("a@s.whatsapp.net", "Lucas")
        totais = {r["responsavel"]:r["total"] for r in painel.metas_conversas("2026-09-14", "2026-09-14")}
        self.assertEqual({"Dione":1,"Lucas":1}, totais)

    def test_conversa_com_envio_historico_nao_e_atribuida_novamente(self):
        c = painel.con()
        c.execute(
            "INSERT INTO mensagens(messageid,chatid,ts,from_me,tipo,texto,file_url,segundos) "
            "VALUES(?,?,?,?,?,?,?,?)",
            ("historica", "a@s.whatsapp.net", 1, 1, "text", "Olá", "", 0),
        )
        c.commit()

        with patch.object(painel, "uz"):
            painel.envia_texto("a@s.whatsapp.net", "5511000000001", "Retorno", "Dione")

        hoje = time.strftime("%Y-%m-%d", time.localtime())
        self.assertEqual([], painel.metas_conversas(hoje, hoje))

    def test_falha_no_envio_nao_registra_conversa_iniciada(self):
        with patch.object(painel, "uz", side_effect=RuntimeError("falhou")):
            with self.assertRaisesRegex(RuntimeError, "falhou"):
                painel.envia_texto("a@s.whatsapp.net", "5511000000001", "Oi", "Dione")

        hoje = time.strftime("%Y-%m-%d", time.localtime())
        self.assertEqual([], painel.metas_conversas(hoje, hoje))

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

    def test_preco_por_prova_fica_proximo_de_078_ate_159_e_cai_nos_maiores(self):
        taxas = []
        texto_planos = next(t["texto"] for t in painel.TEXTOS if t["id"] == "tabela")
        for plano in painel.PLANOS:
            preco = int(plano["preco"].removeprefix("R$ ").replace(".", ""))
            provas = int(plano["fotos"].replace(".", ""))
            taxa = float(plano["por_prova"].removeprefix("R$ ").replace(",", "."))
            self.assertAlmostEqual(preco / provas, taxa, delta=0.0051)
            self.assertIn(f"{plano['preco']} — {plano['fotos']} provas", texto_planos)
            taxas.append(taxa)
        self.assertEqual([50, 100, 200], [int(p["fotos"]) for p in painel.PLANOS[:3]])
        self.assertTrue(all(0.78 <= taxa <= 0.80 for taxa in taxas[:3]))
        self.assertTrue(all(a > b for a, b in zip(taxas[2:], taxas[3:])))
        self.assertGreaterEqual(taxas[-1], 0.55)


if __name__ == "__main__":
    unittest.main()
