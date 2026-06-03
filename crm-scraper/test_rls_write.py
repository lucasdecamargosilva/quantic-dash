"""No-op write test: anon key consegue UPDATE em leads?"""
import os, sys, truststore
truststore.inject_into_ssl()
sys.stdout.reconfigure(encoding="utf-8")

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

# Pega um lead qualquer (sem alterar nada)
lead = sb.table("leads").select("id,status,instagram,updated_at").limit(1).execute().data
if not lead:
    print("Nenhum lead encontrado.")
    sys.exit(1)
lead = lead[0]
print(f"Lead alvo: id={lead['id']}  insta={lead['instagram']}  status atual={lead['status']}")
print(f"updated_at antes: {lead['updated_at']}\n")

# Update no-op: seta status pro mesmo valor
print("Tentando UPDATE leads.status para o MESMO valor (no-op)...")
try:
    res = sb.table("leads").update({"status": lead["status"]}).eq("id", lead["id"]).execute()
    print(f"  Retornou: {len(res.data or [])} linha(s) afetada(s)")
    if res.data:
        print(f"  updated_at depois: {res.data[0].get('updated_at')}")
        print("\n  >>> ANON KEY CONSEGUE WRITE. service_role NAO eh necessario.")
    else:
        print("\n  >>> UPDATE silencioso (zero linhas) — provavelmente RLS bloqueando sem erro.")
        print("  >>> Precisa service_role.")
except Exception as e:
    print(f"  ERRO: {e}")
    print("\n  >>> Precisa service_role.")

# Tenta INSERT em interacoes (script faz isso a cada DM)
print("\nTentando INSERT em interacoes (script faz isso a cada DM)...")
try:
    res = sb.table("interacoes").insert({
        "lead_id": lead["id"],
        "tipo": "nota",
        "conteudo": "[TESTE RLS - PODE APAGAR]",
    }).execute()
    if res.data:
        insert_id = res.data[0]["id"]
        print(f"  INSERT OK. id={insert_id} — vou apagar em seguida.")
        sb.table("interacoes").delete().eq("id", insert_id).execute()
        print(f"  DELETE OK (limpeza).")
        print("\n  >>> ANON KEY CONSEGUE INSERT. service_role NAO eh necessario.")
    else:
        print("  >>> INSERT silencioso. Precisa service_role.")
except Exception as e:
    print(f"  ERRO: {e}")
    print("\n  >>> Precisa service_role.")
