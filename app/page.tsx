"use client";

import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { DatasetInput } from "@/components/dataset-input";
import { ColumnSelector } from "@/components/column-selector";
import { ChartTypeSelector } from "@/components/chart-type-selector";
import ChartPreview from "@/components/chart-preview";
import { GoogleAuth } from "@/components/google-auth";
import { DragList } from "@/components/ui/draglist";

import { calculateRawFrequencies, parseSpreadsheetId } from "@/lib/frequencies";
import { chartSvgBuilders } from "@/lib/chart-svgs";
import { useExportQueue } from "@/lib/export-queue";
import type { Brand } from "@/types/brand";
import { getBrandTheme } from "@/lib/brand-theme";

export type ChartType =
  | "donut"
  | "bar"
  | "matrix"
  | "score"
  | "approval"
  | "partido"
  | "tracking"
  | "stacked"
  | "mediumdonut"
  | "barnarrow"
  | "stackedvertical"
  | "narrowvertbars"
  | "singletrack";

export interface DatasetColumn {
  name: string;
  values: string[];
}

export interface FrequencyData {
  label: string;
  value: number;
  percentage: number;
}

type InputMode = "raw" | "summary";

/* Helpers A1 */

function a1ToRowCol(a1: string) {
  const match = a1.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) {
    throw new Error(`Referencia A1 inválida: ${a1}`);
  }
  const [, colLetters, rowStr] = match;
  let col = 0;
  for (const ch of colLetters) col = col * 26 + (ch.charCodeAt(0) - 64);
  const row = parseInt(rowStr, 10);
  if (!row || row < 1) throw new Error(`Fila inválida en referencia A1: ${a1}`);
  return { row, col };
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
function buildMediumDonutSummary(values: any[][], range: string): FrequencyData[] {
  const trimmed = range.trim();
  if (!trimmed) return [];

  let parsed;
  try {
    parsed = parseA1Range(trimmed);
  } catch {
    return [];
  }

  const { rowStart, rowEnd, colStart } = parsed;

  const freqs: FrequencyData[] = [];

  for (let r = rowStart; r <= rowEnd; r++) {
    const row = values[r - 1] || [];

    // ✅ label en columna anterior al rango
    const rawLabel = row[colStart - 2];
    const label = rawLabel != null ? String(rawLabel).trim() : "";
    if (!label) continue;

    // ✅ porcentaje en la primera columna del rango (B)
    const rawPercent = row[colStart - 1];
    let pct = 0;

    if (typeof rawPercent === "number") {
      pct = rawPercent > 0 && rawPercent <= 1 ? rawPercent * 100 : rawPercent;
    } else if (typeof rawPercent === "string") {
      const cleaned = rawPercent.replace("%", "").replace(",", ".").trim();
      const parsedNum = parseFloat(cleaned);
      if (!Number.isNaN(parsedNum)) pct = parsedNum <= 1 ? parsedNum * 100 : parsedNum;
    }

    pct = Number(pct.toFixed(1));

    freqs.push({ label, value: pct, percentage: pct });
  }

  return freqs;
}

function buildSingleTrackFromRange(values: any[][], range: string): FrequencyData[] {
  const trimmed = range.trim();
  if (!trimmed) return [];
  let parsed;
  try {
    parsed = parseA1Range(trimmed);
  } catch {
    return [];
  }

  const { rowStart, colStart, colEnd } = parsed;
  const headerRow = values[rowStart - 1] || [];
  const valueRow = values[rowStart] || [];
  const out: FrequencyData[] = [];

  for (let c = colStart + 1; c <= colEnd; c++) {
    const rawMonth = headerRow[c - 1];
    const rawVal = valueRow[c - 1];
    const label = rawMonth != null ? String(rawMonth).trim() : "";
    if (!label) continue;

    let v = 0;
    if (typeof rawVal === "number") v = rawVal;
    else if (typeof rawVal === "string") {
      const cleaned = rawVal.replace("%", "").replace(",", ".").trim();
      const num = parseFloat(cleaned);
      if (!Number.isNaN(num)) v = num;
    }

    const rounded = Number(v.toFixed(1));
    out.push({ label, value: rounded, percentage: rounded });
  }

  return out;
}

