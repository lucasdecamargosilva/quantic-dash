#!/usr/bin/env python3
"""Salva os 2 audios padrao em audios/<id>.mp3 a partir da sua conversa com voce mesmo.

Por que existe: a Uazapi apaga os arquivos depois de poucos dias. Quando isso
acontece a URL fixa vira 404 e o combo morre com HTTP 500. Com o mp3 salvo aqui
o painel manda em base64 e nunca mais depende da URL.

Como usar:
  1. Mande os 2 audios na SUA conversa com voce mesmo, nesta ordem:
        1) o de ~16s  "o ideal e o Catalogo"
        2) o de ~19s  "7 dias gratis"
  2. Rode:  python pega_audios.py
"""
import base64
import io
import json
import os
import sys
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
SP = os.path.dirname(os.path.abspath(__file__))
TOKEN = os.environ.get("UAZAPI_TOKEN", "")
EU = "5511938034714@s.whatsapp.net"
ORDEM = ["indicacatalogo", "setedias"]   # ordem em que voce manda


def api(rota, body):
    r = urllib.request.Request("https://quantic.uazapi.com" + rota,
                               data=json.dumps(body).encode(),
                               headers={"token": TOKEN, "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=90) as x:
        return json.loads(x.read())


d = api("/message/find", {"chatid": EU, "limit": 60})
msgs = d.get("messages", d) if isinstance(d, dict) else d
audios = [m for m in msgs
          if "udio" in str(m.get("messageType", "")) and str(m.get("status")) != "Deleted"]
audios.sort(key=lambda m: int(m.get("messageTimestamp") or 0))
ultimos = audios[-len(ORDEM):]

if len(ultimos) < len(ORDEM):
    print("achei so %d audio(s) na conversa com voce mesmo — mande os %d e rode de novo."
          % (len(ultimos), len(ORDEM)))
    sys.exit(1)

os.makedirs(os.path.join(SP, "audios"), exist_ok=True)
for nome, m in zip(ORDEM, ultimos):
    url = m.get("content") or m.get("file") or m.get("mediaUrl") or ""
    if not str(url).startswith("http"):
        url = api("/message/download", {"id": m["id"]}).get("fileURL", "")
    with urllib.request.urlopen(urllib.request.Request(url), timeout=90) as x:
        b = x.read()
    caminho = os.path.join(SP, "audios", nome + ".mp3")
    with open(caminho, "wb") as f:
        f.write(b)
    print("%-16s %3ss  %7d bytes  -> audios/%s.mp3"
          % (nome, m.get("seconds", "?"), len(b), nome))
print("\nPronto. Reinicie o painel e o combo volta a funcionar.")
