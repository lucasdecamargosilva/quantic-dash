"""
Importa os leads da DEMO "experimentar provador" (landing_leads, utm_source='loja-teste')
pro CRM (tabela leads), como fonte 'demo_provador'. São leads QUENTES: o dono da loja
veio ao provoulevou.com.br e testou o provador, deixando a URL da loja.

Filtra: lixo/gibberish, domínios de e-mail, quem já é cliente (lojistas.origem), typos de
cliente e quem já está no CRM. Só tem o DOMÍNIO (sem contato) — instagram é preenchido com
o domínio como placeholder e status fica 'novo'; o enriquecimento acha o @IG/WhatsApp depois.

USO:
  python importar_demo_leads.py --dry-run     # mostra o que importaria
  python importar_demo_leads.py               # importa de verdade
"""
import argparse
from datetime import datetime
from collections import defaultdict
from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY

KW = ['oculos', 'otica', 'eyewear', 'vision', 'glass', 'sun', 'solar', 'moda', 'shop', 'store',
      'brand', 'joia', 'acess', 'kids', 'teen', 'style', 'look', 'wear', 'optic', 'lentes',
      'sunglass', 'eco', 'select', 'elegance', 'use']
OTICA = ['oculos', 'otica', 'eyewear', 'vision', 'glass', 'sun', 'solar', 'lentes', 'optic', 'sunglass']
LIXO = {'provoulevou.com.br', 'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.br',
        'icloud.com', 'teste.com.br', 'teste.com', 'minhaloja.com', 'minhaloja.com.br', 'loja.com',
        'loja.com.br', 'example.com', 'shein.com.br', 'instagran.com.br'}
TYPOS_CLIENTE = {'cacife.com', 'marianacardoso.com', 'acessoriosstyle.com.br', 'meninaflor.com.br', 'meumillu.com.br'}
BADPREF = ('teste', 'minha', 'exemplo', 'asd', 'dfg', 'qwe', 'xxx', 'sad', 'dsa', 'fsd', 'kif',
           'gur', 'yhg', 'nsd', 'hrh', 'jej', 'ase', 'iin', 'asa', 'saf', 'awc', 'dsad', '13r', 'jane', 'ane')


def dom(u):
    s = str(u or '').lower().strip().replace('http://', '').replace('https://', '').replace('www.', '')
    return s.split('/')[0].split('?')[0].strip()


def eh_lixo(d):
    if not d or '.' not in d or d in LIXO or d in TYPOS_CLIENTE:
        return True
    if d.endswith('.edu.br') or d.endswith('.com.ar') or d.endswith('.optica'):
        return True
    nome = d.split('.')[0]
    if len(nome) < 4:
        return True
    if nome.startswith(BADPREF):
        return True
    if any(k in d for k in KW):
        return False
    return (sum(1 for c in nome if c in 'aeiou') / max(len(nome), 1)) < 0.32


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    rows = sb.table("landing_leads").select("utm_content,created_at").eq("utm_source", "loja-teste").limit(5000).execute().data or []
    por = defaultdict(lambda: {'n': 0, 'ult': ''})
    for r in rows:
        d = dom(r.get('utm_content'))
        if d:
            por[d]['n'] += 1
            por[d]['ult'] = max(por[d]['ult'], (r.get('created_at') or '')[:10])

    clientes = {dom(x['origem']) for x in (sb.table("lojistas").select("origem").execute().data or []) if x.get('origem')}
    no_crm = set()
    frm = 0
    while True:
        b = sb.table("leads").select("site,instagram").range(frm, frm + 999).execute().data or []
        for x in b:
            if x.get('site'):
                no_crm.add(dom(x['site']))
            if x.get('instagram'):
                no_crm.add(dom(x['instagram']))
        if len(b) < 1000:
            break
        frm += 1000

    novos = [(d, i['n'], i['ult']) for d, i in por.items()
             if not eh_lixo(d) and d not in clientes and d not in no_crm]
    novos.sort(key=lambda x: (-x[1], x[0]))
    print(f"{len(novos)} prospects reais novos da demo\n")

    imp = 0
    for d, n, ult in novos:
        cat = 'oculos' if any(k in d for k in OTICA) else 'roupa'
        try:
            ultf = datetime.strptime(ult, "%Y-%m-%d").strftime("%d/%m") if ult else "?"
        except Exception:
            ultf = ult
        lead = {
            "instagram": d, "site": d, "nome_loja": d, "status": "novo",
            "fonte_oportunidade": "demo_provador", "tem_provador": False,
            "categoria": cat, "idioma": "pt", "pais": "BR",
            "notas": f"Testou a demo no site ({n}x, último {ultf}). Lead QUENTE — enriquecer contato (IG/WhatsApp) + mandar isca.",
        }
        if args.dry_run:
            print(f"  {d:38} testes={n} [{cat}]")
            imp += 1
            continue
        try:
            sb.table("leads").insert(lead).execute()
            imp += 1
            print(f"  ✓ {d} [{cat}] ({n}x)")
        except Exception as e:
            print(f"  ⏭  {d}: {str(e)[:70]}")

    print(f"\n{'(dry-run) ' if args.dry_run else ''}{imp} leads da demo (fonte='demo_provador').")


if __name__ == "__main__":
    main()
