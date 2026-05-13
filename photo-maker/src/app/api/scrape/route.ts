import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

// Headers que imitam um Chrome real navegando organicamente.
// Cloudflare/anti-bot inspecionam essa combinação inteira — qualquer ausência
// derruba a "browser fingerprint score".
function humanLikeHeaders(pageUrl: URL): Record<string, string> {
  return {
    "User-Agent": USER_AGENT,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "max-age=0",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Ch-Ua":
      '"Google Chrome";v="147", "Chromium";v="147", "Not.A/Brand";v="8"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    Referer: `https://www.google.com/`,
    DNT: "1",
    Priority: "u=0, i",
    Connection: "keep-alive",
  };
}

// Warm-up: faz um GET na home do domínio antes do produto, pra ganhar o
// cookie __cf_bm (Cloudflare bot management). Sem isso, Cloudflare trata
// a request seguinte como "navegação direta sem histórico", o que tem
// score baixo no bot detection.
async function warmUpCookies(pageUrl: URL): Promise<string> {
  try {
    const homeUrl = `${pageUrl.protocol}//${pageUrl.hostname}/`;
    const res = await fetch(homeUrl, {
      headers: humanLikeHeaders(pageUrl),
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    const setCookies = res.headers.getSetCookie?.() ?? [];
    if (setCookies.length === 0) {
      const raw = res.headers.get("set-cookie");
      if (raw) return raw.split(",").map((c) => c.split(";")[0].trim()).join("; ");
    }
    return setCookies.map((c) => c.split(";")[0].trim()).join("; ");
  } catch {
    return "";
  }
}

const MAX_IMAGES = 5;
const MIN_BYTES = 8 * 1024; // ignora ícones/sprites pequenos
const MAX_BYTES = 8 * 1024 * 1024;

// Padrões de URL que NÃO são fotos de produto: logos, banners, ícones, avatares, etc.
const URL_BLACKLIST = [
  /\b(?:logo|logotype|brand[-_]?mark)\b/i,
  /\bbanner\b/i,
  /\bhero[-_]?(?:image|banner|shot)?\b/i,
  /\bpromo\b/i,
  /\bsprite\b/i,
  /\bfavicon\b/i,
  /\bavatar\b/i,
  /\bplaceholder\b/i,
  /\bloader\b/i,
  /\bspinner\b/i,
  /\bicon[s]?\b/i,
  /\bbg|background\b/i,
  /\binstagram\b/i,
  /\bfacebook\b/i,
  /\bwhatsapp\b/i,
  /\bpayment[-_]?method/i,
  /\bbandeira[-_]?cartao/i,
];

function looksLikeNonProduct(url: string): boolean {
  return URL_BLACKLIST.some((re) => re.test(url));
}

// Lê width/height de PNG/JPEG/WEBP/GIF a partir dos primeiros bytes,
// sem dependências externas. Retorna null se não conseguir parsear.
function parseImageDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A + IHDR
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  }
  // JPEG: FF D8, varre os marcadores até achar SOFn
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 8) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      // SOF0..SOF15 (exceto SOF4 e SOF12 que são DHT/DAC)
      if (
        (marker >= 0xc0 && marker <= 0xcf) &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        const height = buf.readUInt16BE(i + 5);
        const width = buf.readUInt16BE(i + 7);
        return { width, height };
      }
      const segLen = buf.readUInt16BE(i + 2);
      i += 2 + segLen;
    }
    return null;
  }
  // GIF: 47 49 46 38
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    const width = buf.readUInt16LE(6);
    const height = buf.readUInt16LE(8);
    return { width, height };
  }
  // WEBP: "RIFF....WEBP"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    // VP8 (lossy)
    if (buf[12] === 0x56 && buf[13] === 0x50 && buf[14] === 0x38 && buf[15] === 0x20) {
      const width = buf.readUInt16LE(26) & 0x3fff;
      const height = buf.readUInt16LE(28) & 0x3fff;
      return { width, height };
    }
    // VP8L (lossless)
    if (buf[12] === 0x56 && buf[13] === 0x50 && buf[14] === 0x38 && buf[15] === 0x4c) {
      const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return { width, height };
    }
    // VP8X (extended)
    if (buf[12] === 0x56 && buf[13] === 0x50 && buf[14] === 0x38 && buf[15] === 0x58) {
      const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      return { width, height };
    }
  }
  return null;
}

