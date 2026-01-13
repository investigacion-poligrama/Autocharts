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
  const blockHeight = finalLines.length * fs + (finalLines.length - 1) * lineGap;

  return { lines: finalLines, fontSize: fs, blockHeight };
}

function a1ToRowColSummary(a1: string) {
  const match = a1.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) throw new Error(`Referencia A1 inválida: ${a1}`);

  const [, colLetters, rowStr] = match;
  let col = 0;
  for (const ch of colLetters) col = col * 26 + (ch.charCodeAt(0) - 64);

  const row = parseInt(rowStr, 10);
  if (!row || row < 1) throw new Error(`Fila inválida en referencia A1: ${a1}`);

  return { row, col };
}

function isColorLight(hex: string) {
  const c = hex.replace("#", "");
  const rgb = c.length === 3
    ? c.split("").map((x) => parseInt(x + x, 16))
    : [parseInt(c.slice(0,2),16), parseInt(c.slice(2,4),16), parseInt(c.slice(4,6),16)];
  const [r,g,b] = rgb;
  // luminancia
  return (0.299*r + 0.587*g + 0.114*b) > 160;
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
    const problemCell = row[colStart - 1];
    const name = problemCell != null ? String(problemCell).trim() : "";
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

function catmullRomToBezier(points: { x: number; y: number }[]) {
  if (points.length < 2) return "";

  let d = `M ${points[0].x} ${points[0].y}`;
  const smoothing = 0.15;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) * smoothing;
    const cp1y = p1.y + (p2.y - p0.y) * smoothing;

    const cp2x = p2.x - (p3.x - p1.x) * smoothing;
    const cp2y = p2.y - (p3.y - p1.y) * smoothing;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return d;
}

function colorForProblem(problemName: string, customColors: Record<string, string>) {
  const normalize = (str: string) =>
    str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "")
      .trim();

  const normalized = normalize(problemName);
  if (customColors[problemName]) return customColors[problemName];

  const matchedKey = Object.keys(customColors).find((k) => normalize(k) === normalized);
  if (matchedKey) return customColors[matchedKey];

  const matrixColors = (ChartConfig.colors as any).matrixColors;
  const paletteColor = matrixColors?.tracking?.[normalized];
  if (paletteColor) return paletteColor;

  return ChartConfig.colors.neutral;
}

function monthToAbbr(raw: string): string {
  const s = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  const map: Record<string, string> = {
    enero: "ENE",
    febrero: "FEB",
    marzo: "MAR",
    abril: "ABR",
    mayo: "MAY",
    junio: "JUN",
    julio: "JUL",
    agosto: "AGO",
    septiembre: "SEP",
    octubre: "OCT",
    noviembre: "NOV",
    diciembre: "DIC",
  };

  const first3 = s.slice(0, 3).toUpperCase();
  const alreadyAbbr = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
  if (alreadyAbbr.includes(first3)) return first3;

  return map[s] ?? first3;
}

