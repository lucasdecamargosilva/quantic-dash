"""Read-only: diagnostico mais profundo de leads / opportunities / contacts."""
import os
import sys
import truststore
truststore.inject_into_ssl()
sys.stdout.reconfigure(encoding="utf-8")

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

print("=" * 60)
print("CONTAGEM (count='exact' revela RLS vs vazio de verdade)")
print("=" * 60)
for table in ["leads", "opportunities", "contacts", "leads_qualificados"]:
    try:
        res = sb.table(table).select("*", count="exact").limit(0).execute()
        print(f"  {table:<25} count = {res.count}")
    except Exception as e:
        print(f"  {table:<25} ERRO: {str(e)[:100]}")

print("\n" + "=" * 60)
print("Tenta SELECT por colunas conhecidas em opportunities")
print("=" * 60)
try:
    cols = "id,stage,pipeline,responsible_name,nome_oportunidade,fonte_oportunidade,telefone,email,site,tags,usuario_insta,contact_id,user_id,created_at,updated_at"
    res = sb.table("opportunities").select(cols).limit(3).execute()
    print(f"  retornou {len(res.data or [])} linha(s)")
    for r in (res.data or []):
        print(f"  -> {r}")
except Exception as e:
    print(f"  ERRO: {e}")

print("\n" + "=" * 60)
print("Tenta SELECT por colunas conhecidas em contacts")
print("=" * 60)
try:
    res = sb.table("contacts").select("id,full_name,company_name,phone,email,user_id").limit(3).execute()
    print(f"  retornou {len(res.data or [])} linha(s)")
    for r in (res.data or []):
        print(f"  -> {r}")
except Exception as e:
    print(f"  ERRO: {e}")

print("\n" + "=" * 60)
print("Distribuicao de status na tabela leads")
print("=" * 60)
try:
    res = sb.table("leads").select("status").limit(1000).execute()
    from collections import Counter
    c = Counter(l["status"] for l in (res.data or []))
    for status, n in c.most_common():
        print(f"  {status:<20} {n}")
except Exception as e:
    print(f"  ERRO: {e}")
