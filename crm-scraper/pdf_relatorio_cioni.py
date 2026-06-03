"""Gera PDF com leads do Lucas Cioni em 7 pipelines:
Stand By, Fechou, Testando, Reuniao Agendada, Interessado, Fotos Enviadas, Respondeu."""
import os, certifi
from datetime import datetime

os.environ['SSL_CERT_FILE'] = certifi.where()
os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()
try:
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass

from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY
from fpdf import FPDF

sb = create_client(SUPABASE_URL, SUPABASE_KEY)


def buscar(status_chave):
    leads = (
        sb.table('leads')
        .select('id, instagram, nome_loja, responsavel')
        .eq('status', status_chave)
        .eq('responsavel', 'Lucas Cioni')
        .order('nome_loja')
        .execute()
        .data
    )
    out = []
    for l in leads:
        inters = (
            sb.table('interacoes')
            .select('tipo, conteudo, created_at')
            .eq('lead_id', l['id'])
            .order('created_at', desc=True)
            .limit(1)
            .execute()
            .data
        )
        nome = l['nome_loja'] or f"@{l['instagram']}"
        if inters:
            i = inters[0]
            dt = i['created_at'][:19].replace('T', ' ')
            tipo = i['tipo']
            conteudo = (i['conteudo'] or '').strip()
        else:
            dt = '—'
            tipo = '—'
            conteudo = 'sem interação registrada'
        out.append({'nome': nome, 'instagram': l['instagram'], 'dt': dt, 'tipo': tipo, 'conteudo': conteudo})
    return out


# Pipelines na ordem solicitada pelo usuario
PIPELINES = [
    ('Stand By', 'stand_by'),
    ('Fechou', 'fechou'),
    ('Testando', 'testando'),
    ('Reunião Agendada', 'reuniao_agendada'),
    ('Interessado', 'interessado'),
    ('Fotos Enviadas', 'fotos_enviadas'),
    ('Respondeu', 'respondeu'),
]
dados = [(titulo, status, buscar(status)) for titulo, status in PIPELINES]
total_geral = sum(len(p[2]) for p in dados)

# Cores (espelha STATUS_HEX do types/index.ts)
CORES = {
    'stand_by':         (148, 163, 184),  # cinza
    'fechou':           (16, 185, 129),   # verde
    'testando':         (132, 204, 22),   # verde-lima
    'reuniao_agendada': (20, 184, 166),   # teal
    'interessado':      (244, 63, 94),    # rose
    'fotos_enviadas':   (59, 130, 246),   # azul
    'respondeu':        (245, 158, 11),   # ambar
}


