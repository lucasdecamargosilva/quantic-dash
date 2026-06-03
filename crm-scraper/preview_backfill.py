"""Verifica status atual dos 5 leads do lote de teste."""
import os, sys, truststore
truststore.inject_into_ssl()
sys.stdout.reconfigure(encoding="utf-8")

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

alvos = ["minimalclub.br", "amarilis.oficial_", "lojadyll", "lojamarfitness", "aquarelabikinis_"]
res = sb.table("leads").select("instagram,status,responsavel,updated_at").in_("instagram", alvos).execute()

print(f"{'instagram':<25} {'status':<15} {'responsavel':<25} updated_at")
print("-" * 100)
for r in (res.data or []):
    print(f"@{r['instagram']:<24} {r['status']:<15} {(r.get('responsavel') or '-'):<25} {r['updated_at']}")

print("\n== Esperado ==")
print("  @minimalclub.br      -> dm_enviada (falhou)")
print("  os outros 4          -> mensagem_1 (enviado com sucesso)")

# Conta as interacoes inseridas no dia de hoje (sanity check)
from datetime import datetime, timezone
hoje = datetime.now(timezone.utc).strftime("%Y-%m-%d")
ints = sb.table("interacoes").select("id,lead_id,tipo,conteudo,created_at").gte("created_at", hoje + "T00:00:00").eq("tipo", "follow_up").execute()
print(f"\n== interacoes (follow_up) criadas hoje: {len(ints.data or [])} ==")
for i in (ints.data or [])[-5:]:
    print(f"  {i['created_at']}  lead={i['lead_id'][:8]}  {i['conteudo']}")
