import type { ChartType, FrequencyData, DatasetColumn } from "@/app/page";
import { buildDonutSvg } from "@/lib/export-donut-svg";
import { buildBarSvg } from "@/lib/export-bar-svg";
import { buildMatrixSvg } from "@/lib/export-matrix-svg";
import { buildScoreSvg } from "@/lib/export-score-svg";
import { buildApprovalSvg } from "@/lib/export-approval-svg";
import { buildPartidoSvg } from "@/lib/export-partido-svg";
import { buildTrackingSvg } from "@/lib/export-tracking-svg";
import { buildMediumDonutSvg } from "@/lib/export-mediumdonut-svg";
import { buildStackedBarSvg, StackedRow, StackedSegment } from "@/lib/export-stackedbar-svg";
import { buildStackedVerticalSvg } from "@/lib/export-stackedvertical-svg";
import type { Brand } from "@/types/brand";
import { buildBarNarrowSvg } from "./export-narrow-bar-svg";
import { buildScoreTrackingCensSvg } from "./export-single-track-svg";
import { buildNarrowVertBarsSvg } from "./export-narrow-vert-bars-svg";
import { ChartConfig} from "./chartconfig";


export interface ChartSvgArgs {
  data: FrequencyData[];
  title: string;
  secondColumn?: string;
  columns?: DatasetColumn[];
  customColors?: Record<string, string>;
  stackedColumns?: string[];
  sheetTitle?: string;
  width?: number;
  height?: number;
  inputMode?: "raw" | "summary";
  labelOrder?: string[];
  secondQuestionCell?: string;
  secondAnswerRange?: string;
  sheetValues?: any[][];
  stackedLabelCells?: string;     
  stackedRangesSummary?: string;
  answerRange?: string;
  backgroundColor?: string;
  textColor?: string;
  brand?: Brand;
  questionCell?: string;    
  matrixRowOrder?: string[];
  combinedCharts?: [
  { chartType: ChartType; args: ChartSvgArgs; title?: string },
  { chartType: ChartType; args: ChartSvgArgs; title?: string }
];
  isCombinedMode?: boolean;
  hideLegend?: boolean;
  
}

/* ------------------------------------------------------------------ */
/* helpers generales                                                   */
/* ------------------------------------------------------------------ */

function parsePercent(raw: unknown): number {
  if (raw == null) return NaN;
  let s = String(raw).trim();
  if (!s) return NaN;

  s = s.replace("%", "").replace(",", ".");
  let n = Number(s);
  if (Number.isNaN(n)) return NaN;

  // si viene en 0–1, conviértelo a 0–100
  if (n <= 1) n = n * 100;

  return Number(n.toFixed(1));
}

function extractInnerSvg(svg: string) {
  const start = svg.search(/<g[^>]*id="chart-content"[^>]*>/i);
  if (start === -1) {
    // fallback: quita wrapper <svg>
    return svg
      .replace(/^[\s\S]*?<svg[^>]*>/i, "")
      .replace(/<\/svg>\s*$/i, "")
      .replace(/<rect[^>]*width="100%"[^>]*height="100%"[^>]*\/?>/i, "");
  }

  // encuentra apertura exacta del <g ...>
  const openTagMatch = svg.slice(start).match(/<g[^>]*id="chart-content"[^>]*>/i);
  if (!openTagMatch) return "";

  const openTag = openTagMatch[0];
  const contentStart = start + openTag.length;

  // ahora hay que encontrar el cierre correcto del </g>
  let depth = 1;
  let i = contentStart;

  const re = /<\/?g\b[^>]*>/gi;
  re.lastIndex = contentStart;

  let match: RegExpExecArray | null;
  while ((match = re.exec(svg))) {
    const tag = match[0];
    if (tag.startsWith("</")) depth--;
    else depth++;

    if (depth === 0) {
      const contentEnd = match.index;
      return svg.slice(contentStart, contentEnd);
    }
  }

  return "";
}

const esc = (s: string) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/* ------------------------------------------------------------------ */
/* stacked: modo RAW (base de datos) – tu lógica original             */
/* ------------------------------------------------------------------ */

