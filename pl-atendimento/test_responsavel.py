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

    def test_filtro_combina_responsavel_busca_e_etapa(self):
        painel.cria_banco()
        c = painel.con()
        c.executemany("INSERT INTO leads(chatid,fone,nome,status,ultimo_ts,ultimo_de,responsavel) "
                      "VALUES(?,?,?,?,?,?,?)", [
            ("a", "5511000000001", "Loja Aurora", "INTERESSADO", 1, "lead", "Dione"),
            ("b", "5511000000002", "Loja Bela", "TESTE GRÁTIS", 2, "lead", "Dione"),
            ("c", "5511000000003", "Loja Clara", "INTERESSADO", 3, "lead", "Lucas"),
            ("d", "5511000000004", "Loja Dora", "INTERESSADO", 4, "lead", None),
        ])
        c.commit()
        self.assertEqual({"a", "b"}, {r["chatid"] for r in painel.fila(responsavel="Dione")})
        self.assertEqual(["b"], [r["chatid"] for r in painel.fila("TESTE GRÁTIS", responsavel="Dione")])
        self.assertEqual(["a"], [r["chatid"] for r in painel.fila(busca="Aurora", responsavel="Dione")])
        self.assertEqual([], painel.fila(busca="Aurora", responsavel="Lucas"))
        self.assertEqual(["d"], [r["chatid"] for r in painel.fila(responsavel="_sem_responsavel")])
        self.assertEqual(4, len(painel.fila()))

    def test_grafico_conta_todas_etapas_sem_removidos_e_suporte(self):
        painel.cria_banco()
        c = painel.con()
        c.executemany("INSERT INTO leads(chatid,nome,status,ultimo_ts,ultimo_de,responsavel,oculto) "
                      "VALUES(?,?,?,?,?,?,?)", [
            ("a", "A", "INTERESSADO", 1, "lead", "Dione", 0),
            ("b", "B", "CONVERTIDO", 2, "nos", "Dione", 0),
            ("c", "C", "INTERESSADO", 3, "lead", "Lucas", 1),
            ("d", "D", "INTERESSADO", 4, "lead", None, 0),
            ("e", "E", "INTERESSADO", 5, "lead", "Lucas", 0),
        ])
        c.execute("INSERT INTO mensagens(messageid,chatid,from_me,texto) VALUES(?,?,?,?)",
                  ("suporte", "e", 0, "Olá! Tive um problema ao usar o provador virtual"))
        c.commit()
        dados = painel.contagem()["_responsaveis"]
        self.assertEqual({"Lucas": 0, "Dione": 2, "": 1}, {r["responsavel"]: r["total"] for r in dados})
        painel.atribui_responsavel("d", "Lucas")
        self.assertEqual({"Lucas": 1, "Dione": 2, "": 0},
                         {r["responsavel"]: r["total"] for r in painel.contagem()["_responsaveis"]})
