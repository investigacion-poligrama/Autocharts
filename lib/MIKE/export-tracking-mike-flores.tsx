// export-tracking-mike-flores.ts
import type { ChartSvgArgs } from "@/lib/chart-svgs";
import { ChartConfig } from "@/lib/chartconfig";

const CANVAS_W = 1920;
const CANVAS_H = 1080;

const FONT_FUTURA = "Futura Condensed ExtraBold, Futura, Arial, sans-serif";

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type WrappedTitle = {
  lines: string[];
  fontSize: number;
  blockHeight: number;
};

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
        const rest = [cur, ...words.slice(words.indexOf(w) + 1)].join(" ");
        lines.push(rest);
        return lines;
      }
    } else {
      cur = test;
    }
  }

  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  return [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(" ")];
}

function prepareTitleMike(title: string, W: number, H: number): WrappedTitle {
  const isVertical = H > W;
  const fontSize = Math.round(isVertical ? W * 0.04 : H * 0.060);
  const maxChars = isVertical ? 26 : 34;
  const lines = wrapTitle(title, maxChars, 3);
  const lineGap = Math.round(fontSize * 0.16);
  const blockHeight = lines.length * fontSize + (lines.length - 1) * lineGap;
  return { lines, fontSize, blockHeight };
}

/* ---------------- A1 helpers ---------------- */

function a1ToRowColSummary(a1: string) {
  const match = a1.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) throw new Error(`Referencia A1 inválida: ${a1}`);

  const [, colLetters, rowStr] = match;
  let col = 0;
  for (const ch of colLetters) col = col * 26 + (ch.charCodeAt(0) - 64);

  const row = parseInt(rowStr, 10);
  if (!row || row < 1) throw new Error(`Fila inválida en referencia A1: ${a1}`);

  return { row, col }; // 1-based
}

function parseA1RangeSummary(range: string) {
  const [startStr, endStr] = range.split(":");
  const start = a1ToRowColSummary(startStr);
  const end = endStr ? a1ToRowColSummary(endStr) : start;

  return {
    rowStart: Math.min(start.row, end.row),
    rowEnd: Math.max(start.row, end.row),
    colStart: Math.min(start.col, end.col),
    colEnd: Math.max(start.col, end.col),
  };
}

function monthToAbbr(raw: string): string {
  const s = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  const m: Record<string, string> = {
    enero: "ENE",
    febrero: "FEB",
    marzo: "MAR",
    abril: "ABR",
    mayo: "MAY",
    junio: "JUN",
    julio: "JUL",
    agosto: "AGO",
    septiembre: "SEP",
    setiembre: "SEP",
    octubre: "OCT",
    noviembre: "NOV",
    diciembre: "DIC",
  };

  const first3 = s.slice(0, 3).toUpperCase();
  const already = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  if (already.includes(first3)) return first3;

  return m[s] ?? first3;
}

function extractTrackingDataSummary(values: any[][], range?: string) {
  if (!values.length) return null;
  if (!range || !range.trim()) return null;

  let parsed;
  try {
    parsed = parseA1RangeSummary(range.trim());
  } catch {
    return null;
  }

  const { rowStart, rowEnd, colStart, colEnd } = parsed;
  const headerRow = values[rowStart - 1] || [];

  const months: string[] = [];
  for (let c = colStart + 1; c <= colEnd; c++) {
    const raw = headerRow[c - 1];
    if (raw == null || raw === "") continue;
    months.push(String(raw).trim());
  }
  if (!months.length) return null;

  const categories: { name: string; values: number[] }[] = [];

  for (let r = rowStart + 1; r <= rowEnd; r++) {
    const row = values[r - 1] || [];
    const nameCell = row[colStart - 1];
    const name = nameCell != null ? String(nameCell).trim() : "";
    if (!name) continue;

    const vals: number[] = [];
    for (let mIdx = 0; mIdx < months.length; mIdx++) {
      const c = colStart + 1 + mIdx;
      const cell = row[c - 1];
      let perc = 0;

      if (typeof cell === "number") {
        let v = cell;
        if (v > 0 && v <= 1) v *= 100;
        perc = Number(v.toFixed(1));
      } else if (typeof cell === "string") {
        const cleaned = cell.replace("%", "").replace(",", ".").trim();
        const parsedNum = parseFloat(cleaned);
        if (!Number.isNaN(parsedNum)) perc = Number(parsedNum.toFixed(1));
      }

      vals.push(perc);
    }

    categories.push({ name, values: vals });
  }

  return { months, categories };
}

/* ---------------- curve helper ---------------- */

function pointsToPolylinePath(points: { x: number; y: number }[]) {
  if (points.length < 2) return "";
  return "M " + points.map((p) => `${p.x} ${p.y}`).join(" L ");
}

