"use client";

import JSZip from "jszip";
import { useEffect, useRef, useState } from "react";

type Shot = { id: string; label: string; prompt: string };

type GeneratedShot = {
  id: string;
  label: string;
  imageBase64?: string;
  mimeType?: string;
  error?: string;
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

type Gender = "male" | "female";

const MALE_MODEL_PROMPT = `${FIDELITY_RULES}

CENA: Foto editorial hiper-realista de um modelo masculino atraente usando OS ÓCULOS DAS IMAGENS DE REFERÊNCIA.

Modelo: jovem (25-32 anos), rosto extremamente bonito e marcante, traços definidos, mandíbula angular, barba muito bem aparada (rala/estilo 3-day stubble), pele saudável com textura natural visível, cabelo castanho escuro, bem cortado e estilizado para trás com volume, olhar confiante e direto para a câmera, expressão séria e magnética. Camiseta preta básica.

Enquadramento: POV 3/4 (meio de frente/meio de lado), rosto SEMPRE virado para o lado ESQUERDO do quadro — rotação ~30° à esquerda (do ponto de vista do espectador). O lado DIREITO do rosto do modelo fica mais próximo da câmera; o lado esquerdo recua. A haste DIREITA dos óculos fica em primeiro plano, mostrando profundidade. NUNCA virar à direita, NUNCA frontal puro. Close-up apertado no rosto (cabeça e parte do pescoço/ombros), modelo MUITO PERTO da câmera, lente de 85mm, profundidade de campo rasa.
Pose: mãos FORA do quadro / abaixadas. SEM tocar nos óculos, SEM ajustar a haste, SEM mãos visíveis perto do rosto. Olhar confiante levemente desviado da câmera ou direto para ela, expressão magnética.

LEMBRETE FINAL: os óculos no rosto do modelo devem ser exatamente os mesmos das referências — mesma cor, mesmo formato, mesma transparência/opacidade, mesma cor de lente. Reflexos sutis e naturais nas lentes, sem alterar a tonalidade real delas.

Iluminação: estúdio profissional editorial, luz principal suave vinda de cima, leve sombra natural sob o queixo.
Fundo: branco puro #FFFFFF totalmente liso e uniforme. SEM gradiente, SEM textura, SEM vinheta, SEM degradê. SEM cinza, SEM bege.
Formato: vertical 9:16 (retrato), 1080x1920px.
Estilo: campanha editorial premium de eyewear, hiper-realista, alta nitidez, qualidade 8K.`;

const FEMALE_MODEL_PROMPT = `${FIDELITY_RULES}

CENA: Foto editorial hiper-realista de uma modelo feminina atraente usando OS ÓCULOS DAS IMAGENS DE REFERÊNCIA.

Modelo: jovem (22-30 anos), rosto extremamente bonito e marcante, traços femininos definidos, sobrancelhas bem desenhadas e cheias, olhos grandes e expressivos (castanhos), cílios destacados, pele saudável com textura natural visível e leve maquiagem natural ("clean girl"), boca cheia com batom nude/rosa natural. Cabelo castanho médio liso/levemente ondulado, repartido ao meio, puxado para trás de modo solto com algumas mechas finas caindo perto do rosto.

Acessórios sutis: brincos de argola dourados médios e um colar fino dourado (cordão delicado). Sem roupa visível ou ombros levemente nus / blusa de alça fina cor neutra.

Enquadramento: POV 3/4 (meio de frente/meio de lado), rosto SEMPRE virado para o lado ESQUERDO do quadro — rotação ~30° à esquerda (do ponto de vista do espectador). O lado DIREITO do rosto da modelo fica mais próximo da câmera; o lado esquerdo recua. A haste DIREITA dos óculos fica em primeiro plano, mostrando profundidade. NUNCA virar à direita, NUNCA frontal puro. Close-up apertado no rosto (cabeça, pescoço e parte dos ombros), modelo MUITO PERTO da câmera, lente de 85mm, profundidade de campo rasa.
Pose: mãos FORA do quadro / abaixadas. SEM tocar nos óculos, SEM ajustar a haste, SEM mãos ou dedos visíveis perto do rosto. Olhar magnético levemente desviado da câmera ou direto para ela.

LEMBRETE FINAL: os óculos no rosto da modelo devem ser exatamente os mesmos das referências — mesma cor, mesmo formato, mesma transparência/opacidade, mesma cor de lente. Reflexos sutis e naturais nas lentes, sem alterar a tonalidade real delas.

Iluminação: estúdio profissional editorial, luz principal suave e quente vinda da frente/cima, modelagem perfeita do rosto.
Fundo: branco puro #FFFFFF totalmente liso e uniforme. SEM gradiente, SEM textura, SEM vinheta, SEM degradê. SEM bege, SEM off-white, SEM cinza.
Formato: vertical 9:16 (retrato), 1080x1920px.
Estilo: campanha editorial premium de eyewear feminino, hiper-realista, alta nitidez, qualidade 8K, foto de capa de revista de moda feminina.`;

function modelShot(gender: Gender): Shot {
  return {
    id: "model",
    label: gender === "female" ? "Modelo (mulher) usando o produto" : "Modelo (homem) usando o produto",
    prompt: gender === "female" ? FEMALE_MODEL_PROMPT : MALE_MODEL_PROMPT,
  };
}

const DEFAULT_SHOTS: Shot[] = [
  modelShot("male"),
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

/* ────────────────────────────────────────────────────────────
   CATEGORIAS — óculos, roupas, sapatos
   ──────────────────────────────────────────────────────────── */

type Category = "glasses" | "clothing" | "shoes";

type AspectRatio = "9:16" | "1:1" | "3:4" | "4:3" | "16:9";

// === SAPATOS ===
// Estilo inspirado em catálogo premium (On Running, Adidas, Nike) — fundo branco
// puro, sombra de contato sutil, lente 85mm, foco profundo nas 3 primeiras e
// macro com profundidade rasa no close-up.
const SHOE_STUDIO_STYLE = `ESTILO DE ESTÚDIO — apenas o LOOK FOTOGRÁFICO, NÃO o design do produto.

⚠️ REGRA CRÍTICA ⚠️
Este bloco descreve SOMENTE o estilo da foto: POV, fundo, sombra, luz, qualidade fotográfica. NÃO descreve o produto. O TÊNIS (cor, formato, material, branding, lettering, logos, padrão do solado, cadarços, todos os detalhes visuais) vem 100% das IMAGENS DE REFERÊNCIA DO PRODUTO REAL enviadas pelo usuário. NÃO INVENTE nem adicione marca, logos, lettering, padrões, cores ou tecnologias que não estejam nas referências do usuário. NÃO misture com nenhuma outra marca de tênis.

PADRÃO FOTOGRÁFICO FIXO (idêntico nas 4 fotos):
• Fundo: branco puro #FFFFFF totalmente liso e uniforme. SEM gradiente, SEM textura, SEM vinheta, SEM degradê.
• Piso/superfície: contínuo com o fundo. Transição invisível. SEM linha de horizonte.
• Sombra de contato (PERMITIDA e NECESSÁRIA): macia, muito difusa, apenas diretamente abaixo do contorno do tênis (footprint shadow). ~10-15% de opacidade, bordas extremamente suaves (gaussian blur ~40px). Estende no máximo 20% além da pegada do produto. Cinza neutro frio. Tipo sombra de estúdio profissional com soft box.
• Iluminação: soft box principal frontal-superior amplo, fill suave nas laterais, leve rim atrás. White balance 100% neutro (sem warm/cool tint). Iluminação revela a textura real do material do produto, sem mascarar.
• Câmera: lente 85mm equivalente, sem distorção de perspectiva.
• Composição: produto centralizado, ocupando ~75% da área útil. Margens generosas e iguais entre as 4 fotos.
• Pós: cores 100% fiéis ao produto real do usuário. Sem filtros, sem tints. Tack sharp em todo o tênis.

CONSISTÊNCIA: imagine essas 4 fotos lado a lado numa página de e-commerce premium. Devem parecer o mesmo set de produção, mesma câmera, mesmo dia.

Se houver imagem(ns) marcada(s) como "REFERÊNCIA DE ESTILO JÁ GERADA", use-a(s) como CÂNONE do look fotográfico (apenas fundo, luz, sombra, exposição). NÃO copie o produto delas se forem outros tênis — o produto vem somente das referências do usuário.`;

const SHOE_SHOTS: Shot[] = [
  {
    id: "three-quarter",
    label: "Tênis — 3/4 par",
    prompt: `${FIDELITY_RULES}

${SHOE_STUDIO_STYLE}

ÂNGULO ESPECÍFICO desta foto: 3/4 PAR ELEVADO.
PAR de tênis (esquerdo + direito), USANDO EXATAMENTE o tênis das referências do usuário (mesma cor, formato, material, branding) — sem alterar o design. O direito à frente, levemente mais perto da câmera; o esquerdo atrás, parcialmente sobreposto. Ambos rotacionados ~30° em relação ao perfil puro, mostrando a lateral externa + um pouco do bico + topo da entressola. POV elevado ~25-30° acima do nível do solo (hero shot dinâmico). Os dois tênis inteiros no quadro, pequena sobreposição.

LEMBRETE: o tênis é EXATAMENTE o do usuário. Apenas o estilo da foto é o descrito acima.`,
  },
  {
    id: "sole",
    label: "Tênis — solado",
    prompt: `${FIDELITY_RULES}

${SHOE_STUDIO_STYLE}

ÂNGULO ESPECÍFICO desta foto: SOLADOS VOLTADOS PRA CÂMERA (par top-down, soletas viradas pra cima).
PAR de tênis (USANDO EXATAMENTE o tênis das referências do usuário, mesmo design e cor) com os solados expostos. Toes apontando pra BAIXO no quadro, calcanhares no topo. Os dois tênis lado a lado, paralelos, com pequeno espaçamento. TODO o solado visível com nitidez — qualquer padrão, ranhura, gravação ou tecnologia que EXISTA no tênis do usuário deve aparecer fiel. NÃO adicione padrões, lettering, marcas ou tecnologias que não estejam nas referências do usuário.

LEMBRETE: solado é o protagonista — mas o solado do tênis do USUÁRIO, com os detalhes reais dele.`,
  },
  {
    id: "top",
    label: "Tênis — vista superior",
    prompt: `${FIDELITY_RULES}

${SHOE_STUDIO_STYLE}

ÂNGULO ESPECÍFICO desta foto: VISTA SUPERIOR (par top-down, parte de cima/upper voltado pra câmera).
PAR de tênis (USANDO EXATAMENTE o tênis das referências do usuário). Toes apontando pra CIMA do quadro, calcanhares no rodapé. Os dois tênis perfeitamente paralelos, lado a lado. Cadarços completos, língua, mesh do upper, palmilha interior visível por dentro do cadarço — todos os detalhes/branding/lettering devem ser FIÉIS ao tênis do usuário. NÃO adicione lettering, logos ou textos que não existam nas referências.

LEMBRETE: alinhamento perfeito entre os dois tênis. Toda a parte de cima visível, fiel ao produto do usuário.`,
  },
  {
    id: "side",
    label: "Tênis — perfil lateral",
    prompt: `${FIDELITY_RULES}

${SHOE_STUDIO_STYLE}

ÂNGULO ESPECÍFICO desta foto: PERFIL LATERAL PURO 90°.
UM tênis (o pé DIREITO, EXATAMENTE o tênis das referências do usuário). Câmera perfeitamente perpendicular ao tênis. Toe apontando pra DIREITA do quadro, calcanhar à esquerda. Sola apoiada plana na superfície branca. POV no nível do tênis (não acima nem abaixo) — perfil técnico clássico de catálogo. Tênis inteiro no quadro, do bico ao calcanhar, centralizado horizontal e verticalmente. Todos os detalhes visíveis (qualquer logo, lettering, padrão de mesh, entressola, cadarços, dobradiças) devem ser FIÉIS ao tênis do usuário — nada inventado, nada adicionado, nada de outras marcas.

LEMBRETE: shot técnico de blueprint. Geometria perfeita, sem distorção. Produto = o do usuário, sem alterações.`,
  },
];

// === ROUPAS ===
// Estrutura básica — modelo usando + flat lay + costas + close de tecido.
const CLOTHING_STUDIO_STYLE = `ESTILO DE ESTÚDIO — todas as 4 fotos da peça devem manter consistência visual entre si.
• Fundo modelo: branco puro #FFFFFF totalmente liso e uniforme. SEM gradiente, SEM textura, SEM cinza, SEM bege, SEM off-white.
• Fundo flat-lay e detalhe: branco puro #FFFFFF seamless.
• Iluminação: soft box editorial, neutra, sem tint.
• Sombra: apenas naturais, sutis, como em sessão de moda real.
• Câmera: lente 85mm, frontal.
• Pós: cores fiéis ao produto, sem filtros.
• Aspect: vertical 9:16.
Variação de cor/textura/fit entre as 4 é ERRO.`;

function clothingShots(gender: Gender): Shot[] {
  const subject = gender === "female" ? "modelo feminina" : "modelo masculino";
  return [
    {
      id: "model-front",
      label: "Modelo — frente",
      prompt: `${FIDELITY_RULES}\n\n${CLOTHING_STUDIO_STYLE}\n\nCENA: ${subject} atraente vestindo a peça da referência. POV frontal, lente 85mm, ${gender === "female" ? "rosto bonito" : "traços marcantes"}, cabelo bem cuidado. Crop do alto da cabeça até o quadril (peça inteira visível). Fundo cinza claro neutro de estúdio.\n\nÂNGULO: frontal completa.`,
    },
    {
      id: "flat-lay",
      label: "Peça — flat lay",
      prompt: `${FIDELITY_RULES}\n\n${CLOTHING_STUDIO_STYLE}\n\nFlat lay top-down da peça em fundo branco puro #FFFFFF. Peça centralizada, bem posicionada como num catálogo de e-commerce, com pequenas dobras naturais. Sem modelo, sem mãos. Etiquetas e detalhes visíveis.`,
    },
    {
      id: "model-back",
      label: "Modelo — costas",
      prompt: `${FIDELITY_RULES}\n\n${CLOTHING_STUDIO_STYLE}\n\nO MESMO modelo da foto frontal, agora visto de COSTAS, mostrando a peça por trás. Mesma iluminação, mesmo fundo, mesma altura/distância de câmera.`,
    },
    {
      id: "detail",
      label: "Peça — close de tecido",
      prompt: `${FIDELITY_RULES}\n\n${CLOTHING_STUDIO_STYLE}\n\nCLOSE-UP MACRO no tecido/detalhe da peça (gola, manga, costura, estampa — escolha a região mais característica). Foco rasa, foreground tack sharp, mostrando trama, textura, costuras, qualidade do material. Fundo branco puro.`,
    },
  ];
}

// === Configuração por categoria ===
type CategoryConfig = {
  label: string;
  emoji: string;
  description: string;
  hasGender: boolean;
  aspectRatio: AspectRatio;
  anchorShotId: string;
  shotsFor: (gender: Gender) => Shot[];
};

const CATEGORY_META: Record<Category, CategoryConfig> = {
  glasses: {
    label: "Óculos",
    emoji: "◐",
    description: "modelo homem + modelo mulher + frontal + 3/4",
    hasGender: false,
    aspectRatio: "9:16",
    anchorShotId: "front",
    shotsFor: () => [
      { ...modelShot("male"), id: "model-male" },
      { ...modelShot("female"), id: "model-female" },
      ...DEFAULT_SHOTS.slice(1),
    ],
  },
  shoes: {
    label: "Sapatos",
    emoji: "◤",
    description: "3/4 par · solado · vista superior · perfil lateral",
    hasGender: false,
    aspectRatio: "1:1",
    anchorShotId: "three-quarter",
    shotsFor: () => SHOE_SHOTS,
  },
  clothing: {
    label: "Roupas",
    emoji: "◇",
    description: "modelo frente + costas + flat lay + close de tecido",
    hasGender: true,
    aspectRatio: "9:16",
    anchorShotId: "flat-lay",
    shotsFor: (gender) => clothingShots(gender),
  },
};

function ProductUpload({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function addFiles(incoming: File[]) {
    const onlyImages = incoming.filter((f) => f.type.startsWith("image/"));
    if (onlyImages.length === 0) return;
    onChange([...files, ...onlyImages]);
  }

  function removeAt(idx: number) {
    onChange(files.filter((_, i) => i !== idx));
  }

  // Paste com Ctrl+V em qualquer lugar da página
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const pasted: File[] = [];
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) pasted.push(f);
        }
      }
      if (pasted.length > 0) {
        e.preventDefault();
        addFiles(pasted);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">Fotos do produto</span>
        {files.length > 0 && (
          <span className="text-xs text-[var(--text-muted)] tabular-nums">{files.length} adicionada{files.length > 1 ? "s" : ""}</span>
        )}
      </div>

      <div
        ref={dropRef}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          addFiles(Array.from(e.dataTransfer.files));
        }}
        data-dragging={isDragging || undefined}
        className="dropzone relative w-full max-w-sm cursor-pointer overflow-hidden p-4"
      >
        {files.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-strong)] text-[var(--text-muted)]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <span className="text-sm text-[var(--text)]">Clique, arraste ou cole</span>
            <span className="text-xs text-[var(--text-soft)]">PNG / JPG · vários ângulos · Ctrl+V</span>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {files.map((f, idx) => {
              const url = URL.createObjectURL(f);
              return (
                <div key={idx} className="group relative aspect-square overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-warm)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`ref-${idx}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAt(idx);
                    }}
                    className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--text)] text-[10px] text-[var(--bg)] opacity-0 transition group-hover:opacity-100"
                    aria-label="Remover"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
            <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-[var(--border-strong)] text-xl text-[var(--text-soft)]">
              +
            </div>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
    </div>
  );
}

