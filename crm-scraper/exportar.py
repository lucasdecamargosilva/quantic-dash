import json
from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY, LEADS_FILTRADOS_PATH


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Erro: SUPABASE_URL e SUPABASE_KEY devem estar definidos no .env")
        return

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    with open(LEADS_FILTRADOS_PATH, "r", encoding="utf-8") as f:
        leads = json.load(f)

    print(f"Exportando {len(leads)} leads para o Supabase...")
    inseridos = 0
    duplicados = 0

    for lead in leads:
        # Checa se ja existe pelo instagram (unique)
        existing = (
            supabase.table("leads")
            .select("id")
            .eq("instagram", lead["instagram"])
            .execute()
        )

        if existing.data:
            print(f"  @{lead['instagram']} — ja existe, pulando")
            duplicados += 1
            continue

        row = {
            "instagram": lead["instagram"],
            "nome_loja": lead["nome_loja"],
            "site": lead["site"],
            "seguidores": lead["seguidores"],
            "tem_provador": lead.get("tem_provador", False),
            "status": "novo",
            "idioma": lead.get("idioma", "pt"),
        }

        supabase.table("leads").insert(row).execute()
        print(f"  @{lead['instagram']} — inserido")
        inseridos += 1

    print(f"\nResultado: {inseridos} inseridos, {duplicados} duplicados ignorados")


if __name__ == "__main__":
    main()