/* ---------------- palette / color picking ---------------- */

function colorForSeries(name: string, customColors: Record<string, string>) {
  if (customColors?.[name]) return customColors[name];

  const normalize = (str: string) =>
    str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "")
      .trim();

  const n = normalize(name);
  const matchedKey = Object.keys(customColors || {}).find((k) => normalize(k) === n);
  if (matchedKey) return (customColors as any)[matchedKey];

  const matrixColors = (ChartConfig.colors as any).matrixColors;
  const cfg = matrixColors?.tracking?.[n];
  if (cfg) return cfg;

  return ChartConfig.colors.neutral;
}

function basicMessageSvg(message: string, bg: string, text: string): string {
  const W = CANVAS_W;
  const H = CANVAS_H;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${bg}" />`,
    `<text x="${W / 2}" y="${H / 2}" fill="${text}"
      font-family="${FONT_FUTURA}"
      font-size="28"
      text-anchor="middle"
      dominant-baseline="middle">${esc(message)}</text>`,
    `</svg>`,
  ].join("\n");
}

export function buildTrackingMikeFloresSvg({
  data = [],
  title,
  customColors = {},
  width,
  height,
  sheetValues,
  answerRange,
  backgroundColor,
  textColor,
  isCombinedMode,
  hideLegend,
}: ChartSvgArgs): string {
  const W = width ?? CANVAS_W;
  const H = height ?? CANVAS_H;

  const bg =
    backgroundColor && backgroundColor.trim() && backgroundColor !== "transparent"
      ? backgroundColor
      : "#232323";

  const mainText =
    textColor && textColor.trim() && textColor !== "transparent" ? textColor : "#ffffff";

  const trackingData = extractTrackingDataSummary(sheetValues || [], answerRange);
  if (!trackingData) {
    return basicMessageSvg("No se pudo leer la tabla de tracking.", bg, mainText);
  }

  let { months, categories } = trackingData;
  months = months.map(monthToAbbr);

  // Respeta orden del DragList (data trae labels)
  const dragOrder = (data || []).map((d) => d.label).filter(Boolean);
  if (dragOrder.length) {
    const byName = new Map(categories.map((c) => [c.name, c]));
    categories = dragOrder.map((l) => byName.get(l)).filter(Boolean) as any;
  }

  if (!categories.length || !months.length) {
    return basicMessageSvg("No hay datos para graficar.", bg, mainText);
  }

  // ---------- Title prep ----------
  const { lines: titleLines, fontSize: titleFs, blockHeight: titleBlockH } =
    prepareTitleMike(title, W, H);

  const titleTop = Math.round(H * 0.17);
  const titleLineGap = Math.round(titleFs * 0.16);
  const titleStartY = titleTop - Math.round(titleBlockH / 2);

  // ---------- Plot layout (Mike) ----------
  const axisX = Math.round(W * 0.24);
  const plotX0 = axisX;
  const plotX1 = Math.round(W * 0.90);
  const plotW = plotX1 - plotX0;

  // fijo para que se parezca al mock
  const contentTop = Math.round(H * 0.34);
  const contentBottom = Math.round(H * 0.71);
  const plotH = Math.max(200, contentBottom - contentTop);

  const monthsCount = months.length;

  // y-scale
  const maxValue = Math.max(10, ...categories.flatMap((c) => c.values));
  const yMin = 0;
  let yMax = Math.ceil(maxValue / 5) * 5;
  yMax = Math.max(30, yMax);

  const yAt = (v: number) => {
    const vv = Math.max(yMin, Math.min(yMax, v));
    const t = (vv - yMin) / (yMax - yMin);
    return contentTop + plotH - t * plotH;
  };

  // x positions
  const innerMarginX = Math.round(plotW * 0.14);
  const usableW = Math.max(50, plotW - innerMarginX * 2);
  const xStep = monthsCount > 1 ? usableW / (monthsCount - 1) : 0;

  const xAt = (i: number) =>
    monthsCount > 1 ? plotX0 + innerMarginX + i * xStep : plotX0 + plotW / 2;

  // styles
  const pointR = Math.max(7, Math.round(H * 0.008));
  const strokeW = Math.max(2, Math.round(H * 0.006));
  const pctFs = Math.max(18, Math.round(H * 0.017));
  const monthFs = Math.max(22, Math.round(H * 0.020));
  const tickFs = Math.max(22, Math.round(H * 0.020));

  const axisStroke = mainText;
  const axisW = 2;

  const xAxisY = contentTop + plotH;
  const monthY = xAxisY + Math.round(monthFs * 1.2);

  // ---------- build svg ----------
  const parts: string[] = [];
  parts.push(
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${bg}" />`
  );

  // ---- Title markup (lo metemos fuera o dentro según combined) ----
  const titleMarkup: string[] = [];
  titleLines.forEach((line, i) => {
    const y = titleStartY + i * (titleFs + titleLineGap);
    titleMarkup.push(
      `<text x="${Math.round(W / 2)}" y="${y}"
        fill="${mainText}"
        font-family="${FONT_FUTURA}"
        font-size="${titleFs}"
        font-weight="800"
        text-anchor="middle"
        dominant-baseline="hanging">${esc(line)}</text>`
    );
  });

  // ✅ normal: el título va fuera
  if (!isCombinedMode) parts.push(...titleMarkup);

  // ---- bounds para combined ----
 const boundsY = Math.max(0, titleStartY);

// izquierda: incluye números del eje Y (tick labels)
const leftPad = Math.round(W * 0.10);
const boundsX = Math.max(0, axisX - leftPad);

// derecha: fin del plot + un aire
const boundsRight = Math.min(W, plotX1 + Math.round(W * 0.03));
const boundsW = Math.max(1, boundsRight - boundsX);

  // ✅ agrega un padding abajo para que el combined lo escale un poco menos
const EXTRA_BOTTOM = Math.round(H * 0.18); // prueba 0.12–0.22

const boundsBottom = Math.min(
  H,
  monthY + Math.round(monthFs * 1.6) + EXTRA_BOTTOM
);

const boundsH = Math.max(1, boundsBottom - boundsY);


  // ---- chart-content (incluye título en combined) ----
  parts.push(`<g id="chart-content">`);

  if (isCombinedMode) parts.push(...titleMarkup);

  parts.push(
    `<rect id="content-bounds" x="${boundsX}" y="${boundsY}" width="${boundsW}" height="${boundsH}"
      fill="none" opacity="0" />`
  );

  // ---- defs FIRST (para que clip-path exista antes de usarse) ----
  parts.push(`
  <defs>
    <clipPath id="plot-clip">
      <rect x="${plotX0}" y="${contentTop}" width="${plotW}" height="${plotH}" />
    </clipPath>
  </defs>
  `.trim());

  // EJE Y
  parts.push(
    `<line x1="${axisX}" y1="${contentTop}" x2="${axisX}" y2="${xAxisY}"
      stroke="${axisStroke}" stroke-width="${axisW}" />`
  );

  // EJE X
  parts.push(
    `<line x1="${axisX}" y1="${xAxisY}" x2="${plotX1}" y2="${xAxisY}"
      stroke="${axisStroke}" stroke-width="${axisW}" />`
  );

  // TICKS Y (0..yMax cada 5)
  for (let t = yMin; t <= yMax; t += 5) {
    const yy = yAt(t);
    parts.push(
      `<text x="${axisX - Math.round(W * 0.03)}" y="${yy}"
        fill="${mainText}"
        font-family="${FONT_FUTURA}"
        font-size="${tickFs}"
        font-weight="400"
        text-anchor="end"
        dominant-baseline="middle">${t}</text>`
    );
  }

  // SERIES (clip)
  parts.push(`<g clip-path="url(#plot-clip)">`);

  categories.forEach((cat) => {
    const color = colorForSeries(cat.name, customColors);
    const pts = cat.values.map((v, i) => ({ x: xAt(i), y: yAt(v) }));

    if (pts.length > 1) {
      const d = pointsToPolylinePath(pts);
      parts.push(
        `<path d="${d}" stroke="${color}" stroke-width="${strokeW}" fill="none"
          stroke-linecap="round" stroke-linejoin="round" />`
      );
    }

    pts.forEach((p, i) => {
      const v = cat.values[i];
      parts.push(`<circle cx="${p.x}" cy="${p.y}" r="${pointR}" fill="${color}" />`);
      parts.push(
        `<text x="${p.x}" y="${p.y - Math.round(pointR * 1.8)}"
          fill="${color}"
          font-family="${FONT_FUTURA}"
          font-size="${pctFs}"
          font-weight="800"
          text-anchor="middle"
          dominant-baseline="alphabetic">${esc(v.toFixed(0))}%</text>`
      );
    });
  });

  parts.push(`</g>`);

  // Meses
  for (let i = 0; i < monthsCount; i++) {
    const x = xAt(i);
    parts.push(
      `<text x="${x}" y="${monthY}"
        fill="${mainText}"
        font-family="${FONT_FUTURA}"
        font-size="${monthFs}"
        font-weight="400"
        font-style="italic"
        text-anchor="middle"
        dominant-baseline="alphabetic">${esc(months[i])}</text>`
    );
  }

  parts.push(`</g>`);
  parts.push(`</svg>`);
  return parts.join("\n");
}