type ScrapedImage = { url: string; base64: string; mimeType: string; bytes: number };

function UrlImporter({ onAdd }: { onAdd: (files: File[]) => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCount, setLastCount] = useState<number>(0);

  async function handleFetch() {
    if (!url.trim()) return;
    setError(null);
    setLoading(true);
    setLastCount(0);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro");
      const found = data.images as ScrapedImage[];
      if (!found || found.length === 0) {
        setError("Nenhuma imagem encontrada nesta página.");
        return;
      }
      // Adiciona automaticamente como referências — sem passo de seleção manual
      const files = found.map((img, idx) => {
        const ext = img.mimeType.split("/")[1] ?? "jpg";
        return base64ToFile(img.base64, img.mimeType, `produto-${idx}.${ext}`);
      });
      onAdd(files);
      setLastCount(files.length);
      setUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">Importar de URL</span>
        <span className="text-[10px] uppercase tracking-widest text-[var(--text-soft)]">opcional</span>
      </div>
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleFetch()}
          placeholder="https://loja.com/produto/oculos-xyz"
          className="field flex-1"
        />
        <button
          onClick={handleFetch}
          disabled={!url.trim() || loading}
          className="btn-secondary"
        >
          {loading ? "Buscando…" : "Buscar"}
        </button>
      </div>

      {loading && <div className="bar-loader" />}

      {error && (
        <p className="text-xs text-[var(--error)]">{error}</p>
      )}

      {lastCount > 0 && !error && (
        <p className="text-xs text-[var(--success)]">
          ✓ {lastCount} imagem{lastCount > 1 ? "ns" : ""} adicionada{lastCount > 1 ? "s" : ""} como referência.
        </p>
      )}
    </div>
  );
}

type BatchItemStatus = "pending" | "fetching" | "generating" | "done" | "error";

type BatchItem = {
  id: string;
  url: string;
  gender: Gender;
  status: BatchItemStatus;
  message?: string;
  refsCount?: number;
  results?: Record<string, GeneratedShot>;
  productImages?: ScrapedImage[];
  shots?: Shot[];
  error?: string;
  fixCount?: number;
};

function urlToSlug(u: string, idx: number): string {
  try {
    const parsed = new URL(u);
    const last = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
    const cleaned = last.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9-_]/gi, "-").toLowerCase().slice(0, 60);
    return cleaned || `produto-${idx + 1}`;
  } catch {
    return `produto-${idx + 1}`;
  }
}

