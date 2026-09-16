import json
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from unittest.mock import patch

import painel
from test_busca import BuscaTest


class DestinatarioTest(BuscaTest):
    def test_telefone_de_outro_lead_bloqueia_envio_e_metrica(self):
        with patch.object(painel, 'uz') as send:
            for chatid, phone in [('a', '552199998888'), ('', '5511987654321'),
                                  ('inexistente', '5511987654321')]:
                with self.assertRaises(ValueError):
                    painel.envia_texto(chatid, phone, 'Olá', 'Dione')
            send.assert_not_called()
        self.assertEqual(0, painel.con().execute('SELECT count(*) FROM atendimentos_iniciados').fetchone()[0])

    def test_envio_valido_usa_telefone_da_conversa(self):
        with patch.object(painel, 'uz', return_value={}) as send:
            painel.envia_texto('a', '5511987654321', 'Olá', 'Dione')
            send.assert_called_once_with('/send/text', {'number': '5511987654321', 'text': 'Olá'})

    def test_todas_rotas_de_envio_rejeitam_destinatario_divergente(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), painel.H)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with patch.object(painel, 'uz') as send:
                for route in ['enviar', 'audio', 'combo', 'catalogo', 'catalogo/video', 'gravado']:
                    req = urllib.request.Request(
                        'http://127.0.0.1:%s/api/%s' % (server.server_port, route),
                        data=json.dumps({'chatid': 'a', 'fone': '552199998888'}).encode(),
                        headers={'Content-Type': 'application/json'})
                    with self.assertRaises(urllib.error.HTTPError) as error:
                        urllib.request.urlopen(req)
                    self.assertEqual(409, error.exception.code)
                send.assert_not_called()
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
