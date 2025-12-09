"use client";

import { useState } from "react";       
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PieChart,
  BarChart3,
  Grid3x3,
  Target,
  ThumbsUp,
  Users,
  TrendingUp,
} from "lucide-react";
import type { ChartType, DatasetColumn } from "@/app/page";
import { Input } from "@/components/ui/input";
import { RangePicker } from "@/components/ui/range-picker"; // ruta igual que en ColumnSelector

interface ChartTypeSelectorProps {
  chartType: ChartType;
  onSelect: (type: ChartType) => void;
  showMatrixOption: boolean;
  onSecondColumnSelect: (column: string) => void;
  columns: DatasetColumn[];
  selectedSecondColumn: string;
  inputMode: "raw" | "summary";
  secondQuestionCell: string;
  onSecondQuestionCellChange: (value: string) => void;
  secondAnswerRange: string;
  onSecondAnswerRangeChange: (value: string) => void;
  sheetValues: any[][];                    
}

export function ChartTypeSelector({
  chartType,
  onSelect,
  showMatrixOption,
  onSecondColumnSelect,
  columns,
  selectedSecondColumn,
  inputMode,
  secondQuestionCell,
  onSecondQuestionCellChange,
  secondAnswerRange,
  onSecondAnswerRangeChange,
  sheetValues,                                 
}: ChartTypeSelectorProps) {
  type SecondRangeTarget = "secondQuestion" | "secondAnswer";
  const [secondRangeTarget, setSecondRangeTarget] =
    useState<SecondRangeTarget | null>(null);
  const needsSecondColumn =
    chartType === "matrix" || chartType === "mediumdonut";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tipo de gráfico</CardTitle>
        <CardDescription>
          Selecciona el gráfico adecuado para el tipo de dato
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-5 gap-2">
          {/* botones de tipo de gráfica */}
          <Button
            variant={chartType === "partido" ? "default" : "outline"}
            onClick={() => onSelect("partido")}
            className="flex-1"
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Partido
            </div>
          </Button>

          <Button
            variant={chartType === "tracking" ? "default" : "outline"}
            onClick={() => onSelect("tracking")}
            className="flex-1"
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Tracking
            </div>
          </Button>

          <Button
            variant={chartType === "mediumdonut" ? "default" : "outline"}
            onClick={() => onSelect("mediumdonut")}
            className="flex-1"
          >
            <div className="flex items-center gap-2">
              <PieChart className="h-4 w-4" />
              Medium Donut
            </div>
          </Button>

          <Button
            variant={chartType === "donut" ? "default" : "outline"}
            onClick={() => onSelect("donut")}
            className="flex-1"
          >
            <div className="flex items-center gap-2">
              <PieChart className="h-4 w-4" />
              Donut
            </div>
          </Button>

          <Button
            variant={chartType === "bar" ? "default" : "outline"}
            onClick={() => onSelect("bar")}
            className="flex-1"
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Bar
            </div>
          </Button>

          <Button
            variant={chartType === "stacked" ? "default" : "outline"}
            onClick={() => onSelect("stacked")}
            className="flex-1"
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Stacked
            </div>
          </Button>

          <Button
            variant={chartType === "score" ? "default" : "outline"}
            onClick={() => onSelect("score")}
            className="flex-1"
          >
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Score
            </div>
          </Button>

          <Button
            variant={chartType === "approval" ? "default" : "outline"}
            onClick={() => onSelect("approval")}
            className="flex-1"
          >
            <div className="flex items-center gap-2">
              <ThumbsUp className="h-4 w-4" />
              Approval
            </div>
          </Button>

          <Button
            variant={chartType === "matrix" ? "default" : "outline"}
            onClick={() => onSelect("matrix")}
            className="flex-1"
          >
            <div className="flex items-center gap-2">
              <Grid3x3 className="h-4 w-4" />
              Matrix
            </div>
          </Button>
          <Button
            variant={chartType === "stackedvertical" ? "default" : "outline"}
            onClick={() => onSelect("stackedvertical")}
            className="flex-1"
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Stacked vertical
            </div>
          </Button>
        </div>

        {/* SEGUNDA PREGUNTA - modo BASE DE DATOS */}
        {needsSecondColumn && showMatrixOption && inputMode === "raw" && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Select Second Question
            </label>
            <Select
              value={selectedSecondColumn}
              onValueChange={onSecondColumnSelect}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a second column..." />
              </SelectTrigger>
              <SelectContent>
                {columns.map((column, idx) => (
                  <SelectItem
                    key={`${column.name}-${idx}`}
                    value={column.name}
                  >
                    {column.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* SEGUNDA PREGUNTA - modo TABLA DE RESULTADOS */}
        {needsSecondColumn && showMatrixOption && inputMode === "summary" && (
          <div className="space-y-4">
            {/* Celda con la segunda pregunta */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Celda con la segunda pregunta
              </label>

              <div className="flex items-center gap-2">
                <Input
                  value={secondQuestionCell}
                  onChange={(e) =>
                    onSecondQuestionCellChange(e.target.value)
                  }
                  placeholder="Ej. H6"
                  className="max-w-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSecondRangeTarget("secondQuestion")}
                  disabled={!sheetValues.length}
                >
                  Seleccionar
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Usa notación A1 (columna + fila). Ejemplo:{" "}
                <code className="font-mono">H6</code> para la celda donde está
                el título de la segunda pregunta.
              </p>
            </div>

            {/* Rango de respuestas y % (segunda pregunta) */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Rango de respuestas y % (segunda pregunta)
              </label>

              <div className="flex items-center gap-2">
                <Input
                  value={secondAnswerRange}
                  onChange={(e) =>
                    onSecondAnswerRangeChange(e.target.value)
                  }
                  placeholder="Ej. H7:I15"
                  className="max-w-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSecondRangeTarget("secondAnswer")}
                  disabled={!sheetValues.length}
                >
                  Seleccionar
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                El rango debe incluir{" "}
                <span className="font-semibold">dos columnas</span>: la primera
                con las respuestas (etiquetas) y la segunda con el porcentaje.
                Ejemplo: <code className="font-mono">H7:I15</code>.
              </p>
            </div>
          </div>
        )}

        {/* RangePicker para la segunda pregunta (summary) */}
        {secondRangeTarget && sheetValues.length > 0 && (
          <RangePicker
            open={true}
            sheetValues={sheetValues}
            // usamos los mismos targets que el RangePicker original
            target={
              secondRangeTarget === "secondQuestion" ? "question" : "answer"
            }
            initialRange={
              secondRangeTarget === "secondQuestion"
                ? secondQuestionCell
                : secondAnswerRange
            }
            onClose={() => setSecondRangeTarget(null)}
            // ignoramos el segundo parámetro (target) del callback,
            // usamos nuestro estado secondRangeTarget
            onConfirm={(range) => {
              if (secondRangeTarget === "secondQuestion") {
                onSecondQuestionCellChange(range);
              } else {
                onSecondAnswerRangeChange(range);
              }
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