function BatchView({
  extraInstructions,
  defaultGender,
  category,
  aspectRatio,
  targetW,
  targetH,
  autoValidate,
}: {
  extraInstructions: string;
  defaultGender: Gender;
  category: Category;
  aspectRatio: AspectRatio;
  targetW: number;
  targetH: number;
  autoValidate: boolean;
}) {

  async function applyTargetResize(r: GeneratedShot): Promise<GeneratedShot> {
    if (!r.imageBase64 || !r.mimeType) return r;
    try {
      const out = await resizeAndCenterCrop(r.imageBase64, r.mimeType, targetW, targetH);
      return { ...r, imageBase64: out.base64, mimeType: out.mimeType };
    } catch {
      return r;
    }
  }
  const meta = CATEGORY_META[category];
  const [urlsText, setUrlsText] = useState("");
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);
  const [genderByUrl, setGenderByUrl] = useState<Record<string, Gender>>({});
  const stopRef = useRef(false);

  function parseUrls(): string[] {
    return Array.from(
      new Set(
        urlsText
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => /^https?:\/\//.test(l))
      )
    );
  }

  // Lista de entradas (URL + gênero por URL)
  const entries: { url: string; gender: Gender }[] = parseUrls().map((u) => ({
    url: u,
    gender: genderByUrl[u] ?? defaultGender,
  }));

  function setEntryGender(url: string, gender: Gender) {
    setGenderByUrl((prev) => ({ ...prev, [url]: gender }));
  }

  function setAllGender(gender: Gender) {
    const next: Record<string, Gender> = { ...genderByUrl };
    for (const e of entries) next[e.url] = gender;
    setGenderByUrl(next);
  }

  function shotsForGender(gender: Gender): Shot[] {
    return meta.shotsFor(gender);
  }

  function updateItem(id: string, patch: Partial<BatchItem>) {
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function processOne(item: BatchItem) {
    const shots = shotsForGender(item.gender);
    updateItem(item.id, { status: "fetching", message: "Buscando imagens..." });

    const scrapeRes = await fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: item.url }),
    });
    const scrapeData = await scrapeRes.json();
    if (!scrapeRes.ok) throw new Error(scrapeData.error ?? "Falha no scrape");
    const images = (scrapeData.images ?? []) as ScrapedImage[];
    if (images.length === 0) throw new Error("Nenhuma imagem encontrada na URL.");

    updateItem(item.id, {
      refsCount: images.length,
      status: "generating",
      message: `Gerando ${shots.length} fotos (${images.length} ref${images.length > 1 ? "s" : ""})...`,
      productImages: images,
      shots,
    });

    const fd = new FormData();
    images.forEach((img, i) => {
      const ext = img.mimeType.split("/")[1] ?? "jpg";
      fd.append("product", base64ToFile(img.base64, img.mimeType, `ref-${i}.${ext}`));
    });
    fd.append("shots", JSON.stringify(shots));
    fd.append("anchorShotId", meta.anchorShotId);
    fd.append("aspectRatio", aspectRatio);
    if (category === "glasses") fd.append("imageSize", "2K");
    if (extraInstructions.trim()) fd.append("extraInstructions", extraInstructions.trim());

    const genRes = await fetch("/api/tryon", { method: "POST", body: fd });
    const genData = await genRes.json();
    if (!genRes.ok) throw new Error(genData.error ?? "Falha na geração");
    const indexed: Record<string, GeneratedShot> = {};
    for (const raw of (genData.results as GeneratedShot[]) ?? []) {
      indexed[raw.id] = await applyTargetResize(raw);
    }
    updateItem(item.id, { results: indexed });

    // Verificação automática
    let fixCount = 0;
    if (autoValidate && Object.values(indexed).every((r) => r.imageBase64)) {
      updateItem(item.id, { message: "Verificando consistência..." });
      const valFd = new FormData();
      images.forEach((img, i) => {
        const ext = img.mimeType.split("/")[1] ?? "jpg";
        valFd.append("product", base64ToFile(img.base64, img.mimeType, `ref-${i}.${ext}`));
      });
      const ids: string[] = [];
      const labels: string[] = [];
      for (const s of shots) {
        const r = indexed[s.id];
        if (r?.imageBase64 && r.mimeType) {
          valFd.append("generated", base64ToFile(r.imageBase64, r.mimeType, `${s.id}.png`));
          ids.push(s.id);
          labels.push(s.label);
        }
      }
      valFd.append("shotIds", JSON.stringify(ids));
      valFd.append("shotLabels", JSON.stringify(labels));
      const valRes = await fetch("/api/validate", { method: "POST", body: valFd });
      const valData = await valRes.json();
      const outliers = (valData.outliers ?? []) as string[];

      let current = indexed;
      for (const outlierId of outliers) {
        updateItem(item.id, { message: `Refazendo "${outlierId}"...` });
        const regenFd = new FormData();
        images.forEach((img, i) => {
          const ext = img.mimeType.split("/")[1] ?? "jpg";
          regenFd.append("product", base64ToFile(img.base64, img.mimeType, `ref-${i}.${ext}`));
        });
        for (const [id, r] of Object.entries(current)) {
          if (id !== outlierId && r.imageBase64 && r.mimeType) {
            regenFd.append("peer", base64ToFile(r.imageBase64, r.mimeType, `${id}.png`));
          }
        }
        regenFd.append("shots", JSON.stringify(shots));
        regenFd.append("targetShotId", outlierId);
        regenFd.append("anchorShotId", meta.anchorShotId);
        regenFd.append("aspectRatio", aspectRatio);
        if (category === "glasses") regenFd.append("imageSize", "2K");
        if (extraInstructions.trim()) regenFd.append("extraInstructions", extraInstructions.trim());
        const regRes = await fetch("/api/tryon", { method: "POST", body: regenFd });
        const regData = await regRes.json();
        const rawFixed = ((regData.results as GeneratedShot[]) ?? [])[0];
        if (rawFixed?.imageBase64) {
          const fixed = await applyTargetResize(rawFixed);
          current = { ...current, [outlierId]: fixed };
          fixCount++;
          updateItem(item.id, { results: current });
        }
      }
    }

    updateItem(item.id, { status: "done", message: "Pronto", fixCount });
  }

  const [regeneratingKeys, setRegeneratingKeys] = useState<Set<string>>(new Set());
  const [regenError, setRegenError] = useState<string | null>(null);

  async function regenerateBatchShot(item: BatchItem, shotId: string) {
    if (!item.productImages?.length || !item.shots?.length || !item.results) {
      setRegenError("Imagens originais ou prompts não disponíveis para refazer.");
      return;
    }
    const key = `${item.id}:${shotId}`;
    if (regeneratingKeys.has(key)) return;
    setRegenError(null);
    setRegeneratingKeys((prev) => new Set(prev).add(key));
    try {
      const fd = new FormData();
      item.productImages.forEach((img, i) => {
        const ext = img.mimeType.split("/")[1] ?? "jpg";
        fd.append("product", base64ToFile(img.base64, img.mimeType, `ref-${i}.${ext}`));
      });
      for (const [id, r] of Object.entries(item.results)) {
        if (id !== shotId && r.imageBase64 && r.mimeType) {
          fd.append("peer", base64ToFile(r.imageBase64, r.mimeType, `${id}.png`));
        }
      }
      fd.append("shots", JSON.stringify(item.shots));
      fd.append("targetShotId", shotId);
      fd.append("anchorShotId", meta.anchorShotId);
      fd.append("aspectRatio", aspectRatio);
      if (category === "glasses") fd.append("imageSize", "2K");
      if (extraInstructions.trim()) fd.append("extraInstructions", extraInstructions.trim());

      const res = await fetch("/api/tryon", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao regerar");
      const rawFixed = ((data.results as GeneratedShot[]) ?? [])[0];
      if (!rawFixed) throw new Error("Sem resultado retornado");
      const fixed = await applyTargetResize(rawFixed);
      updateItem(item.id, {
        results: { ...item.results, [shotId]: fixed },
      });
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : "Erro ao regerar");
    } finally {
      setRegeneratingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  async function startBatch() {
    if (entries.length === 0) return;
    const newItems: BatchItem[] = entries.map((e, i) => ({
      id: `${Date.now()}-${i}`,
      url: e.url,
      gender: e.gender,
      status: "pending",
    }));
    setItems(newItems);
    setRunning(true);
    stopRef.current = false;

    for (const item of newItems) {
      if (stopRef.current) {
        updateItem(item.id, { status: "error", error: "Interrompido" });
        continue;
      }
      try {
        await processOne(item);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro";
        updateItem(item.id, { status: "error", error: msg });
      }
    }
    setRunning(false);
  }

  function stop() {
    stopRef.current = true;
  }

  const [zipping, setZipping] = useState(false);

  async function downloadZip() {
    setZipping(true);
    try {
      const zip = new JSZip();
      const tasks: Promise<void>[] = [];
      items.forEach((item, idx) => {
        if (!item.results) return;
        const slug = urlToSlug(item.url, idx);
        const folder = zip.folder(`${String(idx + 1).padStart(2, "0")}-${slug}`);
        if (!folder) return;
        for (const [shotId, r] of Object.entries(item.results)) {
          if (!r.imageBase64) continue;
          tasks.push(
            base64ToPngBlob(r.imageBase64, r.mimeType ?? "image/png").then((blob) => {
              folder.file(`${shotId}.png`, blob);
            })
          );
        }
      });
      if (tasks.length === 0) return;
      await Promise.all(tasks);

      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `lote-provador-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }

  const doneCount = items.filter((i) => i.status === "done").length;
  const errorCount = items.filter((i) => i.status === "error").length;
  const total = items.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="card p-6 flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="eyebrow">Lista de URLs</span>
          <span className="text-[10px] uppercase tracking-widest text-[var(--text-soft)]">uma por linha</span>
        </div>
        <textarea
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          rows={6}
          disabled={running}
          placeholder={`https://loja.com/produto/oculos-1\nhttps://loja.com/produto/oculos-2\nhttps://outraloja.com/produto/oculos-3`}
          className="field font-mono text-xs"
        />
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          Para cada URL: busca imagens do produto + gera 4 fotos. Processa em sequência (1 por vez)
          pra respeitar limites da API. Cada URL pode ter <em>Homem</em> ou <em>Mulher</em>{" "}
          configurado individualmente abaixo.
        </p>
      </div>

      {/* Painel de configuração — gênero por URL */}
      {meta.hasGender && entries.length > 0 && !running && items.length === 0 && (
        <div className="card p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="eyebrow">Configurar URLs</span>
              <span className="mt-1 text-xs text-[var(--text-muted)] tabular-nums">
                {entries.length} produto{entries.length !== 1 ? "s" : ""} · escolha o modelo de cada
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-[var(--text-soft)]">
                Aplicar a todos
              </span>
              <button onClick={() => setAllGender("male")} className="btn-ghost">
                Homem
              </button>
              <button onClick={() => setAllGender("female")} className="btn-ghost">
                Mulher
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {entries.map((e, i) => (
              <div
                key={e.url}
                className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-warm)] px-3 py-2"
              >
                <span className="font-mono text-[11px] tabular-nums text-[var(--text-soft)]">
                  #{String(i + 1).padStart(2, "0")}
                </span>
                <a
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-xs text-[var(--text)] hover:underline underline-offset-2"
                  title={e.url}
                >
                  {e.url}
                </a>
                <div className="segmented shrink-0">
                  {(["male", "female"] as const).map((g) => (
                    <button
                      key={g}
                      onClick={() => setEntryGender(e.url, g)}
                      data-active={e.gender === g}
                      className="!px-3 !py-1 !text-[11px]"
                    >
                      {g === "male" ? "Homem" : "Mulher"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-3">
        {!running ? (
          <button
            onClick={startBatch}
            disabled={entries.length === 0}
            className="btn-primary"
          >
            Iniciar lote
            {entries.length > 0 && (
              <span className="ml-1 rounded-full bg-[var(--bg)]/15 px-2 py-0.5 text-[11px] tabular-nums">
                {entries.length} URL{entries.length !== 1 ? "s" : ""}
              </span>
            )}
          </button>
        ) : (
          <button
            onClick={stop}
            className="btn-secondary"
            style={{ borderColor: "var(--error)", color: "var(--error)" }}
          >
            Parar
          </button>
        )}
        {doneCount > 0 && (
          <button onClick={downloadZip} disabled={zipping} className="btn-secondary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
            </svg>
            {zipping ? "Empacotando .png…" : `Baixar ZIP · ${doneCount}`}
          </button>
        )}
        {total > 0 && (
          <span className="text-xs text-[var(--text-muted)] tabular-nums">
            {doneCount}/{total} concluídos{errorCount > 0 ? ` · ${errorCount} com erro` : ""}
          </span>
        )}
      </div>

      {regenError && (
        <p className="text-xs text-red-400">{regenError}</p>
      )}

      {items.length > 0 && (
        <div className="flex flex-col gap-3">
          {items.map((item, idx) => (
            <BatchItemRow
              key={item.id}
              item={item}
              idx={idx}
              shots={item.shots ?? shotsForGender(item.gender)}
              aspectRatio={aspectRatio}
              regeneratingShotIds={
                new Set(
                  Array.from(regeneratingKeys)
                    .filter((k) => k.startsWith(`${item.id}:`))
                    .map((k) => k.split(":")[1]!)
                )
              }
              canRegenerate={
                !!item.productImages?.length && !!item.shots?.length && !running
              }
              onRegenerate={(shotId) => regenerateBatchShot(item, shotId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BatchItemRow({
  item,
  idx,
  shots,
  aspectRatio,
  regeneratingShotIds,
  canRegenerate,
  onRegenerate,
}: {
  item: BatchItem;
  idx: number;
  shots: Shot[];
  regeneratingShotIds: Set<string>;
  canRegenerate: boolean;
  onRegenerate: (shotId: string) => void;
  aspectRatio: AspectRatio;
}) {
  const aspectClass =
    aspectRatio === "1:1"
      ? "aspect-square"
      : aspectRatio === "4:3"
      ? "aspect-[4/3]"
      : aspectRatio === "3:4"
      ? "aspect-[3/4]"
      : aspectRatio === "16:9"
      ? "aspect-[16/9]"
      : "aspect-[9/16]";
  const statusColor =
    item.status === "done"
      ? "var(--success)"
      : item.status === "error"
      ? "var(--error)"
      : item.status === "pending"
      ? "var(--text-soft)"
      : "var(--warning)";
  const statusLabel =
    item.status === "pending"
      ? "Aguardando"
      : item.status === "fetching"
      ? "Buscando"
      : item.status === "generating"
      ? "Gerando"
      : item.status === "done"
      ? "Pronto"
      : "Erro";

  const isWorking = item.status === "fetching" || item.status === "generating";

  return (
    <div className="card p-5 rise-in" style={{ animationDelay: `${idx * 40}ms` }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-[var(--text-soft)]">
            <span className="font-mono tabular-nums">#{String(idx + 1).padStart(2, "0")}</span>
            <span className="inline-flex items-center gap-1.5" style={{ color: statusColor }}>
              <span className="status-dot" />
              {statusLabel}
            </span>
            {/* Badge de gênero — só faz sentido se a categoria usa modelo */}
            {(item.results?.["model"] || item.results?.["model-front"] || !item.results) && (
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface-warm)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)]" style={{ display: aspectRatio === "1:1" ? "none" : undefined }}>
                {item.gender === "female" ? "Mulher" : "Homem"}
              </span>
            )}
            {item.refsCount !== undefined && (
              <span>· {item.refsCount} ref{item.refsCount > 1 ? "s" : ""}</span>
            )}
          </div>
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block truncate text-sm text-[var(--text)] hover:underline underline-offset-2"
          >
            {item.url}
          </a>
          {item.message && item.status !== "done" && item.status !== "error" && (
            <p className="mt-1.5 text-xs text-[var(--text-muted)]">{item.message}</p>
          )}
          {item.status === "done" && item.fixCount !== undefined && item.fixCount > 0 && (
            <p className="mt-1.5 text-xs text-[var(--success)]">
              ✓ {item.fixCount} imagem{item.fixCount > 1 ? "ns" : ""} refeita
              {item.fixCount > 1 ? "s" : ""} pela verificação automática
            </p>
          )}
          {item.error && (
            <p className="mt-1.5 text-xs text-[var(--error)]">{item.error}</p>
          )}
        </div>
      </div>

      {isWorking && <div className="bar-loader mt-3" />}

      {item.results && (
        <div className="mt-4 grid grid-cols-4 gap-2">
          {shots.map((s) => {
            const r = item.results![s.id];
            const src = r?.imageBase64 ? `data:${r.mimeType};base64,${r.imageBase64}` : null;
            const isRegen = regeneratingShotIds.has(s.id);
            return (
              <div key={s.id} className={`group relative ${aspectClass} overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-warm)]`}>
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={s.label} className={`h-full w-full object-cover transition ${isRegen ? "opacity-30" : ""}`} />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-[var(--text-soft)]">
                    {r?.error ? "falhou" : "—"}
                  </div>
                )}
                {isRegen && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="rounded-full bg-black/70 px-3 py-1 text-[10px] uppercase tracking-wider text-white">
                      Refazendo…
                    </span>
                  </div>
                )}
                {(src || r?.error) && item.status === "done" && (
                  <button
                    onClick={() => onRegenerate(s.id)}
                    disabled={!canRegenerate || isRegen}
                    className="pointer-events-auto absolute right-1.5 top-1.5 rounded-full bg-white/95 px-1.5 py-0.5 text-[10px] font-medium text-neutral-950 opacity-0 transition hover:bg-white group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Refazer apenas esta foto"
                  >
                    ↻
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ShotCard({
  shot,
  result,
  regenerating,
  onRegenerate,
  canRegenerate,
  aspectRatio,
  aspectStyle,
}: {
  shot: Shot;
  result?: GeneratedShot;
  regenerating: boolean;
  canRegenerate: boolean;
  onRegenerate: () => void;
  aspectRatio: AspectRatio;
  aspectStyle?: React.CSSProperties;
}) {
  const isLoading = !result || regenerating;
  const aspectClass = aspectStyle
    ? ""
    : aspectRatio === "1:1"
    ? "aspect-square"
    : aspectRatio === "4:3"
    ? "aspect-[4/3]"
    : aspectRatio === "3:4"
    ? "aspect-[3/4]"
    : aspectRatio === "16:9"
    ? "aspect-[16/9]"
    : "aspect-[9/16]";
  const imgSrc = result?.imageBase64
    ? `data:${result.mimeType};base64,${result.imageBase64}`
    : null;

  return (
    <div className="card flex flex-col gap-3 p-3 rise-in">
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-medium tracking-tight text-[var(--text)]">{shot.label}</span>
        {result?.error && (
          <span className="text-xs text-[var(--error)]" title={result.error}>
            erro
          </span>
        )}
      </div>

      <div
        className={`relative ${aspectClass} w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-warm)]`}
        style={aspectStyle}
      >
        {imgSrc && !regenerating ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgSrc} alt={shot.label} className="h-full w-full object-cover" />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-3 text-center">
            <div className="bar-loader w-2/3" />
            <span className="text-xs text-[var(--text-muted)]">
              {regenerating
                ? "Refazendo…"
                : isLoading
                ? "Gerando…"
                : result?.error
                ? "Falhou"
                : "—"}
            </span>
          </div>
        )}
      </div>

      {result?.imageBase64 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() =>
              downloadAsPng(result.imageBase64!, result.mimeType ?? "image/png", shot.id)
            }
            className="btn-ghost"
            title="Baixar em PNG"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
            </svg>
            Baixar .png
          </button>
          <button
            onClick={onRegenerate}
            disabled={!canRegenerate || regenerating}
            className="btn-ghost"
            title="Gera apenas esta imagem usando as outras 3 como referência"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0115.5-6.4L21 8m0-5v5h-5M21 12a9 9 0 01-15.5 6.4L3 16m0 5v-5h5" />
            </svg>
            Refazer
          </button>
        </div>
      )}
    </div>
  );
}

// Qualidade WEBP — 0.88 mantém alta fidelidade visual e reduz ~50–70% do tamanho do PNG
const WEBP_QUALITY = 0.88;

async function base64ToWebpBlob(
  base64: string,
  sourceMimeType: string,
  quality = WEBP_QUALITY
): Promise<Blob> {
  const dataUrl = `data:${sourceMimeType};base64,${base64}`;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Falha ao carregar imagem para conversão"));
    img.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(img, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Falha na conversão WEBP"));
        else resolve(blob);
      },
      "image/webp",
      quality
    );
  });
}

async function downloadAsWebp(base64: string, sourceMimeType: string, filename: string) {
  const blob = await base64ToWebpBlob(base64, sourceMimeType);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/\.(png|jpg|jpeg)$/i, "") + ".webp";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function base64ToPngBlob(base64: string, sourceMimeType: string): Promise<Blob> {
  // Se já é PNG, decodifica e re-encoda só pra entregar como Blob.
  // Se for outro formato (webp/jpeg), passa pelo canvas.
  const dataUrl = `data:${sourceMimeType};base64,${base64}`;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Falha ao carregar imagem para PNG"));
    img.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(img, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob PNG"))), "image/png");
  });
}

async function downloadAsPng(base64: string, sourceMimeType: string, filename: string) {
  const blob = await base64ToPngBlob(base64, sourceMimeType);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/\.(png|jpg|jpeg|webp)$/i, "") + ".png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Calcula o aspect ratio mais próximo do tamanho customizado, dentre os
// suportados pela API Gemini. A geração roda nesse ratio; depois fazemos
// resize+crop client-side pra ficar exatamente W×H.
function closestApiAspect(width: number, height: number): AspectRatio {
  const target = width / height;
  const candidates: { id: AspectRatio; r: number }[] = [
    { id: "1:1", r: 1 },
    { id: "3:4", r: 0.75 },
    { id: "4:3", r: 4 / 3 },
    { id: "9:16", r: 9 / 16 },
    { id: "16:9", r: 16 / 9 },
  ];
  return candidates.reduce((best, c) =>
    Math.abs(c.r - target) < Math.abs(best.r - target) ? c : best
  ).id;
}

// Resize/center-crop client-side: corta o centro pra bater com o aspect alvo
// e redimensiona pra dimensões exatas. Mantém PNG pra preservar qualidade
// (a conversão WEBP final acontece no download).
async function resizeAndCenterCrop(
  base64: string,
  sourceMimeType: string,
  targetW: number,
  targetH: number
): Promise<{ base64: string; mimeType: string }> {
  const dataUrl = `data:${sourceMimeType};base64,${base64}`;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Falha ao decodificar imagem para resize"));
    img.src = dataUrl;
  });

  const srcRatio = img.naturalWidth / img.naturalHeight;
  const tgtRatio = targetW / targetH;

  let sx = 0,
    sy = 0,
    sw = img.naturalWidth,
    sh = img.naturalHeight;
  if (srcRatio > tgtRatio) {
    // source mais larga: corta laterais
    sw = sh * tgtRatio;
    sx = (img.naturalWidth - sw) / 2;
  } else if (srcRatio < tgtRatio) {
    // source mais alta: corta topo/base
    sh = sw / tgtRatio;
    sy = (img.naturalHeight - sh) / 2;
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);

  const dataOut = canvas.toDataURL("image/png");
  return { base64: dataOut.split(",")[1], mimeType: "image/png" };
}

/* ────────────────────────────────────────────────────────────
   Histórico — últimas 5 gerações por categoria, em localStorage.
   Imagens convertidas pra WEBP antes de salvar pra caber no quota.
   ──────────────────────────────────────────────────────────── */

type HistoryEntry = {
  id: string;
  category: Category;
  gender?: Gender;
  resolution: string;
  aspectRatio: AspectRatio;
  anchorShotId: string;
  extraInstructions?: string;
  // Resolução final (W×H) usada na geração — pra regerar mantendo o mesmo tamanho.
  targetW?: number;
  targetH?: number;
  timestamp: number;
  // Fotos originais do produto, comprimidas — necessárias pra refazer.
  products?: string[];
  // Cada shot guarda também o prompt usado, pra mandar de volta na regeração.
  shots: Array<{ id: string; label: string; prompt?: string; webpBase64: string }>;
};

const HISTORY_KEY = (c: Category) => `provador.history.${c}`;
const HISTORY_LIMIT = 5;

function blobToBase64Browser(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const r = reader.result as string;
      resolve(r.split(",")[1]);
    };
    reader.onerror = () => reject(new Error("Falha ao ler blob"));
    reader.readAsDataURL(blob);
  });
}

async function fileToWebpBase64Compressed(
  file: File,
  maxSize = 1024,
  quality = 0.65
): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("compress: load failed"));
      img.src = url;
    });
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível");
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob(
        (b) => (b ? res(b) : rej(new Error("toBlob"))),
        "image/webp",
        quality
      )
    );
    return await blobToBase64Browser(blob);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function makeHistoryEntry(
  category: Category,
  gender: Gender | undefined,
  resolution: string,
  aspectRatio: AspectRatio,
  anchorShotId: string,
  extraInstructions: string,
  targetW: number,
  targetH: number,
  productFiles: File[],
  shots: Shot[],
  results: Record<string, GeneratedShot>
): Promise<HistoryEntry> {
  const entryShots: HistoryEntry["shots"] = [];
  for (const s of shots) {
    const r = results[s.id];
    if (!r?.imageBase64 || !r.mimeType) continue;
    try {
      const blob = await base64ToWebpBlob(r.imageBase64, r.mimeType, 0.78);
      const webpBase64 = await blobToBase64Browser(blob);
      entryShots.push({ id: s.id, label: s.label, prompt: s.prompt, webpBase64 });
    } catch {
      // se a conversão falhar, ignora aquela imagem
    }
  }
  const products: string[] = [];
  for (const f of productFiles) {
    try {
      products.push(await fileToWebpBase64Compressed(f));
    } catch {
      // produto que falhar fica de fora — refazer ainda funciona com o resto
    }
  }
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    category,
    gender,
    resolution,
    aspectRatio,
    anchorShotId,
    extraInstructions: extraInstructions || undefined,
    targetW,
    targetH,
    timestamp: Date.now(),
    products,
    shots: entryShots,
  };
}

function saveHistory(entry: HistoryEntry) {
  if (typeof window === "undefined") return;
  const key = HISTORY_KEY(entry.category);
  let existing: HistoryEntry[] = [];
  try {
    existing = JSON.parse(localStorage.getItem(key) ?? "[]");
  } catch {}
  const updated = [entry, ...existing].slice(0, HISTORY_LIMIT);
  // tenta salvar; se quota excedida, vai cortando até caber
  for (let n = updated.length; n >= 1; n--) {
    try {
      localStorage.setItem(key, JSON.stringify(updated.slice(0, n)));
      return;
    } catch {}
  }
  console.warn("[history] não foi possível salvar — quota excedida");
}

function loadHistory(category: Category): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY(category)) ?? "[]");
  } catch {
    return [];
  }
}

function deleteFromHistory(category: Category, id: string) {
  if (typeof window === "undefined") return;
  const entries = loadHistory(category).filter((e) => e.id !== id);
  localStorage.setItem(HISTORY_KEY(category), JSON.stringify(entries));
}

function updateEntryShot(
  category: Category,
  entryId: string,
  shotId: string,
  webpBase64: string
) {
  if (typeof window === "undefined") return;
  const entries = loadHistory(category);
  const idx = entries.findIndex((e) => e.id === entryId);
  if (idx === -1) return;
  const entry = entries[idx];
  entry.shots = entry.shots.map((s) =>
    s.id === shotId ? { ...s, webpBase64 } : s
  );
  entry.timestamp = Date.now();
  // promove pro topo
  entries.splice(idx, 1);
  entries.unshift(entry);
  for (let n = entries.length; n >= 1; n--) {
    try {
      localStorage.setItem(HISTORY_KEY(category), JSON.stringify(entries.slice(0, n)));
      return;
    } catch {}
  }
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "agora mesmo";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}

function HistoryPanel({
  category,
  refreshKey,
}: {
  category: Category;
  refreshKey: number;
}) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [regeneratingKeys, setRegeneratingKeys] = useState<Set<string>>(new Set());
  const [regenError, setRegenError] = useState<string | null>(null);

  useEffect(() => {
    setEntries(loadHistory(category));
  }, [category, refreshKey]);

  if (entries.length === 0) return null;

  async function downloadEntryZip(entry: HistoryEntry) {
    const zip = new JSZip();
    for (const s of entry.shots) {
      try {
        const blob = await base64ToPngBlob(s.webpBase64, "image/webp");
        zip.file(`${s.id}.png`, blob);
      } catch {
        // se falhar a conversão, pula
      }
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date(entry.timestamp).toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `${entry.category}-${date}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadShot(s: HistoryEntry["shots"][number]) {
    await downloadAsPng(s.webpBase64, "image/webp", s.id);
  }

  function remove(id: string) {
    deleteFromHistory(category, id);
    setEntries(loadHistory(category));
  }

  async function regenerateShotInEntry(entry: HistoryEntry, shotId: string) {
    if (!entry.products || entry.products.length === 0) {
      setRegenError("Esta geração foi salva antes da feature de refazer — sem fotos do produto guardadas.");
      return;
    }
    const target = entry.shots.find((s) => s.id === shotId);
    if (!target?.prompt) {
      setRegenError("Prompt do shot não está armazenado nesta entrada.");
      return;
    }
    const key = `${entry.id}:${shotId}`;
    if (regeneratingKeys.has(key)) return;
    setRegenError(null);
    setRegeneratingKeys((prev) => new Set(prev).add(key));
    try {
      const fd = new FormData();
      entry.products.forEach((p, i) => {
        fd.append("product", base64ToFile(p, "image/webp", `ref-${i}.webp`));
      });
      // Outros shots viram peers — referência adicional
      for (const s of entry.shots) {
        if (s.id !== shotId) {
          fd.append("peer", base64ToFile(s.webpBase64, "image/webp", `${s.id}.webp`));
        }
      }
      const shotsForApi = entry.shots
        .filter((s) => s.prompt)
        .map((s) => ({ id: s.id, label: s.label, prompt: s.prompt! }));
      fd.append("shots", JSON.stringify(shotsForApi));
      fd.append("targetShotId", shotId);
      fd.append("anchorShotId", entry.anchorShotId);
      fd.append("aspectRatio", entry.aspectRatio);
      if (entry.extraInstructions) fd.append("extraInstructions", entry.extraInstructions);

      const res = await fetch("/api/tryon", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao regerar");
      const raw = (data.results as GeneratedShot[])[0];
      if (!raw?.imageBase64 || !raw.mimeType) throw new Error(raw?.error ?? "Sem imagem retornada");

      // Resize pro mesmo tamanho da geração original (se conhecido)
      let r = raw;
      if (entry.targetW && entry.targetH) {
        try {
          const out = await resizeAndCenterCrop(raw.imageBase64, raw.mimeType, entry.targetW, entry.targetH);
          r = { ...raw, imageBase64: out.base64, mimeType: out.mimeType };
        } catch {}
      }

      const blob = await base64ToWebpBlob(r.imageBase64!, r.mimeType!, 0.78);
      const newWebp = await blobToBase64Browser(blob);
      updateEntryShot(category, entry.id, shotId, newWebp);
      setEntries(loadHistory(category));
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : "Erro ao regerar");
    } finally {
      setRegeneratingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  return (
    <section className="mt-16">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <span className="eyebrow">Histórico</span>
          <h2 className="display mt-2 text-3xl">
            Últimas {entries.length === 1 ? "geração" : `${entries.length} gerações`}
          </h2>
        </div>
        <span className="text-xs text-[var(--text-muted)]">
          salvo localmente · até {HISTORY_LIMIT} por categoria
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {entries.map((entry) => (
          <div key={entry.id} className="card flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <span className="font-mono tabular-nums">{timeAgo(entry.timestamp)}</span>
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface-warm)] px-2 py-0.5 text-[10px] uppercase tracking-wider">
                  {CATEGORY_META[entry.category].label}
                </span>
                {entry.gender && (
                  <span className="rounded-full border border-[var(--border)] bg-[var(--surface-warm)] px-2 py-0.5 text-[10px] uppercase tracking-wider">
                    {entry.gender === "female" ? "Mulher" : "Homem"}
                  </span>
                )}
                <span className="font-mono">{entry.resolution}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => downloadEntryZip(entry)} className="btn-ghost">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
                  </svg>
                  Baixar ZIP
                </button>
                <button onClick={() => remove(entry.id)} className="btn-ghost" title="Remover do histórico">
                  ✕
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {entry.shots.map((s) => {
                const key = `${entry.id}:${s.id}`;
                const isRegen = regeneratingKeys.has(key);
                const canRegen =
                  !!entry.products?.length && !!s.prompt && !isRegen;
                return (
                  <div key={s.id} className="group relative overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-warm)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:image/webp;base64,${s.webpBase64}`}
                      alt={s.label}
                      className={`aspect-square w-full object-cover transition ${isRegen ? "opacity-30" : ""}`}
                    />
                    {isRegen && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="rounded-full bg-black/70 px-3 py-1 text-[10px] uppercase tracking-wider text-white">
                          Refazendo…
                        </span>
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 opacity-0 transition group-hover:opacity-100">
                      <span className="truncate text-[10px] text-white">{s.label}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => regenerateShotInEntry(entry, s.id)}
                          disabled={!canRegen}
                          className="pointer-events-auto rounded-full bg-white/95 px-1.5 py-0.5 text-[10px] font-medium text-neutral-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                          title={
                            !entry.products?.length
                              ? "Salvo antes da feature de refazer"
                              : !s.prompt
                              ? "Prompt não armazenado"
                              : "Refazer apenas esta foto"
                          }
                        >
                          ↻
                        </button>
                        <button
                          onClick={() => downloadShot(s)}
                          className="pointer-events-auto rounded-full bg-white/95 px-1.5 py-0.5 text-[10px] font-medium text-neutral-950 hover:bg-white"
                          title="Baixar"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {regenError && (
              <p className="text-xs text-red-400">{regenError}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function base64ToFile(base64: string, mimeType: string, name: string): File {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mimeType });
}

/* ────────────────────────────────────────────────────────────
   Loading compacto — uma única faixa minimalista com aperture
   pequena, cronômetro e cue rotativa. Skeleton fica nos próprios
   cards de resultado.
   ──────────────────────────────────────────────────────────── */

const STUDIO_CUES = [
  "Posicionando o softbox",
  "Calibrando white balance",
  "Marcação — perfil 90°",
  "Cor da armação cross-checked",
  "Frame travado · rolling",
  "Direção: olhar reto pra câmera",
  "Reflexos suaves nas lentes",
  "Limpeza de fundo · #FFFFFF",
  "Continuidade entre os cliques",
  "Pós: zero filtros, só calibração",
  "Take aprovado · próxima",
  "Cinematografia em curso",
];

function MiniAperture() {
  return (
    <span className="aperture-mini" aria-hidden>
      <svg width="18" height="18" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" fill="none" stroke="var(--text)" strokeOpacity="0.25" strokeWidth="1" />
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <path
            key={deg}
            d="M 12 3.5 L 16.5 8 L 12 6.5 Z"
            fill="#7b3aec"
            transform={`rotate(${deg} 12 12)`}
          />
        ))}
        <circle cx="12" cy="12" r="2" fill="var(--text)" />
      </svg>
    </span>
  );
}

