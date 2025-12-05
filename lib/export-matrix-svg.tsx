import { ChartConfig } from "@/lib/chartconfig";
import type { ChartSvgArgs } from "@/lib/chart-svgs";

const CANVAS_W = 1920;
const CANVAS_H = 1080;

const esc = (s?: string | null) =>
  (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// ---------------- LABEL WRAPPER ----------------

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

  if (lines.length > 2) {
    return [lines[0], lines.slice(1).join(" ")];
  }
  return lines;
}

// ---------------- PARSER % ----------------

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

// ---------------- TITLES ----------------

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
  if (lines.length > 2) lines.splice(2, lines.length - 2);

  const fs = baseFontSize;
  const gap = 6;

  return {
    lines,
    fontSize: fs,
    blockHeight: lines.length * fs + (lines.length - 1) * gap,
  };
}

// ---------------- TABLE COLOR ----------------

function cellFill(rowLabel: string, percent: number, customColors?: Record<string, string>) {
  const fallback = ChartConfig.colors.matrix.light;
  const baseHex = customColors?.[rowLabel] ?? fallback;
  const clamped = Math.max(0, Math.min(100, percent));
  const alpha = 0.25 + (clamped / 100) * 0.55;
  return { baseHex, alpha };
}

// ---------------- A1 HELPERS ----------------

function a1ToRowCol(a1: string) {
  const match = a1.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) throw new Error(`Referencia A1 inválida: ${a1}`);

  const [, colLetters, rowStr] = match;

  let col = 0;
  for (const ch of colLetters) col = col * 26 + (ch.charCodeAt(0) - 64);

  return { row: Number(rowStr), col };
}

function parseA1Range(range: string) {
  const [a, b] = range.split(":");
  const start = a1ToRowCol(a);
  const end = b ? a1ToRowCol(b) : start;

  return {
    rowStart: Math.min(start.row, end.row),
    rowEnd: Math.max(start.row, end.row),
    colStart: Math.min(start.col, end.col),
    colEnd: Math.max(start.col, end.col),
  };
}

