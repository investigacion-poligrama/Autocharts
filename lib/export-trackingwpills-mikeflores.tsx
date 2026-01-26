// export-trackingwpills-mikeflores.tsx
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

/* ---------------- A1 helpers (summary) ---------------- */

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

/* ---------------- straight lines ---------------- */

function pointsToPolylinePath(points: { x: number; y: number }[]) {
  if (points.length < 2) return "";
  return "M " + points.map((p) => `${p.x} ${p.y}`).join(" L ");
}

/* ---------------- palette ---------------- */

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

/* ---------------- pills legend ---------------- */

function drawPillsLegend({
  W,
  H,
  categories,
  customColors,
  topY,
  maxH,
  mainText,
}: {
  W: number;
  H: number;
  categories: { name: string }[];
  customColors: Record<string, string>;
  topY: number;
  maxH: number;
  mainText: string;
}) {
  const parts: string[] = [];

  const cols = 2;
  const gapX = Math.round(W * 0.035);
  const gapY = Math.round(H * 0.020);

  const pillH = Math.round(H * 0.05);
  const pillW = Math.round(W * 0.30);
  const rx = Math.round(pillH / 2);

  const rows = Math.ceil(categories.length / cols);
  const totalH = rows * pillH + (rows - 1) * gapY;

  const startY = topY + Math.max(0, (maxH - totalH) / 2);

  const totalW = cols * pillW + (cols - 1) * gapX;
  const startX = Math.round((W - totalW) / 2);

  const nameFs = Math.max(16, Math.round(H * 0.016));

  categories.forEach((cat, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);

    const x = startX + col * (pillW + gapX);
    const y = startY + row * (pillH + gapY);

    const c = colorForSeries(cat.name, customColors);

    parts.push(`<rect x="${x}" y="${y}" width="${pillW}" height="${pillH}" rx="${rx}" ry="${rx}" fill="${c}" />`);

    const lines = wrapTitle(cat.name, 18, 2);
    const lineGap = 1;
    const blockH = lines.length * nameFs + (lines.length - 1) * lineGap;

    const cy = y + pillH / 2 - blockH / 2 + nameFs;

    parts.push(
      `<text x="${x + pillW / 2}" y="${cy}"
        fill="${mainText}"
        font-family="${FONT_FUTURA}"
        font-size="${nameFs}"
        font-weight="800"
        text-anchor="middle">` +
        lines
          .map(
            (ln, j) =>
              `<tspan x="${x + pillW / 2}" dy="${j === 0 ? 0 : nameFs + lineGap}">${esc(ln)}</tspan>`
          )
          .join("") +
        `</text>`
    );
  });

  return parts.join("\n");
}

/* ---------------- main builder ---------------- */

export function buildTrackingWithPillsMikeFloresSvg({
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
  if (!trackingData) return basicMessageSvg("No se pudo leer la tabla de tracking.", bg, mainText);

  let { months, categories } = trackingData;
  months = months.map(monthToAbbr);

  const dragOrder = (data || []).map((d) => d.label).filter(Boolean);
  if (dragOrder.length) {
    const byName = new Map(categories.map((c) => [c.name, c]));
    categories = dragOrder.map((l) => byName.get(l)).filter(Boolean) as any;
  }

  if (!categories.length || !months.length) return basicMessageSvg("No hay datos para graficar.", bg, mainText);

  /* ---------------- layout ---------------- */

  const { lines: titleLines, fontSize: titleFs, blockHeight: titleBlockH } = prepareTitleMike(title, W, H);

  const titleTop = Math.round(H * 0.17);
  const titleLineGap = Math.round(titleFs * 0.16);
  const titleStartY = titleTop - Math.round(titleBlockH / 2);

  const axisX = Math.round(W * 0.24);
  const plotX0 = axisX;
  const plotX1 = Math.round(W * 0.90);
  const plotW = plotX1 - plotX0;

  // chart pegado al título
  const contentTop = Math.round(H * 0.30);

  // espacio para pills (solo NO combined)
  const pillsH = isCombinedMode ? 0 : Math.round(H * 0.30);

  const contentBottom = isCombinedMode ? Math.round(H * 0.72) : Math.round(H * 0.62);
  const plotH = Math.max(220, contentBottom - contentTop);
  const xAxisY = contentTop + plotH;

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

  const innerMarginX = Math.round(plotW * 0.14);
  const usableW = Math.max(50, plotW - innerMarginX * 2);
  const xStep = monthsCount > 1 ? usableW / (monthsCount - 1) : 0;

  const xAt = (i: number) =>
    monthsCount > 1 ? plotX0 + innerMarginX + i * xStep : plotX0 + plotW / 2;

  const axisStroke = mainText;
  const axisW = 2;

  const pointR = Math.max(7, Math.round(H * 0.008));
  const strokeW = Math.max(3, Math.round(H * 0.006));
  const pctFs = Math.max(18, Math.round(H * 0.017));
  const monthFs = Math.max(22, Math.round(H * 0.020));

  /* ---------------- svg ---------------- */

  const parts: string[] = [];
  parts.push(
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${bg}" />`
  );

  // Title markup
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

  if (!isCombinedMode) parts.push(...titleMarkup);

  // chart-content
  parts.push(`<g id="chart-content">`);
  if (isCombinedMode) parts.push(...titleMarkup);

  // ✅ bounds para combined (incluye título + plot + meses; excluye pills)
  const monthY = xAxisY + Math.round(monthFs * 1.2);
  const boundsX = 0;
  const boundsY = Math.max(0, titleStartY);
  const boundsW = W;
  const EXTRA_BOTTOM = Math.round(H * 0.18); // prueba 0.12–0.22

const boundsBottom = Math.min(
  H,
  monthY + Math.round(monthFs * 1.6) + EXTRA_BOTTOM
);

const boundsH = Math.max(1, boundsBottom - boundsY);


  parts.push(
    `<rect id="content-bounds" x="${boundsX}" y="${boundsY}" width="${boundsW}" height="${boundsH}"
      fill="none" opacity="0" />`
  );

  // defs/clip
  parts.push(`
    <defs>
      <clipPath id="plot-clip">
        <rect x="${plotX0}" y="${contentTop}" width="${plotW}" height="${plotH}" />
      </clipPath>
    </defs>
  `);

  // Axes
  parts.push(
    `<line x1="${axisX}" y1="${contentTop}" x2="${axisX}" y2="${xAxisY}"
      stroke="${axisStroke}" stroke-width="${axisW}" />`
  );

  parts.push(
    `<line x1="${axisX}" y1="${xAxisY}" x2="${plotX1}" y2="${xAxisY}"
      stroke="${axisStroke}" stroke-width="${axisW}" />`
  );

  // Y ticks
  const tickFs = Math.max(22, Math.round(H * 0.020));
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

  // SERIES (clipped)
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

  // Month labels
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

  // Pills legend (solo NO combined; queda fuera del crop por bounds)
  if (!isCombinedMode) {
    const pillsTop = monthY + Math.round(H * 0.05);
    const pillsMaxH = Math.max(60, H - pillsTop - Math.round(H * 0.05));

    parts.push(
      drawPillsLegend({
        W,
        H,
        categories: categories.map((c) => ({ name: c.name })),
        customColors,
        topY: pillsTop,
        maxH: Math.min(pillsH || pillsMaxH, pillsMaxH),
        mainText: "#ffffff",
      })
    );
  }

  parts.push(`</g>`);
  parts.push(`</svg>`);

  return parts.join("\n");
}