function LoadingStrip({ validating = false }: { validating?: boolean } = {}) {
  const [elapsed, setElapsed] = useState(0);
  const [cueIdx, setCueIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const t = setInterval(() => setCueIdx((i) => (i + 1) % STUDIO_CUES.length), 2200);
    return () => clearInterval(t);
  }, []);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timer = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  return (
    <div className="card flex items-center gap-3 px-4 py-2.5 fade-in">
      <MiniAperture />
      <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
        {timer}
      </span>
      <span className="h-3 w-px bg-[var(--border-strong)]" aria-hidden />
      <span
        key={cueIdx}
        className="cue-text min-w-0 flex-1 truncate text-xs text-[var(--text)]"
      >
        {validating ? "Conferindo consistência…" : STUDIO_CUES[cueIdx]}
      </span>
      <span className="hidden text-[10px] uppercase tracking-widest text-[var(--text-soft)] sm:inline">
        {validating ? "verificando" : "gerando"}
      </span>
    </div>
  );
}

function SkeletonCard({
  label,
  aspectClass,
  aspectStyle,
}: {
  label: string;
  aspectClass: string;
  aspectStyle?: React.CSSProperties;
}) {
  return (
    <div className="card flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-medium tracking-tight text-[var(--text-muted)]">
          {label}
        </span>
      </div>
      <div
        className={`skeleton-card relative ${aspectClass} w-full overflow-hidden rounded-xl border border-[var(--border)]`}
        style={aspectStyle}
      >
        <div className="skeleton-mark absolute inset-0 flex items-center justify-center">
          <MiniAperture />
        </div>
      </div>
      <div className="h-5" aria-hidden />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Try-on óculos — 1 pessoa + N óculos = N fotos
   ──────────────────────────────────────────────────────────── */

const TRYON_PROMPT = `OBJETIVO: A MESMA foto da pessoa, EXATAMENTE como está na referência, com APENAS os óculos do produto adicionados ao rosto dela. NADA MAIS PODE MUDAR.

REGRA DE FIDELIDADE — PESSOA E CENA (TUDO EXCETO OS ÓCULOS):
A imagem marcada como FOTO DA PESSOA é a foto base do output. Preserve PIXEL-A-PIXEL:
• Fundo COMPLETO (todo cenário, ambiente, paisagem, parede, decoração, objetos, outras pessoas — EXATAMENTE como está, sem trocar, simplificar ou estilizar)
• Iluminação da cena (direção, intensidade, cor, sombras existentes)
• Rosto (formato, traços, simetria, idade aparente, etnia, marcas, sardas, maquiagem)
• Cabelo (cor, comprimento, corte, estilo, queda, fios soltos, textura)
• Pele (tom, textura, brilho, manchas naturais)
• Expressão facial e olhar
• Pescoço, ombros, corpo, roupas, acessórios — exatamente como aparecem
• Enquadramento, ângulo da câmera, distância focal, profundidade de campo
• Pós-processamento da foto original (white balance, contraste, saturação, grão)
PROIBIDO: trocar fundo, mudar pra estúdio/branco/cinza, simplificar cenário, mudar pessoa, alterar pose, mudar iluminação, recortar diferente, "embelezar".

REGRA DE FIDELIDADE — ÓCULOS:
As imagens de referência do PRODUTO são a fonte da verdade dos ÓCULOS. Preserve EXATAMENTE:
• Formato da armação (linha superior, lentes, ponte, hastes)
• Cor exata (incluindo transparência, fumê, gradiente)
• Material e textura (acetato, metal, fosco, brilhante)
• Espessura da armação
• Cor e tonalidade EXATA das lentes
• Logos, gravações, parafusos, dobradiças, plaquetas
PROIBIDO: trocar cor, mudar formato, inventar detalhes.

COMPOSIÇÃO:
Coloque os óculos no rosto da pessoa de forma natural — apoio na ponte do nariz, hastes acompanhando as orelhas, posicionamento simétrico. Os óculos devem absorver a iluminação JÁ EXISTENTE na foto da pessoa (reflexos coerentes com a luz da cena, sombra natural sob a armação coerente com a sombra existente no rosto).

OUTPUT: A MESMA foto da pessoa, com os óculos adicionados. Fundo, luz, pose, expressão, enquadramento — TUDO igual à foto original. Hiper-realista, alta nitidez, sem alterar nada além de adicionar os óculos.`;

const PERSON_REF_LABEL = `FOTO BASE DA PESSOA (esta é literalmente a foto que deve sair no output, apenas com os óculos do produto adicionados ao rosto). Preserve EXATAMENTE: fundo completo da cena, iluminação, rosto, cabelo, pele, expressão, pose, ângulo da câmera, enquadramento, roupas, qualquer detalhe da imagem. NÃO troque o fundo por estúdio/branco. NÃO mude nada além de colocar os óculos no rosto`;

const CLOTHING_TRYON_PROMPT = `OBJETIVO: Foto realista da PESSOA das imagens de referência usando a ROUPA do produto.

REGRA DE FIDELIDADE — PESSOA:
A imagem marcada como FOTO DA PESSOA é a fonte da verdade do MODELO. Preserve EXATAMENTE:
• Rosto (formato, traços, simetria, idade aparente, etnia, marcas, sardas)
• Cabelo (cor, comprimento, corte, estilo, queda, textura)
• Pele (tom, textura, brilho, manchas, maquiagem)
• Expressão facial e olhar
• Proporções corporais (altura, largura de ombros, cintura, quadril)
• Pose, postura e posição das mãos/braços/pernas
• Enquadramento e ângulo da câmera
PROIBIDO: trocar a pessoa, mudar o rosto, alterar idade/gênero/etnia, modificar cabelo, mudar pose ou ângulo do corpo, "embelezar".

REGRA DE FIDELIDADE — ROUPA:
As imagens de referência do PRODUTO são a fonte da verdade da ROUPA. Preserve EXATAMENTE:
• Tipo da peça (camiseta, blusa, vestido, calça, jaqueta, etc. — exatamente o que está nas referências)
• Cor exata e tonalidade (incluindo gradientes, lavagens, tingimentos)
• Estampa, padrão, gráfico, lettering (manter idêntico, na mesma posição/escala)
• Material e textura (algodão, seda, jeans, tricot, malha, couro — visível na superfície)
• Modelagem e corte (oversized, slim, regular, croppado, longo, curto)
• Detalhes construtivos (gola, decote, mangas, punhos, bainhas, botões, zíperes, bolsos, costuras visíveis, bordados, logos, etiquetas)
• Caimento natural conforme as referências
PROIBIDO: trocar cor, mudar tipo de peça, inventar estampas/logos, alterar comprimento/corte, adicionar/remover detalhes que não existem nas referências, substituir por uma peça "parecida".

COMPOSIÇÃO:
A pessoa do output veste a roupa do produto NO LUGAR da peça correspondente que ela usa na foto de referência. Caimento natural sobre o corpo dela respeitando suas proporções e a pose original. Iluminação e sombras da roupa coerentes com a luz da foto da pessoa. NÃO mude pose, ângulo, expressão ou enquadramento — só troque a peça.

PEÇAS QUE NÃO SÃO O PRODUTO: se o produto é uma peça superior (ex: blusa) e a foto da pessoa mostra calça/saia/sapato, MANTENHA exatamente o que aparece. Idem se o produto for inferior (ex: calça) — mantenha a parte de cima da pessoa idêntica. Só troque a peça correspondente ao produto.

OUTPUT: Foto editorial hiper-realista, fundo branco puro #FFFFFF totalmente liso e uniforme (sem gradiente, sem textura, sem vinheta, sem sombra projetada). Iluminação editorial neutra. Qualidade 8K, alta nitidez.`;

const CLOTHING_PERSON_REF_LABEL = `FOTO DA PESSOA REAL (fonte da verdade do MODELO — rosto, cabelo, corpo, pose, expressão, idade, etnia, peças que NÃO são o produto). Esta é a pessoa exata que deve aparecer no output usando a roupa do produto. Mantenha rosto, cabelo, corpo, pose, expressão e enquadramento idênticos — apenas troque a peça correspondente ao produto`;

type GlassesSlot = { id: string; files: File[] };

function newSlotId(): string {
  return `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function SlotUploader({
  files,
  onChange,
  onFocus,
  small,
  label,
  highlighted,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  onFocus: () => void;
  small?: boolean;
  label: string;
  highlighted?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function addFiles(incoming: File[]) {
    const onlyImages = incoming.filter((f) => f.type.startsWith("image/"));
    if (onlyImages.length === 0) return;
    onChange([...files, ...onlyImages]);
  }
  function removeAt(idx: number) {
    onChange(files.filter((_, i) => i !== idx));
  }

  return (
    <div
      onMouseDown={onFocus}
      onClick={() => {
        onFocus();
        if (files.length === 0) inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        onFocus();
        addFiles(Array.from(e.dataTransfer.files));
      }}
      data-dragging={dragging || undefined}
      className={`dropzone relative cursor-pointer overflow-hidden p-3 ${
        highlighted ? "ring-1 ring-[var(--accent)]" : ""
      }`}
    >
      {files.length === 0 ? (
        <div className={`flex ${small ? "h-24" : "h-32"} flex-col items-center justify-center gap-1 text-center`}>
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-strong)] text-[var(--text-muted)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <span className="text-xs text-[var(--text)]">{label}</span>
          <span className="text-[10px] text-[var(--text-soft)]">clique, arraste ou cole</span>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {files.map((f, idx) => {
            const url = URL.createObjectURL(f);
            return (
              <div key={idx} className="group relative aspect-square overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-warm)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`ref-${idx}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAt(idx);
                  }}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--text)] text-[10px] text-[var(--bg)] opacity-0 transition group-hover:opacity-100"
                  aria-label="Remover"
                >
                  ✕
                </button>
              </div>
            );
          })}
          <div
            onClick={(e) => {
              e.stopPropagation();
              onFocus();
              inputRef.current?.click();
            }}
            className="flex aspect-square cursor-pointer items-center justify-center rounded-lg border border-dashed border-[var(--border-strong)] text-xl text-[var(--text-soft)]"
          >
            +
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
    </div>
  );
}

