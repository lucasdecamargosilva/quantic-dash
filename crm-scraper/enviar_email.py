"""
Envia email via Titan SMTP usando o template HTML.

Uso:
    # teste para um email especifico
    python enviar_email.py --to lucasdecamargo2015@gmail.com --teste

    # disparo para leads em status novo com email preenchido
    python enviar_email.py --limite 10 --intervalo 1
"""
import argparse
import os
import random
import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY

EMAIL_USER = os.getenv("EMAIL_USER", "contato@provoulevou.com.br")
EMAIL_PASS = os.getenv("EMAIL_PASS", "")
SMTP_HOST = "smtpout.secureserver.net"
SMTP_PORT = 465

MODELOS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "Modelos Email",
)

# Mapeia categoria -> (template, assunto)
TEMPLATES = {
    "roupa": (
        os.path.join(MODELOS_DIR, "email-marketing-apresentacao.html"),
        "Notamos que sua loja ainda não tem provador virtual",
    ),
    "oculos": (
        os.path.join(MODELOS_DIR, "email-marketing-oculos.html"),
        "Notamos que sua marca ainda não tem provador virtual de óculos",
    ),
}

# Status que ainda NAO receberam email — sao alvo do disparo
STATUS_PRE_EMAIL = ["novo", "dm_enviada", "mensagem_1", "mensagem_2", "mensagem_3"]


def carregar_template(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def enviar(destinatario: str, html: str, assunto: str) -> tuple[bool, str]:
    """Envia o email via SMTP Titan. Tenta porta 465 (SSL) e fallback pra 587 (TLS)."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = assunto
    msg["From"] = f"Provou Levou <{EMAIL_USER}>"
    msg["To"] = destinatario
    msg.attach(MIMEText(html, "html", "utf-8"))

    # Tenta porta 465 (SSL) primeiro
    try:
        with smtplib.SMTP_SSL(SMTP_HOST, 465, timeout=30) as server:
            server.login(EMAIL_USER, EMAIL_PASS)
            server.sendmail(EMAIL_USER, [destinatario], msg.as_string())
        return (True, "via SMTP_SSL/465")
    except Exception as e1:
        # Fallback porta 587 (TLS)
        try:
            with smtplib.SMTP(SMTP_HOST, 587, timeout=30) as server:
                server.starttls()
                server.login(EMAIL_USER, EMAIL_PASS)
                server.sendmail(EMAIL_USER, [destinatario], msg.as_string())
            return (True, "via STARTTLS/587")
        except Exception as e2:
            return (False, f"SSL: {type(e1).__name__}: {e1} | TLS: {type(e2).__name__}: {e2}")


def registrar_no_crm(sb, lead_id: str, destinatario: str):
    sb.table("interacoes").insert({
        "lead_id": lead_id,
        "tipo": "dm_enviada",
        "conteudo": f"Email enviado para {destinatario}",
    }).execute()
    sb.table("leads").update({"status": "email_enviado"}).eq("id", lead_id).execute()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--to", type=str, help="Email destinatario para teste")
    parser.add_argument("--categoria", choices=["oculos", "roupa"], default="oculos",
                        help="Define template + filtra leads")
    parser.add_argument("--limite", type=int, default=10)
    parser.add_argument("--intervalo", type=int, default=1, help="minutos entre envios")
    args = parser.parse_args()

    if not EMAIL_PASS:
        print("ERRO: EMAIL_PASS nao definido no .env")
        return

    template_path, assunto = TEMPLATES[args.categoria]
    html = carregar_template(template_path)
    print(f"Template ({args.categoria}): {len(html)} chars — {os.path.basename(template_path)}")

    # Modo teste: envia para 1 email especifico
    if args.to:
        print(f"\n>>> TESTE: enviando para {args.to}")
        ok, erro = enviar(args.to, html, assunto)
        print(f"  {'ENVIADO!' if ok else f'ERRO: {erro}'}")
        return

    # Disparo em massa: leads na categoria com email + status pre-email
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    todos = (
        sb.table("leads").select("*")
        .eq("categoria", args.categoria)
        .in_("status", STATUS_PRE_EMAIL)
        .order("created_at")
        .execute()
        .data or []
    )
    leads = [l for l in todos if l.get("email") and "@" in l.get("email", "")][:args.limite]

    if not leads:
        print("Nenhum lead com email valido encontrado.")
        return

    print(f"\n{'='*50}")
    print(f"  ENVIO EMAIL — {len(leads)} leads ({args.categoria})")
    print(f"  Intervalo: {args.intervalo} min")
    print(f"{'='*50}\n")

    enviados = 0
    falhas = 0

    for i, lead in enumerate(leads):
        email = lead["email"]
        nome = lead.get("nome_loja") or lead["instagram"]
        print(f"[{i+1}/{len(leads)}] {nome} ({email})")

        ok, erro = enviar(email, html, assunto)
        if ok:
            registrar_no_crm(sb, lead["id"], email)
            enviados += 1
            print(f"  ENVIADO -> email_enviado")
        else:
            falhas += 1
            print(f"  ERRO: {erro}")

        if i < len(leads) - 1 and args.intervalo > 0:
            espera = args.intervalo * 60 + random.randint(-10, 10)
            espera = max(espera, 5)
            print(f"\n  Aguardando {espera}s...\n")
            time.sleep(espera)

    print(f"\n{'='*50}")
    print(f"  RESULTADO: {enviados} enviados, {falhas} falhas")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    main()