// Filtra imagens que provavelmente NÃO são fotos de produto.
// Produto típico: 1:1 ou levemente retrato/paisagem (proporção entre ~0.6 e ~1.7).
// Banners são bem mais largos (3:1+), logos são bem pequenos ou achatados.
function looksLikeProductPhoto(buf: Buffer): boolean {
  const dims = parseImageDimensions(buf);
  if (!dims) return true; // se não conseguiu parsear, aceita (evita falsos negativos)
  const { width, height } = dims;
  if (width < 200 || height < 200) return false; // muito pequena pra ser foto de produto
  const ratio = width / height;
  if (ratio < 0.5 || ratio > 1.9) return false; // muito alongada (banner, faixa, logo)
  return true;
}

type Found = { url: string; base64: string; mimeType: string; bytes: number };

function absolutize(src: string, base: URL): string | null {
  try {
    return new URL(src, base).toString();
  } catch {
    return null;
  }
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

// Normaliza URLs para detectar a "mesma imagem" servida em variações diferentes:
// - tira query string (`?w=400`, `?v=2`, `?width=...`)
// - tira sufixos de tamanho do filename (`_400x400`, `-large`, `_thumb`, `_2x`)
// - tira segmentos de pasta de tamanho (`/thumbs/`, `/medium/`, `/originals/`)
function normalizeForDedup(u: string): string {
  try {
    const url = new URL(u);
    url.search = "";
    url.hash = "";
    let p = url.pathname;
    p = p.replace(
      /[-_](?:\d+x\d+|\d+w|\d{2,4}|thumb|thumbnail|small|medium|large|xl|xxl|original|main|big|zoom|hd|@?[1-3]x)(?=\.[a-z0-9]+$)/gi,
      ""
    );
    p = p.replace(
      /\/(?:thumbs?|thumbnails?|small|medium|large|xl|xxl|originals?|sizes?\/[^/]+|cache\/[^/]+)\//gi,
      "/"
    );
    url.pathname = p;
    return url.toString().toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

function dedupeByNormalized(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const key = normalizeForDedup(u);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

// Isola a área principal do produto: tira header, nav, footer, scripts, estilos, SVGs
// (que costumam carregar logos/ícones), e corta antes da seção de produtos relacionados.
function isolateProductSection(html: string): string {
  let cleaned = html
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "")
    .replace(/<picture\b([^>]*)>/gi, "<picture$1>"); // mantém picture mas também mantém os <img> dentro

  // Se houver <main>, foca só nele (geralmente envolve a página do produto)
  const mainMatch = cleaned.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch) cleaned = mainMatch[1];

  // Marcadores comuns que indicam fim da seção principal e início de "relacionados"
  const cutMarkers: RegExp[] = [
    /(?:produtos?\s+relacionados?|related\s+products?|you\s+may\s+also\s+like|customers\s+also\s+(?:bought|viewed)|complete\s+o\s+look|também\s+(?:compr(?:aram|ou)|gost(?:am|ou))|quem\s+(?:viu|comprou)\s+(?:viu|comprou|também)|recomenda(?:do|mos|dos|ções)|outros?\s+produtos?|veja\s+também|talvez\s+você\s+goste|costuma(?:m)?\s+comprar)/i,
    /<(?:section|div|aside)\b[^>]*(?:class|id)=["'][^"']*(?:related|recommend|cross[-_]?sell|upsell|you[-_]?may[-_]?like|also[-_]?bought|carousel[-_]?related|similar[-_]?products|product[-_]?suggestions)[^"']*["']/i,
    /<h\d[^>]*>[^<]*?(?:related|relacionados|recomenda|você\s+(?:vai|pode|talvez)|complete|também)[^<]*?<\/h\d>/i,
  ];
  let cutAt = cleaned.length;
  for (const re of cutMarkers) {
    const m = re.exec(cleaned);
    if (m && m.index < cutAt) cutAt = m.index;
  }
  return cleaned.substring(0, cutAt);
}

// AliExpress: SPA agressivamente JS-rendered. As imagens do produto não estão em <img>
// no HTML inicial — estão em JSON dentro de <script>. Mas o HTML traz URLs alicdn.com
// referenciadas em diversos lugares (window.runParams, og:image, JSON-LD, scripts inline).
// Estratégia: varre o HTML INTEIRO procurando URLs alicdn em hosts/paths que sabemos serem
// fotos de produto, normaliza tamanhos pra alta resolução e ordena.
function isAliExpressUrl(u: URL): boolean {
  const h = u.hostname.toLowerCase();
  return (
    h === "aliexpress.com" ||
    h.endsWith(".aliexpress.com") ||
    h.endsWith(".aliexpress.us") ||
    h.endsWith(".aliexpress.ru") ||
    h.endsWith(".aliexpress.it")
  );
}

function extractAliExpressImages(html: string): string[] {
  const out: string[] = [];
  // Captura URLs alicdn.com mesmo escapadas em JSON (\/) e em scripts.
  // Aceita os paths mais comuns de imagem de produto: kf, imgextra, i1-i9, item.
  const re =
    /(?:https?:)?(?:\\?\/\\?\/)[a-z0-9.-]+\.alicdn\.com\/(?:kf|imgextra|i\d|item)\/[a-zA-Z0-9._\-/]+?\.(?:jpg|jpeg|png|webp)(?:_[\w.]+\.(?:jpg|jpeg|png|webp))*/gi;
  for (const m of html.matchAll(re)) {
    let url = m[0].replace(/\\\//g, "/");
    if (url.startsWith("//")) url = "https:" + url;
    // Pula vídeos/thumbnails de player
    if (/xiaoshipin|video[/_-]thumb|sku\/L\d+/i.test(url)) continue;
    // Sobe pra resolução máxima removendo sufixos `_NxN[stuff].ext` repetidos
    while (/_\d+x\d+[a-zA-Z0-9]*\.(?:jpg|jpeg|png|webp)$/i.test(url)) {
      url = url.replace(
        /_\d+x\d+[a-zA-Z0-9]*\.(jpg|jpeg|png|webp)$/i,
        ".$1"
      );
    }
    out.push(url);
  }
  return out;
}

function extractFromImgTags(html: string, base: URL): string[] {
  const out: string[] = [];
  const imgTags = html.matchAll(/<img\b[^>]*>/gi);
  for (const m of imgTags) {
    const tag = m[0];
    // prioriza zoom/large/data-* atributos comuns de e-commerce
    const candidates: string[] = [];
    const dataLarge = /data-(?:zoom-image|large-image|original|src|image|big-img)=["']([^"']+)["']/i.exec(tag);
    if (dataLarge) candidates.push(dataLarge[1]);
    const srcset = /srcset=["']([^"']+)["']/i.exec(tag);
    if (srcset) {
      // pega o último (geralmente o de maior resolução)
      const parts = srcset[1].split(",").map((s) => s.trim().split(/\s+/)[0]);
      const last = parts[parts.length - 1];
      if (last) candidates.push(last);
    }
    const src = /\bsrc=["']([^"']+)["']/i.exec(tag);
    if (src) candidates.push(src[1]);
    for (const c of candidates) {
      if (c.startsWith("data:")) continue;
      const abs = absolutize(c, base);
      if (abs) out.push(abs);
    }
  }
  return out;
}

async function fetchImage(url: string): Promise<Found | null> {
  try {
    const isAliCdn = /\.alicdn\.com\//i.test(url);
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        ...(isAliCdn ? { Referer: "https://www.aliexpress.com/" } : {}),
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < MIN_BYTES || buf.length > MAX_BYTES) return null;
    // Filtra logos/banners/faixas via dimensões e proporção
    if (!looksLikeProductPhoto(buf)) return null;
    return {
      url,
      base64: buf.toString("base64"),
      mimeType: contentType.split(";")[0].trim(),
      bytes: buf.length,
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (typeof url !== "string" || !url.trim()) {
      return NextResponse.json({ error: "URL obrigatória." }, { status: 400 });
    }

    let pageUrl: URL;
    try {
      pageUrl = new URL(url.trim());
    } catch {
      return NextResponse.json({ error: "URL inválida." }, { status: 400 });
    }

    const isAli = isAliExpressUrl(pageUrl);

    // Warm-up: pega cookie do home antes de pedir a página do produto.
    // Necessário pra passar pelo Cloudflare bot detection em muitos sites.
    const cookieHeader = await warmUpCookies(pageUrl);

    const baseHeaders = humanLikeHeaders(pageUrl);
    const pageRes = await fetch(pageUrl.toString(), {
      headers: {
        ...baseHeaders,
        // Pra produto interno, o referer mais natural é o próprio domínio
        Referer: `${pageUrl.protocol}//${pageUrl.hostname}/`,
        "Sec-Fetch-Site": "same-origin",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        // AliExpress responde melhor com Referer próprio (já é o caso acima)
        ...(isAli ? {} : {}),
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    if (!pageRes.ok) {
      // 4xx em vez de 502 — o Traefik do EasyPanel substitui 5xx pela página
      // "Service is not reachable", quebrando JSON.parse no cliente.
      return NextResponse.json(
        { error: `Falha ao acessar a página (${pageRes.status}).`, images: [] },
        { status: 400 }
      );
    }
    const html = await pageRes.text();

    // AliExpress: scanner específico que varre o HTML inteiro (incluindo scripts JSON)
    // procurando alicdn.com. Sites normais: isolamento da seção principal + <img>.
    let candidates: string[];
    if (isAli) {
      candidates = dedupeByNormalized(dedupe(extractAliExpressImages(html)));
    } else {
      const productSection = isolateProductSection(html);
      candidates = dedupeByNormalized(dedupe(extractFromImgTags(productSection, pageUrl)));
      if (candidates.length === 0) {
        candidates = dedupeByNormalized(dedupe(extractFromImgTags(html, pageUrl)));
      }
    }
    // Tira URLs com padrões de logo/banner/ícone/etc antes de baixar
    candidates = candidates.filter((u) => !looksLikeNonProduct(u)).slice(0, 30);

    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma imagem encontrada na página.", images: [] },
        { status: 200 }
      );
    }

    // Baixa em paralelo, filtra os que falham/são pequenos demais
    const results = await Promise.all(candidates.map(fetchImage));
    const valid = results.filter((r): r is Found => r !== null);

    // Deduplica resultados pós-fetch:
    // 1) por URL normalizada (cobre redirects do CDN que mudam a URL final)
    // 2) por bytes idênticos (cobre o caso de mesma imagem servida com URLs totalmente diferentes)
    const seenNorms = new Set<string>();
    const seenSizes = new Set<number>();
    const unique = valid.filter((v) => {
      const key = normalizeForDedup(v.url);
      if (seenNorms.has(key) || seenSizes.has(v.bytes)) return false;
      seenNorms.add(key);
      seenSizes.add(v.bytes);
      return true;
    });

    return NextResponse.json({
      pageUrl: pageUrl.toString(),
      images: unique.slice(0, MAX_IMAGES).map((i) => ({
        url: i.url,
        base64: i.base64,
        mimeType: i.mimeType,
        bytes: i.bytes,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    // 400 em vez de 500 — Traefik (EasyPanel) intercepta 5xx e devolve HTML.
    return NextResponse.json({ error: message, images: [] }, { status: 400 });
  }
}
