import { ChartConfig } from "@/lib/chartconfig";
import type { ChartSvgArgs } from "@/lib/chart-svgs";

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

// ESCAPAR TEXTO
const esc = (s?: string | null) =>
  (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// WRAP DE LABELS
function wrapMatrixLabel(text: string, maxChars = 18): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const w of words) {
    const test = current ? current + " " + w : w;
    if (test.length > maxChars && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }

  if (current) lines.push(current);

  if (lines.length > 2) return [lines[0], lines.slice(1).join(" ")];

  return lines;
}

// PARSE %
function parsePercentToNumber(raw: any): number {
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (!s) return 0;

  const cleaned = s.replace("%", "").replace(",", ".").trim();
  const num = Number(cleaned);
  if (Number.isNaN(num)) return 0;

  if (num >= 0 && num <= 1) return num * 100;

  return num;
}

// TITLES
function prepareTitle(title: string, baseFontSize: number, maxChars = 115) {
  const words = title.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const w of words) {
    const test = current ? current + " " + w : w;
    if (test.length > maxChars && current) {
      lines.push(current);
      current = w;
    } else current = test;
  }

  if (current) lines.push(current);
  if (lines.length > 2) lines.splice(2);

  const fs = baseFontSize;
  const gap = 6;

  return {
    lines,
    fontSize: fs,
    blockHeight: lines.length * fs + (lines.length - 1) * gap,
  };
}

// COLOR CELDA
function cellFill(rowLabel: string, percent: number, customColors?: Record<string, string>) {
  const fallback = ChartConfig.colors.matrix.light;
  const baseHex = customColors?.[rowLabel] ?? fallback;
  const clamped = Math.max(0, Math.min(100, percent));
  const alpha = 0.25 + (clamped / 100) * 0.55;
  return { baseHex, alpha };
}

// ---------------- A1 HELPERS ----------------
// Ya NO truenan si escribes "C" o "C1:".

function a1ToRowCol(a1: string) {
  const match = a1.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;

  const [, colLetters, rowStr] = match;

  let col = 0;
  for (const ch of colLetters) col = col * 26 + (ch.charCodeAt(0) - 64);

  return { row: Number(rowStr), col };
}

function parseA1Range(range: string) {
  if (!range.trim()) return null;

  const [a, b] = range.trim().split(":");
  const start = a1ToRowCol(a);
  if (!start) return null; // referencia incompleta

  const end = b ? a1ToRowCol(b) ?? start : start;

  return {
    rowStart: Math.min(start.row, end.row),
    rowEnd: Math.max(start.row, end.row),
    colStart: Math.min(start.col, end.col),
    colEnd: Math.max(start.col, end.col),
  };
}

// ---------------------------------------------
// SVG PRINCIPAL
// ---------------------------------------------

