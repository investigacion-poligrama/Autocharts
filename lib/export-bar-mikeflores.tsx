import { ChartConfig } from "@/lib/chartconfig";
import type { FrequencyData } from "@/app/page";
import { getBrandTheme } from "@/lib/brand-theme";

type MikeBuildBarSvgArgs = {
  data: FrequencyData[];
  title: string;
  customColors?: Record<string, string>;
  width?: number;
  height?: number;
  backgroundColor?: string; // default: #232323
  textColor?: string; // default: #ffffff
};

const CANVAS_W = 1920;
const CANVAS_H = 1080;

// Paleta (puedes ajustar el orden si quieres que coincida exacto con partidos)
const PALETTE = [
  "#c8102e", 
  "#f39c12", 
  "#0b6b3a", 
  "#2c2f7a", 
  "#ff2d55", 
  "#9acd32", 
  "#8d6e63",
];

const FONT_FUTURA =
   "Futura Condensed ExtraBold, Futura, Arial, sans-serif";

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function clampPercent(raw: unknown): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
      ? Number(raw.replace("%", "").replace(",", ".").trim())
      : 0;

  const v = Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(100, v));
}

function formatPct(v: number): string {
  // La foto se ve “sin decimales” (27%, 16%, etc.)
  return `${Math.round(v)}%`;
}

function darkenHex(hex: string, factor = 0.55): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return hex;

  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);

  const rd = Math.max(0, Math.min(255, Math.round(r * factor)));
  const gd = Math.max(0, Math.min(255, Math.round(g * factor)));
  const bd = Math.max(0, Math.min(255, Math.round(b * factor)));

  const toHex = (x: number) => x.toString(16).padStart(2, "0");
  return `#${toHex(rd)}${toHex(gd)}${toHex(bd)}`;
}

function wrapTitle(title: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";

  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;

    if (test.length > maxCharsPerLine && cur) {
      lines.push(cur);
      cur = w;

      if (lines.length === maxLines - 1) {
        // última línea: lo que falta (sin pasarse mucho)
        const rest = [cur, ...words.slice(words.indexOf(w) + 1)].join(" ");
        lines.push(rest);
        return lines;
      }
    } else {
      cur = test;
    }
  }

  if (cur) lines.push(cur);

  // si se pasó, compacta en maxLines
  if (lines.length <= maxLines) return lines;
  return [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(" ")];
}