class PDF(FPDF):
    def header(self):
        self.set_font('Arial', 'B', 14)
        self.set_text_color(40, 40, 40)
        self.cell(0, 8, 'Lucas Cioni — Relatório de Pipelines', new_x='LMARGIN', new_y='NEXT', align='L')
        self.set_font('Arial', '', 9)
        self.set_text_color(120, 120, 120)
        sub = '  |  '.join(t for t, _ in PIPELINES)
        self.cell(0, 5, f"Total: {total_geral} leads  |  Gerado em {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                  new_x='LMARGIN', new_y='NEXT', align='L')
        self.cell(0, 5, sub, new_x='LMARGIN', new_y='NEXT', align='L')
        self.ln(3)
        self.set_draw_color(200, 200, 200)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(4)

    def footer(self):
        self.set_y(-12)
        self.set_font('Arial', 'I', 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 6, f'Pagina {self.page_no()}', align='C')


pdf = PDF(orientation='P', unit='mm', format='A4')
pdf.set_auto_page_break(auto=True, margin=15)
pdf.add_font('Arial', '', r'C:\Windows\Fonts\arial.ttf')
pdf.add_font('Arial', 'B', r'C:\Windows\Fonts\arialbd.ttf')
pdf.add_font('Arial', 'I', r'C:\Windows\Fonts\ariali.ttf')
pdf.add_page()

usable_w = pdf.w - pdf.l_margin - pdf.r_margin
col_lead = 60
col_dthora = 38
col_msg = usable_w - col_lead - col_dthora


def secao(titulo, status_chave, rows):
    cor = CORES.get(status_chave, (60, 60, 90))

    # Garante que o titulo + uma linha cabe na pagina atual
    if pdf.get_y() + 18 > pdf.h - pdf.b_margin:
        pdf.add_page()

    pdf.set_font('Arial', 'B', 11)
    pdf.set_fill_color(*cor)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(0, 8, f'  {titulo}  —  {len(rows)} lead{"s" if len(rows) != 1 else ""}',
             new_x='LMARGIN', new_y='NEXT', fill=True, align='L')
    pdf.ln(1)

    if not rows:
        pdf.set_font('Arial', 'I', 9)
        pdf.set_text_color(120, 120, 120)
        pdf.cell(0, 6, '  Sem leads nesta pipeline.', new_x='LMARGIN', new_y='NEXT')
        pdf.ln(3)
        return

    pdf.set_font('Arial', 'B', 9)
    pdf.set_fill_color(60, 60, 90)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(col_lead, 7, 'Lead', border=0, fill=True, align='L')
    pdf.cell(col_dthora, 7, 'Data / Hora', border=0, fill=True, align='L')
    pdf.cell(col_msg, 7, 'Ultima interacao', border=0, fill=True, align='L')
    pdf.ln(7)

    pdf.set_text_color(30, 30, 30)
    for row_idx, r in enumerate(rows):
        pdf.set_fill_color(245, 245, 250) if row_idx % 2 == 0 else pdf.set_fill_color(255, 255, 255)
        pdf.set_font('Arial', '', 8)
        y_start = pdf.get_y()
        x_start = pdf.get_x()

        lead_text = f"{r['nome']}\n@{r['instagram']}"
        msg_text = f"[{r['tipo']}]  {r['conteudo']}"

        pdf.set_font('Arial', 'B', 8)
        lead_lines = pdf.multi_cell(col_lead, 4, lead_text, dry_run=True, output='LINES')
        pdf.set_font('Arial', '', 8)
        msg_lines = pdf.multi_cell(col_msg, 4, msg_text, dry_run=True, output='LINES')
        dthora_lines = pdf.multi_cell(col_dthora, 4, r['dt'], dry_run=True, output='LINES')

        n_lines = max(len(lead_lines), len(msg_lines), len(dthora_lines))
        row_h = n_lines * 4 + 2

        if y_start + row_h > pdf.h - pdf.b_margin:
            pdf.add_page()
            y_start = pdf.get_y()
            x_start = pdf.get_x()

        pdf.rect(x_start, y_start, usable_w, row_h, style='F')

        pdf.set_xy(x_start, y_start + 1)
        pdf.set_font('Arial', 'B', 8)
        pdf.set_text_color(20, 20, 20)
        pdf.multi_cell(col_lead, 4, lead_text, align='L')

        pdf.set_xy(x_start + col_lead, y_start + 1)
        pdf.set_font('Arial', '', 8)
        pdf.set_text_color(80, 80, 80)
        pdf.multi_cell(col_dthora, 4, r['dt'], align='L')

        pdf.set_xy(x_start + col_lead + col_dthora, y_start + 1)
        pdf.set_font('Arial', '', 8)
        pdf.set_text_color(30, 30, 30)
        pdf.multi_cell(col_msg, 4, msg_text, align='L')

        pdf.set_y(y_start + row_h)

    pdf.ln(5)


for titulo, status_chave, rows in dados:
    secao(titulo, status_chave, rows)

out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'relatorio_lucas_cioni.pdf')
pdf.output(out_path)
print(f'PDF gerado: {out_path}')
print(f'Total de leads (7 pipelines): {total_geral}')
for titulo, _, rows in dados:
    print(f'  {titulo}: {len(rows)}')