export function buildMatrixSvg({
  data,
  title,
  secondColumn,
  columns,
  customColors = {},
  sheetTitle,
  width,
  height,
  inputMode,
  sheetValues,
  secondAnswerRange,
  backgroundColor,
  textColor,
}: ChartSvgArgs): string {

  const W = width ?? CANVAS_W;
  const H = height ?? CANVAS_H;

  const bg = backgroundColor ?? "#000000";
  const mainTextColor = textColor ?? "#ffffff";
  const mutedTextColor = textColor ? textColor : "#bdbdbd";

  const titleFs = ChartConfig.typography.title.fontSize;
  const footerFs = ChartConfig.typography.footer.fontSize;

  const isTall = W === 1440 && H === 1800;

  let marginLeft = isTall ? 100 : 120;
  let marginRight = isTall ? 100 : 120;
  let marginTop = isTall ? 170 : 125;
  let marginBottom = isTall ? 170 : 125;

  const { lines: titleLines, blockHeight: titleH } = prepareTitle(
    title,
    titleFs,
    isTall ? 80 : 115
  );

  const titleY = marginTop + 130;
  const lineY = titleY + titleH + 16;

  // DATA
  let rowOrder: string[] = [];
  let col2Labels: string[] = [];
  let matrix: Record<string, Record<string, number>> = {};

  // --------------------- SUMMARY MODE ---------------------

  if (inputMode === "summary") {
    if (!sheetValues || !secondAnswerRange) {
      return basicMsg("Define el rango de la segunda pregunta");
    }

    rowOrder = data.map((d) => d.label);
    const rowPerc = Object.fromEntries(data.map((d) => [d.label, d.percentage]));

    const parsed = parseA1Range(secondAnswerRange);

    if (!parsed) {
      return basicMsg("Rango A1 aún no válido");
    }

    let { rowStart, rowEnd, colStart, colEnd } = parsed;

    if (colEnd < colStart + 1) {
      return basicMsg("El rango debe tener dos columnas");
    }

    const labels: string[] = [];
    const colPct: number[] = [];

    for (let r = rowStart; r <= rowEnd; r++) {
      const row = sheetValues[r - 1] || [];
      const label = row[colStart - 1];
      const pct = row[colStart];

      if (!label) continue;

      labels.push(String(label));
      colPct.push(parsePercentToNumber(pct));
    }

    col2Labels = labels;

    matrix = {};
    rowOrder.forEach((r) => {
      matrix[r] = {};
      col2Labels.forEach((c, i) => {
        matrix[r][c] = Math.round((rowPerc[r] * colPct[i]) / 100);
      });
    });
  }

  // --------------------- RAW MODE ---------------------

  if (inputMode === "raw") {
    const col1 = columns?.find((c) => c.name === title);
    const col2 = columns?.find((c) => c.name === secondColumn);

    if (!col1 || !col2) return basicMsg("Select both columns to generate matrix");

    rowOrder = data.map((d) => d.label);
    col2Labels = Array.from(new Set(col2.values)).filter(Boolean);

    matrix = {};
    rowOrder.forEach((r) => {
      matrix[r] = {};
      col2Labels.forEach((c) => (matrix[r][c] = 0));
    });

    col1.values.forEach((v1, i) => {
      const v2 = col2.values[i];
      if (v1 && v2 && matrix[v1] && matrix[v1][v2] != null) {
        matrix[v1][v2]++;
      }
    });

    rowOrder.forEach((r) => {
      const total = Object.values(matrix[r]).reduce((a, b) => a + b, 0);
      col2Labels.forEach((c) => {
        matrix[r][c] = total > 0 ? Math.round((matrix[r][c] / total) * 100) : 0;
      });
    });
  }

  // ------------------- SVG OUTPUT -------------------

const parts: string[] = [];

parts.push(
  `<?xml version="1.0" encoding="UTF-8"?>`,
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
  `<rect width="100%" height="100%" fill="${bg}" />`
);

// Título
titleLines.forEach((line, i) => {
  parts.push(
    `<text x="${marginLeft}" y="${titleY + i * (titleFs + 6)}"
      fill="${mainTextColor}" font-size="${titleFs}" font-family="${FONT_STACK}">
      ${esc(line)}
    </text>`
  );
});

// Línea
parts.push(
  `<line x1="${marginLeft}" y1="${lineY}" x2="${W - marginRight}" y2="${lineY}"
    stroke="${mainTextColor}" stroke-width="2"/>`
);

// ENCABEZADO: Poligrama / Poder / Ganar
const logoX = W - marginRight;
const logoY0 = marginTop - 24;
const headerFs = 40;
const headerLine = headerFs * 1.1;

if (sheetTitle) {
  let sheetTitleY = logoY0 + 40;
  if (isTall) sheetTitleY = logoY0 + 60;

  parts.push(
    `<text x="${marginLeft}" y="${sheetTitleY}" fill="${mainTextColor}"
      font-family="${FONT_STACK}" font-size="30" text-anchor="start">
      ${esc(sheetTitle)}
    </text>`
  );
}

parts.push(
  `<text x="${logoX}" y="${logoY0}" fill="${mainTextColor}"
    font-size="${headerFs}" font-weight="700" text-anchor="end"
    font-family="${FONT_STACK}">Poligrama.</text>`,
  `<text x="${logoX}" y="${logoY0 + headerLine}" fill="${mainTextColor}"
    font-size="${headerFs}" font-weight="700" text-anchor="end"
    font-family="${FONT_STACK}">Poder.</text>`,
  `<text x="${logoX}" y="${logoY0 + headerLine * 2}" fill="${mainTextColor}"
    font-size="${headerFs}" font-weight="700" text-anchor="end"
    font-family="${FONT_STACK}">Ganar.</text>`
);


const tableTop = lineY + 60;
const tableBottom = H - marginBottom - 40;
const tableHeight = tableBottom - tableTop;

const headerH = 70;
const rowsH = tableHeight - headerH;
const rowH = rowsH / rowOrder.length;

const labelColW = 280;
const dataW = W - marginLeft - marginRight - labelColW;
const colW = dataW / col2Labels.length;

col2Labels.forEach((label, idx) => {
  const x = marginLeft + labelColW + idx * colW;
  const rectY = tableTop + 10;
  const rectH = headerH - 20;

  parts.push(
    `<rect x="${x + 4}" y="${rectY}" width="${colW - 8}" height="${rectH}"
      rx="12" fill="#ffffff"/>`,
    `<text x="${x + colW / 2}" y="${rectY + rectH / 2}" fill="#000000"
      font-size="20" font-weight="700" text-anchor="middle"
      dominant-baseline="middle" font-family="${FONT_STACK}">
      ${esc(label)}
    </text>`
  );
});


// FILAS
rowOrder.forEach((rowLabel, rowIndex) => {
  const y = tableTop + headerH + rowIndex * rowH;

  const rowBg = customColors[rowLabel] ?? ChartConfig.colors.matrix.medium;
  const textLines = wrapMatrixLabel(rowLabel);

  parts.push(
    `<rect x="${marginLeft}" y="${y + 6}" width="${labelColW - 16}"
      height="${rowH - 12}" rx="10" fill="${rowBg}"/>`
  );

  const centerX = marginLeft + (labelColW - 16) / 2;
  const centerY = y + rowH / 2;

  if (textLines.length === 1) {
    parts.push(
      `<text x="${centerX}" y="${centerY}" fill="${mainTextColor}"
        text-anchor="middle" font-size="20" dominant-baseline="middle"
        font-family="${FONT_STACK}">
        ${esc(textLines[0])}
      </text>`
    );
  } else {
    parts.push(
      `<text x="${centerX}" y="${centerY - 12}" fill="${mainTextColor}"
        text-anchor="middle" font-size="20" font-family="${FONT_STACK}">
        ${esc(textLines[0])}
      </text>`,
      `<text x="${centerX}" y="${centerY + 12}" fill="${mainTextColor}"
        text-anchor="middle" font-size="20" font-family="${FONT_STACK}">
        ${esc(textLines[1])}
      </text>`
    );
  }

  col2Labels.forEach((colLabel, colIndex) => {
    const cellX = marginLeft + labelColW + colIndex * colW;
    const pct = matrix[rowLabel][colLabel] ?? 0;

    const { baseHex, alpha } = cellFill(rowLabel, pct, customColors);

    parts.push(
      `<rect x="${cellX + 4}" y="${y + 6}" width="${colW - 8}" height="${rowH - 12}"
        rx="12" fill="${baseHex}" fill-opacity="${alpha}"/>`,
      `<text x="${cellX + colW / 2}" y="${y + rowH / 2}"
        fill="${mainTextColor}" font-size="20" font-weight="700"
        text-anchor="middle" dominant-baseline="middle"
        font-family="${FONT_STACK}">
        ${pct}%
      </text>`
    );
  });
});

// FOOTER
parts.push(
  `<text x="${W - marginRight}" y="${H - marginBottom}"
    fill="${mutedTextColor}" font-size="${footerFs}" text-anchor="end"
    font-family="${FONT_STACK}">
    ${esc(ChartConfig.footer)}
  </text>`
);

parts.push(`</svg>`);

return parts.join("\n");
}

// ------------- MENSAJE SVG SIN CRASH -------------

function basicMsg(message: string) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}">
      <rect width="100%" height="100%" fill="#000"/>
      <text
        x="${CANVAS_W / 2}"
        y="${CANVAS_H / 2}"
        fill="#fff"
        font-size="26"
        text-anchor="middle"
        font-family="${FONT_STACK}"
      >
        ${message}
      </text>
    </svg>
  `;
}
