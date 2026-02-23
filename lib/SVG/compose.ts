// lib/svg/compose.ts

/* ------------------------------------------------------------------ */
/* Small utils + SVG composition helpers                               */
/* Copiado desde: lib/chart-svgs.ts                                     */
/* ------------------------------------------------------------------ */

export const BASE_BOUNDS = { x: 0, y: 0, w: 1920, h: 1080 };

export const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ------------------------------------------------------------------ */
/* SVG Extraction / Bounds                                             */
/* ------------------------------------------------------------------ */

export type SvgBounds = { x: number; y: number; w: number; h: number };
export type ExtractedSvg = { inner: string; bounds: SvgBounds | null };

export function getFallbackBoundsFromSvg(svg: string): SvgBounds | null {
  const vbMatch = svg.match(/viewBox="([^"]+)"/i);
  if (vbMatch) {
    const nums = vbMatch[1].trim().split(/\s+/).map(Number);
    if (nums.length === 4 && nums.every(Number.isFinite)) {
      const [, , w, h] = nums;
      if (w > 0 && h > 0) return { x: 0, y: 0, w, h };
    }
  }

  const wMatch = svg.match(/\bwidth="([^"]+)"/i);
  const hMatch = svg.match(/\bheight="([^"]+)"/i);
  const w = wMatch ? Number(String(wMatch[1]).replace(/[^\d.]/g, "")) : NaN;
  const h = hMatch ? Number(String(hMatch[1]).replace(/[^\d.]/g, "")) : NaN;
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return { x: 0, y: 0, w, h };
  }

  return null;
}

/**
 * Extrae el contenido dentro de <g id="..."> ... </g> (cierre correcto con depth).
 * Si no existe el groupId, regresa "".
 */
export function extractGroup(svg: string, groupId: string): string {
  const reStart = new RegExp(`<g[^>]*id="${groupId}"[^>]*>`, "i");
  const gStart = svg.search(reStart);
  if (gStart === -1) return "";

  const openTagMatch = svg.slice(gStart).match(reStart);
  if (!openTagMatch) return "";

  const openTag = openTagMatch[0];
  const contentStart = gStart + openTag.length;

  let depth = 1;
  const re = /<\/?g\b[^>]*>/gi;
  re.lastIndex = contentStart;

  let match: RegExpExecArray | null;
  while ((match = re.exec(svg))) {
    const tag = match[0];
    if (tag.startsWith("</")) depth--;
    else depth++;

    if (depth === 0) {
      const contentEnd = match.index;
      return svg.slice(contentStart, contentEnd);
    }
  }
  return "";
}

export function extractRectBoundsFromFragment(fragment: string, rectId: string): SvgBounds | null {
const re = new RegExp(`<rect[^>]*id="${rectId}"[^>]*\/?>`, "i");
  const m = fragment.match(re);
  if (!m) return null;

  const rect = m[0];
  const getNum = (attr: string) => {
    const mm = rect.match(new RegExp(`${attr}="([^"]+)"`, "i"));
    return mm ? Number(mm[1]) : NaN;
  };

  const x = getNum("x");
  const y = getNum("y");
  const w = getNum("width");
  const h = getNum("height");

  if ([x, y, w, h].some((n) => !Number.isFinite(n) || n <= 0)) return null;
  return { x, y, w, h };
}

/**
 * Extrae el contenido dentro de <g id="chart-content"> ... </g>
 * y opcionalmente el rect id="content-bounds".
 * Si no existe <g id="chart-content">, hace fallback a “inner sin wrapper”.
 */
