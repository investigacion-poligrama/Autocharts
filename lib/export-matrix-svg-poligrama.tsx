import { ChartConfig } from "@/lib/chartconfig";
import type { ChartSvgArgs } from "@/lib/chart-svgs";

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

const esc = (s?: string | null) =>
  (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

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

function parsePercentToNumber(raw: any): number {
  if (raw == null) return 0;
  if (typeof raw === "number") {
    let n = raw;
    if (n > 0 && n <= 1) n = n * 100;
    return n;
  }

  const s = String(raw).trim();
  if (!s) return 0;

  const cleaned = s.replace("%", "").replace(",", ".").trim();
  const num = Number(cleaned);
  if (Number.isNaN(num)) return 0;

  if (num >= 0 && num <= 1) return num * 100;
  return num;
}

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

function cellFill(
  rowLabel: string,
  percent: number,
  customColors?: Record<string, string>
) {
  const fallback = ChartConfig.colors.matrix.light;
  const baseHex = customColors?.[rowLabel] ?? fallback;
  const clamped = Math.max(0, Math.min(100, percent));
  const alpha = 0.25 + (clamped / 100) * 0.55;
  return { baseHex, alpha };
}

/* ---------------- A1 helpers ---------------- */

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
  if (!start) return null;

  const end = b ? a1ToRowCol(b) ?? start : start;

  return {
    rowStart: Math.min(start.row, end.row),
    rowEnd: Math.max(start.row, end.row),
    colStart: Math.min(start.col, end.col),
    colEnd: Math.max(start.col, end.col),
  };
}