type TryonKind = "glasses" | "clothing";

function TryonView({
  aspectRatio,
  targetW,
  targetH,
  extraInstructions,
  kind,
}: {
  aspectRatio: AspectRatio;
  targetW: number;
  targetH: number;
  extraInstructions: string;
  kind: TryonKind;
}) {
  const PROMPT = kind === "glasses" ? TRYON_PROMPT : CLOTHING_TRYON_PROMPT;
  const REF_LABEL = kind === "glasses" ? PERSON_REF_LABEL : CLOTHING_PERSON_REF_LABEL;
  const itemSingular = kind === "glasses" ? "óculos" : "roupa";
  const slotHeader = kind === "glasses" ? "Óculos" : "Roupas";
  const resultTitle =
    kind === "glasses" ? "Mesma pessoa, óculos diferentes" : "Mesma pessoa, roupas diferentes";
  const slotPlaceholder =
    kind === "glasses" ? "Adicionar foto do óculos" : "Adicionar foto da roupa";
  const [personFile, setPersonFile] = useState<File | null>(null);
  const [glassesSlots, setGlassesSlots] = useState<GlassesSlot[]>([
    { id: newSlotId(), files: [] },
    { id: newSlotId(), files: [] },
    { id: newSlotId(), files: [] },
  ]);
  const [results, setResults] = useState<Record<string, GeneratedShot>>({});
  const [generating, setGenerating] = useState(false);
  const [generatingSlots, setGeneratingSlots] = useState<Set<string>>(new Set());
  const [regeneratingSlots, setRegeneratingSlots] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Pasta target — última zona em que o usuário clicou. Default: pessoa.
  const pasteTargetRef = useRef<"person" | string>("person");
  const [pasteTarget, setPasteTarget] = useState<"person" | string>("person");

  function focusPerson() {
    pasteTargetRef.current = "person";
    setPasteTarget("person");
  }
  function focusSlot(id: string) {
    pasteTargetRef.current = id;
    setPasteTarget(id);
  }

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const pasted: File[] = [];
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) pasted.push(f);
        }
      }
      if (pasted.length === 0) return;
      e.preventDefault();
      const target = pasteTargetRef.current;
      if (target === "person") {
        setPersonFile(pasted[0]);
      } else {
        setGlassesSlots((prev) =>
          prev.map((s) => (s.id === target ? { ...s, files: [...s.files, ...pasted] } : s))
        );
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  async function applyTargetResize(r: GeneratedShot): Promise<GeneratedShot> {
    if (!r.imageBase64 || !r.mimeType) return r;
    try {
      const out = await resizeAndCenterCrop(r.imageBase64, r.mimeType, targetW, targetH);
      return { ...r, imageBase64: out.base64, mimeType: out.mimeType };
    } catch {
      return r;
    }
  }

  async function generateOne(slot: GlassesSlot): Promise<void> {
    if (!personFile || slot.files.length === 0) return;
    const fd = new FormData();
    for (const f of slot.files) fd.append("product", f);
    fd.append("peer", personFile);
    const shot: Shot = {
      id: slot.id,
      label: `Pessoa usando ${itemSingular}`,
      prompt: PROMPT,
    };
    fd.append("shots", JSON.stringify([shot]));
    fd.append("targetShotId", slot.id);
    fd.append("aspectRatio", aspectRatio);
    fd.append("referenceLabel", REF_LABEL);
    if (extraInstructions.trim()) fd.append("extraInstructions", extraInstructions.trim());

    try {
      const res = await fetch("/api/tryon", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao gerar");
      const raw = (data.results as GeneratedShot[])[0];
      if (!raw) throw new Error("Sem resultado retornado");
      const out = await applyTargetResize(raw);
      setResults((prev) => ({ ...prev, [slot.id]: { ...out, id: slot.id, label: shot.label } }));
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [slot.id]: {
          id: slot.id,
          label: shot.label,
          error: err instanceof Error ? err.message : "Erro",
        },
      }));
    }
  }

  async function handleGenerateAll() {
    if (!personFile) {
      setError("Adicione a foto da pessoa primeiro.");
      return;
    }
    const valid = glassesSlots.filter((s) => s.files.length > 0);
    if (valid.length === 0) {
      setError(`Adicione ao menos uma ${itemSingular}.`);
      return;
    }
    setError(null);
    setGenerating(true);
    setGeneratingSlots(new Set(valid.map((s) => s.id)));
    setResults({});
    try {
      await Promise.all(
        valid.map(async (s) => {
          await generateOne(s);
          setGeneratingSlots((prev) => {
            const next = new Set(prev);
            next.delete(s.id);
            return next;
          });
        })
      );
    } finally {
      setGenerating(false);
      setGeneratingSlots(new Set());
    }
  }

  async function handleRegenerate(slotId: string) {
    if (regeneratingSlots.has(slotId)) return;
    const slot = glassesSlots.find((s) => s.id === slotId);
    if (!slot || !personFile || slot.files.length === 0) return;
    setRegeneratingSlots((prev) => new Set(prev).add(slotId));
    try {
      await generateOne(slot);
    } finally {
      setRegeneratingSlots((prev) => {
        const next = new Set(prev);
        next.delete(slotId);
        return next;
      });
    }
  }

  function addSlot() {
    setGlassesSlots((prev) => [...prev, { id: newSlotId(), files: [] }]);
  }
  function removeSlot(id: string) {
    setGlassesSlots((prev) => prev.filter((s) => s.id !== id));
    setResults((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }
  function setSlotFiles(id: string, files: File[]) {
    setGlassesSlots((prev) => prev.map((s) => (s.id === id ? { ...s, files } : s)));
  }
  function appendSlotFiles(id: string, newFiles: File[]) {
    setGlassesSlots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, files: [...s.files, ...newFiles] } : s))
    );
  }

  const validCount = glassesSlots.filter((s) => s.files.length > 0).length;
  const canGenerate = !!personFile && validCount > 0 && !generating;

  return (
    <div className="flex flex-col gap-8">
      {/* Inputs */}
      <section className="grid grid-cols-1 items-start gap-8 md:grid-cols-12">
        {/* Pessoa */}
        <div className="flex flex-col gap-3 md:col-span-4">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">Foto da pessoa</span>
            {personFile && (
              <button
                type="button"
                onClick={() => setPersonFile(null)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                trocar
              </button>
            )}
          </div>
          <SlotUploader
            files={personFile ? [personFile] : []}
            onChange={(files) => setPersonFile(files[0] ?? null)}
            onFocus={focusPerson}
            label="Adicionar foto da pessoa"
            highlighted={pasteTarget === "person"}
          />
          <p className="text-[11px] text-[var(--text-soft)]">
            1 imagem · usada como referência única em todas as gerações.
          </p>
        </div>

        {/* Items */}
        <div className="flex flex-col gap-4 md:col-span-8">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">{slotHeader}</span>
            <span className="text-xs text-[var(--text-muted)]">
              {validCount} de {glassesSlots.length} preenchido{validCount !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {glassesSlots.map((slot, idx) => (
              <div key={slot.id} className="card p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--text)]">
                    {slotHeader} #{idx + 1}
                  </span>
                  {glassesSlots.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSlot(slot.id)}
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--error)]"
                    >
                      remover
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <SlotUploader
                    files={slot.files}
                    onChange={(files) => setSlotFiles(slot.id, files)}
                    onFocus={() => focusSlot(slot.id)}
                    small
                    label={slotPlaceholder}
                    highlighted={pasteTarget === slot.id}
                  />
                  <div onMouseDown={() => focusSlot(slot.id)}>
                    <UrlImporter
                      onAdd={(newFiles) => {
                        focusSlot(slot.id);
                        appendSlotFiles(slot.id, newFiles);
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addSlot}
              disabled={generating}
              className="btn-ghost self-start"
            >
              + adicionar {itemSingular}
            </button>
          </div>
        </div>
      </section>

      {/* CTA */}
      <div className="flex items-center justify-between gap-4">
        {error && <span className="text-xs text-[var(--error)]">{error}</span>}
        <button
          onClick={handleGenerateAll}
          disabled={!canGenerate}
          className="btn-primary ml-auto"
        >
          {generating
            ? `Gerando ${generatingSlots.size} foto${generatingSlots.size === 1 ? "" : "s"}…`
            : `Gerar ${validCount} foto${validCount === 1 ? "" : "s"}`}
        </button>
      </div>

      {generating && (
        <div className="mb-2">
          <LoadingStrip />
        </div>
      )}

      {/* Resultados */}
      {(generating || Object.keys(results).length > 0) && (
        <section className="mt-4">
          <div className="mb-6">
            <span className="eyebrow">Resultado</span>
            <h2 className="display mt-2 text-3xl">{resultTitle}</h2>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {glassesSlots
              .filter((s) => s.files.length > 0)
              .map((slot, idx) => {
                const result = results[slot.id];
                const isGenerating = generatingSlots.has(slot.id);
                const isRegen = regeneratingSlots.has(slot.id);
                return (
                  <ShotCard
                    key={slot.id}
                    shot={{
                      id: slot.id,
                      label: `Pessoa usando ${itemSingular} #${idx + 1}`,
                      prompt: PROMPT,
                    }}
                    result={isGenerating ? undefined : result}
                    regenerating={isRegen}
                    canRegenerate={
                      !!personFile && slot.files.length > 0 && !generating && !isRegen
                    }
                    onRegenerate={() => handleRegenerate(slot.id)}
                    aspectRatio={aspectRatio}
                  />
                );
              })}
          </div>
        </section>
      )}
    </div>
  );
}

type Mode = "single" | "batch" | "tryon" | "tryon-clothing";

type ResolutionPreset = "1:1" | "9:16" | "16:9" | "custom";

const RESOLUTION_PRESETS: { id: Exclude<ResolutionPreset, "custom">; label: string; sub: string; w: number; h: number }[] = [
  { id: "1:1", label: "Quadrado", sub: "1080×1080", w: 1080, h: 1080 },
  { id: "9:16", label: "Vertical", sub: "1792×3072", w: 1792, h: 3072 },
  { id: "16:9", label: "Horizontal", sub: "1920×1080", w: 1920, h: 1080 },
];

export default function Home() {
  const [mode, setMode] = useState<Mode>("single");
  const [category, setCategory] = useState<Category>("glasses");
  const [productFiles, setProductFiles] = useState<File[]>([]);
  const [gender, setGender] = useState<Gender>("male");
  const [extraInstructions, setExtraInstructions] = useState("");
  const categoryMeta = CATEGORY_META[category];
  const [resolutionPreset, setResolutionPreset] = useState<ResolutionPreset>(
    categoryMeta.aspectRatio === "1:1"
      ? "1:1"
      : categoryMeta.aspectRatio === "16:9"
      ? "16:9"
      : "9:16"
  );
  const [customW, setCustomW] = useState<number>(1080);
  const [customH, setCustomH] = useState<number>(1350);
  const isCustom = resolutionPreset === "custom";
  // Aspect que vai pra API: preset normal usa o ID; custom usa o ratio mais próximo
  const aspectRatio: AspectRatio =
    resolutionPreset === "custom"
      ? closestApiAspect(customW, customH)
      : resolutionPreset;
  // Dimensões finais (após resize, se custom)
  const finalW = isCustom ? customW : RESOLUTION_PRESETS.find((p) => p.id === resolutionPreset)?.w ?? 1080;
  const finalH = isCustom ? customH : RESOLUTION_PRESETS.find((p) => p.id === resolutionPreset)?.h ?? 1920;
  const shots: Shot[] = categoryMeta.shotsFor(gender);
  const [generating, setGenerating] = useState(false);
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, GeneratedShot>>({});
  const [error, setError] = useState<string | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [autoValidate, setAutoValidate] = useState(true);
  const [validating, setValidating] = useState(false);
  const [validationFixCount, setValidationFixCount] = useState(0);

  async function regenerateShot(
    shotId: string,
    currentResults: Record<string, GeneratedShot>
  ): Promise<GeneratedShot | null> {
    const fd = new FormData();
    for (const f of productFiles) fd.append("product", f);
    for (const [id, r] of Object.entries(currentResults)) {
      if (id !== shotId && r.imageBase64 && r.mimeType) {
        fd.append("peer", base64ToFile(r.imageBase64, r.mimeType, `${id}.png`));
      }
    }
    fd.append("shots", JSON.stringify(shots));
    fd.append("targetShotId", shotId);
    fd.append("anchorShotId", categoryMeta.anchorShotId);
    fd.append("aspectRatio", aspectRatio);
    if (category === "glasses") fd.append("imageSize", "2K");
    if (extraInstructions.trim()) fd.append("extraInstructions", extraInstructions.trim());

    const res = await fetch("/api/tryon", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) return null;
    const r = ((data.results as GeneratedShot[]) ?? [])[0];
    if (!r) return null;
    return await applyTargetResize(r);
  }

  async function runValidation(currentResults: Record<string, GeneratedShot>): Promise<string[]> {
    const fd = new FormData();
    for (const f of productFiles) fd.append("product", f);
    const ids: string[] = [];
    const labels: string[] = [];
    for (const s of shots) {
      const r = currentResults[s.id];
      if (!r?.imageBase64 || !r.mimeType) return [];
      fd.append("generated", base64ToFile(r.imageBase64, r.mimeType, `${s.id}.png`));
      ids.push(s.id);
      labels.push(s.label);
    }
    fd.append("shotIds", JSON.stringify(ids));
    fd.append("shotLabels", JSON.stringify(labels));
    const res = await fetch("/api/validate", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) return [];
    return (data.outliers ?? []) as string[];
  }

  async function applyTargetResize(r: GeneratedShot): Promise<GeneratedShot> {
    if (!r.imageBase64 || !r.mimeType) return r;
    try {
      const out = await resizeAndCenterCrop(r.imageBase64, r.mimeType, finalW, finalH);
      return { ...r, imageBase64: out.base64, mimeType: out.mimeType };
    } catch {
      return r;
    }
  }

  async function handleGenerate() {
    if (productFiles.length === 0) return;
    setError(null);
    setGenerating(true);
    setResults({});
    setValidationFixCount(0);

    const fd = new FormData();
    for (const f of productFiles) fd.append("product", f);
    fd.append("shots", JSON.stringify(shots));
    fd.append("anchorShotId", categoryMeta.anchorShotId);
    fd.append("aspectRatio", aspectRatio);
    if (category === "glasses") fd.append("imageSize", "2K");
    if (extraInstructions.trim()) fd.append("extraInstructions", extraInstructions.trim());

    try {
      const res = await fetch("/api/tryon", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao gerar");
      const indexed: Record<string, GeneratedShot> = {};
      for (const r of data.results as GeneratedShot[]) {
        indexed[r.id] = await applyTargetResize(r);
      }
      setResults(indexed);

      // Verificação automática: detecta divergências grotescas e refaz só essas
      let finalResults = indexed;
      if (autoValidate) {
        const allSucceeded = Object.values(indexed).every((r) => r.imageBase64);
        if (allSucceeded) {
          setValidating(true);
          try {
            const outliers = await runValidation(indexed);
            let working = indexed;
            let fixes = 0;
            for (const outlierId of outliers) {
              const fixed = await regenerateShot(outlierId, working);
              if (fixed?.imageBase64) {
                working = { ...working, [outlierId]: fixed };
                fixes++;
                setResults(working);
              }
            }
            setValidationFixCount(fixes);
            finalResults = working;
          } finally {
            setValidating(false);
          }
        }
      }

      // Salva no histórico
      try {
        const resolution = isCustom
          ? `${customW}×${customH}`
          : RESOLUTION_PRESETS.find((p) => p.id === resolutionPreset)?.sub ?? aspectRatio;
        const entry = await makeHistoryEntry(
          category,
          categoryMeta.hasGender ? gender : undefined,
          resolution,
          aspectRatio,
          categoryMeta.anchorShotId,
          extraInstructions,
          finalW,
          finalH,
          productFiles,
          shots,
          finalResults
        );
        if (entry.shots.length > 0) {
          saveHistory(entry);
          setHistoryVersion((v) => v + 1);
        }
      } catch (e) {
        console.warn("[history] falhou ao salvar:", e);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setGenerating(false);
    }
  }

  async function handleRegenerate(shotId: string) {
    if (productFiles.length === 0) return;
    if (regeneratingIds.has(shotId)) return;
    setError(null);
    setRegeneratingIds((prev) => new Set(prev).add(shotId));

    const fd = new FormData();
    for (const f of productFiles) fd.append("product", f);
    // Outras 3 imagens já geradas viram "peers" — referência adicional pra consistência
    for (const [id, r] of Object.entries(results)) {
      if (id !== shotId && r.imageBase64 && r.mimeType) {
        fd.append("peer", base64ToFile(r.imageBase64, r.mimeType, `${id}.png`));
      }
    }
    fd.append("shots", JSON.stringify(shots));
    fd.append("targetShotId", shotId);
    fd.append("anchorShotId", categoryMeta.anchorShotId);
    fd.append("aspectRatio", aspectRatio);
    if (category === "glasses") fd.append("imageSize", "2K");
    if (extraInstructions.trim()) fd.append("extraInstructions", extraInstructions.trim());

    try {
      const res = await fetch("/api/tryon", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao regerar");
      const raw = (data.results as GeneratedShot[])[0];
      if (raw) {
        const r = await applyTargetResize(raw);
        setResults((prev) => ({ ...prev, [r.id]: r }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setRegeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }

  function reset() {
    setProductFiles([]);
    setResults({});
    setError(null);
  }

  const hasResults = Object.keys(results).length > 0;

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Halo decorativo no topo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[800px] -translate-x-1/2 rounded-full opacity-50 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, rgba(176, 130, 90, 0.18), rgba(176, 130, 90, 0.05) 50%, transparent 70%)",
        }}
      />

      <div className="relative z-[1] mx-auto max-w-6xl px-6 pb-24 pt-10">
        {/* Top nav */}
        <nav className="mb-12 flex items-center justify-between border-b border-[var(--border)] pb-6">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-full bg-[var(--accent)] text-[var(--bg)]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <circle cx="6" cy="14" r="4" />
                <circle cx="18" cy="14" r="4" />
                <path d="M10 14h4" />
              </svg>
            </span>
            <span className="display text-xl">Provador Virtual</span>
          </div>
          <div className="hidden items-center gap-6 text-xs text-[var(--text-muted)] md:flex">
            <span className="inline-flex items-center gap-1.5">
              <span className="status-dot" style={{ color: "var(--success)" }} />
              <span>API conectada</span>
            </span>
            <span className="text-[var(--text-soft)]">Powered by Gemini 3 · Veo</span>
          </div>
        </nav>

        {/* Hero */}
        <header className="mb-14 grid grid-cols-1 items-end gap-10 md:grid-cols-12 rise-in">
          <div className="md:col-span-8">
            <span className="eyebrow">Eyewear · IA generativa</span>
            <h1 className="display mt-4 text-5xl md:text-7xl text-[var(--text)]">
              Quatro fotos.<br />
              <span style={{ color: "#7b3aec" }}>Um clique.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-[var(--text-muted)] leading-relaxed">
              Transforme a foto de um óculos em uma campanha completa: <strong className="font-medium text-[var(--text)]">1 modelo
              usando</strong> + <strong className="font-medium text-[var(--text)]">3 ângulos de estúdio</strong>.
              Verificação automática de fidelidade. Modo lote pra catálogos inteiros.
            </p>
          </div>
          <div className="md:col-span-4 md:text-right">
            <div className="inline-flex flex-col items-start md:items-end gap-1 text-xs text-[var(--text-muted)]">
              <span className="font-mono">~30s por produto</span>
            </div>
          </div>
        </header>

        {/* Category selector */}
        <div className="mb-4 flex flex-col gap-2">
          <span className="eyebrow">Categoria do produto</span>
          <div className="segmented" role="tablist">
            {(["glasses", "shoes", "clothing"] as const).map((c) => (
              <button
                key={c}
                role="tab"
                onClick={() => {
                  if (c === category) return;
                  setCategory(c);
                  const aspect = CATEGORY_META[c].aspectRatio;
                  setResolutionPreset(
                    aspect === "1:1" ? "1:1" : aspect === "16:9" ? "16:9" : "9:16"
                  );
                  setResults({});
                  setError(null);
                }}
                disabled={generating}
                data-active={category === c}
              >
                <span className="mr-1.5 text-[var(--text-soft)]" aria-hidden>
                  {CATEGORY_META[c].emoji}
                </span>
                {CATEGORY_META[c].label}
              </button>
            ))}
          </div>
          <span className="text-xs text-[var(--text-muted)]">
            {categoryMeta.description}
          </span>
        </div>

        {/* Mode toggle */}
        <div className="mb-10 flex items-center justify-between gap-4">
          <div className="segmented" role="tablist">
            {(["single", "batch", "tryon", "tryon-clothing"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                onClick={() => setMode(m)}
                disabled={generating}
                data-active={mode === m}
              >
                {m === "single"
                  ? "Um produto"
                  : m === "batch"
                  ? "Lote"
                  : m === "tryon"
                  ? "Try-on óculos"
                  : "Try-on roupa"}
              </button>
            ))}
          </div>
          {generating && <span className="text-xs text-[var(--text-muted)]">Gerando…</span>}
          {validating && <span className="text-xs text-[var(--warning)]">Verificando consistência…</span>}
        </div>

        {mode === "batch" && (
          <BatchView
            extraInstructions={extraInstructions}
            defaultGender={gender}
            category={category}
            aspectRatio={aspectRatio}
            targetW={finalW}
            targetH={finalH}
            autoValidate={autoValidate}
          />
        )}

        {mode === "tryon" && (
          <TryonView
            aspectRatio={aspectRatio}
            targetW={finalW}
            targetH={finalH}
            extraInstructions={extraInstructions}
            kind="glasses"
          />
        )}

        {mode === "tryon-clothing" && (
          <TryonView
            aspectRatio={aspectRatio}
            targetW={finalW}
            targetH={finalH}
            extraInstructions={extraInstructions}
            kind="clothing"
          />
        )}

        {mode === "single" && (
          <>
            <section className="grid grid-cols-1 items-start gap-8 md:grid-cols-12">
              {/* Coluna esquerda — referências */}
              <div className="card flex flex-col gap-6 p-6 md:col-span-5">
                <ProductUpload files={productFiles} onChange={setProductFiles} />
                <div className="divider" />
                <UrlImporter onAdd={(newFiles) => setProductFiles([...productFiles, ...newFiles])} />
              </div>

              {/* Coluna direita — controles */}
              <div className="flex flex-col gap-6 md:col-span-7">
                <div className="card flex flex-col gap-5 p-6">
                  {categoryMeta.hasGender && (
                    <div className="flex flex-col gap-2">
                      <span className="eyebrow">Modelo</span>
                      <div className="segmented w-fit">
                        {(["male", "female"] as const).map((g) => (
                          <button
                            key={g}
                            onClick={() => setGender(g)}
                            disabled={generating || regeneratingIds.size > 0 || validating}
                            data-active={gender === g}
                          >
                            {g === "male" ? "Homem" : "Mulher"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    <span className="eyebrow">Resolução</span>
                    <div className="flex flex-wrap gap-1.5">
                      {RESOLUTION_PRESETS.map((r) => {
                        const active = resolutionPreset === r.id;
                        return (
                          <button
                            key={r.id}
                            onClick={() => setResolutionPreset(r.id)}
                            disabled={generating || regeneratingIds.size > 0 || validating}
                            className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                              active
                                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)]"
                                : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-warm)]"
                            }`}
                          >
                            <span className="text-xs font-medium">{r.label}</span>
                            <span
                              className={`font-mono text-[10px] tracking-wide ${
                                active ? "opacity-80" : "text-[var(--text-soft)]"
                              }`}
                            >
                              {r.sub}
                            </span>
                          </button>
                        );
                      })}
                      <button
                        onClick={() => setResolutionPreset("custom")}
                        disabled={generating || regeneratingIds.size > 0 || validating}
                        className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          isCustom
                            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)]"
                            : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-warm)]"
                        }`}
                      >
                        <span className="text-xs font-medium">Personalizada</span>
                        <span
                          className={`font-mono text-[10px] tracking-wide ${
                            isCustom ? "opacity-80" : "text-[var(--text-soft)]"
                          }`}
                        >
                          {isCustom ? `${customW}×${customH}` : "W×H"}
                        </span>
                      </button>
                    </div>
                    {isCustom && (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <label className="text-[10px] uppercase tracking-widest text-[var(--text-soft)]">
                            largura
                          </label>
                          <input
                            type="number"
                            min={256}
                            max={4096}
                            step={8}
                            value={customW}
                            onChange={(e) => {
                              const v = Math.max(256, Math.min(4096, Number(e.target.value) || 0));
                              setCustomW(v);
                            }}
                            disabled={generating || regeneratingIds.size > 0 || validating}
                            className="field !py-1.5 !px-2 !text-xs w-24 font-mono"
                          />
                        </div>
                        <span className="text-[var(--text-soft)]">×</span>
                        <div className="flex items-center gap-1.5">
                          <label className="text-[10px] uppercase tracking-widest text-[var(--text-soft)]">
                            altura
                          </label>
                          <input
                            type="number"
                            min={256}
                            max={4096}
                            step={8}
                            value={customH}
                            onChange={(e) => {
                              const v = Math.max(256, Math.min(4096, Number(e.target.value) || 0));
                              setCustomH(v);
                            }}
                            disabled={generating || regeneratingIds.size > 0 || validating}
                            className="field !py-1.5 !px-2 !text-xs w-24 font-mono"
                          />
                        </div>
                        <span className="text-[10px] text-[var(--text-soft)]">
                          gerada em {aspectRatio} e redimensionada para {customW}×{customH}
                        </span>
                      </div>
                    )}
                  </div>

                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={autoValidate}
                      onChange={(e) => setAutoValidate(e.target.checked)}
                      disabled={generating || validating}
                      className="mt-0.5 h-4 w-4 cursor-pointer accent-[var(--accent)]"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[var(--text)]">
                        Verificação automática{" "}
                        <span style={{ color: "#7b3aec" }}>(recomendado)</span>
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">
                        analisa as imagens geradas e refaz a que estiver com divergência grotesca
                      </span>
                    </span>
                  </label>

                  <div className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between">
                      <span className="eyebrow">Instruções adicionais</span>
                      <span className="text-[10px] uppercase tracking-widest text-[var(--text-soft)]">
                        opcional
                      </span>
                    </div>
                    <textarea
                      value={extraInstructions}
                      onChange={(e) => setExtraInstructions(e.target.value)}
                      rows={3}
                      placeholder="Ex: modelo loiro de olhos azuis, fundo cinza escuro, mão direita à frente, vibe outono…"
                      className="field"
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-[var(--text-muted)]">
                        Aplica nas 4 imagens. Fidelidade ao produto continua prioritária.
                      </p>
                      {extraInstructions && (
                        <button
                          onClick={() => setExtraInstructions("")}
                          className="text-xs text-[var(--text-soft)] hover:text-[var(--text)]"
                        >
                          limpar
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      onClick={handleGenerate}
                      disabled={productFiles.length === 0 || generating}
                      className="btn-primary"
                    >
                      {generating ? (
                        "Gerando 4 fotos…"
                      ) : (
                        <>
                          Gerar fotos
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12h14M13 6l6 6-6 6" />
                          </svg>
                        </>
                      )}
                    </button>
                    {hasResults && (
                      <button onClick={reset} className="btn-secondary">
                        Recomeçar
                      </button>
                    )}
                  </div>

                  {error && (
                    <div className="rounded-xl border border-[color:rgba(179,38,30,0.25)] bg-[color:rgba(179,38,30,0.06)] p-3 text-sm text-[var(--error)]">
                      {error}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {(generating || hasResults) && (
              <section className="mt-16">
                <div className="mb-6 flex items-end justify-between gap-3">
                  <div>
                    <span className="eyebrow">Resultado</span>
                    <h2 className="display mt-2 text-3xl">As quatro peças</h2>
                  </div>
                  {!validating && validationFixCount > 0 && (
                    <span className="rounded-full border border-[color:rgba(31,109,74,0.3)] bg-[color:rgba(31,109,74,0.08)] px-3 py-1 text-xs text-[var(--success)]">
                      ✓ {validationFixCount} refeita{validationFixCount > 1 ? "s" : ""} pela verificação
                    </span>
                  )}
                </div>

                {(generating || validating) && (
                  <div className="mb-4">
                    <LoadingStrip validating={validating} />
                  </div>
                )}

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {shots.map((shot) => {
                    const result = results[shot.id];
                    if (!result && generating) {
                      const aspectClass = isCustom
                        ? ""
                        : aspectRatio === "1:1"
                        ? "aspect-square"
                        : aspectRatio === "16:9"
                        ? "aspect-[16/9]"
                        : "aspect-[9/16]";
                      const inlineStyle = isCustom
                        ? { aspectRatio: `${finalW} / ${finalH}` }
                        : undefined;
                      return (
                        <SkeletonCard
                          key={shot.id}
                          label={shot.label}
                          aspectClass={aspectClass}
                          aspectStyle={inlineStyle}
                        />
                      );
                    }
                    return (
                      <ShotCard
                        key={shot.id}
                        shot={shot}
                        result={result}
                        regenerating={regeneratingIds.has(shot.id)}
                        canRegenerate={
                          productFiles.length > 0 && !generating && !regeneratingIds.has(shot.id)
                        }
                        onRegenerate={() => handleRegenerate(shot.id)}
                        aspectRatio={aspectRatio}
                        aspectStyle={
                          isCustom ? { aspectRatio: `${finalW} / ${finalH}` } : undefined
                        }
                      />
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        <HistoryPanel category={category} refreshKey={historyVersion} />

        <footer className="mt-24 border-t border-[var(--border)] pt-6 text-xs text-[var(--text-soft)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Provador Virtual · IA</span>
            <span className="font-mono">gemini-3.1-flash-image</span>
          </div>
        </footer>
      </div>
    </main>
  );
}
