import type { FrequencyData } from "@/app/page";
import { getBrandTheme } from "@/lib/brand-theme";
import { COOLVETICA_WOFF2_BASE64 } from "@/coolvetica.b64";
import type { Brand } from "@/types/brand";

const esc = (s: string) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

type WrappedTitle = { lines: string[]; fontSize: number; blockHeight: number };

type BuildNarrowVertBarsSvgArgs = {
  data: FrequencyData[];
  title: string;
  sheetTitle?: string;
  width?: number;
  height?: number;
  backgroundColor?: string;
  textColor?: string;
  brand?: Brand;
  headerLeftLabel?: string;
  isCombinedMode?: boolean;
};

function prepareTitle(
  title: string,
  baseFontSize: number,
  maxChars = 40,
  maxLines = 4
): WrappedTitle {
  const words = String(title || "").trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  let truncated = false;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const test = current ? `${current} ${w}` : w;

    if (test.length <= maxChars) {
      current = test;
      continue;
    }

    if (current) {
      lines.push(current);
      current = w;
    } else {
      lines.push(w.slice(0, maxChars));
      current = "";
    }

    if (lines.length === maxLines) {
      truncated = i < words.length - 1 || (current.length > maxChars);
      current = "";
      break;
    }
  }

  if (current) lines.push(current);

  if (lines.length > maxLines) {
    lines.length = maxLines;
    truncated = true;
  }

  // ✅ Solo agrega … si de verdad se truncó
  if (truncated && lines.length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/[.…]+$/, "") + "…";
  }

  const fs = baseFontSize;
  const lineGap = 6;
  const blockHeight = lines.length * fs + (lines.length - 1) * lineGap;

  return { lines, fontSize: fs, blockHeight };
}

function monthLabelEs(d: Date) {
  const monthNamesEs = [
    "enero","febrero","marzo","abril","mayo","junio",
    "julio","agosto","septiembre","octubre","noviembre","diciembre",
  ];
  const m = monthNamesEs[d.getMonth()];
  return `${m.charAt(0).toUpperCase() + m.slice(1)} ${d.getFullYear()}`;
}

// Etiqueta tipo “Muy buenas” => 2 líneas si está larga
function wrapLabel(label: string, maxChars = 10, maxLines = 2): string[] {
  const words = String(label || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const lines: string[] = [];
  let cur = "";

  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (test.length <= maxChars) {
      cur = test;
      continue;
    }
    if (cur) lines.push(cur);
    cur = w;

    if (lines.length === maxLines - 1) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);

  // si aún se pasa, recorta la última
  if (lines.length) {
    const last = lines[lines.length - 1];
    if (last.length > maxChars) lines[lines.length - 1] = last.slice(0, Math.max(1, maxChars - 1)) + "…";
  }

  return lines.slice(0, maxLines);
}

export function buildNarrowVertBarsSvg({
  data,
  title,
  sheetTitle,
  width,
  height,
  backgroundColor,
  textColor,
  brand,
  isCombinedMode,
  headerLeftLabel = "Monterrey, Nuevo León",
}: BuildNarrowVertBarsSvgArgs): string {
   const isCensBrand = brand === "censEdmundSinsa";

  const theme = getBrandTheme(brand ?? "poligrama");
  const W = isCensBrand ? 612 : (width ?? 1920);
const H = isCensBrand ? 792 : (height ?? 1080);


  // Para Cens usamos reglas “tall” escaladas desde 1440x1800
  const BASE_W = 1440;
  const BASE_H = 1800;
  const scale = isCensBrand ? Math.min(W / BASE_W, H / BASE_H) : 1;
  const S = (n: number) => n * scale;

  const wantsCoolvetica = /coolvetica rg/i.test(theme.fontFamily || "");
  const FONT_STACK = theme.fontFamily || "Helvetica, Arial, sans-serif";

  const bg = backgroundColor ?? theme.defaultBackground;
  const mainTextColor = textColor ?? theme.defaultTextColor;

  const useTallRules = isCensBrand || (W === 1440 && H === 1800);

  const marginLeft = useTallRules ? S(100) : 120;
  const marginRight = useTallRules ? S(100) : 120;
  const marginTop = useTallRules ? S(170) : 125;
  const marginBottom = useTallRules ? S(170) : 125;

  // Header
  const headerY = marginTop - S(24);
  const centerX = W / 2;
  const rightX = W - marginRight;
  const headerDateLabel = monthLabelEs(new Date());

  // Title
  const titleY = marginTop + S(130);
  const baseTitleFs = useTallRules ? S(75) : 75; // como referencia, “título grande”
  const { lines: titleLines, fontSize: titleFs, blockHeight: titleBlockH } = prepareTitle(
    title,
    useTallRules ? S(75) : 75,
    useTallRules ? 30 : 44,
    4
  );
  const titleLineGapRender = useTallRules ? S(22) : 22;

  // Datos
  const items = (data || [])
    .map((d) => {
      const raw =
        typeof d.percentage === "number"
          ? d.percentage
          : typeof d.value === "number"
          ? d.value
          : 0;
      const value = Math.max(0, Math.min(100, raw));
      return { label: String(d.label ?? "").trim(), value };
    })
    .filter((x) => x.label);

  if (!items.length) {
    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
      `<rect width="100%" height="100%" fill="${bg}" />`,
      `<text x="${marginLeft}" y="${titleY}" fill="${mainTextColor}" font-family="${FONT_STACK}" font-size="${S(
        32
      )}">Sin datos</text>`,
      `</svg>`,
    ].join("\n");
  }

  // ---- Área de barras (vertical) ----
  // Diseño “tipo foto”: mucho aire arriba y barras “desde el baseline”
