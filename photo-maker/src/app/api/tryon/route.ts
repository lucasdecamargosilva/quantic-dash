import { NextRequest, NextResponse } from "next/server";
import { ai, fileToBase64 } from "@/lib/genai";

export const runtime = "nodejs";
export const maxDuration = 120;

export type Shot = {
  id: string;
  label: string;
  prompt: string;
};

const FIDELITY_RULES = `REGRA CRÍTICA — FIDELIDADE ABSOLUTA AO PRODUTO:
As imagens anexas são FOTOS REAIS DO PRODUTO em ângulos diferentes. Trate-as como a ÚNICA fonte da verdade visual. O produto gerado DEVE SER IDÊNTICO ao das referências.

OBRIGATÓRIO PRESERVAR (não inventar, não estilizar, não "melhorar"):
• Formato exato da armação (linha superior, formato das lentes, ponte, hastes)
• Cor exata (incluindo se é transparente, fumê, sólida, gradiente)
• Material e textura (acetato, metal, transparente, fosco, brilhante)
• Espessura da armação (não engrossar nem afinar)
• Cor e tonalidade EXATA das lentes (clear, escura, espelhada, gradiente — exatamente como na referência)
• Logos, gravações, parafusos, dobradiças, plaquetas (manter onde aparecem)
• Detalhes de acabamento (cantos, curvas, ângulos)

PROIBIDO:
• Trocar a cor da armação ou das lentes
• Mudar o formato (ex: arredondar uma armação angulosa, ou vice-versa)
• Adicionar detalhes que não existem (logo inventado, decorações)
• Remover detalhes que existem
• Substituir por um modelo "parecido" — tem que ser ESTE produto

Antes de gerar, observe as 1+ imagens de referência e reproduza fielmente.`;

const PRODUCT_STUDIO_STYLE = `ESTILO DE ESTÚDIO — IDÊNTICO ENTRE AS 3 FOTOS DE PRODUTO:
As 3 fotos do produto (frontal, 3/4 e lateral) DEVEM parecer 3 cliques da MESMA sessão de fotos, com o MESMO setup. Apenas o ângulo da câmera muda. Variação de fundo, sombra ou iluminação entre elas é ERRO.

ESPECIFICAÇÃO TÉCNICA RIGOROSAMENTE FIXA:
• Fundo: branco puro #FFFFFF totalmente liso e uniforme. SEM gradiente, SEM textura, SEM vinheta, SEM degradê.
• Sombra: NENHUMA sombra desenhada abaixo do produto. SEM drop shadow. SEM mancha cinza. SEM "ground shadow". O produto FLUTUA sobre o branco. Permitido apenas: auto-sombras MUITO sutis dentro do próprio produto, vindas da iluminação real (ex: sombra interna na ponte, na dobradiça). Nunca sombra projetada sobre o fundo.
• Iluminação: estúdio profissional de e-commerce. Soft box principal vinda de cima/frente, fill suave nas laterais. Luz totalmente NEUTRA — sem warm tint, sem cool tint, sem coloração ambiente. Sem reflexos exagerados ou highlights espelhados que escondam a cor real do produto.
• Câmera: distância e zoom IGUAIS nas 3 fotos. Mesma altura, mesmo crop, mesma escala do produto no quadro. Apenas o ÂNGULO de captura muda.
• Composição: produto centralizado horizontal e verticalmente, ocupando ~60% da altura útil. Margens iguais nas 3 fotos.
• Pós-processamento: white balance, exposição, contraste e saturação IDÊNTICOS. As 3 fotos devem parecer ter saído da mesma câmera, processadas pelo mesmo perfil.
• Formato: vertical 9:16 (retrato), 1080x1920px.
• Sem modelo, sem mãos, sem props, sem fundo decorativo, sem texto, sem logo do site.

CONSISTÊNCIA: imagine essas 3 fotos LADO A LADO numa página de e-commerce. Elas precisam parecer um SET coerente.

Se houver imagem(ns) anexa(s) marcada(s) como "REFERÊNCIA DE ESTILO JÁ GERADA", trate essa(s) como o CÂNONE visual desta série: copie EXATAMENTE o tom de fundo, intensidade de luz, ausência de sombra e nível de detalhe dela(s). Apenas o ângulo de câmera muda em relação a ela(s).`;