function makeStackedRowsRaw({
  columns = [],
  stackedColumns = [],
  labelOrder = [],
}: ChartSvgArgs): StackedRow[] {
  if (!stackedColumns.length) return [];

  // categorías = orden del DragList si existe, si no, fallback a primera col
  let categories: string[] = [];

  if (labelOrder.length > 0) {
    categories = [...labelOrder];
  } else {
    const firstCol = columns.find((c) => c.name === stackedColumns[0]);
    if (!firstCol) return [];
    categories = Array.from(
      new Set(firstCol.values.filter((v) => v && v !== ""))
    );
  }

  const makeRawSegments = (questionCol: DatasetColumn) => {
    const counts: Record<string, number> = {};
    let total = 0;

    questionCol.values.forEach((v) => {
      if (!v) return;
      counts[v] = (counts[v] || 0) + 1;
      total++;
    });

    return categories.map((cat) => {
      const c = counts[cat] || 0;
      const pct = total > 0 ? Number(((c / total) * 100).toFixed(1)) : 0;
      return { label: cat, percentage: pct };
    });
  };

  return stackedColumns
    .map((colName) => {
      const colIndex = columns.findIndex((c) => c.name === colName);
      if (colIndex === -1) return null;

      const questionCol = columns[colIndex];
      let percentCol: DatasetColumn | undefined;
      const candidate = columns[colIndex + 1];

      if (candidate) {
        const nameLooksLikePercent = /porcentaje/i.test(candidate.name);
        const hasNumeric = candidate.values.some(
          (v) => !Number.isNaN(parsePercent(v))
        );
        if (nameLooksLikePercent || hasNumeric) {
          percentCol = candidate;
        }
      }
      if (!percentCol) {
        const segments = makeRawSegments(questionCol);
        return { label: colName, segments };
      }
      const segments = categories.map((cat) => {
        const rowIdx = questionCol.values.findIndex((v) => v === cat);
        const rawPct =
          rowIdx === -1 ? NaN : parsePercent(percentCol!.values[rowIdx]);

        return {
          label: cat,
          percentage: Number((rawPct || 0).toFixed(1)),
        };
      });

      return { label: colName, segments };
    })
    .filter(Boolean) as StackedRow[];
}

/* ------------------------------------------------------------------ */
/* stacked: modo SUMMARY (tabla de resultados)                        */
/* ------------------------------------------------------------------ */

function a1ToRowColSummary(a1: string) {
  const match = a1.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) {
    throw new Error(`Referencia A1 inválida: ${a1}`);
  }
  const [, colLetters, rowStr] = match;
  let col = 0;
  for (const ch of colLetters) {
    col = col * 26 + (ch.charCodeAt(0) - 64); // A=1
  }
  const row = parseInt(rowStr, 10);
  if (!row || row < 1) {
    throw new Error(`Fila inválida en referencia A1: ${a1}`);
  }
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

function buildSummarySegmentsFromRange(
  values: any[][],
  range: string
): StackedSegment[] {
  const trimmed = range.trim();
  if (!trimmed) return [];

  let parsed;
  try {
    parsed = parseA1RangeSummary(trimmed);
  } catch (err) {
    console.warn("Rango A1 inválido para stacked:", trimmed, err);
    return [];
  }

  const { rowStart, rowEnd, colStart, colEnd } = parsed;
  if (colEnd < colStart + 1) {
    console.warn(
      "El rango de stacked debería incluir al menos dos columnas (etiqueta y %).",
      trimmed
    );
  }

  const segments: StackedSegment[] = [];

  for (let r = rowStart; r <= rowEnd; r++) {
    const row = values[r - 1] || [];
    const rawLabel = row[colStart - 1];
    const rawPercent = row[colStart];

    const label = rawLabel != null ? String(rawLabel).trim() : "";
    if (!label) continue;

    let percNum = 0;

    if (typeof rawPercent === "number") {
      let v = rawPercent;
      if (v > 0 && v <= 1) v = v * 100;
      percNum = v;
    } else if (typeof rawPercent === "string") {
      const cleaned = rawPercent.replace("%", "").replace(",", ".").trim();
      const parsedNum = parseFloat(cleaned);
      if (!Number.isNaN(parsedNum)) percNum = parsedNum;
    }

    segments.push({
      label,
      percentage: Number(percNum.toFixed(1)),
    });
  }

  return segments;
}

