// lib/chart-svgs.ts
import type { ChartType, FrequencyData, DatasetColumn } from "@/app/page";
import type { Brand } from "@/types/brand";

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

import { buildBarNarrowSvg } from "./export-narrow-bar-svg";
import { buildScoreTrackingCensSvg } from "./export-single-track-svg";
import { buildNarrowVertBarsSvg } from "./export-narrow-vert-bars-svg";

import { MikebuildBarSvg } from "./export-bar-mikeflores";
import { getBrandTheme } from "@/lib/brand-theme";
import { buildTrackingMikeFloresSvg } from "./export-tracking-mike-flores";
import { buildTrackingWithPillsMikeFloresSvg } from "./export-trackingwpills-mikeflores";
import { buildTableMikeFloresSvg } from "./export-table-mikeflores";
import { buildDonutMikeFloresSvg } from "./export-donut-mikeflores";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export interface ChartSvgArgs {
  data: FrequencyData[];
  title: string;

  // generic dataset
  secondColumn?: string;
  columns?: DatasetColumn[];
  customColors?: Record<string, string>;
  sheetTitle?: string;

  // sizing
  width?: number;
  height?: number;

  // input modes
  inputMode?: "raw" | "summary";
  sheetValues?: any[][];

  // ordering
  labelOrder?: string[];
  matrixRowOrder?: string[];

  // stacked (raw)
  stackedColumns?: string[];

  // stacked (summary)
  stackedLabelCells?: string;
  stackedRangesSummary?: string;

  // matrix/tracking ranges
  answerRange?: string;
  questionCell?: string;

  // styling
  backgroundColor?: string;
  textColor?: string;
  brand?: Brand;

  // combined
  combinedCharts?: [
    { chartType: ChartType; args: ChartSvgArgs; title?: string },
    { chartType: ChartType; args: ChartSvgArgs; title?: string }
  ];
  isCombinedMode?: boolean;

  // misc
  hideLegend?: boolean;
}

export type ChartSvgBuilder = (args: ChartSvgArgs) => string;

/* ------------------------------------------------------------------ */
/* Small utils                                                        */
/* ------------------------------------------------------------------ */

const BASE_BOUNDS = { x: 0, y: 0, w: 1920, h: 1080 };

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function isDeskoverBrand(a?: Brand) {
  return a === "deskover";
}

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

/* ------------------------------------------------------------------ */
/* SVG Extraction / Bounds                                             */
/* ------------------------------------------------------------------ */

type SvgBounds = { x: number; y: number; w: number; h: number };
type ExtractedSvg = { inner: string; bounds: SvgBounds | null };

function getFallbackBoundsFromSvg(svg: string): SvgBounds | null {
  const vbMatch = svg.match(/viewBox="([^"]+)"/i);
  if (vbMatch) {
    const nums = vbMatch[1].trim().split(/\s+/).map(Number);
    if (nums.length === 4 && nums.every(Number.isFinite)) {
      const [, , w, h] = nums;
      if (w > 0 && h > 0) return { x: 0, y: 0, w, h };
    }
  }

  const wMatch = svg.match(/\bwidth="([^"]+)"/i);
  const hMatch = svg.match(/\bheight="([^"]+)"/i);
  const w = wMatch ? Number(String(wMatch[1]).replace(/[^\d.]/g, "")) : NaN;
  const h = hMatch ? Number(String(hMatch[1]).replace(/[^\d.]/g, "")) : NaN;
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return { x: 0, y: 0, w, h };
  }

  return null;
}

/**
 * Extrae el contenido dentro de <g id="chart-content"> ... </g>
 * y opcionalmente el rect id="content-bounds".
 * Si no existe <g id="chart-content">, hace fallback a “inner sin wrapper”.
 */
function extractChartContent(svg: string, wantBounds: boolean): ExtractedSvg {
  const gStart = svg.search(/<g[^>]*id="chart-content"[^>]*>/i);

  // Fallback: quita wrapper <svg> y rect full background
  if (gStart === -1) {
    const inner = svg
      .replace(/^[\s\S]*?<svg[^>]*>/i, "")
      .replace(/<\/svg>\s*$/i, "")
      .replace(/<rect[^>]*width="100%"[^>]*height="100%"[^>]*\/?>/i, "");

    return { inner, bounds: wantBounds ? getFallbackBoundsFromSvg(svg) : null };
  }

  const openTagMatch = svg.slice(gStart).match(/<g[^>]*id="chart-content"[^>]*>/i);
  if (!openTagMatch) {
    return { inner: "", bounds: wantBounds ? getFallbackBoundsFromSvg(svg) : null };
  }

  const openTag = openTagMatch[0];
  const contentStart = gStart + openTag.length;

  // Encontrar cierre correcto del </g> con depth
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

      if (!wantBounds) return { inner, bounds: null };

      // 1) busca content-bounds dentro del inner
      const rectMatch = inner.match(/<rect[^>]*id="content-bounds"[^>]*>/i);
      if (!rectMatch) {
        return { inner, bounds: getFallbackBoundsFromSvg(svg) };
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
        return { inner, bounds: getFallbackBoundsFromSvg(svg) };
      }

      return { inner, bounds: { x, y, w, h } };
    }
  }

  return { inner: "", bounds: wantBounds ? getFallbackBoundsFromSvg(svg) : null };
}

