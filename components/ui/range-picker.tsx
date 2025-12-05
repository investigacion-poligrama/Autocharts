"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/** Convierte col 1 → A, 2 → B, 27 → AA, etc. */
function colToLetters(col: number): string {
  let n = col;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** A1 para un rango rectangular */
function toA1Range(
  rowStart: number,
  colStart: number,
  rowEnd: number,
  colEnd: number
): string {
  const rs = Math.min(rowStart, rowEnd);
  const re = Math.max(rowStart, rowEnd);
  const cs = Math.min(colStart, colEnd);
  const ce = Math.max(colStart, colEnd);

  const a1Start = `${colToLetters(cs)}${rs}`;
  const a1End = `${colToLetters(ce)}${re}`;
  if (a1Start === a1End) return a1Start;
  return `${a1Start}:${a1End}`;
}

type RangePickerTarget =
  | "question"
  | "answer"
  | "stackedLabels"
  | "stackedRanges";

interface RangePickerProps {
  open: boolean;
  onClose: () => void;
  sheetValues: any[][];
  /** Para saber a qué campo vamos a escribir cuando demos “Usar este rango” */
  target: RangePickerTarget;
  /** Rango inicial (solo para mostrarlo arriba, no lo pinto todavía) */
  initialRange?: string;
  /** Callback con el rango A1 resultante */
  onConfirm: (range: string, target: RangePickerTarget) => void;
}

export function RangePicker({
  open,
  onClose,
  sheetValues,
  target,
  initialRange,
  onConfirm,
}: RangePickerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [startCell, setStartCell] = useState<{ row: number; col: number } | null>(
    null
  );
  const [endCell, setEndCell] = useState<{ row: number; col: number } | null>(
    null
  );

  useEffect(() => {
    if (!open) {
      setIsDragging(false);
      setStartCell(null);
      setEndCell(null);
    }
  }, [open]);

  if (!open) return null;

  const maxCols = sheetValues.reduce(
    (max, row) => Math.max(max, row.length),
    0
  );

  const currentRange =
    startCell && endCell
      ? toA1Range(startCell.row, startCell.col, endCell.row, endCell.col)
      : initialRange || "";

  const isCellSelected = (row: number, col: number) => {
    if (!startCell || !endCell) return false;
    const r1 = Math.min(startCell.row, endCell.row);
    const r2 = Math.max(startCell.row, endCell.row);
    const c1 = Math.min(startCell.col, endCell.col);
    const c2 = Math.max(startCell.col, endCell.col);
    return row >= r1 && row <= r2 && col >= c1 && col <= c2;
  };

  const handleMouseDown = (row: number, col: number) => {
    setStartCell({ row, col });
    setEndCell({ row, col });
    setIsDragging(true);
  };

  const handleMouseEnter = (row: number, col: number) => {
    if (!isDragging) return;
    setEndCell({ row, col });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleConfirm = () => {
    if (!currentRange) return;
    onConfirm(currentRange, target);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseUp={handleMouseUp}
    >
      <div className="bg-background max-w-5xl w-full max-h-[90vh] rounded-xl shadow-lg flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-medium">
            Seleccionar rango en la hoja
          </h2>
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>

        {/* Info actual */}
        <div className="border-b px-4 py-2 text-xs flex items-center justify-between gap-2">
          <div>
            <div className="text-muted-foreground">
              Campo:{" "}
              <span className="font-semibold">
                {target === "question" && "Celda de la pregunta"}
                {target === "answer" && "Rango de respuestas y %"}
                {target === "stackedLabels" &&
                  "Celdas con título de cada barra"}
                {target === "stackedRanges" &&
                  "Rangos de respuestas por barra"}
              </span>
            </div>
            <div>
              Rango seleccionado:{" "}
              <code className="font-mono text-xs">
                {currentRange || "—"}
              </code>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirm}
              disabled={!currentRange}
            >
              Usar este rango
            </Button>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto px-4 py-3">
          <div className="inline-block border rounded">
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th className="bg-muted sticky left-0 z-10 min-w-[36px] border-r border-b"></th>
                  {Array.from({ length: maxCols }).map((_, colIdx) => (
                    <th
                      key={colIdx}
                      className="bg-muted border-b border-r px-2 py-1 text-center font-mono"
                    >
                      {colToLetters(colIdx + 1)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheetValues.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {/* row header */}
                    <th className="bg-muted sticky left-0 z-10 border-r border-b px-1 text-right font-mono">
                      {rIdx + 1}
                    </th>
                    {Array.from({ length: maxCols }).map((_, cIdx) => {
                      const rowNum = rIdx + 1;
                      const colNum = cIdx + 1;
                      const selected = isCellSelected(rowNum, colNum);
                      const value = row[cIdx];

                      return (
                        <td
                          key={cIdx}
                          className={`border-b border-r min-w-[80px] max-w-[160px] px-1 py-0.5 cursor-pointer select-none ${
                            selected ? "bg-primary/20" : "hover:bg-muted/60"
                          }`}
                          onMouseDown={() =>
                            handleMouseDown(rowNum, colNum)
                          }
                          onMouseEnter={() =>
                            handleMouseEnter(rowNum, colNum)
                          }
                        >
                          <span className="block truncate">
                            {value != null ? String(value) : ""}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
