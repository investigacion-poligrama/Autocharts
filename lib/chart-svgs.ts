import type { ChartType, FrequencyData, DatasetColumn } from "@/app/page";
import { buildDonutSvg } from "@/lib/export-donut-svg-poligrama";
import { buildBarSvg } from "@/lib/export-bar-svg-poligrama";
import { buildMatrixSvg } from "@/lib/export-matrix-svg-poligrama";
import { buildScoreSvg } from "@/lib/export-score-svg-poligrama";
import { buildApprovalSvg } from "@/lib/export-approval-svg-poligrama";
import { buildPartidoSvg } from "@/lib/export-partido-svg-poligrama";
import { buildTrackingSvg } from "@/lib/export-tracking-svg-poligrama";
import { buildMediumDonutSvg } from "@/lib/export-mediumdonut-svg-poligrama";
import {
  buildStackedBarSvg,
  StackedRow,
  StackedSegment,
} from "@/lib/export-stackedbar-svg-poligrama";
import { buildStackedVerticalSvg } from "@/lib/export-stackedvertical-svg";
import type { Brand } from "@/types/brand";
import { buildBarNarrowSvg } from "./export-narrow-bar-svg";
import { buildScoreTrackingCensSvg } from "./export-single-track-svg";
import { buildNarrowVertBarsSvg } from "./export-narrow-vert-bars-svg";
import { ChartConfig } from "./chartconfig";
import { MikebuildBarSvg } from "./export-bar-mikeflores";
import { getBrandTheme } from "@/lib/brand-theme";
import { buildTrackingMikeFloresSvg } from "./export-tracking-mike-flores";
import { buildTrackingWithPillsMikeFloresSvg } from "./export-trackingwpills-mikeflores";
import { buildTableMikeFloresSvg } from "./export-table-mikeflores";
import { buildDonutMikeFloresSvg } from "./export-donut-mikeflores";

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
  const openTagMatch = svg
    .slice(start)
    .match(/<g[^>]*id="chart-content"[^>]*>/i);
  if (!openTagMatch) return "";

  const openTag = openTagMatch[0];
  const contentStart = start + openTag.length;

  // ahora hay que encontrar el cierre correcto del </g>
  let depth = 1;

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

/**
 * ✅ SOLO se usa en DESKOVER combined.
 * Extrae el inner de chart-content y, si existe, el rect id="content-bounds"
 * para poder “cropear” y centrar sin agarrar todo el canvas.
 */
function extractInnerSvgWithBounds(svg: string): {
  inner: string;
  bounds: { x: number; y: number; w: number; h: number } | null;
} {
  const start = svg.search(/<g[^>]*id="chart-content"[^>]*>/i);
  if (start === -1) {
    const inner = svg
      .replace(/^[\s\S]*?<svg[^>]*>/i, "")
      .replace(/<\/svg>\s*$/i, "")
      .replace(/<rect[^>]*width="100%"[^>]*height="100%"[^>]*\/?>/i, "");
    return { inner, bounds: null };
  }

  const openTagMatch = svg
    .slice(start)
    .match(/<g[^>]*id="chart-content"[^>]*>/i);
  if (!openTagMatch) return { inner: "", bounds: null };

  const openTag = openTagMatch[0];
  const contentStart = start + openTag.length;

  let depth = 1;
  const re = /<\/?g\b[^>]*>/gi;
  re.lastIndex = contentStart;

  let match: RegExpExecArray | null;
  while ((match = re.exec(svg))) {
    const tag = match[0];
    if (tag.startsWith("</")) depth--;
    else depth++;

    if (depth === 0) {
      const contentEnd = match.index;
      const inner = svg.slice(contentStart, contentEnd);

      // bounds rect (si existe)
      // bounds rect (si existe)
const rectMatch = inner.match(/<rect[^>]*id="content-bounds"[^>]*>/i);

// ✅ fallback: si no hay content-bounds, usa el viewBox del SVG completo
const vbMatch = svg.match(/viewBox="([^"]+)"/i);
let fallbackBounds: { x: number; y: number; w: number; h: number } | null = null;

if (vbMatch) {
  const nums = vbMatch[1].trim().split(/\s+/).map(Number);
  if (nums.length === 4 && nums.every((n) => Number.isFinite(n))) {
    const [, , w, h] = nums;
    if (w > 0 && h > 0) fallbackBounds = { x: 0, y: 0, w, h };
  }
}

// si no hay viewBox, intenta width/height
if (!fallbackBounds) {
  const wMatch = svg.match(/\bwidth="([^"]+)"/i);
  const hMatch = svg.match(/\bheight="([^"]+)"/i);
  const w = wMatch ? Number(String(wMatch[1]).replace(/[^\d.]/g, "")) : NaN;
  const h = hMatch ? Number(String(hMatch[1]).replace(/[^\d.]/g, "")) : NaN;
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    fallbackBounds = { x: 0, y: 0, w, h };
  }
}

