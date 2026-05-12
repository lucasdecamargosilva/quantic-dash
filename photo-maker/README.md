# Professional Photo Maker

Gerador de fotos profissionais de produto com IA — transforma 1+ foto de produto em uma campanha completa: modelo usando + ângulos de estúdio, com verificação automática de fidelidade ao produto e download em WEBP otimizado.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind v4
- **Gemini 3.1 Flash Image** (geração)
- **Gemini 2.5 Flash** (validação visual de outliers)
- Tipografia: Helvetica Now Display (local) + Geist

## Funcionalidades

- **3 categorias de produto:** óculos, roupas, sapatos — cada uma com seus 4 shots e prompts dedicados
- **Modo Único** (1 produto por vez) e **Modo Lote** (URLs em massa, ZIP no final)
- **Importar de URL** com scraping inteligente (suporte AliExpress + lojas comuns)
- **Verificação automática** detecta divergências grotescas e refaz só as imagens problemáticas
- **Resolução** 1:1 / 9:16 / 16:9 ou personalizada (W×H qualquer)
- **Histórico** das últimas 5 gerações por categoria, salvo localmente
- **Download em WEBP** (qualidade 0.88, ~50-70% menor que PNG)
- **Estratégia âncora** garante consistência visual (bg, luz, sombra) entre os 4 shots
- **Modelo masculino/feminino** configurável (e por URL no modo lote)

## Como rodar

```bash
npm install
echo "GEMINI_API_KEY=sua_chave_aqui" > .env.local
npm run dev
```

Pegue uma chave em [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

## Estrutura

- `src/app/page.tsx` — UI principal (categoria, controles, resultado, histórico)
- `src/app/api/tryon/route.ts` — geração de imagens (estratégia âncora)
- `src/app/api/scrape/route.ts` — scraping de URLs (incluindo AliExpress)
- `src/app/api/validate/route.ts` — validação visual com Gemini Flash

## Custos aproximados

Por geração de 4 imagens: ~$0.16 (cobrado por imagem gerada). Imagens de input não pesam significativamente.
