"use client";

import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DatasetColumn, FrequencyData, ChartType } from "@/app/page";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

interface ColumnSelectorProps {
  columns: DatasetColumn[];
  selectedColumn: string;
  onSelect: (column: string) => void;

  frequencies: FrequencyData[];

  sheets: Array<{ name: string; id: number }>;
  selectedSheet: string;
  onSheetSelect: (sheet: string) => void;

  customColors?: Record<string, string>;
  onColorChange: (label: string, color: string) => void;

  excludedLabels: string[];
  onToggleExclude: (label: string) => void;
  onResetExclusions: () => void;
  adjustedPercentages: Record<string, number>;

  chartType: ChartType;

  // stacked (modo base de datos)
  stackedColumns: string[];
  onStackedColumnsChange: (cols: string[]) => void;

  // modo tabla de resultados
  inputMode: "raw" | "summary";
  questionCell: string;
  onQuestionCellChange: (value: string) => void;
  answerRange: string;
  onAnswerRangeChange: (value: string) => void;

  // stacked – tabla de resultados
  stackedLabelCells: string;
  onStackedLabelCellsChange: (value: string) => void;
  stackedRangesSummary: string;
  onStackedRangesSummaryChange: (value: string) => void;

  // 👇 NUEVO: para poder leer la leyenda desde el rango
  sheetValues: any[][];
}

/* Helpers para A1 (los uso solo para stacked+summary) */
function a1ToRowCol(a1: string) {
  const match = a1.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) throw new Error(`Referencia A1 inválida: ${a1}`);
  const [, colLetters, rowStr] = match;
  let col = 0;
  for (const ch of colLetters) {
    col = col * 26 + (ch.charCodeAt(0) - 64);
  }
  const row = parseInt(rowStr, 10);
  if (!row || row < 1) throw new Error(`Fila inválida en referencia A1: ${a1}`);
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

