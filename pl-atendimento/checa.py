#!/usr/bin/env python3
"""Confere se a pagina servida pelo painel esta sa antes de confiar nela.

Motivo: uma quebra de linha dentro de uma string do JavaScript derrubou o script
inteiro. O servidor respondia 200, a API funcionava, e a tela abria VAZIA — sem
nenhum erro visivel. Este teste pega isso em 2 segundos.

Uso:  python checa.py
"""
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
BASE = "http://localhost:8781"


def pega(caminho, timeout=30):
    with urllib.request.urlopen(BASE + caminho, timeout=timeout) as r:
        return r.read().decode("utf-8")


falhas = []

# 1) a pagina responde
try:
    html = pega("/")
    print("página .............. %d bytes" % len(html))
except Exception as e:
    print("página .............. FALHOU: %s" % str(e)[:80])
    sys.exit(1)

# 2) o JavaScript compila (o erro que passou despercebido)
js = html[html.index("<script>") + 8: html.rindex("</script>")]
tmp = os.path.join(tempfile.gettempdir(), "_painel_check.js")
open(tmp, "w", encoding="utf-8").write(js)
r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
os.remove(tmp)
if r.returncode:
    print("javascript ........... QUEBRADO")
    print(re.sub(r"^", "    ", r.stderr[:600], flags=re.M))
    falhas.append("js")
else:
    print("javascript ........... ok (%d bytes)" % len(js))

# 3) as rotas que a tela usa no primeiro carregamento
for rota, chave in [("/api/prontos", "audios"), ("/api/fila", None),
                    ("/api/contagem", "_esperando"), ("/api/sync", None)]:
    try:
        d = json.loads(pega(rota))
        if chave and chave not in d:
            raise ValueError("sem a chave %s" % chave)
        n = len(d) if isinstance(d, list) else "ok"
        print("%-20s %s" % (rota + " " + "." * (18 - len(rota)), n))
    except Exception as e:
        print("%-20s FALHOU: %s" % (rota, str(e)[:70]))
        falhas.append(rota)

# 4) elementos que a tela precisa ter
for marca in ('id="lista"', 'id="filtros"', 'id="painel"', 'class="planos"',
              'id="mic"', 'function ocultar'):
    if marca not in html:
        print("faltando na página ... %s" % marca)
        falhas.append(marca)

print()
print("TUDO CERTO" if not falhas else "PROBLEMAS: %s" % ", ".join(falhas))
sys.exit(1 if falhas else 0)