// ---------------- MAIN MATRIX EXPORT ----------------

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
}: ChartSvgArgs): string {
  const W = width ?? CANVAS_W;
  const H = height ?? CANVAS_H;

  const bg = "#000";
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

  // -------------------------------------------
  // MATRIZ DATA
  // -------------------------------------------

  let rowOrder: string[] = [];
  let col2Labels: string[] = [];
  let matrix: Record<string, Record<string, number>> = {};

  // -------- SUMMARY MODE (TABLE OF RESULTS) --------

  if (inputMode === "summary") {
    if (!sheetValues || !secondAnswerRange) {
      return basicMessageSvg("Define el rango de la segunda pregunta");
    }

    // Primera pregunta → ya viene procesada como "data"
    rowOrder = data.map((d) => d.label);
    const rowPerc = Object.fromEntries(data.map((d) => [d.label, d.percentage]));

    // Segunda pregunta desde sheetValues + secondAnswerRange
    let { rowStart, rowEnd, colStart, colEnd } = parseA1Range(secondAnswerRange);

    if (colEnd < colStart + 1)
      return basicMessageSvg("El rango debe tener dos columnas");

    const colLabels: string[] = [];
    const colPerc: number[] = [];

    for (let r = rowStart; r <= rowEnd; r++) {
      const row = sheetValues[r - 1] || [];
      const label = row[colStart - 1];
      const pct = row[colStart];

      if (!label) continue;
      colLabels.push(String(label));
      colPerc.push(parsePercentToNumber(pct));
    }

    col2Labels = colLabels;

    // Construcción de la matriz
    matrix = {};
    rowOrder.forEach((rl) => {
      matrix[rl] = {};
      col2Labels.forEach((cl, idx) => {
        matrix[rl][cl] = Math.round((rowPerc[rl] * colPerc[idx]) / 100);
      });
    });
  }

  // -------- RAW MODE (COLUMN CROSS TAB) --------

  if (inputMode === "raw") {
    const col1 = columns?.find((c) => c.name === title);
    const col2 = columns?.find((c) => c.name === secondColumn);

    if (!col1 || !col2) {
      return basicMessageSvg("Select both columns to generate matrix");
    }

    rowOrder = data.map((r) => r.label);
    col2Labels = Array.from(new Set(col2.values)).filter(Boolean);

    // Init matrix
    matrix = {};
    rowOrder.forEach((r) => {
      matrix[r] = {};
      col2Labels.forEach((c) => (matrix[r][c] = 0));
    });

    col1.values.forEach((v1, i) => {
      const v2 = col2.values[i];
      if (!v1 || !v2) return;
      if (matrix[v1] && matrix[v1][v2] != null) matrix[v1][v2]++;
    });

    // Convert to %
    rowOrder.forEach((r) => {
      const total = Object.values(matrix[r]).reduce((a, b) => a + b, 0);
      col2Labels.forEach((c) => {
        matrix[r][c] =
          total > 0 ? Math.round((matrix[r][c] / total) * 100) : 0;
      });
    });
  }

  // -------------------------------------------
  // START SVG BUILD
  // -------------------------------------------

  const parts: string[] = [];

  parts.push(
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${bg}" />`
  );

  // Title
  titleLines.forEach((line, i) => {
    parts.push(
      `<text x="${marginLeft}" y="${titleY + i * (titleFs + 6)}" fill="#fff" font-size="${titleFs}" font-family="Helvetica" >${esc(
        line
      )}</text>`
    );
  });

  // Divider
  parts.push(
    `<line x1="${marginLeft}" y1="${lineY}" x2="${W - marginRight}" y2="${lineY}" stroke="#fff" stroke-width="2"/>`
  );

    // Línea
  parts.push(
    `<line x1="${marginLeft}" y1="${lineY}" x2="${
      W - marginRight
    }" y2="${lineY}" stroke="#ffffff" stroke-width="2" />`
  );

  // --------- HEADER: nombre de hoja + Poligrama / Poder / Ganar ---------
  const logoX = W - marginRight;
  const logoY0 = marginTop - 24;
  const headerFs = 40;
  const headerLine = headerFs * 1.1;

  if (sheetTitle) {
    // pequeño ajuste para el canvas alto 1440×1800
    let sheetTitleY = logoY0 + 40;
    if (W === 1440 && H === 1800) {
      sheetTitleY = logoY0 + 60;
    }

    parts.push(
      `<text x="${marginLeft}" y="${sheetTitleY}"
             fill="#ffffff"
             font-family="Helvetica, Arial, sans-serif"
             font-size="30"
             text-anchor="start">
        ${esc(sheetTitle)}
       </text>`
    );
  }

  parts.push(
    `<text x="${logoX}" y="${logoY0}" fill="#ffffff"
            font-family="Helvetica, Arial, sans-serif"
            font-size="${headerFs}" font-weight="700"
            text-anchor="end">Poligrama.</text>`,
    `<text x="${logoX}" y="${
      logoY0 + headerLine
    }" fill="#ffffff"
            font-family="Helvetica, Arial, sans-serif"
            font-size="${headerFs}" font-weight="700"
            text-anchor="end">Poder.</text>`,
    `<text x="${logoX}" y="${
      logoY0 + headerLine * 2
    }" fill="#ffffff"
            font-family="Helvetica, Arial, sans-serif"
            font-size="${headerFs}" font-weight="700"
            text-anchor="end">Ganar.</text>`
  );


  // Headers & layout
  const tableTop = lineY + 60;
  const tableBottom = H - marginBottom - 40;
  const tableHeight = tableBottom - tableTop;

  const headerH = 70;
  const rowsH = tableHeight - headerH;
  const rowH = rowsH / rowOrder.length;

  const labelColW = 280;
  const dataW = W - marginLeft - marginRight - labelColW;
  const colW = dataW / col2Labels.length;

  // Column headers
  col2Labels.forEach((label, idx) => {
    const x = marginLeft + labelColW + idx * colW;
    const rectY = tableTop + 10;
    const rectH = headerH - 20;

    parts.push(
      `<rect x="${x + 4}" y="${rectY}" width="${colW - 8}" height="${rectH}" rx="12" fill="${customColors[label] ?? "#fff"}" />`,
      `<text x="${x + colW / 2}" y="${
        rectY + rectH / 2
      }" fill="#000" font-size="20" font-weight="700" text-anchor="middle" dominant-baseline="middle">${esc(
        label
      )}</text>`
    );
  });

  // Rows
  rowOrder.forEach((rowLabel, rowIndex) => {
    const y = tableTop + headerH + rowIndex * rowH;

    const bg = customColors[rowLabel] ?? ChartConfig.colors.matrix.medium;

    const textLines = wrapMatrixLabel(rowLabel);

    parts.push(
      `<rect x="${marginLeft}" y="${y + 6}" width="${
        labelColW - 16
      }" height="${rowH - 12}" rx="10" fill="${bg}"/>`
    );

    const centerX = marginLeft + (labelColW - 16) / 2;
    const centerY = y + rowH / 2;

    if (textLines.length === 1) {
      parts.push(
        `<text x="${centerX}" y="${centerY}" fill="#fff" text-anchor="middle" font-size="20" dominant-baseline="middle">${esc(
          textLines[0]
        )}</text>`
      );
    } else {
      parts.push(
        `<text x="${centerX}" y="${
          centerY - 12
        }" fill="#fff" text-anchor="middle" font-size="20">${esc(
          textLines[0]
        )}</text>`,
        `<text x="${centerX}" y="${
          centerY + 12
        }" fill="#fff" text-anchor="middle" font-size="20">${esc(
          textLines[1]
        )}</text>`
      );
    }

    col2Labels.forEach((colLabel, colIndex) => {
      const cellX = marginLeft + labelColW + colIndex * colW;
      const pct = matrix[rowLabel][colLabel] ?? 0;

      const { baseHex, alpha } = cellFill(rowLabel, pct, customColors);

      parts.push(
        `<rect x="${cellX + 4}" y="${y + 6}" width="${
          colW - 8
        }" height="${rowH - 12}" rx="12" fill="${baseHex}" fill-opacity="${alpha}"/>`,
        `<text x="${cellX + colW / 2}" y="${
          y + rowH / 2
        }" fill="#fff" font-size="20" font-weight="700" text-anchor="middle" dominant-baseline="middle">${pct}%</text>`
      );
    });
  });

  // Footer
  parts.push(
    `<text x="${W - marginRight}" y="${H - marginBottom}" fill="#bdbdbd" font-size="${footerFs}" text-anchor="end">${esc(
      ChartConfig.footer
    )}</text>`
  );

  parts.push(`</svg>`);

  return parts.join("\n");
}

// ---------------- BASIC MSG SVG ----------------

function basicMessageSvg(message: string) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}">
      <rect width="100%" height="100%" fill="#000"/>
      <text x="${CANVAS_W / 2}" y="${CANVAS_H / 2}" fill="#fff" font-size="26" text-anchor="middle">${message}</text>
    </svg>
  `;
}