const barsTop = marginTop + S(20)


// ✅ reserva REAL para labels (máx 2 líneas) + padding
const labelGap = S(28);
const labelFs = useTallRules ? S(24) : 24;
const maxLabelLines = 2;
const labelLineGap = S(6);
const labelsBlockH =
  labelGap + (maxLabelLines * labelFs) + ((maxLabelLines - 1) * labelLineGap) + S(24);

// ✅ ya no uses S(400)
const barsBottom = H - marginBottom - labelsBlockH;
const barsH = Math.max(1, barsBottom - barsTop);


  // Baseline (donde “nacen” las barras)
  const baselineY = barsBottom;

  // Ancho util
  const plotLeft = marginLeft + S(20);
  const plotRight = W - marginRight - S(20);
  const plotW = Math.max(1, plotRight - plotLeft);

  // Barras “narrow”
  const n = items.length;
  const slot = plotW / n;

  // muy angosta como referencia del PDF
  const barW = Math.max(S(10), Math.min(S(18), slot * 0.18));
  const pctFs = useTallRules ? S(34) : 34;

  // separación % arriba y label abajo
  const pctGap = S(12);


  const parts: string[] = [];
  parts.push(
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    wantsCoolvetica
      ? `<style type="text/css">
  @font-face {
    font-family: 'Coolvetica Rg';
    src: url("data:font/woff2;base64,${COOLVETICA_WOFF2_BASE64}") format("woff2");
    font-weight: 400;
    font-style: normal;
  }
</style>`
      : "",
    `<rect width="100%" height="100%" fill="${bg}" />`
  );

parts.push(`<g id="chart-content">`);
  // HEADER
  if (sheetTitle) {
    parts.push(
      `<text x="${marginLeft}" y="${headerY}"
             fill="${mainTextColor}" font-family="${FONT_STACK}"
             font-size="${useTallRules ? S(26) : 26}" font-weight="600" text-anchor="start">${esc(
               headerLeftLabel
             )}</text>`,
      `<text x="${centerX}" y="${headerY}"
             fill="${mainTextColor}" font-family="${FONT_STACK}"
             font-size="${useTallRules ? S(30) : 30}" font-weight="600" text-anchor="middle">${esc(
               sheetTitle
             )}</text>`,
      `<text x="${rightX}" y="${headerY}"
             fill="${mainTextColor}" font-family="${FONT_STACK}"
             font-size="${useTallRules ? S(26) : 26}" font-weight="600" text-anchor="end">${esc(
               headerDateLabel
             )}</text>`
    );
  }

  // TITLE

  titleLines.forEach((line, idx) => {
    const y = titleY + idx * (titleFs + titleLineGapRender);
    parts.push(
      `<text x="${marginLeft}" y="${y}"
             fill="${mainTextColor}"
             font-family="${FONT_STACK}"
             font-size="${titleFs}"
             font-weight="600"
             text-anchor="start">${esc(line)}</text>`
    );
  });
  
  // BARS
  // Opacidades tipo “tonos” sin colores nuevos
  const minOp = 0.25;
  const maxOp = 0.85;

  items.forEach((it, i) => {
    const cx = plotLeft + slot * (i + 0.5);
    const x = cx - barW / 2;

    const h = (it.value / 100) * barsH;
    const yTop = baselineY - h;

    const t = n <= 1 ? 1 : i / (n - 1);
    const op = minOp + (maxOp - minOp) * t;

    // barra
    parts.push(
      `<rect x="${x}" y="${yTop}" width="${barW}" height="${h}"
             fill="${mainTextColor}" fill-opacity="${op}" />`
    );

    // % arriba
    const pctText = `${it.value.toFixed(1).replace(/\.0$/, "")}%`;
    parts.push(
      `<text x="${cx}" y="${yTop - pctGap}"
             fill="${mainTextColor}" fill-opacity="${op}"
             font-family="${FONT_STACK}"
             font-size="${pctFs}"
             font-weight="700"
             text-anchor="middle">${esc(pctText)}</text>`
    );

    // label abajo (1–2 líneas)
    const lines = wrapLabel(it.label, useTallRules ? 12 : 10, 2);
    if (lines.length) {
      const baseY = baselineY + labelGap;
      lines.forEach((ln, j) => {
        parts.push(
          `<text x="${cx}" y="${baseY + j * (labelFs + S(6))}"
                 fill="${mainTextColor}" fill-opacity="${op}"
                 font-family="${FONT_STACK}"
                 font-size="${labelFs}"
                 font-weight="600"
                 text-anchor="middle">${esc(ln)}</text>`
        );
      });
    }
  });

 // ✅ bounds "tight" para combined (corta el margen izquierdo/derecho)
const contentBottom = Math.min(H, barsBottom + labelsBlockH);

// el dibujo real vive entre plotLeft..plotRight (con un poquito de aire)
const boundsX = Math.max(0, plotLeft - S(20));
const boundsRight = Math.min(W, plotRight + S(20));
const boundsW = Math.max(1, boundsRight - boundsX);

// si estás ocultando header/título, el contenido empieza más abajo
const boundsY =  Math.max(0, barsTop - S(20)) 

const boundsBottom = Math.min(H, contentBottom);
const boundsH = Math.max(1, boundsBottom - boundsY);

parts.push(
  `<rect id="content-bounds" x="${boundsX}" y="${boundsY}" width="${boundsW}" height="${boundsH}" fill="none" opacity="0" />`,
  `</g>`,
  `</svg>`
);


  return parts.join("\n");
}