export const DEFAULT_SHOTS: Shot[] = [
  {
    id: "model",
    label: "Modelo usando o produto",
    prompt: `${FIDELITY_RULES}

CENA: Foto editorial hiper-realista de um modelo masculino atraente usando OS ÓCULOS DAS IMAGENS DE REFERÊNCIA.

Modelo: jovem (25-32 anos), rosto extremamente bonito e marcante, traços definidos, mandíbula angular, barba muito bem aparada (rala/estilo 3-day stubble), pele saudável com textura natural visível, cabelo castanho escuro, bem cortado e estilizado para trás com volume, olhar confiante e direto para a câmera, expressão séria e magnética. Camiseta preta básica.

Enquadramento: POV 3/4 (meio de frente/meio de lado), rosto SEMPRE virado para o lado ESQUERDO do quadro — rotação ~30° à esquerda (do ponto de vista do espectador). O lado DIREITO do rosto do modelo fica mais próximo da câmera; o lado esquerdo recua. A haste DIREITA dos óculos fica em primeiro plano, mostrando profundidade. NUNCA virar à direita, NUNCA frontal puro. Close-up apertado no rosto (cabeça e parte do pescoço/ombros), modelo MUITO PERTO da câmera, lente de 85mm, profundidade de campo rasa.
Pose: mãos FORA do quadro / abaixadas. SEM tocar nos óculos, SEM ajustar a haste, SEM mãos visíveis perto do rosto. Olhar confiante levemente desviado da câmera ou direto para ela, expressão magnética.

LEMBRETE FINAL: os óculos no rosto do modelo devem ser exatamente os mesmos das referências — mesma cor, mesmo formato, mesma transparência/opacidade, mesma cor de lente. Reflexos sutis e naturais nas lentes, sem alterar a tonalidade real delas.

Iluminação: estúdio profissional editorial, luz principal suave vinda de cima, leve sombra natural sob o queixo.
Fundo: branco puro #FFFFFF totalmente liso e uniforme. SEM gradiente, SEM textura, SEM vinheta, SEM degradê. SEM cinza, SEM bege.
Formato: vertical 9:16 (retrato), 1080x1920px.
Estilo: campanha editorial premium de eyewear, hiper-realista, alta nitidez, qualidade 8K.`,
  },
  {
    id: "front",
    label: "Produto — frontal",
    prompt: `${FIDELITY_RULES}

${PRODUCT_STUDIO_STYLE}

ÂNGULO ESPECÍFICO desta foto: completamente FRONTAL. Lentes diretamente para a câmera, hastes simetricamente paralelas, óculos perfeitamente centralizado e levemente "flutuando" sem inclinação.

LEMBRETE FINAL: produto fiel às referências reais (cor, forma, material) E estilo de estúdio idêntico ao das outras fotos do produto desta série.`,
  },
  {
    id: "three-quarter",
    label: "Produto — 3/4",
    prompt: `${FIDELITY_RULES}

${PRODUCT_STUDIO_STYLE}

ÂNGULO ESPECÍFICO desta foto: 3/4 (três quartos). Produto rotacionado ~25-30° em relação à câmera, revelando a profundidade da haste e a curvatura da armação. Mantido na mesma altura/distância da foto frontal.

LEMBRETE FINAL: produto fiel às referências reais (cor, forma, material) E estilo de estúdio idêntico ao das outras fotos do produto desta série.`,
  },
];

type AspectRatio = "9:16" | "1:1" | "3:4" | "4:3" | "16:9";
type ImageSize = "512" | "1K" | "2K" | "4K";

async function callGemini(
  shot: Shot,
  productImgs: { data: string; mimeType: string }[],
  styleAnchorImgs: { data: string; mimeType: string }[] = [],
  aspectRatio: AspectRatio = "9:16",
  referenceLabel?: string,
  imageSize?: ImageSize
) {
  // Constrói o conteúdo com rótulos textuais entre os grupos de imagens,
  // pra IA distinguir "produto real" (fonte da verdade do PRODUTO)
  // de "âncora de estilo" (fonte da verdade do ESTÚDIO: bg/luz/sombra).
  type RequestPart =
    | { text: string }
    | { inlineData: { mimeType: string; data: string } };
  const requestParts: RequestPart[] = [{ text: shot.prompt }];

  requestParts.push({
    text: `\n\nIMAGENS DE REFERÊNCIA DO PRODUTO REAL (fonte da verdade visual do PRODUTO — cor, forma, material, lentes, detalhes):`,
  });
  for (const img of productImgs) {
    requestParts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  }

  if (styleAnchorImgs.length > 0) {
    const label =
      referenceLabel ??
      `REFERÊNCIA DE ESTILO JÁ GERADA (fonte da verdade do SETUP DE ESTÚDIO — cor de fundo, intensidade de luz, ausência de sombra, exposição). Esta foto é um clique anterior da MESMA sessão; copie EXATAMENTE seu fundo, sua luz e sua ausência de sombra. Apenas o ÂNGULO da câmera muda em relação a ela`;
    requestParts.push({ text: `\n\n${label}:` });
    for (const img of styleAnchorImgs) {
      requestParts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }
  }

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: requestParts,
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: imageSize ? { aspectRatio, imageSize } : { aspectRatio },
    },
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);

  if (!imagePart?.inlineData?.data) {
    const textPart = parts.find((p) => p.text)?.text;
    throw new Error(textPart ?? "Sem imagem retornada");
  }

  return {
    imageBase64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType ?? "image/png",
  };
}