function extractInnerSvg(svg: string) {
  return extractChartContent(svg, false).inner;
}

function extractInnerSvgWithBounds(svg: string) {
  return extractChartContent(svg, true);
}

function namespaceSvgIds(fragment: string, prefix: string) {
  if (!fragment) return fragment;

  const ids = new Set<string>();
  fragment.replace(/\bid="([^"]+)"/g, (_m, id) => {
    ids.add(id);
    return _m;
  });

  let out = fragment;
  ids.forEach((id) => {
    const nid = `${prefix}${id}`;
    out = out.replace(new RegExp(`\\bid="${id}"`, "g"), `id="${nid}"`);
    out = out.replace(new RegExp(`url\\(#${id}\\)`, "g"), `url(#${nid})`);
    out = out.replace(new RegExp(`\\bhref="#${id}"`, "g"), `href="#${nid}"`);
    out = out.replace(new RegExp(`\\bxlink:href="#${id}"`, "g"), `xlink:href="#${nid}"`);
  });

  return out;
}

function placeIntoSlot(
  inner: string,
  bounds: SvgBounds | null,
  slotW: number,
  slotH: number,
  opts?: {
    allowUpscale?: boolean;
    maxScale?: number;
    margin?: number;
    forceScale?: number;
    alignY?: "center" | "top";
      alignX?: "center" | "left";   
  }
) {
  const b = bounds ?? BASE_BOUNDS;

  const fitScale = Math.min(slotW / b.w, slotH / b.h);
  const allowUpscale = opts?.allowUpscale ?? false;
  const maxScale = opts?.maxScale ?? 1.35;
  const margin = opts?.margin ?? 0.96;

  const baseScale =
    typeof opts?.forceScale === "number"
      ? Math.min(opts.forceScale, fitScale)
      : allowUpscale
      ? Math.min(maxScale, fitScale)
      : Math.min(1, fitScale);

  const s = baseScale * margin;

  const scaledW = b.w * s;
  const scaledH = b.h * s;
const alignX = opts?.alignX ?? "center";
const dx = alignX === "left" ? 0 : (slotW - scaledW) / 2;

  const alignY = opts?.alignY ?? "center";
  const dy = alignY === "top" ? 0 : (slotH - scaledH) / 2;

  return `
    <g transform="translate(${dx},${dy}) scale(${s}) translate(${-b.x},${-b.y})">
      ${inner}
    </g>
  `.trim();
}

/* ------------------------------------------------------------------ */
/* Stacked RAW                                                        */
/* ------------------------------------------------------------------ */

function makeStackedRowsRaw({
  columns = [],
  stackedColumns = [],
  labelOrder = [],
}: ChartSvgArgs): StackedRow[] {
  if (!stackedColumns.length) return [];

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

      // intenta usar columna % al lado (si parece porcentaje)
      let percentCol: DatasetColumn | undefined;
      const candidate = columns[colIndex + 1];

      if (candidate) {
        const nameLooksLikePercent = /porcentaje/i.test(candidate.name);
        const hasNumeric = candidate.values.some((v) => !Number.isNaN(parsePercent(v)));
        if (nameLooksLikePercent || hasNumeric) percentCol = candidate;
      }

      if (!percentCol) {
        return { label: colName, segments: makeRawSegments(questionCol) };
      }

      const segments = categories.map((cat) => {
        const rowIdx = questionCol.values.findIndex((v) => v === cat);
        const rawPct = rowIdx === -1 ? NaN : parsePercent(percentCol!.values[rowIdx]);
        return { label: cat, percentage: Number((rawPct || 0).toFixed(1)) };
      });

      return { label: colName, segments };
    })
    .filter(Boolean) as StackedRow[];
}

/* ------------------------------------------------------------------ */
/* Stacked SUMMARY (A1)                                                */
/* ------------------------------------------------------------------ */

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
    console.warn("El rango stacked debería incluir al menos dos columnas (etiqueta y %).", trimmed);
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

    segments.push({ label, percentage: Number(percNum.toFixed(1)) });
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
/* Combined rendering                                                   */
/* ------------------------------------------------------------------ */

function svgWrapper(W: number, H: number, bg: string, content: string) {
  return `
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="${bg}"/>
  ${content}
</svg>
`.trim();
}

