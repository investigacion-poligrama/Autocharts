import { ChartConfig } from "@/lib/chartconfig";
import type { ChartSvgArgs } from "@/lib/chart-svgs";

const CANVAS_W = 1920;
const CANVAS_H = 1080;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type WrappedTitle = {
  lines: string[];
  fontSize: number;
  blockHeight: number;
};

function wrapLegendLabel(text: string, maxChars = 14): string[] {
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

function prepareTitle(
  title: string,
  baseFontSize: number,
  maxChars = 115
): WrappedTitle {
  const words = title.split(/\s+/);
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

  let finalLines = lines;
  if (lines.length > 2) {
    finalLines = [lines[0], lines.slice(1).join(" ")];
  }

  const fs = baseFontSize;
  const lineGap = 6;

  const blockHeight =
    finalLines.length * fs + (finalLines.length - 1) * lineGap;

  return { lines: finalLines, fontSize: fs, blockHeight };
}

/* ------------------------------------------------------------------ */
/*   Helpers de color                                                 */
/* ------------------------------------------------------------------ */

const mdKeyFor = (label: string) => {
  const l = label.toLowerCase();
  if (/\bseguro\b/.test(l)) return "primary";
  if (/\binseguro\b/.test(l)) return "danger";
  return "neutral";
};

const mdColorFor = (label: string, customColors?: Record<string, string>) => {
  if (customColors?.[label]) return customColors[label];

  const key = mdKeyFor(label);
  if (key === "primary") return ChartConfig.colors.primary;
  if (key === "danger") return ChartConfig.colors.danger;
  return ChartConfig.colors.neutral;
};

function parsePercentCell(raw: any): number {
  if (raw == null) return 0;
  if (typeof raw === "number") {
    let n = raw;
    if (n > 0 && n <= 1) n = n * 100;
    return n;
  }
  const s = String(raw).trim();
  if (!s) return 0;

  const cleaned = s.replace("%", "").replace(",", ".").trim();
  const n = Number(cleaned);
  if (Number.isNaN(n)) return 0;
  if (n >= 0 && n <= 1) return n * 100;
  return n;
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

/* ------------------------------------------------------------------ */
/*   Builder principal SVG (MediumDonut)                              */
/* ------------------------------------------------------------------ */

export function buildMediumDonutSvg({
  data,
  title,
  customColors = {},
  sheetTitle,
  width,
  height,
  labelOrder,
  inputMode,
  sheetValues,
  answerRange,
  questionCell,
  backgroundColor,
  textColor,
}: ChartSvgArgs): string {
  const W = width ?? CANVAS_W;
  const H = height ?? CANVAS_H;

  const bg = backgroundColor ?? "#000000";
  const mainTextColor = textColor ?? "#ffffff";
  const mutedTextColor = textColor ? textColor : "#bdbdbd";

  const baseTitleFs = ChartConfig.typography.title.fontSize;
  const footerFs = ChartConfig.typography.footer.fontSize;
  const headerFs = 40;
  const headerLine = headerFs * 1.1;

  const isTall1440 = W === 1440 && H === 1800;

  let marginLeft: number;
  let marginRight: number;
  let marginTop: number;
  let marginBottom: number;

  if (isTall1440) {
    marginLeft = 100;
    marginRight = 100;
    marginTop = 170;
    marginBottom = 170;
  } else {
    marginLeft = 90;
    marginRight = 90;
    marginTop = 80;
    marginBottom = 80;
  }

  const titleY = marginTop + 130;
  const maxTitleChars = isTall1440 ? 80 : 115;

  const {
    lines: titleLines,
    fontSize: titleFs,
    blockHeight: titleBlockH,
  } = prepareTitle(title, baseTitleFs, maxTitleChars);

  const lineY = titleY + titleBlockH + 16;

  // datos válidos para la dona
  const safeData = data.filter((d) => (d.percentage ?? 0) > 0);
  if (!safeData.length) {
    return basicMediumDonutMessageSvg(
      "No hay datos para la gráfica.",
      bg,
      mainTextColor
    );
  }

  // orden de filas (labels)
  const orderedLabels: string[] =
    labelOrder && labelOrder.length
      ? labelOrder.filter((l) => safeData.some((d) => d.label === l))
      : safeData.map((d) => d.label);

  /* ------------------------------------------------------------------ */
  /* SUMMARY MODE: tabla comparativa desde sheet (SIN cálculos)         */
  /* ------------------------------------------------------------------ */

  let headers: string[] = [];
  let rowData: Record<string, number[]> = {};

  if (inputMode !== "summary") {
    return basicMediumDonutMessageSvg(
      "Medium Donut ahora solo funciona en modo tabla de resultados.",
      bg,
      mainTextColor
    );
  }

  if (!sheetValues || !sheetValues.length || !questionCell || !answerRange) {
    return basicMediumDonutMessageSvg(
      "Define celda de pregunta y rango de respuestas.",
      bg,
      mainTextColor
    );
  }

  const qPos = a1ToRowCol(questionCell);
  const parsed = parseA1Range(answerRange);

  if (!qPos || !parsed) {
    return basicMediumDonutMessageSvg(
      "Rango o celda inválidos.",
      bg,
      mainTextColor
    );
  }

  const { rowStart, rowEnd, colStart, colEnd } = parsed;

  // headers en la fila de la pregunta, columnas colStart..colEnd
  const headerRow = sheetValues[qPos.row - 1] || [];
  headers = [];
  for (let c = colStart; c <= colEnd; c++) {
    const v = headerRow[c - 1];
    if (v != null && String(v).trim()) headers.push(String(v).trim());
  }

  // row labels en la columna anterior, filas rowStart..rowEnd
  rowData = {};
  orderedLabels.forEach((label) => (rowData[label] = []));

  for (let r = rowStart; r <= rowEnd; r++) {
    const row = sheetValues[r - 1] || [];
    const rowLabelRaw = row[colStart - 2];
    const rowLabel = rowLabelRaw != null ? String(rowLabelRaw).trim() : "";
    if (!rowLabel) continue;

    if (!rowData[rowLabel]) rowData[rowLabel] = [];

    const values: number[] = [];
    for (let c = colStart; c <= colEnd; c++) {
      values.push(Math.round(parsePercentCell(row[c - 1])));
    }
    rowData[rowLabel] = values;
  }

  if (!headers.length) {
    return basicMediumDonutMessageSvg(
      "No se encontraron headers en la tabla.",
      bg,
      mainTextColor
    );
  }

  /* ------------------------------------------------------------------ */
  /* DONA (izquierda)                                                   */
  /* ------------------------------------------------------------------ */

  const legendData = (() => {
    const byLabel = new Map(safeData.map((d) => [d.label, d]));
    const fromOrder = orderedLabels
      .map((label) => byLabel.get(label))
      .filter((x): x is (typeof safeData)[number] => Boolean(x));

    const inOrder = new Set(orderedLabels);
    const leftovers = safeData.filter((d) => !inOrder.has(d.label));

    return [...fromOrder, ...leftovers];
  })();

  const contentTop = lineY + 60;
  const contentBottom = H - marginBottom;
  const leftWidth = isTall1440 ? 520 : 640;
  const gap = isTall1440 ? 40 : 60;

  const rightX0 = marginLeft + leftWidth + gap;
  const rightWidth = W - rightX0 - marginRight;

  const donutCx = marginLeft + leftWidth / 2;
  const donutCy = isTall1440 ? H / 2 - 160 : H / 2;
  const outerR = 140;
  const innerR = 90;

  const totalPerc =
    safeData.reduce((s, d) => s + (d.percentage ?? 0), 0) || 1;
  let currentAngle = -Math.PI / 2;

  const donutPaths: string[] = [];

  safeData.forEach((item) => {
    const pct = item.percentage ?? 0;
    if (pct <= 0) return;

    const angle = (pct / totalPerc) * 2 * Math.PI;
    const start = currentAngle;
    const end = start + angle;
    currentAngle = end;

    const large = angle > Math.PI ? 1 : 0;
    const color = mdColorFor(item.label, customColors);

    const x1 = donutCx + outerR * Math.cos(start);
    const y1 = donutCy + outerR * Math.sin(start);
    const x2 = donutCx + outerR * Math.cos(end);
    const y2 = donutCy + outerR * Math.sin(end);

    const x3 = donutCx + innerR * Math.cos(end);
    const y3 = donutCy + innerR * Math.sin(end);
    const x4 = donutCx + innerR * Math.cos(start);
    const y4 = donutCy + innerR * Math.sin(start);

    const dPath = `
      M ${x1} ${y1}
      A ${outerR} ${outerR} 0 ${large} 1 ${x2} ${y2}
      L ${x3} ${y3}
      A ${innerR} ${innerR} 0 ${large} 0 ${x4} ${y4}
      Z
    `;

    donutPaths.push(
      `<path d="${dPath}" fill="${color}" stroke="${color}" stroke-width="3" />`
    );
  });

  /* ------------------------------------------------------------------ */
  /* LEYENDA                                                            */
  /* ------------------------------------------------------------------ */

  const legendTop = donutCy + outerR + (isTall1440 ? 40 : 90);
  const legendItems = legendData;

  const legendCols = isTall1440
    ? 1
    : legendItems.length <= 4
    ? legendItems.length
    : Math.ceil(legendItems.length / 2);

  const legendColWidth = leftWidth / Math.max(legendCols, 1);
  const legendRowHeight = 100;

  const legendPills: string[] = [];

  legendItems.forEach((it, idx) => {
    const colIdx = idx % legendCols;
    const rowIdx = Math.floor(idx / legendCols);

    const x =
      marginLeft + colIdx * legendColWidth + legendColWidth / 2;
    const y = legendTop + rowIdx * legendRowHeight;

    const pillBg = mdColorFor(it.label, customColors);
    const pillTextColor = "#ffffff";

    const lines = wrapLegendLabel(it.label, 28);
    const fsLabel = lines.length === 2 ? 13 : 18;
    const fsPct = 20;

    const line1Y = y - 10;
    const line2Y = line1Y + fsLabel + 2;
    const pctY = y + 18;

    const rectH = 70;

    legendPills.push(
      `<rect x="${x - legendColWidth / 2 + 4}"
         y="${y - rectH / 2}"
         width="${legendColWidth - 8}"
         height="${rectH}"
         rx="12" ry="12"
         fill="${pillBg}" />`,
      `<text x="${x}" y="${line1Y}"
         fill="${pillTextColor}"
         font-weight="700"
         font-family="Helvetica, Arial, sans-serif"
         font-size="${fsLabel}"
         text-anchor="middle">
         ${esc(lines[0])}
       </text>`,
      lines.length > 1
        ? `<text x="${x}" y="${line2Y}"
             fill="${pillTextColor}"
             font-weight="700"
             font-family="Helvetica, Arial, sans-serif"
             font-size="${fsLabel}"
             text-anchor="middle">
             ${esc(lines[1] ?? "")}
           </text>`
        : "",
      `<text x="${x}" y="${pctY}"
         fill="${pillTextColor}"
         font-weight="700"
         font-family="Helvetica, Arial, sans-serif"
         font-size="${fsPct}"
         text-anchor="middle">
         ${it.percentage}%
       </text>`
    );
  });

  /* ------------------------------------------------------------------ */
  /* TABLA DERECHA                                                      */
  /* ------------------------------------------------------------------ */

  const tableTop = contentTop;
  const headerHeight = 60;
  const tableBottom = contentBottom - 40;
  const tableHeight = tableBottom - tableTop;

  const tableBodyY = tableTop + headerHeight;

  const labels = orderedLabels;
  const rowsCount = labels.length || 1;
  const rowHeight = Math.max(40, (tableHeight - headerHeight) / rowsCount);

  const labelColWidth = isTall1440 ? 190 : 260;
  const nCols = headers.length;
  const colWidth = (rightWidth - labelColWidth) / Math.max(nCols, 1);

  const tableParts: string[] = [];

  // Encabezados
  headers.forEach((h, idx) => {
    const x = rightX0 + labelColWidth + idx * colWidth;
    const rectY = tableTop + 8;
    const rectH = headerHeight - 16;

    tableParts.push(
      `<rect x="${x + 4}" y="${rectY}" width="${colWidth - 8}" height="${rectH}" rx="12" ry="12" fill="${ChartConfig.colors.white}" />`,
      `<text x="${x + colWidth / 2}" y="${rectY + rectH / 2}"
        fill="${ChartConfig.colors.black}" font-family="Helvetica, Arial, sans-serif"
        font-size="20" font-weight="700" text-anchor="middle" dominant-baseline="middle">
        ${esc(h)}
      </text>`
    );
  });

  // Filas
  labels.forEach((label, rowIdx) => {
    const y = tableBodyY + rowIdx * rowHeight;
    const pillBg = mdColorFor(label, customColors);
    const pillTextColor = "#ffffff";

    const labelLines = wrapLegendLabel(label, 18);
    const labelFs = 18;
    const lineGap = 2;

    const rectY = y + 6;
    const rectH = rowHeight - 12;
    const centerX = rightX0 + (labelColWidth - 16) / 2;
    const centerY = rectY + rectH / 2;

    const line1Y =
      labelLines.length === 1
        ? centerY
        : centerY - labelFs / 2 - lineGap / 2;
    const line2Y = line1Y + labelFs + lineGap;

    tableParts.push(
      `<rect x="${rightX0}" y="${rectY}" width="${labelColWidth - 16}"
        height="${rectH}" rx="12" ry="12" fill="${pillBg}" />`,
      `<text x="${centerX}" y="${line1Y}"
        fill="${pillTextColor}" font-weight="700"
        font-family="Helvetica, Arial, sans-serif" font-size="${labelFs}" text-anchor="middle">
        ${esc(labelLines[0])}
      </text>`,
      labelLines.length > 1
        ? `<text x="${centerX}" y="${line2Y}"
            fill="${pillTextColor}" font-family="Helvetica, Arial, sans-serif"
            font-weight="700" font-size="${labelFs}" text-anchor="middle">
            ${esc(labelLines[1])}
          </text>`
        : ""
    );

    const values = rowData[label] ?? [];

    values.forEach((val, idx) => {
      const cellX = rightX0 + labelColWidth + idx * colWidth;

      tableParts.push(
        `<rect x="${cellX + 4}" y="${y + 6}" width="${colWidth - 8}"
          height="${rowHeight - 12}" rx="12" ry="12" fill="${pillBg}" />`,
        `<text x="${cellX + colWidth / 2}" y="${y + rowHeight / 2}"
          fill="${pillTextColor}" font-family="Helvetica, Arial, sans-serif"
          font-size="20" font-weight="700" text-anchor="middle"
          dominant-baseline="middle">
          ${val}%
        </text>`
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /* SVG Output                                                         */
  /* ------------------------------------------------------------------ */

  const parts: string[] = [];

  parts.push(
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${bg}" />`
  );

  const titleLineGap = 6;
  titleLines.forEach((line, idx) => {
    const y = titleY + idx * (titleFs + titleLineGap);
    parts.push(
      `<text x="${marginLeft}" y="${y}" fill="${mainTextColor}" font-family="Helvetica, Arial, sans-serif" font-size="${titleFs}">${esc(
        line
      )}</text>`
    );
  });

  parts.push(
    `<line x1="${marginLeft}" y1="${lineY}" x2="${W - marginRight}" y2="${lineY}" stroke="${mainTextColor}" stroke-width="2" />`
  );

  const logoX = W - marginRight;
  const logoY0 = marginTop - 24;

  if (sheetTitle) {
    parts.push(
      `<text x="${marginLeft}" y="${logoY0}"
        fill="${mainTextColor}" font-family="Helvetica, Arial, sans-serif"
        font-size="30" text-anchor="start">${esc(sheetTitle)}</text>`
    );
  }

  parts.push(
    `<text x="${logoX}" y="${logoY0}" fill="${mainTextColor}" font-family="Helvetica, Arial, sans-serif" font-size="${headerFs}" font-weight="700" text-anchor="end">Poligrama.</text>`,
    `<text x="${logoX}" y="${
      logoY0 + headerLine
    }" fill="${mainTextColor}" font-family="Helvetica, Arial, sans-serif" font-size="${headerFs}" font-weight="700" text-anchor="end">Poder.</text>`,
    `<text x="${logoX}" y="${
      logoY0 + headerLine * 2
    }" fill="${mainTextColor}" font-family="Helvetica, Arial, sans-serif" font-size="${headerFs}" font-weight="700" text-anchor="end">Ganar.</text>`
  );

  parts.push(`<g>`, ...donutPaths, `</g>`);
  parts.push(`<g>`, ...legendPills, `</g>`);
  parts.push(`<g>`, ...tableParts, `</g>`);

  parts.push(
    `<text x="${W - marginRight}" y="${H - marginBottom}" fill="${mutedTextColor}" font-family="Helvetica, Arial, sans-serif" font-size="${footerFs}" text-anchor="end">${esc(
      ChartConfig.footer
    )}</text>`
  );

  parts.push(`</svg>`);
  return parts.join("\n");
}

function basicMediumDonutMessageSvg(
  message: string,
  bg: string,
  textColor: string
): string {
  const W = CANVAS_W;
  const H = CANVAS_H;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${bg}" />`,
    `<text x="${W / 2}" y="${H / 2}" fill="${textColor}" font-family="Helvetica, Arial, sans-serif" font-size="24" text-anchor="middle" dominant-baseline="middle">${esc(
      message
    )}</text>`,
    `</svg>`,
  ].join("\n");
}