export function buildMatrixSvg({
  title,
  customColors = {},
  sheetTitle,
  width,
  height,
  inputMode,
  sheetValues,
  answerRange,
  questionCell,
  backgroundColor,
  textColor,
  matrixRowOrder,
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

  /* --------------------- SUMMARY MODE: READ MATRIX FROM SHEET --------------------- */

  if (inputMode !== "summary") {
    return basicMsg("Matrix ahora solo funciona en modo tabla de resultados.");
  }

  if (!sheetValues || !sheetValues.length) {
    return basicMsg("No hay datos de la hoja.");
  }

  if (!questionCell || !answerRange) {
    return basicMsg("Define celda de pregunta y rango de respuestas.");
  }

  const qPos = a1ToRowCol(questionCell);
  const parsed = parseA1Range(answerRange);

  if (!qPos || !parsed) {
    return basicMsg("Rango o celda inválidos.");
  }

  const { rowStart, rowEnd, colStart, colEnd } = parsed;

  // Headers están en la fila del questionCell, desde colStart..colEnd
  const headerRow = sheetValues[qPos.row - 1] || [];
  const col2Labels: string[] = [];
  for (let c = colStart; c <= colEnd; c++) {
    const v = headerRow[c - 1];
    if (v != null && String(v).trim()) col2Labels.push(String(v).trim());
  }

// Row labels están en la columna anterior a colStart, filas rowStart..rowEnd
const rowOrder: string[] = [];
const matrix: Record<string, Record<string, number>> = {};

for (let r = rowStart; r <= rowEnd; r++) {
  const row = sheetValues[r - 1] || [];
  const rowLabelRaw = row[colStart - 2]; // columna previa
  const rowLabel = rowLabelRaw != null ? String(rowLabelRaw).trim() : "";
  if (!rowLabel) continue;

  rowOrder.push(rowLabel);
  matrix[rowLabel] = {};

  col2Labels.forEach((colLabel, idx) => {
    const cellRaw = row[colStart - 1 + idx];
    matrix[rowLabel][colLabel] = Number(parsePercentToNumber(cellRaw).toFixed(1));
  });
}
const fmtPct = (n: number) => {
  const v = Number.isFinite(n) ? n : 0;
  const s = v.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
};
const safeRowOrder = (matrixRowOrder?.length ? matrixRowOrder : rowOrder)
  .filter((lbl) => matrix[lbl]);

  if (!rowOrder.length || !col2Labels.length) {
    return basicMsg("No se pudo leer la matriz desde el rango.");
  }

  /* ------------------- SVG OUTPUT ------------------- */

  const parts: string[] = [];

  parts.push(
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${bg}" />`
  );

  titleLines.forEach((line, i) => {
    parts.push(
      `<text x="${marginLeft}" y="${titleY + i * (titleFs + 6)}"
        fill="${mainTextColor}" font-size="${titleFs}" font-family="${FONT_STACK}">
        ${esc(line)}
      </text>`
    );
  });

  parts.push(
    `<line x1="${marginLeft}" y1="${lineY}" x2="${W - marginRight}" y2="${lineY}"
      stroke="${mainTextColor}" stroke-width="2"/>`
  );

  const logoX = W - marginRight;
  const logoY0 = marginTop - 24;
  const headerFs = 40;
  const headerLine = headerFs * 1.1;

parts.push(`<g id="chart-content">`);
  const tableTop = lineY + 60;
  const tableBottom = H - marginBottom - 40;
  const tableHeight = tableBottom - tableTop;

  const headerH = 70;
  const rowsH = tableHeight - headerH;
  const rowH = rowsH / safeRowOrder.length;

  const labelColW = 280;
  const dataW = W - marginLeft - marginRight - labelColW;
  const shrinkX = 0.78;
  const PILL_W = (labelColW - 16) * shrinkX; 
  const PILL_GAP = 20; // prueba 12–32
  const cols = col2Labels.length;

// ancho total del grupo de % (header/columnas)
const colsBlockW = cols * PILL_W + (cols - 1) * PILL_GAP;

// ancho total de TODA la matriz (label + gap + columnas)
const fullBlockW = PILL_W + PILL_GAP + colsBlockW;

// centrado en el canvas (entre margins)
const contentLeft = marginLeft;
const contentW = W - marginLeft - marginRight;
const fullLeft = contentLeft + (contentW - fullBlockW) / 2;

// posiciones X finales
const labelPillX = fullLeft;
const blockLeft = labelPillX + PILL_W + PILL_GAP;



  col2Labels.forEach((label, idx) => {
    const rectY = tableTop + 10;
    const rectH = headerH - 20;
const pillX = blockLeft + idx * (PILL_W + PILL_GAP);

    parts.push(
  `<rect x="${pillX}" y="${rectY}" width="${PILL_W}" height="${rectH}"
    rx="12" fill="none"/>`,
  `<text x="${pillX + PILL_W / 2}" y="${rectY + rectH / 2}" fill="${mainTextColor}"
    font-size="20" font-weight="700" text-anchor="middle"
    dominant-baseline="middle" font-family="${FONT_STACK}">
    ${esc(label)}
  </text>`);
  });

  safeRowOrder.forEach((rowLabel, rowIndex) => {
    const y = tableTop + headerH + rowIndex * rowH;

    const rowBg = customColors[rowLabel] ?? ChartConfig.colors.matrix.medium;
    const textLines = wrapMatrixLabel(rowLabel);
const labelW = PILL_W;
const labelX = labelPillX; // <- clave


parts.push(
  `<rect x="${labelX}" y="${y + 6}" width="${labelW}"
    height="${rowH - 12}" rx="10" fill="${rowBg}"/>`
);


    const centerX = labelX + labelW / 2;
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
      const pct = matrix[rowLabel]?.[colLabel] ?? 0;
      const cellPillX = blockLeft + colIndex * (PILL_W + PILL_GAP);

      const { baseHex, alpha } = cellFill(rowLabel, pct, customColors);

      
parts.push(
  `<rect x="${cellPillX}" y="${y + 6}" width="${PILL_W}" height="${rowH - 12}"
    rx="12" fill="${baseHex}" fill-opacity="${alpha}"/>`,
  `<text x="${cellPillX + PILL_W / 2}" y="${y + rowH / 2}"
    fill="${mainTextColor}" font-size="20" font-weight="700"
    text-anchor="middle" dominant-baseline="middle"
    font-family="${FONT_STACK}">
    ${fmtPct(pct)}%
  </text>`
);
    });
  });
parts.push(`</g>`);

  parts.push(`</svg>`);
  return parts.join("\n");
}

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
