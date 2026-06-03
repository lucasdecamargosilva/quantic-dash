"""
Exporta os leads coletados pelo tiktok.py para o Supabase, marcando plataforma='tiktok'.

Separado do exportar.py (Instagram) de proposito — para nao tocar no fluxo que ja funciona.
Le o mesmo arquivo de leads filtrados (data/leads_filtrados.json) que o tiktok.py gera.

Dedup: pula leads cujo @handle ja existe na tabela (UNIQUE(instagram) original mantido).

Uso:
    python tiktok.py --limit 30 --min-seg 5000
    python exportar_tiktok.py
"""
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

    print(f"Exportando {len(leads)} leads do TikTok para o Supabase...")
    inseridos = 0
    duplicados = 0

    for lead in leads:
        # Dedup pelo @handle (UNIQUE original). Se ja existe (IG ou TikTok), pula.
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
            "instagram": lead["instagram"],          # handle do TikTok
            "nome_loja": lead["nome_loja"],
            "site": lead["site"],
            "seguidores": lead["seguidores"],
            "tem_provador": lead.get("tem_provador", False),
            "status": "novo_tiktok",   # cai na coluna "Novo TikTok" do pipeline
            "idioma": lead.get("idioma", "pt"),
            "categoria": lead.get("categoria", "oculos"),
            "plataforma": "tiktok",
            "fonte_oportunidade": "TikTok",  # mostra o logo do TikTok no CRM (FonteLogo)
            "responsavel": "Lucas de Camargo",
            "whatsapp": lead.get("whatsapp"),
        }

        supabase.table("leads").insert(row).execute()
        print(f"  @{lead['instagram']} (tiktok) — inserido")
        inseridos += 1

    print(f"\nResultado: {inseridos} inseridos, {duplicados} duplicados ignorados")


if __name__ == "__main__":
    main()