export function ColumnSelector({
  columns,
  selectedColumn,
  onSelect,
  frequencies,
  sheets,
  selectedSheet,
  onSheetSelect,
  customColors = {},
  onColorChange,
  excludedLabels,
  onToggleExclude,
  onResetExclusions,
  adjustedPercentages,
  chartType,
  stackedColumns,
  onStackedColumnsChange,
  inputMode,
  questionCell,
  onQuestionCellChange,
  answerRange,
  onAnswerRangeChange,
  stackedLabelCells,
  onStackedLabelCellsChange,
  stackedRangesSummary,
  onStackedRangesSummaryChange,
  sheetValues,
}: ColumnSelectorProps) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  const availableColors: Record<string, string> = {
    Si: "#00a651",
    No: "#e10814",
    Neutral: "#9d9d9c",
    Algoefectivo: "#63c26d",
    Pocoefectivo: "#c37171",
    Nadaefectivo: "#a93838",
    PAN: "#1161d7",
    MC: "#fa8500",
    VIDA: "#0b2b3f",
    Hombre: "#2d3182",
    Mujer: "#dc0180",
    Poligrama: "#9fff6a",
  };

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "")
      .trim();

  const handlePresetClick = (name: string, color: string) => {
    if (selectedLabel) {
      onColorChange(selectedLabel, color);
      return;
    }
    const keyN = normalize(name);
    const match = frequencies.find(
      (f) =>
        normalize(f.label).includes(keyN) ||
        keyN.includes(normalize(f.label))
    );
    if (match) onColorChange(match.label, color);
  };

  const isExcluded = (label: string) => excludedLabels.includes(label);

  const rowClass = (label: string) =>
    `flex items-center justify-between gap-3 text-sm rounded-md px-2 py-1 transition select-none
     ${selectedLabel === label ? "ring-2 ring-primary/70 bg-muted/40" : "hover:bg-muted/30"}
     ${isExcluded(label) ? "opacity-50 line-through" : ""}`;

  const isStackedSummary =
    chartType === "stacked" && inputMode === "summary";

  /* ------------------------------------------------------------------
   *  Leyenda real para stacked + summary (leer desde answerRange)
   * ------------------------------------------------------------------ */

  const legendLabelsForStackedSummary: string[] = useMemo(() => {
    if (!isStackedSummary) return [];
    if (!answerRange.trim() || !sheetValues.length) return [];

    try {
      const { rowStart, rowEnd, colStart } = parseA1Range(
        answerRange.trim()
      );
      const labels: string[] = [];

      for (let r = rowStart; r <= rowEnd; r++) {
        const row = sheetValues[r - 1] || [];
        const cell = row[colStart - 1];
        const label = cell != null ? String(cell).trim() : "";
        if (label) labels.push(label);
      }

      // quitar duplicados
      return Array.from(new Set(labels));
    } catch {
      return [];
    }
  }, [isStackedSummary, answerRange, sheetValues]);

  /**
   * Este es el array que realmente usamos para el selector de colores.
   * - Normal: usamos `frequencies` entero
   * - Stacked + summary: SOLO las etiquetas de la leyenda
   */
  const colorRows: FrequencyData[] = useMemo(() => {
    if (!frequencies.length) return [];

    if (!isStackedSummary) return frequencies;

    if (!legendLabelsForStackedSummary.length) {
      // si por algo no pudimos leer la leyenda, caemos al comportamiento normal
      return frequencies;
    }

    const legendSet = new Set(legendLabelsForStackedSummary);

    const byLabel = new Map<string, FrequencyData>();
    frequencies.forEach((f) => {
      if (!legendSet.has(f.label)) return;
      if (!byLabel.has(f.label)) byLabel.set(f.label, f);
    });

    return Array.from(byLabel.values());
  }, [frequencies, isStackedSummary, legendLabelsForStackedSummary]);

  const showFreqList = colorRows.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Elige una pregunta </CardTitle>
        <CardDescription>
          Elige la hoja y columna que contiene la pregunta
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Sheet */}
        {sheets.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Sheet</label>
            <Select value={selectedSheet} onValueChange={onSheetSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Select a sheet..." />
              </SelectTrigger>
              <SelectContent>
                {sheets.map((sheet) => (
                  <SelectItem key={sheet.id} value={sheet.name}>
                    {sheet.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* ----------------- MODO BASE DE DATOS ----------------- */}
        {inputMode === "raw" && (
          <>
            {/* Columna con pregunta */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Columna con pregunta
              </label>
              <Select
                value={selectedColumn}
                onValueChange={(val) => {
                  setSelectedLabel(null);
                  onSelect(val);
                }}
              >
                <SelectTrigger className="h-auto min-h-10 py-2 whitespace-normal text-left">
                  <SelectValue
                    placeholder="Elige una columna"
                    className="whitespace-normal text-left break-words"
                  />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((column, idx) => (
                    <SelectItem
                      key={`${column.name}-${idx}`}
                      value={column.name}
                      className="max-h-60 w-[32rem] overflow-y-auto"
                    >
                      {column.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Stacked: columnas (raw) */}
            {chartType === "stacked" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Columnas para el gráfico stacked
                </label>
                <p className="text-xs text-muted-foreground">
                  Selecciona las columnas que quieres como barras. El número de
                  barras será igual al número de columnas seleccionadas.
                </p>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between"
                      type="button"
                    >
                      {stackedColumns.length === 0 && "Selecciona columnas"}
                      {stackedColumns.length === 1 && stackedColumns[0]}
                      {stackedColumns.length > 1 &&
                        `${stackedColumns.length} columnas seleccionadas`}
                      <span className="ml-2 text-xs text-muted-foreground">
                        ▾
                      </span>
                    </Button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent
                    className="max-h-60 w-[26rem] overflow-y-auto"
                    align="start"
                  >
                    {columns.map((column) => {
                      const active = stackedColumns.includes(column.name);
                      return (
                        <DropdownMenuCheckboxItem
                          key={column.name}
                          checked={active}
                          onCheckedChange={(checked) => {
                            const next = checked
                              ? [...stackedColumns, column.name]
                              : stackedColumns.filter(
                                  (c) => c !== column.name
                                );
                            onStackedColumnsChange(next);
                          }}
                          className="text-xs whitespace-normal break-words"
                        >
                          {column.name}
                        </DropdownMenuCheckboxItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>

                {stackedColumns.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Barras seleccionadas:{" "}
                    <strong>{stackedColumns.length}</strong>
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* ----------------- MODO TABLA DE RESULTADOS ----------------- */}
        {inputMode === "summary" && (
          <div className="space-y-4">
            {/* Celda con la pregunta (título grande) */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Celda con la pregunta
              </label>
              <Input
                value={questionCell}
                onChange={(e) => onQuestionCellChange(e.target.value)}
                placeholder="Ej. C6"
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">
                Usa notación A1 (columna + fila). Ejemplo:{" "}
                <code className="font-mono">C6</code> para la celda donde está
                la pregunta.
              </p>
            </div>

            {/* Para TODOS los gráficos de tabla excepto stacked:
                rango “normal” etiqueta + % */}
            {chartType !== "stacked" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Rango de respuestas y %
                </label>
                <Input
                  value={answerRange}
                  onChange={(e) => onAnswerRangeChange(e.target.value)}
                  placeholder="Ej. B7:C15"
                  className="max-w-xs"
                />
                <p className="text-xs text-muted-foreground">
                  El rango debe incluir{" "}
                  <span className="font-semibold">dos columnas</span>: la
                  primera con las respuestas (etiquetas) y la segunda con el
                  porcentaje. Ejemplo:{" "}
                  <code className="font-mono">B7:C15</code>.
                </p>
              </div>
            )}

            {/* Específico para stacked – tabla de resultados */}
            {chartType === "stacked" && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Posibles respuestas (para la leyenda)
                  </label>
                  <Input
                    value={answerRange}
                    onChange={(e) => onAnswerRangeChange(e.target.value)}
                    placeholder="Ej. C4:D7"
                    className="max-w-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Rango con las opciones de respuesta (etiquetas + %). Solo
                    se usan las etiquetas para la leyenda superior.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Celdas con el título de cada barra
                  </label>
                  <Input
                    value={stackedLabelCells}
                    onChange={(e) =>
                      onStackedLabelCellsChange(e.target.value)
                    }
                    placeholder="Ej. B7,B13,B19"
                    className="max-w-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Lista de celdas separadas por coma. Cada celda contiene el
                    título corto de una barra (por ejemplo, el nombre de cada
                    persona evaluada).
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Rangos de respuestas por barra
                  </label>
                  <Input
                    value={stackedRangesSummary}
                    onChange={(e) =>
                      onStackedRangesSummaryChange(e.target.value)
                    }
                    placeholder="Ej. C7:D11, C13:D17, C19:D23"
                    className="max-w-md"
                  />
                  <p className="text-xs text-muted-foreground">
                    Cada rango (etiquetas + %) define una barra apilada. Usa
                    comas para separar las barras. Ejemplo:{" "}
                    <code className="font-mono">
                      C7:D11, C13:D17, C19:D23
                    </code>
                    .
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Frecuencia de respuestas y colores */}
        {showFreqList && (
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-baseline justify-between">
              <h4 className="text-sm font-medium text-foreground">
                Frecuencia de respuestas y colores
              </h4>
              <div className="text-xs text-muted-foreground">
                Tip: click en una respuesta para seleccionarla;{" "}
                <span className="font-medium">click derecho</span> para
                excluir/incluir.
              </div>
            </div>

            {isStackedSummary && (
              <p className="text-xs text-muted-foreground">
                (En stacked + tabla de resultados solo se muestran las opciones
                de la <strong>leyenda</strong>: Muy buena, Buena, Regular, etc.)
              </p>
            )}

            {excludedLabels.length > 0 && (
              <div className="text-xs flex items-center justify-between rounded bg-muted px-2 py-1">
                <span>
                  Excluidas: <strong>{excludedLabels.length}</strong>{" "}
                  (re-normalizado al 100%)
                </span>
                <button
                  className="underline hover:no-underline"
                  type="button"
                  onClick={onResetExclusions}
                  title="Restablecer exclusiones"
                >
                  Restablecer
                </button>
              </div>
            )}

            <div className="space-y-1">
              {colorRows.map((freq) => {
                const adjusted = adjustedPercentages[freq.label];
                const showAdjusted =
                  adjusted !== undefined &&
                  adjusted !== freq.percentage &&
                  !isExcluded(freq.label);

                return (
                  <div
                    key={freq.label}
                    className={rowClass(freq.label)}
                    onClick={(e) => {
                      if (e.altKey) {
                        onToggleExclude(freq.label);
                        return;
                      }
                      setSelectedLabel(freq.label);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onToggleExclude(freq.label);
                    }}
                    role="button"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        type="color"
                        value={customColors[freq.label] || "#00a651"}
                        onChange={(e) =>
                          onColorChange(freq.label, e.target.value)
                        }
                        onClick={(e) => e.stopPropagation()}
                        className="w-8 h-8 rounded cursor-pointer border border-border flex-shrink-0"
                        title="Choose color"
                        style={{ minWidth: 32, minHeight: 32 }}
                        disabled={isExcluded(freq.label)}
                      />
                      <span className="text-muted-foreground truncate">
                        {freq.label}{" "}
                        {isExcluded(freq.label) && (
                          <em className="ml-2 text-[11px]">[Excluido]</em>
                        )}
                      </span>
                    </div>

                    <span className="font-medium text-foreground whitespace-nowrap">
                      {freq.value}{" "}
                      {showAdjusted
                        ? `(${freq.percentage}% → ${adjustedPercentages[freq.label]}%)`
                        : `(${freq.percentage}%)`}
                    </span>
                  </div>
                );
              })}
            </div>

            <details className="mt-3">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Colores predeterminados{" "}
                {selectedLabel ? `(aplicar a: ${selectedLabel})` : ""}
              </summary>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {Object.entries(availableColors).map(([name, color]) => (
                  <button
                    key={name}
                    onClick={() => handlePresetClick(name, color)}
                    className="flex flex-col items-center gap-1 p-2 rounded hover:bg-muted text-xs border"
                    title={`${name}: ${color}`}
                    type="button"
                  >
                    <div
                      className="w-6 h-6 rounded border border-border"
                      style={{ backgroundColor: color }}
                    />
                    <span className="truncate w-full text-center">
                      {name}
                    </span>
                  </button>
                ))}
              </div>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