function buildSummaryFrequenciesFromRange(values: any[][], range: string): FrequencyData[] {
  const trimmed = range.trim();
  if (!trimmed) return [];
  let parsed;

  try {
    parsed = parseA1Range(trimmed);
  } catch {
    return [];
  }

  const { rowStart, rowEnd, colStart } = parsed;
  const freqs: FrequencyData[] = [];

  for (let r = rowStart; r <= rowEnd; r++) {
    const row = values[r - 1] || [];
    const rawLabel = row[colStart - 1];
    const rawPercent = row[colStart];

    const label = rawLabel != null ? String(rawLabel).trim() : "";
    if (!label) continue;
    const labelAsNumber = Number(label.replace(",", "."));
    if (!Number.isNaN(labelAsNumber)) continue;
    const numLabel = Number(label);
    if (!isNaN(numLabel) && numLabel > 0 && numLabel < 1) continue;


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

    const rounded = Number(percNum.toFixed(1));
    freqs.push({ label, value: rounded, percentage: rounded });
  }

  return freqs;
}

function buildMatrixRowLabels(values: any[][], range: string): string[] {
  const trimmed = range.trim();
  if (!trimmed) return [];

  let parsed;
  try {
    parsed = parseA1Range(trimmed);
  } catch {
    return [];
  }

  const { rowStart, rowEnd, colStart } = parsed;

  const labels: string[] = [];

  for (let r = rowStart; r <= rowEnd; r++) {
    const row = values[r - 1] || [];
    const rawLabel = row[colStart - 2]; // columna previa al inicio
    const label = rawLabel != null ? String(rawLabel).trim() : "";
    if (!label) continue;
    labels.push(label);
  }

  return labels;
}

function buildMatrixFrequencies(values: any[][], range: string): FrequencyData[] {
  const labels = buildMatrixRowLabels(values, range);

  return labels.map((label) => ({
    label,
    value: 0,
    percentage: 0,
  }));
}


/* ---------------- Page ---------------- */