export function extractChartContent(svg: string, wantBounds: boolean): ExtractedSvg {
  const gStart = svg.search(/<g[^>]*id="chart-content"[^>]*>/i);

  // Fallback: quita wrapper <svg> y rect full background
  if (gStart === -1) {
    const inner = svg
      .replace(/^[\s\S]*?<svg[^>]*>/i, "")
      .replace(/<\/svg>\s*$/i, "")
      .replace(/<rect[^>]*width="100%"[^>]*height="100%"[^>]*\/?>/i, "");

    return { inner, bounds: wantBounds ? getFallbackBoundsFromSvg(svg) : null };
  }

  const openTagMatch = svg.slice(gStart).match(/<g[^>]*id="chart-content"[^>]*>/i);
  if (!openTagMatch) {
    return { inner: "", bounds: wantBounds ? getFallbackBoundsFromSvg(svg) : null };
  }

  const openTag = openTagMatch[0];
  const contentStart = gStart + openTag.length;

  // Encontrar cierre correcto del </g> con depth
  let depth = 1;
  const re = /<\/?g\b[^>]*>/gi;
  re.lastIndex = contentStart;

  let match: RegExpExecArray | null;
  while ((match = re.exec(svg))) {
    const tag = match[0];
    if (tag.startsWith("</")) depth--;
    else depth++;

    if (depth === 0) {
  const contentEnd = match.index;
  let inner = svg.slice(contentStart, contentEnd);

  if (!wantBounds) return { inner, bounds: null };

  // 1) busca content-bounds dentro del inner
  const rectMatch = inner.match(/<rect[^>]*id="content-bounds"[^>]*\/?>/i);
  if (!rectMatch) {
    return { inner, bounds: getFallbackBoundsFromSvg(svg) };
  }

  const rect = rectMatch[0];

  const getNum = (attr: string) => {
    const m = rect.match(new RegExp(`${attr}="([^"]+)"`, "i"));
    return m ? Number(m[1]) : NaN;
  };

  const x = getNum("x");
  const y = getNum("y");
  const w = getNum("width");
  const h = getNum("height");

  // ✅ quitar el rect del inner para que Illustrator NO lo tome como bounds
  inner = inner.replace(rect, "");

  if ([x, y, w, h].some((n) => !Number.isFinite(n) || n <= 0)) {
    return { inner, bounds: getFallbackBoundsFromSvg(svg) };
  }

  return { inner, bounds: { x, y, w, h } };
}
  }

  return { inner: "", bounds: wantBounds ? getFallbackBoundsFromSvg(svg) : null };
}

export function extractInnerSvg(svg: string) {
  return extractChartContent(svg, false).inner;
}

export function extractInnerSvgWithBounds(svg: string) {
  return extractChartContent(svg, true);
}

export function namespaceSvgIds(fragment: string, prefix: string) {
  if (!fragment) return fragment;

  const ids = new Set<string>();
  fragment.replace(/\bid="([^"]+)"/g, (_m, id) => {
    ids.add(id);
    return _m;
  });

  let out = fragment;
  ids.forEach((id) => {
    const nid = `${prefix}${id}`;
    out = out.replace(new RegExp(`\\bid="${id}"`, "g"), `id="${nid}"`);
    out = out.replace(new RegExp(`url\\(#${id}\\)`, "g"), `url(#${nid})`);
    out = out.replace(new RegExp(`\\bhref="#${id}"`, "g"), `href="#${nid}"`);
    out = out.replace(new RegExp(`\\bxlink:href="#${id}"`, "g"), `xlink:href="#${nid}"`);
  });

  return out;
}

export function placeIntoSlot(
  inner: string,
  bounds: SvgBounds | null,
  slotW: number,
  slotH: number,
  opts?: {
    allowUpscale?: boolean;
    maxScale?: number;
    margin?: number;
    forceScale?: number;
    alignY?: "top" | "center" | "bottom";
    alignX?: "center" | "left";
  }
) {
  const b = bounds ?? BASE_BOUNDS;

  const fitScale = Math.min(slotW / b.w, slotH / b.h);
  const allowUpscale = opts?.allowUpscale ?? false;
  const maxScale = opts?.maxScale ?? 1.35;
  const margin = opts?.margin ?? 0.96;

  const baseScale =
    typeof opts?.forceScale === "number"
      ? Math.min(opts.forceScale, fitScale)
      : allowUpscale
      ? Math.min(maxScale, fitScale)
      : Math.min(1, fitScale);

  const s = baseScale * margin;

  const scaledW = b.w * s;
  const scaledH = b.h * s;

  const alignX = opts?.alignX ?? "center";
  const dx = alignX === "left" ? 0 : (slotW - scaledW) / 2;

  const alignY = opts?.alignY ?? "center";
  const dy = alignY === "top" ? 0 : (slotH - scaledH) / 2;

  return `
    <g transform="translate(${dx},${dy}) scale(${s}) translate(${-b.x},${-b.y})">
      ${inner}
    </g>
  `.trim();
}

/* ------------------------------------------------------------------ */
/* Combined rendering helpers                                          */
/* ------------------------------------------------------------------ */

export function svgWrapper(W: number, H: number, bg: string, content: string) {
  const Wpt = +(W * 0.75).toFixed(3); // px->pt (96->72)
  const Hpt = +(H * 0.75).toFixed(3);

  return `
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${Wpt}pt" height="${Hpt}pt"
     viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="${bg}"/>
  ${content}
</svg>
`.trim();
}