if (!rectMatch) {
  // ✅ IMPORTANT: ya no regreses null, regresa fallbackBounds
  return { inner, bounds: fallbackBounds };
}


      const rect = rectMatch[0];
      const getNum = (attr: string) => {
        const m = rect.match(new RegExp(`${attr}="([^"]+)"`, "i"));
        return m ? Number(m[1]) : NaN;
      };

      const x = getNum("x");
      const y = getNum("y");
      const w = getNum("width");
      const h = getNum("height");

      if ([x, y, w, h].some((n) => !Number.isFinite(n) || n <= 0)) {
        return { inner, bounds: null };
      }

      return { inner, bounds: { x, y, w, h } };
    }
  }

  return { inner: "", bounds: null };
}

function placeIntoSlot(
  inner: string,
  bounds: { x: number; y: number; w: number; h: number } | null,
  slotW: number,
  slotH: number,
  opts?: {
    allowUpscale?: boolean;
    maxScale?: number;
    margin?: number;
    forceScale?: number;           // ✅ nuevo: fuerza escala final (antes de margin)
    alignY?: "center" | "top";     // ✅ nuevo: para respetar top padding visual
  }
) {
  if (!bounds) bounds = { x: 0, y: 0, w: 1920, h: 1080 };

  const fitScale = Math.min(slotW / bounds.w, slotH / bounds.h);

  const allowUpscale = opts?.allowUpscale ?? false;
  const maxScale = opts?.maxScale ?? 1.35;
  const margin = opts?.margin ?? 0.96;

  // ✅ si viene forceScale, úsalo (pero nunca más grande que fitScale)
  const baseScale =
    typeof opts?.forceScale === "number"
      ? Math.min(opts.forceScale, fitScale)
      : allowUpscale
      ? Math.min(maxScale, fitScale)
      : Math.min(1, fitScale);

  const s = baseScale * margin;

  const scaledW = bounds.w * s;
  const scaledH = bounds.h * s;

  const dx = (slotW - scaledW) / 2;

  // ✅ center vs top
  const alignY = opts?.alignY ?? "center";
  const dy = alignY === "top" ? 0 : (slotH - scaledH) / 2;

  return `
    <g transform="translate(${dx},${dy}) scale(${s}) translate(${-bounds.x},${-bounds.y})">
      ${inner}
    </g>
  `.trim();
}




function namespaceSvgIds(fragment: string, prefix: string) {
  if (!fragment) return fragment;

  // 1) recolecta ids presentes
  const ids = new Set<string>();
  fragment.replace(/\bid="([^"]+)"/g, (_m, id) => {
    ids.add(id);
    return _m;
  });

  // 2) reemplaza id="x" => id="prefix-x" y referencias url(#x), href="#x", etc.
  let out = fragment;
  ids.forEach((id) => {
    const nid = `${prefix}${id}`;

    // id="..."
    out = out.replace(new RegExp(`\\bid="${id}"`, "g"), `id="${nid}"`);

    // url(#...)
    out = out.replace(new RegExp(`url\\(#${id}\\)`, "g"), `url(#${nid})`);

    // href="#..."
    out = out.replace(new RegExp(`\\bhref="#${id}"`, "g"), `href="#${nid}"`);

    // xlink:href="#..."
    out = out.replace(
      new RegExp(`\\bxlink:href="#${id}"`, "g"),
      `xlink:href="#${nid}"`
    );
  });

  return out;
}


const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
    categories = Array.from(new Set(firstCol.values.filter((v) => v && v !== "")));
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
        const hasNumeric = candidate.values.some((v) => !Number.isNaN(parsePercent(v)));
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
        const rawPct = rowIdx === -1 ? NaN : parsePercent(percentCol!.values[rowIdx]);
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