export default function Home() {
  const { items, addChart, downloadZip } = useExportQueue();

  const [datasetUrl, setDatasetUrl] = useState("");
  const [columns, setColumns] = useState<DatasetColumn[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<string>("");
  const [selectedSecondColumn, setSelectedSecondColumn] = useState<string>("");
  const [chartType, setChartType] = useState<ChartType>("donut");
  const [frequencies, setFrequencies] = useState<FrequencyData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [authToken, setAuthToken] = useState<string>("");

  const [sheets, setSheets] = useState<Array<{ name: string; id: number }>>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");

  const [customColors, setCustomColors] = useState<Record<string, string>>({});
  const [previewBg, setPreviewBg] = useState<string>("#000000");
  const [previewTextColor, setPreviewTextColor] = useState<string>("#FFFFFF");

  const [ordered, setOrdered] = useState<FrequencyData[]>([]);
  const [excludedLabels, setExcludedLabels] = useState<string[]>([]);
  const [inputMode, setInputMode] = useState<InputMode>("raw");
  const [stackedColumns, setStackedColumns] = useState<string[]>([]);

  const [sheetValues, setSheetValues] = useState<any[][]>([]);
  const [questionCell, setQuestionCell] = useState<string>("");
  const [answerRange, setAnswerRange] = useState<string>("");

  const [secondQuestionCell, setSecondQuestionCell] = useState<string>("");
  const [secondAnswerRange, setSecondAnswerRange] = useState<string>("");

  const [stackedLabelCells, setStackedLabelCells] = useState<string>("");
  const [stackedRangesSummary, setStackedRangesSummary] = useState<string>("");

  const [brand, setBrand] = useState<Brand | null>(null);

  // ✅ Matrix: orden de filas
  const [matrixRowOrder, setMatrixRowOrder] = useState<string[]>([]);

  const handleBrandSelect = (b: Brand) => {
    const theme = getBrandTheme(b);
    setBrand(b);
    setPreviewBg(theme.defaultBackground);
    setPreviewTextColor(theme.defaultTextColor);
  };
  useEffect(() => {
  if (chartType === "tracking") return;

  setOrdered([]);
  setExcludedLabels([]);
  setMatrixRowOrder([]);
  setCustomColors({});
}, [chartType]);

  useEffect(() => {
    setStackedColumns([]);
  }, [inputMode]);

  useEffect(() => {
    if (inputMode !== "summary") return;
    if (!questionCell || !sheetValues.length) return;

    try {
      const { row, col } = a1ToRowCol(questionCell);
      const cellValue = sheetValues[row - 1]?.[col - 1];
      if (cellValue != null && cellValue !== "") {
        setSelectedColumn(String(cellValue));
      } else {
        setSelectedColumn(questionCell);
      }
    } catch {
      // noop
    }
  }, [inputMode, questionCell, sheetValues]);

  type CanvasPreset = "1920x1080" | "1440x1800";
  const CANVAS_PRESETS: Record<CanvasPreset, { width: number; height: number; label: string }> = {
    "1920x1080": { width: 1920, height: 1080, label: "1920 × 1080 px" },
    "1440x1800": { width: 1440, height: 1800, label: "1440 × 1800 px" },
  };

  const [canvasPreset, setCanvasPreset] = useState<CanvasPreset>("1920x1080");
  const { width: canvasWidth, height: canvasHeight } = CANVAS_PRESETS[canvasPreset];

  /* colors / exclusions */

  const handleColorChange = (label: string, color: string) => {
    setCustomColors((prev) => ({ ...prev, [label]: color }));
  };

  const toggleExclude = (label: string) => {
    setExcludedLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const resetExclusions = () => setExcludedLabels([]);

  /* load sheets */

  const handleLoadDataset = async (
    url: string,
    token: string,
    sheetOverride?: string
  ): Promise<void> => {
    if (!token) {
      alert("Please connect to Google first");
      return;
    }

    setDatasetUrl(url);
    setSheets([]);
    setSelectedSheet("");
    setColumns([]);
    setStackedColumns([]);
    setSelectedColumn("");
    setSelectedSecondColumn("");
    setFrequencies([]);
    setOrdered([]);
    setExcludedLabels([]);
    setSheetValues([]);
    setQuestionCell("");
    setAnswerRange("");
    setSecondQuestionCell("");
    setSecondAnswerRange("");
    setMatrixRowOrder([]); // ✅ reset matrix order

    try {
      const spreadsheetId = parseSpreadsheetId(url);
      if (!spreadsheetId) throw new Error("Invalid Google Sheets URL");

      (window as any).gapi.client.setToken({ access_token: token });
      const metaRes = await (window as any).gapi.client.sheets.spreadsheets.get({
        spreadsheetId,
        includeGridData: false,
      });

      const availableSheets =
        metaRes.result.sheets?.map((sheet: any, index: number) => ({
          name: sheet.properties?.title || "Sheet1",
          id: index,
        })) || [];

      if (!availableSheets.length) throw new Error("No se encontraron hojas");

      setSheets(availableSheets);

      const sheetNameToUse = sheetOverride || availableSheets[0].name;
      setSelectedSheet(sheetNameToUse);

      const dataRes = await (window as any).gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetNameToUse}!A1:ZZ1000`,
        valueRenderOption: "UNFORMATTED_VALUE",
      });

      const values = dataRes.result.values || [];
      setSheetValues(values);

      if (!values.length) {
        setColumns([]);
        return;
      }

      const headerRowIndex = values.findIndex((row: any[]) =>
        row.some((cell) => cell !== "" && cell != null)
      );
      if (headerRowIndex === -1) {
        setColumns([]);
        return;
      }

      const headers = values[headerRowIndex] || [];
      const rows = values.slice(headerRowIndex + 1);

      const cols: DatasetColumn[] = headers.map((header: any, colIndex: number) => ({
        name: String(header || `Columna ${colIndex + 1}`),
        values: rows.map((row: any[]) => String(row[colIndex] ?? "")),
      }));

      setColumns(cols);
    } catch (error) {
      console.error("Error loading spreadsheet:", error);
      alert("Failed to load spreadsheet.");
    } finally {
      setIsLoading(false);
    }
  };

  /* handlers */

  const handleColumnSelect = (columnName: string) => setSelectedColumn(columnName);
  const handleSecondColumnSelect = (columnName: string) => setSelectedSecondColumn(columnName);

  const handleSheetSelect = (sheetName: string) => {
    setSelectedSheet(sheetName);
    if (datasetUrl && authToken) {
      handleLoadDataset(datasetUrl, authToken, sheetName);
    }
  };

  /* ✅ useEffect MODIFICADO: frecuencias + matrix row order */
  useEffect(() => {
    // RAW
    if (inputMode === "raw") {
      if (!selectedColumn) {
        setFrequencies([]);
        return;
      }

      let freqs: FrequencyData[] = calculateRawFrequencies(columns, selectedColumn);

      if (chartType === "tracking") {
        const seen = new Set<string>();
        freqs = freqs.filter((f) => {
          if (seen.has(f.label)) return false;
          seen.add(f.label);
          return true;
        });
        setOrdered(freqs);
      }

      setExcludedLabels([]);
      setFrequencies(freqs);

      if (chartType === "matrix") setMatrixRowOrder([]);
      return;
    }

    // SUMMARY
    if (!answerRange || !sheetValues.length) {
      setFrequencies([]);
      return;
    }

    let freqs: FrequencyData[] =
    chartType === "singletrack"
    ? buildSingleTrackFromRange(sheetValues, answerRange)
    : chartType === "matrix"
    ? buildMatrixFrequencies(sheetValues, answerRange)
    : chartType === "mediumdonut"
    ? buildMediumDonutSummary(sheetValues, answerRange)
    : buildSummaryFrequenciesFromRange(sheetValues, answerRange);

       if (chartType === "matrix" || chartType === "mediumdonut") {
        const rowLabels = buildMatrixRowLabels(sheetValues, answerRange);
          setMatrixRowOrder((prev) => {
            if (!prev.length) return rowLabels;

            const stillValid = prev.every((x) => rowLabels.includes(x));
            if (!stillValid) return rowLabels;

            return prev;
          });
        }
    if (chartType === "tracking") {
      const seen = new Set<string>();
      freqs = freqs.filter((f) => {
        if (seen.has(f.label)) return false;
        seen.add(f.label);
        return true;
      });
      setOrdered(freqs);
    }

    setExcludedLabels([]);
    setFrequencies(freqs);
  }, [inputMode, selectedColumn, columns, chartType, answerRange, sheetValues]);

  useEffect(() => {
    if (frequencies.length === 0) return;

    if (ordered.length === 0) {
      setOrdered(frequencies);
      return;
    }

    const byLabel = new Map(frequencies.map((f) => [f.label, f]));
    const updated = ordered
      .filter((o) => byLabel.has(o.label))
      .map((o) => ({ ...o, ...byLabel.get(o.label)! }));

    setOrdered(updated);
  }, [frequencies]);

  const adjustedFrequencies: FrequencyData[] = useMemo(() => {
    if (chartType === "matrix") return frequencies;
    const remaining = frequencies.filter((f) => !excludedLabels.includes(f.label));

    if (inputMode === "summary") {
      return remaining.map((f) => ({
        ...f,
        percentage: Number(f.percentage.toFixed(1)),
        value: f.value,
      }));
    }

    const remTotal = remaining.reduce((s, f) => s + f.value, 0);
    return remaining.map((f) => ({
      ...f,
      percentage: remTotal > 0 ? Number(((f.value / remTotal) * 100).toFixed(1)) : 0,
    }));
  }, [frequencies, excludedLabels, inputMode]);

  const adjustedPercentages: Record<string, number> = useMemo(() => {
    const m: Record<string, number> = {};
    adjustedFrequencies.forEach((f) => {
      m[f.label] = f.percentage;
    });
    return m;
  }, [adjustedFrequencies]);

  const dataForChart: FrequencyData[] = useMemo(() => {
    if (adjustedFrequencies.length === 0) return [];

    const guide = ordered.map((f) => f.label).filter((l) => !excludedLabels.includes(l));

    const byLabel = new Map(adjustedFrequencies.map((f) => [f.label, f]));
    const orderedPart = guide
      .map((label) => byLabel.get(label))
      .filter((x): x is FrequencyData => Boolean(x));

    const inGuide = new Set(guide);
    const leftovers = adjustedFrequencies.filter((f) => !inGuide.has(f.label));

    return [...orderedPart, ...leftovers];
  }, [ordered, excludedLabels, adjustedFrequencies]);

  const labelOrder = useMemo(() => dataForChart.map((f) => f.label), [dataForChart]);

  /* Add to queue */

  const handleAddToQueue = () => {
    if (!selectedColumn) return;

    if (chartType === "stacked") {
      if (inputMode === "raw") {
        if (!stackedColumns.length) return;
      } else {
        if (!stackedRangesSummary.trim()) return;
      }
    } else {
      if (dataForChart.length === 0) return;
    }

    const builder = chartSvgBuilders[chartType];
    if (!builder) return;

    const svg = builder({
      data: dataForChart,
      title: selectedColumn,
      secondColumn: selectedSecondColumn,
      columns,
      customColors,
      stackedColumns,
      sheetTitle: selectedSheet,
      width: canvasWidth,
      height: canvasHeight,
      inputMode,
      labelOrder,
      matrixRowOrder, 
      sheetValues,
      stackedLabelCells,
      stackedRangesSummary,
      answerRange,
      backgroundColor: previewBg,
      textColor: previewTextColor,
      secondAnswerRange,
      brand: brand ?? "poligrama",
      questionCell,
    });

    addChart({
      title: selectedColumn,
      chartType,
      svg,
    });
  };

  const canShowPreview = useMemo(() => {
    if (!selectedColumn) return false;

    if (chartType === "stacked") {
      if (inputMode === "raw") return stackedColumns.length > 0;
      return stackedRangesSummary.trim().length > 0;
    }

    return dataForChart.length > 0;
  }, [chartType, selectedColumn, stackedColumns, dataForChart, inputMode, stackedRangesSummary]);

  /* Render */

  if (!brand) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md w-full space-y-6">
          <h1 className="text-2xl font-semibold text-center">
            ¿Con qué marca vas a trabajar?
          </h1>

          <div className="grid gap-4">
            <Button onClick={() => handleBrandSelect("poligrama")} className="w-full">
              Poligrama
            </Button>

            <Button variant="outline" onClick={() => handleBrandSelect("deskover")} className="w-full">
              Deskover
            </Button>

            <Button variant="outline" onClick={() => handleBrandSelect("censEdmundSinsa")} className="w-full">
              Cens / Edmund / Sinsa
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Generador de Gráficas
          </h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <GoogleAuth onAuthSuccess={(token) => setAuthToken(token)} />

            <DatasetInput
              onLoad={(url) => handleLoadDataset(url, authToken)}
              isLoading={isLoading}
              disabled={!authToken}
              inputMode={inputMode}
              onInputModeChange={setInputMode}
              canvasPreset={canvasPreset}
              onCanvasPresetChange={setCanvasPreset}
              previewBg={previewBg}
              previewTextColor={previewTextColor}
              onPreviewBgChange={setPreviewBg}
              onPreviewTextColorChange={setPreviewTextColor}
              brand={brand ?? "poligrama"}
            />

            {columns.length > 0 && (
              <>
                <ColumnSelector
                  columns={columns}
                  selectedColumn={selectedColumn}
                  onSelect={handleColumnSelect}
                  frequencies={frequencies}
                  sheets={sheets}
                  selectedSheet={selectedSheet}
                  onSheetSelect={handleSheetSelect}
                  customColors={customColors}
                  onColorChange={handleColorChange}
                  excludedLabels={excludedLabels}
                  onToggleExclude={toggleExclude}
                  onResetExclusions={resetExclusions}
                  adjustedPercentages={adjustedPercentages}
                  chartType={chartType}
                  stackedColumns={stackedColumns}
                  onStackedColumnsChange={setStackedColumns}
                  inputMode={inputMode}
                  questionCell={questionCell}
                  onQuestionCellChange={setQuestionCell}
                  answerRange={answerRange}
                  onAnswerRangeChange={setAnswerRange}
                  stackedLabelCells={stackedLabelCells}
                  onStackedLabelCellsChange={setStackedLabelCells}
                  stackedRangesSummary={stackedRangesSummary}
                  onStackedRangesSummaryChange={setStackedRangesSummary}
                  sheetValues={sheetValues}
                />

                {/* ✅ Drag list */}
                {(chartType === "matrix" ? matrixRowOrder.length > 0 : adjustedFrequencies.length > 0) && (
                  <div className="mt-4">
                    <h3 className="mb-2 text-sm font-medium text-foreground">
                      Orden de respuestas
                    </h3>

                    <DragList
                    showPercentage={chartType !== "matrix"}
                      items={
                        chartType === "matrix"
                          ? matrixRowOrder.map((label) => ({
                              id: label,
                              label,
                              color: customColors[label],
                            }))
                          : dataForChart.map((f) => ({
                              id: f.label,
                              label: f.label,
                              percentage: f.percentage,
                              color: customColors[f.label],
                            }))
                      }
                      onReorder={(next) => {
                        if (chartType === "matrix") {
                          setMatrixRowOrder(next.map((n) => n.id));
                          return;
                        }

                        const byLabel = new Map(frequencies.map((f) => [f.label, f]));
                        const newOrdered = next
                          .map((n) => byLabel.get(n.id))
                          .filter((x): x is FrequencyData => Boolean(x));
                        setOrdered(newOrdered);
                      }}
                    />
                  </div>
                )}

                <ChartTypeSelector
                  chartType={chartType}
                  onSelect={setChartType}
                  showMatrixOption={columns.length > 1}
                  onSecondColumnSelect={handleSecondColumnSelect}
                  columns={columns}
                  selectedSecondColumn={selectedSecondColumn}
                  inputMode={inputMode}
                  secondQuestionCell={secondQuestionCell}
                  onSecondQuestionCellChange={setSecondQuestionCell}
                  secondAnswerRange={secondAnswerRange}
                  onSecondAnswerRangeChange={setSecondAnswerRange}
                  sheetValues={sheetValues}
                  brand={brand ?? "poligrama"}
                />
              </>
            )}
          </div>

          <div className="lg:sticky lg:top-8 lg:self-start space-y-4">
            {canShowPreview && (
              <ChartPreview
                chartType={chartType}
                data={dataForChart}
                title={selectedColumn}
                secondColumn={selectedSecondColumn}
                columns={columns}
                customColors={customColors}
                onAddToQueue={handleAddToQueue}
                onDownloadZip={downloadZip}
                batchCount={items.length}
                stackedColumns={stackedColumns}
                sheetTitle={selectedSheet}
                canvasWidth={canvasWidth}
                canvasHeight={canvasHeight}
                inputMode={inputMode}
                labelOrder={labelOrder}
                matrixRowOrder={matrixRowOrder} // ✅ PASAR A PREVIEW TAMBIÉN
                sheetValues={sheetValues}
                secondAnswerRange={secondAnswerRange}
                stackedLabelCells={stackedLabelCells}
                stackedRangesSummary={stackedRangesSummary}
                answerRange={answerRange}
                questionCell={questionCell}
                previewBg={previewBg}
                previewTextColor={previewTextColor}
                brand={brand ?? "poligrama"}
              />
            )}

            {items.length > 0 && (
              <div className="p-4 border rounded bg-muted/20">
                <h3 className="text-sm font-medium">Gráficas en lote: {items.length}</h3>
                <button
                  onClick={downloadZip}
                  className="mt-2 px-4 py-2 rounded bg-primary text-white"
                >
                  Descargar ZIP
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
