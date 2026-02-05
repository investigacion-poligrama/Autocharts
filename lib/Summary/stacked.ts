// lib/summary/stacked.ts

import type { ChartSvgArgs } from "@/lib/chart-svgs";
import type { DatasetColumn } from "@/app/page";

import type { StackedRow, StackedSegment } from "@/lib/POLIGRAMA/export-stackedbar-svg-poligrama";
import { a1ToRowCol, parseA1Range } from "@/lib/Summary/a1";

/* ------------------------------------------------------------------ */
/* Percent parsing                                                     */
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

function buildSummarySegmentsFromRange(values: any[][], range: string): StackedSegment[] {
  const trimmed = range.trim();
  if (!trimmed) return [];

  let parsed;
  try {
    parsed = parseA1Range(trimmed);
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
        const { row, col } = a1ToRowCol(ref);
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
/* Exported API                                                       */
/* ------------------------------------------------------------------ */

export function makeStackedRows(args: ChartSvgArgs): StackedRow[] {
  return args.inputMode === "summary" ? makeStackedRowsSummary(args) : makeStackedRowsRaw(args);
}