function buildSummarySegmentsFromRange(values: any[][], range: string): StackedSegment[] {
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
        rowLabel = val != null && val !== "" ? String(val).trim() : ref.toUpperCase();
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
  donut: (args) => {
    const isMike = args.brand === "deskover";

    if (isMike) {
      return buildDonutMikeFloresSvg({
        ...args,
        width: args.width,
        height: args.height,
        backgroundColor: args.backgroundColor,
        textColor: args.textColor,
        customColors: args.customColors,
        isCombinedMode: args.isCombinedMode,
      });
    }

    return buildDonutSvg({
      data: args.data,
      title: args.title,
      customColors: args.customColors,
      sheetTitle: args.sheetTitle,
      width: args.width,
      height: args.height,
      backgroundColor: args.backgroundColor,
      textColor: args.textColor,
    });
  },

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

  tracking: (args) => {
    const isMike = args.brand === "deskover";
    if (isMike) {
      return buildTrackingMikeFloresSvg({
        ...args,
        sheetValues: args.sheetValues,
        answerRange: args.answerRange,
        isCombinedMode: args.isCombinedMode,
        hideLegend: args.hideLegend,
      });
    }

    return buildTrackingSvg({
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
    });
  },

  trackingpills: (args) => {
    const isMike = args.brand === "deskover";
    if (isMike) {
      return buildTrackingWithPillsMikeFloresSvg({
        ...args,
        sheetValues: args.sheetValues,
        answerRange: args.answerRange,
        isCombinedMode: args.isCombinedMode,
        hideLegend: args.hideLegend,
      });
    }

    return chartSvgBuilders.tracking(args);
  },

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
      args.inputMode === "summary" ? makeStackedRowsSummary(args) : makeStackedRowsRaw(args);

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

  mikebar: (args) => {
    const theme = getBrandTheme(args.brand ?? "poligrama");

    return MikebuildBarSvg({
      data: args.data,
      title: args.title,
      customColors: args.customColors,
      width: args.width,
      height: args.height,
      isCombinedMode: args.isCombinedMode,
      backgroundColor: args.backgroundColor ?? theme.defaultBackground,
      textColor: args.textColor ?? theme.defaultTextColor,
    });
  },

  table: (args) => {
    const isMike = args.brand === "deskover";
    if (!isMike) return "";
    return buildTableMikeFloresSvg({
      ...args,
      sheetValues: args.sheetValues,
      answerRange: args.answerRange,
      isCombinedMode: args.isCombinedMode,
    });
  },

  combined: (args) => {
    if (!args.combinedCharts) return "";
    const [a, b] = args.combinedCharts;
    if (a.chartType === "combined" || b.chartType === "combined") return "";

    const W = args.width ?? 1920;
    const H = args.height ?? 1080;
    const bg = args.backgroundColor ?? "#000";

    const isDeskover = (a.args.brand ?? b.args.brand) === "deskover";

    // ✅ tracking special layout
    const hasTracking = a.chartType === "tracking" || b.chartType === "tracking";

    if (hasTracking) {
      const trackingChart = a.chartType === "tracking" ? a : b;
      const otherChart = a.chartType === "tracking" ? b : a;

      if (isDeskover) {
        // --- Deskover: arriba/abajo (tracking abajo más grande) ---
        const otherH = Math.round(H * 0.25);

  // ✅ margen arriba del canvas para el chart superior
  const TOP_PAD = Math.round(H * 0.06);
  const GAP = Math.round(H * 0.03);

  const availableH = H - TOP_PAD - GAP;

  // ✅ arriba más grande que 0.25 para que NO se vea mini
  const topH = Math.round(availableH * 0.42);  // prueba 0.40–0.45
  const trackingH = availableH - topH;

        const BASE_W = 1920;
const BASE_H = 1080;

const svgOther = chartSvgBuilders[otherChart.chartType]({
  ...otherChart.args,
  width: BASE_W,
  height: BASE_H,
  isCombinedMode: true,
});

const svgTracking = chartSvgBuilders[trackingChart.chartType]({
  ...trackingChart.args,
  width: BASE_W,
  height: BASE_H,
  isCombinedMode: true,
  hideLegend: true,
});


 const other = extractInnerSvgWithBounds(svgOther);
  const tracking = extractInnerSvgWithBounds(svgTracking);

  const otherInner = namespaceSvgIds(other.inner, "c1-");
  const trackingInner = namespaceSvgIds(tracking.inner, "c2-");

  const fitOther = Math.min(W / (other.bounds?.w ?? 1920), topH / (other.bounds?.h ?? 1080));
  const fitTrack = Math.min(W / (tracking.bounds?.w ?? 1920), trackingH / (tracking.bounds?.h ?? 1080));
  const commonScale = Math.min(fitOther, fitTrack);

  const otherPlaced = placeIntoSlot(otherInner, other.bounds, W, topH, {
    allowUpscale: true,
    maxScale: 1.35,
    margin: 0.98,
    forceScale: commonScale,
    alignY: "top",
  });

  const trackingPlaced = placeIntoSlot(trackingInner, tracking.bounds, W, trackingH, {
    allowUpscale: true,
    maxScale: 1.35,
    margin: 0.98,
    forceScale: commonScale,
    alignY: "top",
  });

  const yTop = TOP_PAD;
  const yBottom = TOP_PAD + topH + GAP;

  return `
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${W}" height="${H}"
     viewBox="0 0 ${W} ${H}"
     preserveAspectRatio="xMidYMid meet"
     overflow="visible">
  <rect width="100%" height="100%" fill="${bg}"/>
  <g transform="translate(0,${yTop})">${otherPlaced}</g>
  <g transform="translate(0,${yBottom})">${trackingPlaced}</g>
</svg>
`.trim();
}
      // --- Poligrama: izquierda/derecha (SIN CAMBIOS) ---
      const otherW = Math.round(W * 0.25);
      const trackingW = W - otherW;

      const svgOther = chartSvgBuilders[otherChart.chartType]({
        ...otherChart.args,
        width: otherW,
        height: H,
        isCombinedMode: true,
      });

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
  <g transform="translate(0,0)">${innerOther}</g>
  <g transform="translate(${otherW},0)">${innerTracking}</g>
</svg>
`.trim();
    }

    // ✅ default layout
    if (isDeskover) {
      // --- Deskover: arriba/abajo ---
 const halfH = Math.round(H / 2);

  // ✅ margen extra arriba del canvas para el primer chart
  const TOP_PAD = Math.round(H * 0.06); // ✅ más parecido a la foto 2
  const GAP = Math.round(H * 0.03);     // ✅ separación entre charts (chica)

  // ✅ alturas reales de slots (no uses halfH directo)
  const availableH = H - TOP_PAD - GAP;
  const topH = Math.round(availableH * 0.50);
  const bottomH = availableH - topH;

  // ✅ el slot de arriba ahora es más chico (para no empujar hacia abajo sin control)
  const topSlotH = Math.max(1, halfH - TOP_PAD);

      const BASE_W = 1920;
const BASE_H = 1080;

const svgA = chartSvgBuilders[a.chartType]({
  ...a.args,
  width: BASE_W,
  height: BASE_H,
  isCombinedMode: true,
});

const svgB = chartSvgBuilders[b.chartType]({
  ...b.args,
  width: BASE_W,
  height: BASE_H,
  isCombinedMode: true,
});


 const A = extractInnerSvgWithBounds(svgA);
  const B = extractInnerSvgWithBounds(svgB);

  const innerA = namespaceSvgIds(A.inner, "c1-");
  const innerB = namespaceSvgIds(B.inner, "c2-");

  // ✅ calcula escala objetivo común para que “se sientan del mismo tamaño”
  const fitA = Math.min(W / (A.bounds?.w ?? 1920), topH / (A.bounds?.h ?? 1080));
  const fitB = Math.min(W / (B.bounds?.w ?? 1920), bottomH / (B.bounds?.h ?? 1080));
  const commonScale = Math.min(fitA, fitB); // ✅ ambos caben con la misma escala

  const placedA = placeIntoSlot(innerA, A.bounds, W, topH, {
    allowUpscale: true,
    maxScale: 1.35,
    margin: 0.98,           // ✅ súbelo para que no se vea “chiquito”
    forceScale: commonScale,
    alignY: "top",          // ✅ respeta margen arriba dentro del slot
  });

  const placedB = placeIntoSlot(innerB, B.bounds, W, bottomH, {
    allowUpscale: true,
    maxScale: 1.35,
    margin: 0.98,
    forceScale: commonScale,
    alignY: "top",
  });

  const yTop = TOP_PAD;
  const yBottom = TOP_PAD + topH + GAP;

  return `
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${W}" height="${H}"
     viewBox="0 0 ${W} ${H}"
     preserveAspectRatio="xMidYMid meet"
     overflow="visible">
  <rect width="100%" height="100%" fill="${bg}"/>
  <g transform="translate(0,${yTop})">${placedA}</g>
  <g transform="translate(0,${yBottom})">${placedB}</g>
</svg>
`.trim();
}

    // --- Poligrama: izquierda/derecha (SIN CAMBIOS) ---
    const halfW = Math.round(W / 2);

    const svgA = chartSvgBuilders[a.chartType]({
      ...a.args,
      width: halfW,
      height: H,
      isCombinedMode: true,
    });

    const svgB = chartSvgBuilders[b.chartType]({
      ...b.args,
      width: halfW,
      height: H,
      isCombinedMode: true,
    });

    const innerA = extractInnerSvg(svgA);
    const innerB = extractInnerSvg(svgB);

    return `
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="${bg}"/>
  <g transform="translate(0,0)">${innerA}</g>
  <g transform="translate(${halfW},0)">${innerB}</g>
</svg>
`.trim();
  },
};