export function MikebuildBarSvg({
  data,
  title,
  customColors = {},
  width,
  height,
  backgroundColor,
  textColor,
}: MikeBuildBarSvgArgs): string {
  const W = width ?? CANVAS_W;
  const H = height ?? CANVAS_H;

const bg =
  backgroundColor && backgroundColor.trim() && backgroundColor !== "transparent"
    ? backgroundColor
    : "#232323";

const mainText =
  textColor && textColor.trim() && textColor !== "transparent"
    ? textColor
    : "#ffffff";


  // ---- Layout (calibrado para verse como la foto) ----
  const isVertical = H > W;
  const titleFontSize = Math.round(
  isVertical ? W * 0.04 : H * 0.060
);

  const titleTop = Math.round(H * 0.17);

  // Bloque central de barras
const blockWidth = Math.round(W * 0.52);
const barX0 = Math.round((W - blockWidth) / 2);

const pctGap = Math.round(W * 0.02);   // espacio entre barra y %
const pctZone = Math.round(W * 0.08);  // “zona” donde vive el % (más holgada)

const barW = blockWidth - pctGap - pctZone; // ✅ ancho real de la barra
const barX1 = barX0 + barW;

// % va en la zona derecha
const pctX = barX1 + pctGap + pctZone; // como usas text-anchor=end, esto queda bien


const rows = Math.max(1, data.length);

// proporciones internas (ajústalas a gusto)
const gapRatio = 0.55;      // gap relativo a bar
const labelRatio = 0.55;    // labelFont relativo a bar

// Queremos: rows * (labelBlockH + barH) + (rows-1)*rowGap <= barsAreaH
// donde labelBlockH = labelFont + labelGap
// labelFont = barH * labelRatio
// labelGap  = barH * 0.20 (por ejemplo)
// rowGap    = barH * gapRatio

const labelGapRatio = 0.20;

const maxTitleChars = isVertical ? 26 : 34;
const titleLines = wrapTitle(title, maxTitleChars, 3);
const titleLineGap = Math.round(titleFontSize * 0.16);

const titleBlockH =
  titleLines.length * titleFontSize + (titleLines.length - 1) * titleLineGap;

// Margen superior + “aire” debajo del título
const topPad = Math.round(H * 0.08);
const afterTitleGap = Math.round(H * 0.05);

const denomPerRow = (labelRatio + labelGapRatio + 1); // labelFont + labelGap + bar
const denomTotal =
  rows * denomPerRow + (rows - 1) * gapRatio;
  const barsAreaTop = topPad + titleBlockH + afterTitleGap;
const bottomPad = Math.round(H * 0.10);
const barsAreaH = Math.max(200, H - barsAreaTop - bottomPad);
// barH que cabe
let barH = Math.floor(barsAreaH / denomTotal);

// clamps para que no se vea ridículo
barH = Math.max(18, Math.min(barH, Math.round(H * 0.055)));

const rowGap = Math.round(barH * gapRatio);
const labelFont = Math.round(barH * labelRatio);
const labelGap = Math.round(barH * labelGapRatio);
const labelBlockH = labelFont + labelGap;
const firstRowTop = barsAreaTop; // empieza justo debajo del título

// (opcional) % font también relativo a barH para que no explote
const pctFont = Math.round(barH * 0.78); // ✅ más parecido al PDF


  const r = Math.round(barH / 2); // rounded ends

  const normalized = data.map((d) => ({
    ...d,
    value: clampPercent((d as any).percentage ?? (d as any).value),
    label: String((d as any).label ?? ""),
  }));

  // ---- SVG parts ----
  const parts: string[] = [];
  parts.push(
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${bg}"/>`
  );

  // ---- Título centrado (2 líneas máx) ----


  const titleStartY = titleTop - Math.round(titleBlockH / 2);

  titleLines.forEach((line, i) => {
    const y = titleStartY + i * (titleFontSize + titleLineGap);
    parts.push(
      `<text x="${Math.round(W / 2)}" y="${y}"
        fill="${mainText}"
        font-family="${FONT_FUTURA}"
        font-size="${titleFontSize}"
        font-weight="800"
        text-anchor="middle"
        dominant-baseline="hanging"
      >${esc(line)}</text>`
    );
  });

  // ---- Contenido que se extrae en combined mode ----
  const bars: string[] = [];

  normalized.forEach((item, idx) => {
    const rowTop = firstRowTop + idx * (labelBlockH + barH + rowGap);
  const labelY = rowTop;               // top del bloque de label
  const barTop = rowTop + labelBlockH; // top de la barra (debajo del label)
  const yMid = barTop + barH / 2;

  const color = customColors[item.label] ?? PALETTE[idx % PALETTE.length];
  const trackColor = darkenHex(color, 0.55);
  const fillW = Math.round(((barX1 - barX0) * item.value) / 100);

  // LABEL (más chico y no bold)
  bars.push(
    `<text
      x="${barX0}"
      y="${labelY + labelFont}"
      fill="${mainText}"
      font-family="${FONT_FUTURA}"
      font-size="${labelFont}"
      font-weight="400"
      font-style="italic"
      text-anchor="start"
      dominant-baseline="alphabetic"
    >${esc(item.label)}</text>`
  );

  // TRACK
  bars.push(
    `<rect x="${barX0}" y="${barTop}" width="${barX1 - barX0}" height="${barH}"
      rx="${r}" ry="${r}"
      fill="${trackColor}"
      fill-opacity="0.55"
    />`
  );

  // FILL
  bars.push(
    `<rect x="${barX0}" y="${barTop}" width="${fillW}" height="${barH}"
      rx="${r}" ry="${r}"
      fill="${color}"
    />`
  );

  // %
  bars.push(
    `<text
      x="${pctX}"
      y="${yMid}"
      fill="${mainText}"
      font-family="${FONT_FUTURA}"
      font-size="${pctFont}"
      font-weight="800"
      text-anchor="end"
      dominant-baseline="middle"
    >${esc(formatPct(item.value))}</text>`
  );
});


  parts.push(`<g id="chart-content">`);
  parts.push(bars.join("\n"));
  parts.push(`</g>`);
  parts.push(`</svg>`);

  return parts.join("\n");
}
