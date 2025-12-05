import { ChartConfig } from "@/lib/chartconfig";
import type { ChartSvgArgs } from "@/lib/chart-svgs";
import type { DatasetColumn } from "@/app/page";

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
  const MAX_CHARS = maxChars;

  const words = title.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const w of words) {
    const test = current ? current + " " + w : w;
    if (test.length > MAX_CHARS && current) {
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

const mdColorFor = (
  label: string,
  customColors?: Record<string, string>
) => {
  if (customColors?.[label]) return customColors[label];

  const key = mdKeyFor(label);
  if (key === "primary") return ChartConfig.colors.primary;
  if (key === "danger") return ChartConfig.colors.danger;
  return ChartConfig.colors.neutral;
};

/* ------------------------------------------------------------------ */
/*   Modo RAW: comparativa con microdatos                             */
/* ------------------------------------------------------------------ */

function extractComparativeDataOrdered(
  mainColumn: string,
  secondColumn: string,
  columns: DatasetColumn[],
  orderedLabels: string[]
) {
  const col1 = columns.find((c) => c.name === mainColumn);
  const col2 = columns.find((c) => c.name === secondColumn);

  if (!col1 || !col2) {
    return { headers: ["Total"], rowData: {} as Record<string, number[]> };
  }

  const uniqueGroups = Array.from(new Set(col2.values)).filter(Boolean);
  // headers internos: ["Total", ...grupos]
  const headers = ["Total", ...uniqueGroups];

  const rowData: Record<string, number[]> = {};
  orderedLabels.forEach((label) => (rowData[label] = []));

  // Total municipal
  const mainCounts: Record<string, number> = {};
  let mainTotal = 0;
  col1.values.forEach((v) => {
    if (!v) return;
    if (!Object.prototype.hasOwnProperty.call(rowData, v)) return;
    mainCounts[v] = (mainCounts[v] || 0) + 1;
    mainTotal++;
  });

  orderedLabels.forEach((label) => {
    const c = mainCounts[label] || 0;
    rowData[label].push(
      mainTotal > 0 ? Math.round((c / mainTotal) * 100) : 0
    );
  });

  // Grupos
  uniqueGroups.forEach((g) => {
    const groupCounts: Record<string, number> = {};
    let groupTotal = 0;
    col1.values.forEach((v1, i) => {
      const v2 = col2.values[i];
      if (v2 !== g) return;
      if (!v1) return;
      if (!Object.prototype.hasOwnProperty.call(rowData, v1)) return;
      groupCounts[v1] = (groupCounts[v1] || 0) + 1;
      groupTotal++;
    });

    orderedLabels.forEach((label) => {
      const c = groupCounts[label] || 0;
      rowData[label].push(
        groupTotal > 0 ? Math.round((c / groupTotal) * 100) : 0
      );
    });
  });

  return { headers, rowData };
}

/* ------------------------------------------------------------------ */
/*   Helpers para SUMMARY: leer segunda pregunta desde la hoja        */
/* ------------------------------------------------------------------ */

function a1ToRowCol(a1: string) {
  const match = a1.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) {
    throw new Error(`Referencia A1 inválida: ${a1}`);
  }
  const [, colLetters, rowStr] = match;
  let col = 0;
  for (const ch of colLetters) {
    col = col * 26 + (ch.charCodeAt(0) - 64); // A=1, B=2...
  }
  const row = parseInt(rowStr, 10);
  if (!row || row < 1) {
    throw new Error(`Fila inválida en referencia A1: ${a1}`);
  }
  return { row, col }; // 1-based
}

function parseA1Range(range: string) {
  const [startStr, endStr] = range.split(":");
  const start = a1ToRowCol(startStr);
  const end = endStr ? a1ToRowCol(endStr) : start;

  return {
    rowStart: Math.min(start.row, end.row),
    rowEnd: Math.max(start.row, end.row),
    colStart: Math.min(start.col, end.col),
    colEnd: Math.max(start.col, end.col),
  };
}

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

/**
 * Lee la tabla de resultados de la segunda pregunta a partir de
 * `sheetValues` + `secondAnswerRange`. Se asume formato:
 *   [etiqueta, porcentaje]
 */
function buildSecondQuestionSummaryFromRange(
  sheetValues: any[][],
  secondAnswerRange: string
): { headers: string[]; percents: number[] } {
  if (!secondAnswerRange.trim() || !sheetValues.length) {
    return { headers: [], percents: [] };
  }

  let parsed;
  try {
    parsed = parseA1Range(secondAnswerRange.trim());
  } catch {
    return { headers: [], percents: [] };
  }

  const { rowStart, rowEnd, colStart } = parsed;
  if (rowEnd < rowStart) return { headers: [], percents: [] };

  const headers: string[] = [];
  const percents: number[] = [];

  for (let r = rowStart; r <= rowEnd; r++) {
    const row = sheetValues[r - 1] || [];
    const rawLabel = row[colStart - 1];
    const rawPercent = row[colStart]; // segunda col del rango

    const label = rawLabel != null ? String(rawLabel).trim() : "";
    if (!label) continue;

    const p = parsePercentCell(rawPercent);
    headers.push(label);
    percents.push(p);
  }

  return { headers, percents };
}

/* ------------------------------------------------------------------ */
/*   Builder principal SVG (MediumDonut)                              */
/* ------------------------------------------------------------------ */

export function buildMediumDonutSvg({
  data,
  title,
  secondColumn,
  columns,
  customColors = {},
  sheetTitle,
  width,
  height,
  labelOrder,
  inputMode,
  sheetValues,
  secondAnswerRange,
}: ChartSvgArgs): string {
  const W = width ?? CANVAS_W;
  const H = height ?? CANVAS_H;
  const bg = "#000000";

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
    return basicMediumDonutMessageSvg("No hay datos para la gráfica.");
  }

  // orden de filas (labels)
  const orderedLabels: string[] =
    labelOrder && labelOrder.length
      ? labelOrder.filter((l) => safeData.some((d) => d.label === l))
      : safeData.map((d) => d.label);

  // ------------------------ headers + rowData ------------------------

  let headers: string[] = [];
  let rowData: Record<string, number[]> = {};

  if (inputMode === "raw") {
    // modo base de datos → usa columnas de microdatos
    if (!columns || !secondColumn) {
      return basicMediumDonutMessageSvg(
        "Debes seleccionar la segunda columna para la comparativa"
      );
    }

    ({ headers, rowData } = extractComparativeDataOrdered(
      title,
      secondColumn,
      columns,
      orderedLabels
    ));
  } else {
    // modo tabla de resultados: usamos data (P1) y la tabla de % de la segunda pregunta
    const rowPercents: Record<string, number> = {};
    safeData.forEach((d) => {
      rowPercents[d.label] = d.percentage ?? 0;
    });

    let colHeaders: string[] = [];
    let colPercents: number[] = [];

    if (sheetValues && secondAnswerRange) {
      const summary = buildSecondQuestionSummaryFromRange(
        sheetValues,
        secondAnswerRange
      );
      colHeaders = summary.headers;
      colPercents = summary.percents;
    }

    if (!colHeaders.length) {
      // fallback: sólo columna Total (como antes)
      headers = ["Total"];
      rowData = {};
      orderedLabels.forEach((label) => {
        const p1 = rowPercents[label] ?? 0;
        rowData[label] = [Math.round(p1)];
      });
    } else {
      // columnas = grupos de segunda pregunta + Total
      headers = [...colHeaders, "Total"];
      rowData = {};

      orderedLabels.forEach((label) => {
        const p1 = rowPercents[label] ?? 0;
        const row: number[] = [];

        colPercents.forEach((p2) => {
          const joint = (p1 * p2) / 100;
          row.push(Math.round(joint));
        });

        row.push(Math.round(p1)); // última columna = Total
        rowData[label] = row;
      });
    }
  }

  // datos para leyenda en el MISMO orden que la dona
  const legendData = (() => {
    const byLabel = new Map(safeData.map((d) => [d.label, d]));

    const fromOrder = orderedLabels
      .map((label) => byLabel.get(label))
      .filter((x): x is (typeof safeData)[number] => Boolean(x));

    const inOrder = new Set(orderedLabels);
    const leftovers = safeData.filter((d) => !inOrder.has(d.label));

    return [...fromOrder, ...leftovers];
  })();

  // ---- Layout general: izquierda (dona+leyenda) / derecha (tabla) ----

  const contentTop = lineY + 60;
  const contentBottom = H - marginBottom;
  const leftWidth = isTall1440 ? 520 : 640;
  const gap = isTall1440 ? 40 : 60;

  const rightX0 = marginLeft + leftWidth + gap;
  const rightWidth = W - rightX0 - marginRight;

  /* -------------------- DONA -------------------- */

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
      `<path d="${dPath}" fill="${color}" stroke="#000000" stroke-width="3" />`
    );
  });

  /* -------------------- LEYENDA -------------------- */

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

    const bg = mdColorFor(it.label, customColors);
    const textColor = ChartConfig.colors.white;

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
         fill="${bg}" />`,
      `<text x="${x}" y="${line1Y}"
         fill="${textColor}"
         font-weight="700"
         font-family="Helvetica, Arial, sans-serif"
         font-size="${fsLabel}"
         text-anchor="middle">
         ${esc(lines[0])}
       </text>`,
      lines.length > 1
        ? `<text x="${x}" y="${line2Y}"
             fill="${textColor}"
             font-weight="700"
             font-family="Helvetica, Arial, sans-serif"
             font-size="${fsLabel}"
             text-anchor="middle">
             ${esc(lines[1] ?? "")}
           </text>`
        : "",
      `<text x="${x}" y="${pctY}"
         fill="${textColor}"
         font-weight="700"
         font-family="Helvetica, Arial, sans-serif"
         font-size="${fsPct}"
         text-anchor="middle">
         ${it.percentage}%
       </text>`
    );
  });

  /* -------------------- TABLA (columna derecha) -------------------- */

  const tableTop = contentTop;
  const headerHeight = 60;
  const tableBottom = contentBottom - 40;
  const tableHeight = tableBottom - tableTop;

  const tableBodyY = tableTop + headerHeight;

  const labels = orderedLabels;
  const rowsCount = labels.length || 1;
  const rowHeight = Math.max(
    40,
    (tableHeight - headerHeight) / rowsCount
  );

  const labelColWidth = isTall1440 ? 190 : 260;

  // headers visibles: en raw usamos headers internos ["Total", grp1, grp2...]
  // pero queremos mostrar [grp1, grp2..., "Total"].
  let headerLabels: string[] = [];
  if (inputMode === "raw") {
    if (headers.length === 0) {
      headerLabels = ["Total"];
    } else {
      const [total, ...groups] = headers;
      headerLabels = [...groups, total];
    }
  } else {
    headerLabels = headers.length ? headers : ["Total"];
  }

  const nCols = headerLabels.length;
  const colWidth = (rightWidth - labelColWidth) / Math.max(nCols, 1);

  const tableParts: string[] = [];

  // Encabezados
  headerLabels.forEach((h, idx) => {
    const x = rightX0 + labelColWidth + idx * colWidth;
    const rectY = tableTop + 8;
    const rectH = headerHeight - 16;

    tableParts.push(
      `<rect x="${x + 4}" y="${rectY}" width="${
        colWidth - 8
      }" height="${rectH}" rx="12" ry="12" fill="${
        ChartConfig.colors.white
      }" />`,
      `<text x="${
        x + colWidth / 2
      }" y="${
        rectY + rectH / 2
      }" fill="${ChartConfig.colors.black}" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="700" text-anchor="middle" dominant-baseline="middle">${esc(
        h
      )}</text>`
    );
  });

  // Filas
  labels.forEach((label, rowIdx) => {
    const y = tableBodyY + rowIdx * rowHeight;
    const bg = mdColorFor(label, customColors);
    const pillTextColor = ChartConfig.colors.white;

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
      `<rect x="${rightX0}" y="${rectY}" width="${
        labelColWidth - 16
      }" height="${rectH}" rx="12" ry="12" fill="${bg}" />`,
      `<text x="${centerX}" y="${line1Y}"
             fill="${pillTextColor}"
             font-weight="700"
             font-family="Helvetica, Arial, sans-serif"
             font-size="${labelFs}"
             text-anchor="middle">
             ${esc(labelLines[0])}
       </text>`,
      labelLines.length > 1
        ? `<text x="${centerX}" y="${line2Y}"
                 fill="${pillTextColor}"
                 font-family="Helvetica, Arial, sans-serif"
                 font-weight="700"
                 font-size="${labelFs}"
                 text-anchor="middle">
                 ${esc(labelLines[1])}
           </text>`
        : ""
    );

    const rawValues = rowData[label] ?? [];
    let displayValues: number[];

    if (inputMode === "raw") {
      // [Total, g1, g2...] → [g1, g2..., Total]
      if (rawValues.length === 0) {
        displayValues = [];
      } else {
        const [total, ...groups] = rawValues;
        displayValues = [...groups, total];
      }
    } else {
      displayValues = rawValues;
    }

    displayValues.forEach((val, idx) => {
      const cellX = rightX0 + labelColWidth + idx * colWidth;

      tableParts.push(
        `<rect x="${cellX + 4}" y="${
          y + 6
        }" width="${colWidth - 8}" height="${
          rowHeight - 12
        }" rx="12" ry="12" fill="${bg}" />`,
        `<text x="${
          cellX + colWidth / 2
        }" y="${
          y + rowHeight / 2
        }" fill="${pillTextColor}"
           font-family="Helvetica, Arial, sans-serif"
           font-size="20"
           font-weight="700"
           text-anchor="middle"
           dominant-baseline="middle">
           ${val}%
        </text>`
      );
    });
  });

  /* -------------------- COMPOSICIÓN GENERAL -------------------- */

  const parts: string[] = [];

  parts.push(
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${bg}" />`
  );

  // Título
  const titleLineGap = 6;
  titleLines.forEach((line, idx) => {
    const y = titleY + idx * (titleFs + titleLineGap);
    parts.push(
      `<text x="${marginLeft}" y="${y}" fill="#ffffff" font-family="Helvetica, Arial, sans-serif" font-size="${titleFs}">${esc(
        line
      )}</text>`
    );
  });

  // Línea
  parts.push(
    `<line x1="${marginLeft}" y1="${lineY}" x2="${
      W - marginRight
    }" y2="${lineY}" stroke="#ffffff" stroke-width="2" />`
  );

  // Poligrama / Poder. / Ganar.
  const logoX = W - marginRight;
  const logoY0 = marginTop - 24;

  if (sheetTitle) {
    parts.push(
      `<text x="${marginLeft}" y="${logoY0}"
             fill="#ffffff"
             font-family="Helvetica, Arial, sans-serif"
             font-size="30"
             text-anchor="start">
        ${esc(sheetTitle)}
       </text>`
    );
  }

  parts.push(
    `<text x="${logoX}" y="${logoY0}" fill="#ffffff" font-family="Helvetica, Arial, sans-serif" font-size="${headerFs}" font-weight="700" text-anchor="end">Poligrama.</text>`,
    `<text x="${logoX}" y="${
      logoY0 + headerLine
    }" fill="#ffffff" font-family="Helvetica, Arial, sans-serif" font-size="${headerFs}" font-weight="700" text-anchor="end">Poder.</text>`,
    `<text x="${logoX}" y="${
      logoY0 + headerLine * 2
    }" fill="#ffffff" font-family="Helvetica, Arial, sans-serif" font-size="${headerFs}" font-weight="700" text-anchor="end">Ganar.</text>`
  );

  // Dona
  parts.push(`<g>`, ...donutPaths, `</g>`);

  // Leyenda
  parts.push(`<g>`, ...legendPills, `</g>`);

  // Tabla
  parts.push(`<g>`, ...tableParts, `</g>`);

  // Footer
  parts.push(
    `<text x="${W - marginRight}" y="${H - marginBottom}" fill="#bdbdbd" font-family="Helvetica, Arial, sans-serif" font-size="${footerFs}" text-anchor="end">${esc(
      ChartConfig.footer
    )}</text>`
  );

  parts.push(`</svg>`);

  return parts.join("\n");
}

/* ------------------------------------------------------------------ */
/*   Mensaje básico si faltan datos                                   */
/* ------------------------------------------------------------------ */

function basicMediumDonutMessageSvg(message: string): string {
  const W = CANVAS_W;
  const H = CANVAS_H;
  const bg = "#000000";

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${bg}" />`,
    `<text x="${W / 2}" y="${H / 2}" fill="#ffffff" font-family="Helvetica, Arial, sans-serif" font-size="24" text-anchor="middle" dominant-baseline="middle">${esc(
      message
    )}</text>`,
    `</svg>`,
  ].join("\n");
}