async function generateShot(
  shot: Shot,
  productImgs: { data: string; mimeType: string }[],
  styleAnchorImgs: { data: string; mimeType: string }[] = [],
  aspectRatio: AspectRatio = "9:16",
  referenceLabel?: string,
  imageSize?: ImageSize
): Promise<{ id: string; label: string; imageBase64?: string; mimeType?: string; error?: string }> {
  const MAX_ATTEMPTS = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await callGemini(shot, productImgs, styleAnchorImgs, aspectRatio, referenceLabel, imageSize);
      if (attempt > 1) console.log(`[tryon:${shot.id}] sucesso na tentativa ${attempt}`);
      return { id: shot.id, label: shot.label, ...result };
    } catch (err) {
      lastError = err;
      console.error(`[tryon:${shot.id}] tentativa ${attempt}/${MAX_ATTEMPTS} falhou:`, err);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }

  return {
    id: shot.id,
    label: shot.label,
    error: lastError instanceof Error ? lastError.message : "Erro desconhecido",
  };
}

const VALID_ASPECTS: AspectRatio[] = ["9:16", "1:1", "3:4", "4:3", "16:9"];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const productFiles = formData.getAll("product").filter((v): v is File => v instanceof File);
    const peerFiles = formData.getAll("peer").filter((v): v is File => v instanceof File);
    const shotsJson = formData.get("shots") as string | null;
    const targetShotId = formData.get("targetShotId") as string | null;
    const anchorShotId = (formData.get("anchorShotId") as string | null) ?? "front";
    const aspectRatioRaw = (formData.get("aspectRatio") as string | null) ?? "9:16";
    const aspectRatio: AspectRatio = (VALID_ASPECTS as string[]).includes(aspectRatioRaw)
      ? (aspectRatioRaw as AspectRatio)
      : "9:16";
    const referenceLabel = (formData.get("referenceLabel") as string | null) ?? undefined;
    const imageSizeRaw = (formData.get("imageSize") as string | null) ?? undefined;
    const VALID_SIZES: ImageSize[] = ["512", "1K", "2K", "4K"];
    const imageSize: ImageSize | undefined =
      imageSizeRaw && (VALID_SIZES as string[]).includes(imageSizeRaw)
        ? (imageSizeRaw as ImageSize)
        : undefined;

    if (productFiles.length === 0) {
      return NextResponse.json({ error: "Envie ao menos uma foto do produto." }, { status: 400 });
    }

    const rawShots: Shot[] = shotsJson ? JSON.parse(shotsJson) : DEFAULT_SHOTS;
    const extraInstructions = ((formData.get("extraInstructions") as string | null) ?? "").trim();

    // Anexa instruções adicionais do usuário ao final de cada prompt (com peso alto: bem visíveis).
    const shots: Shot[] = extraInstructions
      ? rawShots.map((s) => ({
          ...s,
          prompt: `${s.prompt}\n\nINSTRUÇÕES ADICIONAIS DO USUÁRIO (prioridade alta — siga à risca, mas sem violar as REGRAS DE FIDELIDADE acima):\n${extraInstructions}`,
        }))
      : rawShots;

    const productImgs = await Promise.all(productFiles.map(fileToBase64));
    const peerImgs = await Promise.all(peerFiles.map(fileToBase64));

    // Modo single-shot (regenerar uma imagem): produto = referências do usuário,
    // âncora de estilo = as outras 3 imagens já geradas (peers).
    if (targetShotId) {
      const target = shots.find((s) => s.id === targetShotId);
      if (!target) {
        return NextResponse.json({ error: "Shot não encontrado." }, { status: 400 });
      }
      const result = await generateShot(target, productImgs, peerImgs, aspectRatio, referenceLabel, imageSize);
      return NextResponse.json({ results: [result] });
    }

    // Modo batch: estratégia âncora — gera o shot âncora primeiro (sem âncora de estilo,
    // só com as referências do produto). Depois usa essa imagem como ÂNCORA DE ESTILO para
    // os outros shots, garantindo bg/luz/sombra idênticos em toda a série.
    const anchorShot =
      shots.find((s) => s.id === anchorShotId) ?? shots[0];
    const otherShots = shots.filter((s) => s.id !== anchorShot?.id);

    let anchorResult: Awaited<ReturnType<typeof generateShot>> | null = null;
    if (anchorShot) {
      anchorResult = await generateShot(anchorShot, productImgs, [], aspectRatio, undefined, imageSize);
    }

    const styleAnchor: { data: string; mimeType: string }[] = [];
    if (anchorResult?.imageBase64 && anchorResult.mimeType) {
      styleAnchor.push({
        data: anchorResult.imageBase64,
        mimeType: anchorResult.mimeType,
      });
    }

    const otherResults = await Promise.all(
      otherShots.map((s) => generateShot(s, productImgs, styleAnchor, aspectRatio, undefined, imageSize))
    );

    // Reordena os resultados para manter a ordem original definida em `shots`
    const byId = new Map<string, Awaited<ReturnType<typeof generateShot>>>();
    if (anchorResult) byId.set(anchorResult.id, anchorResult);
    for (const r of otherResults) byId.set(r.id, r);
    const results = shots.map((s) => byId.get(s.id)).filter((r): r is NonNullable<typeof r> => !!r);

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    // 400 em vez de 500 — Traefik (EasyPanel) intercepta 5xx e devolve HTML.
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
