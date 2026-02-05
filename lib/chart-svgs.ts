// lib/chart-svgs.ts
import type { ChartType, FrequencyData, DatasetColumn } from "@/types/charts";
import type { Brand } from "@/types/brand";
import { buildDonutSvg } from "@/lib/POLIGRAMA/export-donut-svg-poligrama";
import { buildBarSvg } from "@/lib/POLIGRAMA/export-bar-svg-poligrama";
import { buildMatrixSvg } from "@/lib/POLIGRAMA/export-matrix-svg-poligrama";
import { buildScoreSvg } from "@/lib/POLIGRAMA/export-score-svg-poligrama";
import { buildApprovalSvg } from "@/lib/POLIGRAMA/export-approval-svg-poligrama";
import { buildPartidoSvg } from "@/lib/POLIGRAMA/export-partido-svg-poligrama";
import { buildTrackingSvg } from "@/lib/POLIGRAMA/export-tracking-svg-poligrama";
import { buildMediumDonutSvg } from "@/lib/POLIGRAMA/export-mediumdonut-svg-poligrama";

import {
  buildStackedBarSvg,
  StackedRow,
} from "@/lib/POLIGRAMA/export-stackedbar-svg-poligrama";

import { buildStackedVerticalSvg } from "@/lib/CENS/export-stackedvertical-svg";

import { buildBarNarrowSvg } from "./CENS/export-narrow-bar-svg";
import { buildScoreTrackingCensSvg } from "./CENS/export-single-track-svg";
import { buildNarrowVertBarsSvg } from "./CENS/export-narrow-vert-bars-svg";

import { MikebuildBarSvg } from "./MIKE/export-bar-mikeflores";
import { getBrandTheme } from "@/lib/brand-theme";
import { buildTrackingMikeFloresSvg } from "./MIKE/export-tracking-mike-flores";
import { buildTrackingWithPillsMikeFloresSvg } from "./MIKE/export-trackingwpills-mikeflores";
import { buildTableMikeFloresSvg } from "./MIKE/export-table-mikeflores";
import { buildDonutMikeFloresSvg } from "./MIKE/export-donut-mikeflores";

import {
  svgWrapper,
  extractGroup,
  extractInnerSvg,
  extractInnerSvgWithBounds,
  namespaceSvgIds,
  placeIntoSlot,
  extractRectBoundsFromFragment,
  BASE_BOUNDS,
} from "@/lib/SVG/compose";

import { makeStackedRows } from "@/lib/Summary/stacked";

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
  secondAnswerRange?: string;

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

function isDeskoverBrand(a?: Brand) {
  return a === "deskover";
}

/* ------------------------------------------------------------------ */
/* Combined rendering                                                   */
/* ------------------------------------------------------------------ */

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
  const stackedData = makeStackedRows(args);

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
    // ------------------------------------------------------------------
    // CENS Combined: A (header+title) + B (narrow plot) + C (stacked plot)
    // ------------------------------------------------------------------

    // ✅ B) Fuerza el orden: narrow arriba, stacked abajo
    const topChart =
      a.chartType === "narrowvertbars"
        ? a
        : b.chartType === "narrowvertbars"
        ? b
        : a; // fallback

    const bottomChart = topChart === a ? b : a;

    const outBg = args.backgroundColor ?? "#ffffff";
    const outW = 612;
    const outH = 792;

    // Render “base” para extraer header/plot con bounds buenos (tall rules)
    const BASE_W = 1440;
    const BASE_H = 1800;

    const svgTop = chartSvgBuilders[topChart.chartType]({
      ...topChart.args,
      width: BASE_W,
      height: BASE_H,
      isCombinedMode: true,
    });

    const svgBottom = chartSvgBuilders[bottomChart.chartType]({
      ...bottomChart.args,
      width: BASE_W,
      height: BASE_H,
      isCombinedMode: true,
    });

    // -----------------------------
    // A) Header + título (sin escala)
    // -----------------------------
    const headerInnerRaw = extractGroup(svgTop, "chart-header");
    const headerInner = namespaceSvgIds(headerInnerRaw, "h-");
    const headerB =
      extractRectBoundsFromFragment(headerInnerRaw, "header-bounds") ?? { x: 0, y: 0, w: BASE_W, h: 380 }; // fallback

    // -----------------------------
    // B) Plot narrow (solo chart-plot)
    // -----------------------------
    const topPlotInnerRaw = extractGroup(svgTop, "chart-plot");
    const topPlotInner = namespaceSvgIds(topPlotInnerRaw, "b-");
    const topPlotB =
      extractRectBoundsFromFragment(topPlotInnerRaw, "content-bounds") ??
      extractInnerSvgWithBounds(svgTop).bounds;

    // -----------------------------
    // C) Plot stacked (solo chart-plot)
    // -----------------------------
    const bottomPlotInnerRaw = extractGroup(svgBottom, "chart-plot");
    const bottomPlotInner = namespaceSvgIds(bottomPlotInnerRaw, "c-");
    const bottomPlotB =
      extractRectBoundsFromFragment(bottomPlotInnerRaw, "content-bounds") ??
      extractInnerSvgWithBounds(svgBottom).bounds;

    // -----------------------------
    // Layout: A fijo, B/C se reparten el resto del alto
    // -----------------------------
    const TOP_PAD = 0;
    const GAP = Math.round(outH * 0.015);

    // Header H: usa bounds reales; fallback 260
    const headerSlotH = Math.round(outH * 0.3); // 30% suele verse como tu “foto buena”

    const availableH = outH - TOP_PAD - headerSlotH - GAP;
    const topShare = 0.44; // 👈 fijo (más estable que usar bounds.h)
    const topH = Math.round(availableH * topShare);
    const bottomH = availableH - topH;

    // Place header (ESCALADO)
    const placedHeader = placeIntoSlot(headerInner, headerB, outW, headerSlotH, {
      allowUpscale: false,
      margin: 1,
      alignY: "top",
      alignX: "left",
    });

    // Place plots (ESCALADOS)
    const placedTop = placeIntoSlot(topPlotInner, topPlotB, outW, topH, {
      allowUpscale: true,
      maxScale: 2.2,
      margin: 1,
      alignY: "top",
      alignX: "center",
    });

    // mismo “margen” que usa el header en la maqueta 1440
    const LEFT_INSET = Math.round(outW * (100 / 1440)); // ~42px en 612

    const placedBottom = placeIntoSlot(bottomPlotInner, bottomPlotB, outW - LEFT_INSET, bottomH, {
      allowUpscale: true,
      maxScale: 2.2,
      margin: 1,
      alignY: "top",
      alignX: "left",
    });

    return `
<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${outW} ${outH}">
  <rect width="100%" height="100%" fill="${outBg}"/>
  <g transform="translate(0,${TOP_PAD})">${placedHeader}</g>
  <g transform="translate(0,${TOP_PAD + headerSlotH})">${placedTop}</g>
  <g transform="translate(${LEFT_INSET},${TOP_PAD + headerSlotH + topH + GAP})">${placedBottom}</g>
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
