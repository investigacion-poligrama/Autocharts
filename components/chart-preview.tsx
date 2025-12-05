"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "./ui/button";
import { Download } from "lucide-react";
import type { ChartType, FrequencyData, DatasetColumn } from "@/app/page";
import PreviewFrame from "@/components/ui/preview-frame";
import { chartSvgBuilders } from "@/lib/chart-svgs";
import { useExportQueue } from "@/lib/export-queue";

interface ChartPreviewProps {
  chartType: ChartType;
  data: FrequencyData[];
  title: string;
  secondColumn?: string;
  columns?: DatasetColumn[];
  customColors?: Record<string, string>;
  onAddToQueue: () => void;
  onDownloadZip: () => void;
  batchCount: number;
  stackedColumns?: string[];
  sheetTitle?: string;
  canvasWidth: number;
  canvasHeight: number;
  inputMode: "raw" | "summary";
  labelOrder: string[];
  sheetValues: any[][];
  secondAnswerRange?: string;
  stackedLabelCells?: string;
  stackedRangesSummary?: string;
  answerRange?: string;  
}

export default function ChartPreview({
  chartType,
  data,
  title,
  secondColumn,
  columns,
  customColors = {},
  onAddToQueue,
  onDownloadZip,
  batchCount,
  stackedColumns,
  sheetTitle,
  canvasWidth,
  canvasHeight,
  inputMode,
  labelOrder,
  sheetValues,
  secondAnswerRange,
  stackedLabelCells,
  stackedRangesSummary,
  answerRange,
}: ChartPreviewProps) {
  const [isExporting, setIsExporting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgMarkup, setSvgMarkup] = useState<string>("");
  const { addChart } = useExportQueue(); // si no lo usas luego lo quitas

  useEffect(() => {
    const builder = chartSvgBuilders[chartType];
    if (!builder) {
      setSvgMarkup("");
      return;
    }

    const svg = builder({
      data,
      title,
      secondColumn,
      columns,
      customColors,
      stackedColumns,
      sheetTitle,
      width: canvasWidth,
      height: canvasHeight,
      inputMode,
      labelOrder,
      secondAnswerRange,
      sheetValues,
      stackedLabelCells,
      stackedRangesSummary,
      answerRange,
    });

    setSvgMarkup(svg);
  }, [
    chartType,
    data,
    title,
    secondColumn,
    columns,
    customColors,
    stackedColumns,
    sheetTitle,
    canvasWidth,
    canvasHeight,
    inputMode,
    labelOrder,
    sheetValues,
    secondAnswerRange,
    stackedLabelCells,
    stackedRangesSummary,
    answerRange,
  ]);

  const handleExport = () => {
    const builder = chartSvgBuilders[chartType];
    if (!builder) {
      alert("Aún no hay exportador SVG para este tipo de gráfica.");
      return;
    }

    setIsExporting(true);
    try {
      const svg = builder({
        data,
        title,
        secondColumn,
        columns,
        customColors,
        stackedColumns,
        sheetTitle,
        width: canvasWidth,
        height: canvasHeight,
        inputMode,
        labelOrder,
        stackedLabelCells,
        stackedRangesSummary,
        answerRange,
      });

      const blob = new Blob([svg], {
        type: "image/svg+xml;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.slice(0, 40).replace(/\s+/g, "_")}.svg`;
      a.click();

      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("No se pudo exportar la imagen.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="relative rounded-xl shadow-sm overflow-visible"
      style={{
        background: "transparent",
        width: "100%",
        borderRadius: "16px",
      }}
    >
      {/* HEADER: título + botones */}
      <div className="flex items-center justify-between px-6 pb-4 pt-6 md:mx-[-24px]">
        <h3 className="text-lg font-semibold">{title}</h3>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onAddToQueue}>
            Guardar en lote ({batchCount})
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={onDownloadZip}
            disabled={batchCount === 0}
          >
            Descargar ZIP
          </Button>

          <Button onClick={handleExport} size="sm" disabled={isExporting}>
            <Download className="mr-2 h-4 w-4" />
            Export SVG
          </Button>
        </div>
      </div>

      {/* PREVIEW */}
      <div className="px-6 pb-6 md:mx-[-24px]">
        <PreviewFrame title={title} legend={undefined} contentRef={containerRef}>
          <div
            ref={containerRef}
            className="h-full w-full"
            style={{
              background: "#000",
              minHeight: 0,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              aspectRatio: `${canvasWidth}/${canvasHeight}`,
            }}
          >
            {svgMarkup && (
              <div
                className="h-full w-full"
                style={{ minHeight: 0, minWidth: 0 }}
                dangerouslySetInnerHTML={{ __html: svgMarkup }}
              />
            )}
          </div>
        </PreviewFrame>
      </div>
    </div>
  );
}
