"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import type { Brand } from "@/types/brand";

interface ChartTypeSelectorProps {
  chartType: ChartType;
  onSelect: (type: ChartType) => void;
  showMatrixOption: boolean;

  // ✅ mantenemos para no romper page.tsx
  onSecondColumnSelect: (column: string) => void;
  columns: DatasetColumn[];
  selectedSecondColumn: string;

  inputMode: "raw" | "summary";

  // ✅ mantenemos para no romper page.tsx
  secondQuestionCell: string;
  onSecondQuestionCellChange: (value: string) => void;
  secondAnswerRange: string;
  onSecondAnswerRangeChange: (value: string) => void;

  sheetValues: any[][];
  brand: Brand;
}

export function ChartTypeSelector({
  chartType,
  onSelect,
  showMatrixOption,
  brand,
}: ChartTypeSelectorProps) {
  const isPoligrama = brand === "poligrama";
  const isCens = brand === "censEdmundSinsa";
  const isDeskover = brand === "deskover";

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
          {/* ==== POLIGRAMA ==== */}
          {isPoligrama && (
            <>
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

              {showMatrixOption && (
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
              )}
            </>
          )}

          {/* ==== CENS / EDMUND / SINSA ==== */}
          {isCens && (
            <>
              <Button
                variant={chartType === "stackedvertical" ? "default" : "outline"}
                onClick={() => onSelect("stackedvertical")}
                className="flex-1"
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Stacked bar
                </div>
              </Button>

              <Button
                variant={chartType === "barnarrow" ? "default" : "outline"}
                onClick={() => onSelect("barnarrow")}
                className="flex-1"
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Narrow Bar
                </div>
              </Button>

              <Button
                variant={chartType === "singletrack" ? "default" : "outline"}
                onClick={() => onSelect("singletrack")}
                className="flex-1"
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Single Track
                </div>
              </Button>

              <Button
                variant={chartType === "narrowvertbars" ? "default" : "outline"}
                onClick={() => onSelect("narrowvertbars")}
                className="flex-1"
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Vert Bars
                </div>
              </Button>
            </>
          )}

          {/* ==== Mike Flores ==== */}
          {isDeskover && (
            <>
              <Button
                variant={chartType === "mikebar" ? "default" : "outline"}
                onClick={() => onSelect("mikebar")}
                className="flex-1"
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Horizontal bars
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
                variant={chartType === "trackingpills" ? "default" : "outline"}
                onClick={() => onSelect("trackingpills")}
                className="flex-1"
              >
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                 T c/leyenda
                </div>
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