function buildCombinedPoligramaSideBySide(
  leftSvg: string,
  rightSvg: string,
  W: number,
  H: number,
  bg: string
) {
  const halfW = Math.round(W / 2);
  const innerL = extractInnerSvg(leftSvg);
  const innerR = extractInnerSvg(rightSvg);

  return svgWrapper(
    W,
    H,
    bg,
    `
  <g transform="translate(0,0)">${innerL}</g>
  <g transform="translate(${halfW},0)">${innerR}</g>
    `.trim()
  );
}

function buildCombinedDeskoverVerticalWithCommonScale(
  svgA: string,
  svgB: string,
  W: number,
  H: number,
  bg: string,
  layout?: { topShare?: number; topPadShare?: number; gapShare?: number }
) {
  const TOP_PAD = Math.round(H * (layout?.topPadShare ?? 0.06));
  const GAP = Math.round(H * (layout?.gapShare ?? 0.03));

  const availableH = H - TOP_PAD - GAP;
  const topH = Math.round(availableH * (layout?.topShare ?? 0.5));
  const bottomH = availableH - topH;

  const A = extractInnerSvgWithBounds(svgA);
  const B = extractInnerSvgWithBounds(svgB);

  const innerA = namespaceSvgIds(A.inner, "c1-");
  const innerB = namespaceSvgIds(B.inner, "c2-");

  const fitA = Math.min(W / (A.bounds?.w ?? BASE_BOUNDS.w), topH / (A.bounds?.h ?? BASE_BOUNDS.h));
  const fitB = Math.min(
    W / (B.bounds?.w ?? BASE_BOUNDS.w),
    bottomH / (B.bounds?.h ?? BASE_BOUNDS.h)
  );
  const commonScale = Math.min(fitA, fitB);

  const placedA = placeIntoSlot(innerA, A.bounds, W, topH, {
    allowUpscale: true,
    maxScale: 1.35,
    margin: 0.98,
    forceScale: commonScale,
    alignY: "top",
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

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

function buildDonutByBrand(args: ChartSvgArgs) {
  if (isDeskoverBrand(args.brand)) {
    return buildDonutMikeFloresSvg({
      ...args,
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
}

function buildTrackingByBrand(args: ChartSvgArgs) {
  if (isDeskoverBrand(args.brand)) {
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
}

function buildTrackingPillsByBrand(args: ChartSvgArgs) {
  if (isDeskoverBrand(args.brand)) {
    return buildTrackingWithPillsMikeFloresSvg({
      ...args,
      sheetValues: args.sheetValues,
      answerRange: args.answerRange,
      isCombinedMode: args.isCombinedMode,
      hideLegend: args.hideLegend,
    });
  }
  // Poligrama: fallback a tracking normal
  return buildTrackingByBrand(args);
}

function buildStacked(args: ChartSvgArgs) {
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
}

function buildMikeBar(args: ChartSvgArgs) {
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
}

function buildCombined(args: ChartSvgArgs) {
  if (!args.combinedCharts) return "";
  const [a, b] = args.combinedCharts;
  if (a.chartType === "combined" || b.chartType === "combined") return "";

  const W = args.width ?? 1920;
  const H = args.height ?? 1080;
  const bg = args.backgroundColor ?? "#000";

  const deskover = isDeskoverBrand(a.args.brand ?? b.args.brand);

  const hasTracking = a.chartType === "tracking" || b.chartType === "tracking";

  // ---------- TRACKING special layout ----------
  if (hasTracking) {
    const trackingChart = a.chartType === "tracking" ? a : b;
    const otherChart = a.chartType === "tracking" ? b : a;

    if (deskover) {
      // Deskover arriba/abajo, tracking abajo más grande
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

      // topShare 0.42 (como lo traías)
      return buildCombinedDeskoverVerticalWithCommonScale(svgOther, svgTracking, W, H, bg, {
        topShare: 0.42,
        topPadShare: 0.06,
        gapShare: 0.03,
      });
    }

    // Poligrama: izquierda/derecha
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

    return svgWrapper(
      W,
      H,
      bg,
      `
  <g transform="translate(0,0)">${innerOther}</g>
  <g transform="translate(${otherW},0)">${innerTracking}</g>
      `.trim()
    );

    
  }

  // ---------- DEFAULT combined ----------
  const brand = (a.args.brand ?? b.args.brand) as Brand | undefined;
  const isCens = brand === "censEdmundSinsa";

if (isCens) {

// dentro de buildCombined(args) -> if (isCens) { ... }

// ✅ B) Fuerza el orden: narrow arriba, stacked abajo
const topChart =
  a.chartType === "narrowvertbars" ? a :
  b.chartType === "narrowvertbars" ? b :
  a; // fallback

const bottomChart =
  topChart === a ? b : a;

// (opcional pero recomendado) si quieres ser estricto:
/// if (topChart.chartType !== "narrowvertbars" || bottomChart.chartType !== "stackedvertical") {
///   console.warn("CENS combined esperaba narrowvertbars arriba y stackedvertical abajo");
/// }

const outBg = args.backgroundColor ?? "#ffffff";
const outW = 612;
const outH = 792;

const BASE_W = 1440;
const BASE_H = 1800;

// ✅ usa topChart / bottomChart en lugar de a / b
const svgTop = chartSvgBuilders[topChart.chartType]({
  ...topChart.args,
  width: BASE_W,
  height: BASE_H,
  isCombinedMode: true, // (recomendado, para que no achique)
});

const svgBottom = chartSvgBuilders[bottomChart.chartType]({
  ...bottomChart.args,
  width: BASE_W,
  height: BASE_H,
  isCombinedMode: true,
});


  const top = extractInnerSvgWithBounds(svgTop);
  const bottom = extractInnerSvgWithBounds(svgBottom);

  const topB = top.bounds ?? { x: 0, y: 0, w: outW, h: outH };
  const bottomB = bottom.bounds ?? { x: 0, y: 0, w: outW, h: outH };

  const topInner = namespaceSvgIds(top.inner, "c1-");
  const bottomInner = namespaceSvgIds(bottom.inner, "c2-");

  const TOP_PAD = Math.round(outH * 0.01);
  const GAP = Math.round(outH * 0.015);
  const availableH = outH - TOP_PAD - GAP;

  // reparto por content-bounds, con clamps
  const rawShare = topB.h / Math.max(1, topB.h + bottomB.h);
  const topShare = Math.min(0.62, Math.max(0.38, rawShare));
  const topH = Math.max(1, Math.round(availableH * topShare));
  const bottomH = Math.max(1, availableH - topH);

  // ✅ common scale (igual que Deskover)
  // ✅ Opción A: escala independiente (evita que el peor "encoga" a los dos)
const scaleTop = Math.min(outW / topB.w);
const scaleBottom = Math.min(outW / bottomB.w);

const placedTop = placeIntoSlot(topInner, topB, outW, topH, {
  forceScale: scaleTop,
  margin: 1,
  alignY: "top",
  alignX: "center",
  allowUpscale: true,
  maxScale: 1.5,
});

const placedBottom = placeIntoSlot(bottomInner, bottomB, outW, bottomH, {
  forceScale: scaleBottom,
  margin: 1,
  alignY: "top",
  alignX: "center",
  allowUpscale: true,
  maxScale: 1.5,
});

  const clipTopId = "clip-top";
  const clipBottomId = "clip-bottom";

  return `
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${outW} ${outH}">
  <rect width="100%" height="100%" fill="${outBg}"/>

  <defs>
    <clipPath id="${clipTopId}">
      <rect x="0" y="0" width="${outW}" height="${topH}" />
    </clipPath>
    <clipPath id="${clipBottomId}">
      <rect x="0" y="0" width="${outW}" height="${bottomH}" />
    </clipPath>
  </defs>

  <g transform="translate(0,${TOP_PAD})" clip-path="url(#${clipTopId})">
    ${placedTop}
  </g>

  <g transform="translate(0,${TOP_PAD + topH + GAP})" clip-path="url(#${clipBottomId})">
    ${placedBottom}
  </g>
</svg>
`.trim();
}



  
  if (deskover) {
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

    return buildCombinedDeskoverVerticalWithCommonScale(svgA, svgB, W, H, bg, {
      topShare: 0.5,
      topPadShare: 0.06,
      gapShare: 0.03,
    });
  }

  // Poligrama: side-by-side half/half
  const halfW = Math.round(W / 2);
  const svgA = chartSvgBuilders[a.chartType]({ ...a.args, width: halfW, height: H, isCombinedMode: true });
  const svgB = chartSvgBuilders[b.chartType]({ ...b.args, width: halfW, height: H, isCombinedMode: true });
  return buildCombinedPoligramaSideBySide(svgA, svgB, W, H, bg);
}

/* ------------------------------------------------------------------ */
/* Exported builder map                                                */
/* ------------------------------------------------------------------ */

export const chartSvgBuilders: Record<ChartType, ChartSvgBuilder> = {
  donut: buildDonutByBrand,

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

  tracking: buildTrackingByBrand,

  trackingpills: buildTrackingPillsByBrand,

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

  stacked: buildStacked,

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
      isCombinedMode: args.isCombinedMode,
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
      isCombinedMode: args.isCombinedMode,
    }),

  mikebar: buildMikeBar,

  table: (args) => {
    if (!isDeskoverBrand(args.brand)) return "";
    return buildTableMikeFloresSvg({
      ...args,
      sheetValues: args.sheetValues,
      answerRange: args.answerRange,
      isCombinedMode: args.isCombinedMode,
    });
  },

  combined: buildCombined,
};
