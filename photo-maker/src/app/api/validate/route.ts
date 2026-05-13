import { NextRequest, NextResponse } from "next/server";
import { ai, fileToBase64 } from "@/lib/genai";

export const runtime = "nodejs";
export const maxDuration = 60;

function buildPrompt(shotIds: string[], shotLabels: string[]) {
  const lines = shotIds.map((id, i) => `${i + 1}) "${id}" — ${shotLabels[i] ?? id}`).join("\n");
  return `Você é um auditor visual de fotos de produto.

Recebeu primeiro 1+ FOTOS REAIS do produto (referências), e em seguida ${shotIds.length} IMAGENS GERADAS por IA que devem mostrar o MESMO produto em cenas/ângulos diferentes.

Sua tarefa: identificar se ALGUMA das imagens geradas tem uma DIVERGÊNCIA GROTESCA do produto real (das referências). Pequenas diferenças naturais de IA (leves variações de iluminação, ângulo, sombra) NÃO contam — só conta divergência GRANDE de:
• cor completamente diferente (ex: produto rosa real virou produto preto)
• detalhes de cor das partes secundárias muito diferentes (ex: solado branco virou solado preto)
• formato/silhueta claramente diferente (ex: arredondado virou angular)
• material totalmente diferente (ex: couro liso virou mesh)
• logos/branding inventados ou removidos drasticamente
• proporções totalmente erradas

As imagens geradas vêm NA ORDEM ABAIXO (use estes IDs ao responder):
${lines}

RESPONDA APENAS em JSON válido, sem markdown, no formato:
{"outliers":["<id>","<id>"],"reason":"explicação curta de até 100 chars"}

Se TODAS estiverem fiéis ao produto real, responda:
{"outliers":[],"reason":"todas consistentes"}

Se múltiplas estiverem divergentes, liste todas. Se uma única estiver divergente, liste só ela.`;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const productFiles = formData.getAll("product").filter((v): v is File => v instanceof File);
    const generatedFiles = formData
      .getAll("generated")
      .filter((v): v is File => v instanceof File);
    const shotIdsJson = (formData.get("shotIds") as string | null) ?? "[]";
    const shotLabelsJson = (formData.get("shotLabels") as string | null) ?? "[]";
    let shotIds: string[];
    let shotLabels: string[];
    try {
      shotIds = JSON.parse(shotIdsJson);
      shotLabels = JSON.parse(shotLabelsJson);
    } catch {
      shotIds = [];
      shotLabels = [];
    }

    if (productFiles.length === 0) {
      return NextResponse.json({ error: "Envie ao menos uma referência." }, { status: 400 });
    }
    if (generatedFiles.length === 0) {
      return NextResponse.json({ error: "Sem imagens geradas pra validar." }, { status: 400 });
    }
    if (shotIds.length !== generatedFiles.length) {
      return NextResponse.json(
        { error: "shotIds não corresponde ao número de imagens geradas." },
        { status: 400 }
      );
    }

    const productImgs = await Promise.all(productFiles.map(fileToBase64));
    const generatedImgs = await Promise.all(generatedFiles.map(fileToBase64));

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { text: buildPrompt(shotIds, shotLabels) },
        { text: "REFERÊNCIAS REAIS DO PRODUTO:" },
        ...productImgs.map((img) => ({
          inlineData: { mimeType: img.mimeType, data: img.data },
        })),
        { text: `IMAGENS GERADAS (na ordem: ${shotIds.join(", ")}):` },
        ...generatedImgs.map((img) => ({
          inlineData: { mimeType: img.mimeType, data: img.data },
        })),
      ],
    });

    const text = response.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text ?? "";
    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

    let parsed: { outliers: string[]; reason?: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const m = /\{[\s\S]*\}/.exec(cleaned);
      if (!m) {
        return NextResponse.json({ outliers: [], reason: "parse falhou", raw: text });
      }
      parsed = JSON.parse(m[0]);
    }

    const validIds = new Set(shotIds);
    const outliers = (parsed.outliers ?? []).filter((id) => validIds.has(id));

    return NextResponse.json({ outliers, reason: parsed.reason });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[validate] erro:", err);
    // 400 em vez de 500 — Traefik (EasyPanel) intercepta 5xx e devolve HTML.
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