export function buildTrackingSvg({
  data = [],
  title,
  customColors = {},
  sheetTitle,
  width,
  height,
  inputMode,
  sheetValues,
  answerRange,
  backgroundColor,
  textColor,
}: ChartSvgArgs): string {
  const W = width ?? CANVAS_W;
  const H = height ?? CANVAS_H;

  const bg = backgroundColor ?? "#000000";
  const mainTextColor = textColor ?? "#ffffff";
  const mutedTextColor = textColor ?? "#bdbdbd";

  const baseTitleFs = ChartConfig.typography.title.fontSize;
  const footerFs = ChartConfig.typography.footer.fontSize;
  const headerFs = 40;
  const headerLine = headerFs * 1.1;

  const marginLeft = 120;
  const marginRight = 120;
  const marginTop = 125;
  const marginBottom = 125;

  const titleY = marginTop + 130;
  const { lines: titleLines, fontSize: titleFs, blockHeight: titleBlockH } =
    prepareTitle(title, baseTitleFs);

  const lineY = titleY + titleBlockH + 16;

  let trackingData:
    | { months: string[]; categories: { name: string; values: number[] }[] }
    | null = null;

  trackingData = extractTrackingDataSummary(sheetValues || [], answerRange);

  if (!trackingData) {
    return basicTrackingMessageSvg("No se pudo leer la tabla de tracking.");
  }

  let { months, categories } = trackingData;
  months = months.map(monthToAbbr);

  const dragOrder = (data || []).map((d) => d.label);
  if (dragOrder.length) {
    const byName = new Map(categories.map((c) => [c.name, c]));
    categories = dragOrder.map((l) => byName.get(l)).filter(Boolean) as any;
  }

  if (!categories.length) {
    return basicTrackingMessageSvg("No hay datos (todas las categorías excluidas).");
  }

  const contentTop = lineY + 60;
  const contentBottom = H - marginBottom - 120;
  const contentHeight = contentBottom - contentTop;

  const legendWidth = 420;
  const chartX0 = marginLeft + legendWidth + 120;
  const chartY0 = contentTop;
  const chartWidth = W - chartX0 - marginRight;
  const chartHeight = contentHeight;

  const maxValue = Math.max(10, ...categories.flatMap((c) => c.values));
  const yMax = Math.ceil(maxValue / 10) * 10;

  const monthsCount = months.length;
  const innerMarginX = 40;
  const usableWidth = chartWidth - innerMarginX * 2;
  const xStep = monthsCount > 1 ? usableWidth / (monthsCount - 1) : 0;

  const parts: string[] = [];

  parts.push(
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${bg}" />`
  );

  // Título
  titleLines.forEach((line, idx) => {
    const y = titleY + idx * (titleFs + 6);
    parts.push(
      `<text x="${marginLeft}" y="${y}" fill="${mainTextColor}" font-family="Helvetica, Arial, sans-serif" font-size="${titleFs}">${esc(line)}</text>`
    );
  });

  // Línea horizontal
  parts.push(
    `<line x1="${marginLeft}" y1="${lineY}" x2="${W - marginRight}" y2="${lineY}" stroke="${mainTextColor}" stroke-width="2" />`
  );

  // Header
  const logoX = W - marginRight;
  const logoY0 = marginTop - 24;


    /* -------------------- LEYENDA (pills) -------------------- */

  const legendX = marginLeft;
  const pillCols = 2;
  const pillGapX = 16;
  const pillGapY = 25;
  const pillWidth = ((legendWidth - pillGapX) / pillCols) + 20;
  const pillHeight = 80;

  const legendRows = Math.ceil(categories.length / pillCols);
  const legendTotalHeight =
    legendRows * pillHeight + (legendRows - 1) * pillGapY;

  const legendY = contentTop + (contentHeight - legendTotalHeight) / 2;

  categories.forEach((cat, idx) => {
    const colIdx = idx % pillCols;
    const rowIdx = Math.floor(idx / pillCols);

    const x = legendX + colIdx * (pillWidth + pillGapX);
    const y = legendY + rowIdx * (pillHeight + pillGapY);

    const color = colorForProblem(cat.name, customColors);
    const textFill = isColorLight(color) ? "#000000" : "#ffffff";

    // pill rect
    parts.push(
      `<rect x="${x}" y="${y}" width="${pillWidth}" height="${pillHeight}" rx="20" ry="20" fill="${color}" />`
    );

    // texto del pill, con wrap a 2 líneas
    const legendFs = 22;
    const maxChars = 18;
    const cx = x + pillWidth / 2;
    const cy = y + pillHeight / 2;

    const words = cat.name.split(/\s+/);
    let lines: string[] = [];
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
      lines = [lines[0], lines.slice(1).join(" ")];
    }

    const lineGap = 2;
    const firstLineY =
      cy - ((lines.length - 1) * (legendFs + lineGap)) / 2;

    parts.push(
      `<text x="${cx}" y="${firstLineY}"
        fill="${textFill}"
        font-family="Helvetica, Arial, sans-serif"
        font-size="${legendFs}"
        font-weight="700"
        text-anchor="middle">` +
        lines
          .map(
            (line, idx2) =>
              `<tspan x="${cx}" dy="${
                idx2 === 0 ? 0 : legendFs + lineGap
              }">${esc(line)}</tspan>`
          )
          .join("") +
        `</text>`
    );
  });

  parts.push(`<g id="chart-content">`);

  // -------- GRID vertical con huecos ----------
  const GRID_STROKE = "#E6E6E6";
  const GRID_WIDTH = 0.25;
  const GRID_OPACITY = 0.35;
  const holeRadius = 10;

  months.forEach((_, i) => {
    const x =
      monthsCount > 1
        ? chartX0 + innerMarginX + i * xStep
        : chartX0 + chartWidth / 2;

    const yPoints = categories
      .map((cat) => cat.values[i])
      .filter((v) => v > 0)
      .map((value) => chartY0 + chartHeight - (value / yMax) * chartHeight)
      .sort((a, b) => a - b);

    if (!yPoints.length) {
      parts.push(
        `<line x1="${x}" y1="${chartY0}" x2="${x}" y2="${chartY0 + chartHeight}"
          stroke="${GRID_STROKE}"
          stroke-width="${GRID_WIDTH}"
          opacity="${GRID_OPACITY}"
          shape-rendering="crispEdges"
          stroke-linecap="square" />`
      );
      return;
    }

    let lastY = chartY0;
    yPoints.forEach((y) => {
      const yEnd = y - holeRadius;
      if (yEnd > lastY) {
        parts.push(
          `<line x1="${x}" y1="${lastY}" x2="${x}" y2="${yEnd}"
            stroke="${GRID_STROKE}"
            stroke-width="${GRID_WIDTH}"
            opacity="${GRID_OPACITY}"
            shape-rendering="crispEdges"
            stroke-linecap="square" />`
        );
      }
      lastY = y + holeRadius;
    });

    if (lastY < chartY0 + chartHeight) {
      parts.push(
        `<line x1="${x}" y1="${lastY}" x2="${x}" y2="${chartY0 + chartHeight}"
          stroke="${GRID_STROKE}"
          stroke-width="${GRID_WIDTH}"
          opacity="${GRID_OPACITY}"
          shape-rendering="crispEdges"
          stroke-linecap="square" />`
      );
    }
  });

  // --------- Líneas + puntos + labels (%) ----------
  categories.forEach((cat) => {
    const color = colorForProblem(cat.name, customColors);
    const points = cat.values.map((v, i) => {
      const x =
        monthsCount > 1
          ? chartX0 + innerMarginX + i * xStep
          : chartX0 + chartWidth / 2;
      const y = chartY0 + chartHeight - (v / yMax) * chartHeight;
      return { x, y };
    });

    if (points.length > 1) {
      const d = catmullRomToBezier(points);
      parts.push(
        `<path d="${d}" stroke="${color}" stroke-width="2" fill="none"
          stroke-linecap="round" stroke-linejoin="round" />`
      );
    }

    points.forEach((pt, i) => {
      const v = cat.values[i];
      const labelY = pt.y - 12;

      parts.push(`<circle cx="${pt.x}" cy="${pt.y}" r="8" fill="${color}" />`);

      parts.push(
        `<text x="${pt.x}" y="${labelY}"
          fill="${color}"
          font-family="Helvetica, Arial, sans-serif"
          font-size="18"
          font-weight="700"
          text-anchor="middle">
          ${v.toFixed(1)}%
        </text>`
      );
    });
  });

  parts.push(`</g>`);

  // ✅ Labels eje X (meses)
  const MONTH_LABEL_Y_OFFSET = 55;

  months.forEach((month, i) => {
    const x =
      monthsCount > 1
        ? chartX0 + innerMarginX + i * xStep
        : chartX0 + chartWidth / 2;

    parts.push(
      `<text x="${x}" y="${chartY0 + chartHeight + MONTH_LABEL_Y_OFFSET}"
        fill="${mainTextColor}"
        font-family="Helvetica, Arial, sans-serif"
        font-size="22"
        font-weight="700"
        text-anchor="middle">
        ${esc(month)}
      </text>`
    );
  });

  parts.push(`</svg>`);
  return parts.join("\n");
}

function basicTrackingMessageSvg(message: string): string {
  const W = CANVAS_W;
  const H = CANVAS_H;
  const bg = "#000000";

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${bg}" />`,
    `<text x="${W / 2}" y="${H / 2}" fill="#ffffff"
      font-family="Helvetica, Arial, sans-serif"
      font-size="24"
      text-anchor="middle"
      dominant-baseline="middle">
      ${esc(message)}
    </text>`,
    `</svg>`,
  ].join("\n");
}
