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
    }),

  bar: (args) => buildBarSvg(args),

  matrix: (args) =>
    buildMatrixSvg({
      data: args.data,
      title: args.title,
      columns: args.columns ?? [],
      customColors: args.customColors,
      secondColumn: args.secondColumn ?? "",
      sheetTitle: args.sheetTitle,
      width: args.width,
      height: args.height,
      inputMode: args.inputMode,
      sheetValues: args.sheetValues,
      secondAnswerRange: args.secondAnswerRange,
    }),

  score: (args) =>
    buildScoreSvg({
      data: args.data,
      title: args.title,
      customColors: args.customColors,
      sheetTitle: args.sheetTitle,
      width: args.width,
      height: args.height,
    }),

  approval: (args) =>
    buildApprovalSvg({
      data: args.data,
      title: args.title,
      customColors: args.customColors,
      sheetTitle: args.sheetTitle,
      width: args.width,
      height: args.height,
    }),

  partido: (args) =>
    buildPartidoSvg({
      data: args.data,
      title: args.title,
      customColors: args.customColors,
      sheetTitle: args.sheetTitle,
      width: args.width,
      height: args.height,
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
      secondAnswerRange: args.secondAnswerRange,
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
    });
  },
};