function makeStackedRowsSummary({
  sheetValues = [],
  stackedLabelCells = "",
  stackedRangesSummary = "",
}: ChartSvgArgs): StackedRow[] {
  if (!sheetValues.length) return [];
  if (!stackedRangesSummary.trim()) return [];

  const labelRefs = stackedLabelCells
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const ranges = stackedRangesSummary
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const rows: StackedRow[] = [];

  ranges.forEach((range, idx) => {
    const segments = buildSummarySegmentsFromRange(sheetValues, range);
    if (!segments.length) return;

    let rowLabel = `Serie ${idx + 1}`;

    const ref = labelRefs[idx];
    if (ref) {
      try {
        const { row, col } = a1ToRowColSummary(ref);
        const val = sheetValues[row - 1]?.[col - 1];
        rowLabel =
          val != null && val !== "" ? String(val).trim() : ref.toUpperCase();
      } catch {
        rowLabel = ref.toUpperCase();
      }
    }

    rows.push({ label: rowLabel, segments });
  });

  return rows;
}

/* ------------------------------------------------------------------ */
/* builders por tipo de gráfica                                       */
/* ------------------------------------------------------------------ */

export type ChartSvgBuilder = (args: ChartSvgArgs) => string;

export const chartSvgBuilders: Record<ChartType, ChartSvgBuilder> = {
  
  donut: (args) =>
    buildDonutSvg({
      data: args.data,
      title: args.title,
      customColors: args.customColors,
      sheetTitle: args.sheetTitle,
      width: args.width,
      height: args.height,
      backgroundColor: args.backgroundColor,
      textColor: args.textColor,
    }),

  bar: (args) =>
  buildBarSvg({
    data: args.data,
    title: args.title,
    customColors: args.customColors,
    sheetTitle: args.sheetTitle,
    width: args.width,
    height: args.height,
    backgroundColor: args.backgroundColor,
    textColor: args.textColor,
  }),


  matrix: (args) =>
  buildMatrixSvg({
    data: args.data,
    title: args.title,
    customColors: args.customColors,
    sheetTitle: args.sheetTitle,
    width: args.width,
    height: args.height,
    inputMode: args.inputMode,
    sheetValues: args.sheetValues,
    answerRange: args.answerRange,         
    questionCell: args.questionCell,        
    backgroundColor: args.backgroundColor,
    textColor: args.textColor,
    matrixRowOrder: args.matrixRowOrder,
  }),


  score: (args) =>
    buildScoreSvg({
      data: args.data,
      title: args.title,
      customColors: args.customColors,
      sheetTitle: args.sheetTitle,
      width: args.width,
      height: args.height,
      backgroundColor: args.backgroundColor,
      textColor: args.textColor,
    }),

  approval: (args) =>
    buildApprovalSvg({
      data: args.data,
      title: args.title,
      customColors: args.customColors,
      sheetTitle: args.sheetTitle,
      width: args.width,
      height: args.height,
      backgroundColor: args.backgroundColor,
      textColor: args.textColor, 
    }),

  partido: (args) =>
    buildPartidoSvg({
      data: args.data,
      title: args.title,
      customColors: args.customColors,
      sheetTitle: args.sheetTitle,
      width: args.width,
      height: args.height,
      backgroundColor: args.backgroundColor,
      textColor: args.textColor,
    }),

  tracking: (args) =>
    buildTrackingSvg({
      data: args.data,
      title: args.title,
      columns: args.columns ?? [],
      customColors: args.customColors,
      sheetTitle: args.sheetTitle,
      width: args.width,
      height: args.height,
      inputMode: args.inputMode,
      sheetValues: args.sheetValues,
      answerRange: args.answerRange,
      backgroundColor: args.backgroundColor,
      textColor: args.textColor,
      isCombinedMode: args.isCombinedMode,
      hideLegend: args.hideLegend,
    }),

  mediumdonut: (args) =>
    buildMediumDonutSvg({
      data: args.data,
      title: args.title,
      columns: args.columns ?? [],
      customColors: args.customColors,
      secondColumn: args.secondColumn ?? "",
      sheetTitle: args.sheetTitle,
      width: args.width,
      height: args.height,
      labelOrder: args.labelOrder,
      inputMode: args.inputMode,
      sheetValues: args.sheetValues,
      answerRange: args.answerRange,
      questionCell: args.questionCell,
      backgroundColor: args.backgroundColor,
      textColor: args.textColor,
    }),

  stacked: (args) => {
    const stackedData: StackedRow[] =
      args.inputMode === "summary"
        ? makeStackedRowsSummary(args)
        : makeStackedRowsRaw(args);

    return buildStackedBarSvg({
      data: stackedData,
      title: args.title,
      customColors: args.customColors,
      sheetTitle: args.sheetTitle,
      width: args.width,
      height: args.height,
      backgroundColor: args.backgroundColor,
      textColor: args.textColor,
    });
  },
  stackedvertical: (args) =>
    buildStackedVerticalSvg({
      data: args.data,                 
      title: args.title,
      columns: args.columns ?? [],
      customColors: args.customColors,
      sheetTitle: args.sheetTitle,
      width: args.width,
      height: args.height,
      inputMode: args.inputMode,
      sheetValues: args.sheetValues,
      answerRange: args.answerRange,
      backgroundColor: args.backgroundColor,
      textColor: args.textColor,
      brand: args.brand, 
    }),
    barnarrow: (args) =>
  buildBarNarrowSvg({
    data: args.data,
    title: args.title,
    sheetTitle: args.sheetTitle,
    width: args.width,
    height: args.height,
    backgroundColor: args.backgroundColor,
    textColor: args.textColor,
    brand: args.brand,
    headerLeftLabel: "Monterrey, Nuevo León", 
  }),
  singletrack: (args) =>
    buildScoreTrackingCensSvg({
      data: args.data,                 
      title: args.title,
      columns: args.columns ?? [],
      customColors: args.customColors,
      sheetTitle: args.sheetTitle,
      width: args.width,
      height: args.height,
      inputMode: args.inputMode,
      sheetValues: args.sheetValues,
      answerRange: args.answerRange,
      backgroundColor: args.backgroundColor,
      textColor: args.textColor,
      brand: args.brand, 
    }),
    narrowvertbars: (args) =>
    buildNarrowVertBarsSvg({
      data: args.data,
      title: args.title,
      sheetTitle: args.sheetTitle,
      width: args.width,
      height: args.height,
      backgroundColor: args.backgroundColor,
      textColor: args.textColor,
      brand: args.brand,
      headerLeftLabel: "Monterrey, Nuevo León", 
    }),

  combined: (args) => {
  if (!args.combinedCharts) return "";
  const [a, b] = args.combinedCharts;
  if (a.chartType === "combined" || b.chartType === "combined") return "";

  const W = args.width ?? 1920;
  const H = args.height ?? 1080;

  const bg = args.backgroundColor ?? "#000";
  const mainTextColor = args.textColor ?? "#fff";
  const mutedTextColor = args.textColor ? args.textColor : "#bdbdbd";

  const sheetTitle = args.sheetTitle ?? "";
  const titleFs = ChartConfig.typography.title.fontSize;

  const marginLeft = 120;
  const marginRight = 120;
  const marginTop = 125;
  const marginBottom = 125;

  const headerFs = 40;
  const headerLine = headerFs * 1.1;

  const sheetTitleY = marginTop - 24;

  const questionFs = ChartConfig.typography.title.fontSize;
  const questionY = sheetTitle
    ? sheetTitleY + headerLine * 2.4
    : marginTop + headerLine * 2.4;

  const lineY = questionY + 55;

  const question = a.args.title ?? "";
  const logoX = W - marginRight;
  const logoY0 = sheetTitleY;

  // -----------------------------
  // ✅ SPECIAL CASE: TRACKING
  // -----------------------------
  const hasTracking = a.chartType === "tracking" || b.chartType === "tracking";

  // Si hay tracking: layout vertical (tracking 75% alto)
  if (hasTracking) {
    // -----------------------------
// ✅ SPECIAL CASE: TRACKING (HORIZONTAL 1/4 + 3/4)
// -----------------------------
const hasTracking = a.chartType === "tracking" || b.chartType === "tracking";

if (hasTracking) {
  // tracking siempre a la derecha (como tu ejemplo)
  const trackingChart = a.chartType === "tracking" ? a : b;
  const otherChart = a.chartType === "tracking" ? b : a;

  const otherW = Math.round(W * 0.25);
  const trackingW = W - otherW;

  // ✅ Render: otro (izq) en 1/4
  const svgOther = chartSvgBuilders[otherChart.chartType]({
    ...otherChart.args,
    width: otherW,
    height: H,
    isCombinedMode: true,
  });

  // ✅ Render: tracking (der) en 3/4 y sin leyenda
  const svgTracking = chartSvgBuilders[trackingChart.chartType]({
    ...trackingChart.args,
    width: trackingW,
    height: H,
    isCombinedMode: true,
    hideLegend: true,
  });

  const innerOther = extractInnerSvg(svgOther);
  const innerTracking = extractInnerSvg(svgTracking);

  return `
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="${bg}"/>

  <text x="${marginLeft}" y="${questionY}"
    fill="${mainTextColor}"
    font-family="${ChartConfig.typography.fontFamily}, Arial, sans-serif"
    font-size="${questionFs}"
    font-weight="400">
    ${esc(question)}
  </text>

  <line x1="${marginLeft}" y1="${lineY}" x2="${W - marginRight}"
    y2="${lineY}" stroke="${mainTextColor}" stroke-width="2"/>


  <!-- Izquierda: otro chart (1/4) -->
  <g transform="translate(0,0)">
    ${innerOther}
  </g>

  <!-- Derecha: tracking (3/4) -->
  <g transform="translate(${otherW},0)">
    ${innerTracking}
  </g>
</svg>
`.trim();
}
  }

  // -----------------------------
  // ✅ DEFAULT: tu modo mitad y mitad
  // -----------------------------
  const halfW = Math.round(W / 2);

  const svgA = chartSvgBuilders[a.chartType]({ ...a.args, width: halfW, height: H });
  const svgB = chartSvgBuilders[b.chartType]({ ...b.args, width: halfW, height: H });

  const innerA = extractInnerSvg(svgA);
  const innerB = extractInnerSvg(svgB);

  return `
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="${bg}"/>

  ${sheetTitle ? `
  <text x="${marginLeft}" y="${sheetTitleY}"
    fill="${mainTextColor}"
    font-family="${ChartConfig.typography.fontFamily}, Arial, sans-serif"
    font-size="${titleFs}"
    font-weight="400">
    ${esc(sheetTitle)}
  </text>` : ""}

  <text x="${marginLeft}" y="${questionY}"
    fill="${mainTextColor}"
    font-family="${ChartConfig.typography.fontFamily}, Arial, sans-serif"
    font-size="${questionFs}"
    font-weight="400">
    ${esc(question)}
  </text>

  <line x1="${marginLeft}" y1="${lineY}" x2="${W - marginRight}"
    y2="${lineY}" stroke="${mainTextColor}" stroke-width="2"/>

  <text x="${logoX}" y="${logoY0}"
    fill="${mainTextColor}"
    font-family="${ChartConfig.typography.fontFamily}, Arial, sans-serif"
    font-size="${headerFs}"
    font-weight="700"
    text-anchor="end">Poligrama.</text>

  <text x="${logoX}" y="${logoY0 + headerLine}"
    fill="${mainTextColor}"
    font-family="${ChartConfig.typography.fontFamily}, Arial, sans-serif"
    font-size="${headerFs}"
    font-weight="700"
    text-anchor="end">Poder.</text>

  <text x="${logoX}" y="${logoY0 + headerLine * 2}"
    fill="${mainTextColor}"
    font-family="${ChartConfig.typography.fontFamily}, Arial, sans-serif"
    font-size="${headerFs}"
    font-weight="700"
    text-anchor="end">Ganar.</text>

  <text x="${W - marginRight}" y="${H - marginBottom}"
    fill="${mutedTextColor}"
    font-family="${ChartConfig.typography.fontFamily}, Arial, sans-serif"
    font-size="${ChartConfig.typography.footer.fontSize}"
    font-weight="500"
    text-anchor="end">
    ${esc(ChartConfig.footer)}
  </text>

  <g transform="translate(0,0)">
    ${innerA}
  </g>

  <g transform="translate(${halfW},0)">
    ${innerB}
  </g>
</svg>
`.trim();
},






};
