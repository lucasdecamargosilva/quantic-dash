import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
APIFY_TOKEN = os.getenv("APIFY_TOKEN")

HASHTAGS = [
    "oculosdegrau",
    "oticaonline",
    "oculosdesol",
    "eyewear",
    "oculospersonalizados",
]

PROVADOR_KEYWORDS = [
    "provador virtual",
    "try on",
    "experimentar",
    "virtual fitting",
    "try-on",
    "prova virtual",
]

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
LEADS_BRUTOS_PATH = os.path.join(DATA_DIR, "leads_brutos.json")
LEADS_FILTRADOS_PATH = os.path.join(DATA_DIR, "leads_filtrados.json")
