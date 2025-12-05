"use client";

import * as React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2 } from "lucide-react";

type InputMode = "raw" | "summary";
type CanvasPreset = "1920x1080" | "1440x1800";

interface DatasetInputProps {
  onLoad: (url: string) => void;
  isLoading: boolean;
  disabled?: boolean;
  inputMode: InputMode;
  onInputModeChange: (mode: InputMode) => void;
  canvasPreset: CanvasPreset;
  onCanvasPresetChange: (preset: CanvasPreset) => void;
  onPreviewBgChange: (c: string) => void;
  onPreviewTextColorChange: (c: string) => void;
  previewBg: string;
  previewTextColor: string;
}

export function DatasetInput({
  onLoad,
  isLoading,
  disabled,
  inputMode,
  onInputModeChange,
  canvasPreset,
  onCanvasPresetChange,
  onPreviewBgChange,
  onPreviewTextColorChange,
  previewBg,
  previewTextColor,
}: DatasetInputProps) {
  const [url, setUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || isLoading || disabled) return;
    onLoad(trimmed);
  };

  const isDisabled = isLoading || disabled;
  const canSubmit = !!url.trim() && !isDisabled;

  const isSummary = inputMode === "summary";
  const is1920 = canvasPreset === "1920x1080";
  const is1440 = canvasPreset === "1440x1800";


  return (
    <Card>
      <CardHeader>
        <CardTitle>Fuente de datos</CardTitle>
        <CardDescription>
          1) Elige si usar la base de datos o una tabla de resultados.
          2) Conecta tu hoja de Google. 
        </CardDescription>

        {/* 🔹 toggle de modo */}
        <div className="mt-3 inline-flex gap-2 text-xs">
          <Button
            type="button"
            size="sm"
            variant={isSummary ? "outline" : "default"}
            onClick={() => onInputModeChange("raw")}
          >
            Base de datos
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isSummary ? "default" : "outline"}
            onClick={() => onInputModeChange("summary")}
          >
            Tabla de resultados
          </Button>
        </div>
        {/* 🔹 nuevo toggle de tamaño */}
        <div className="mt-3 inline-flex gap-2 text-xs">
          <Button
            type="button"
            size="sm"
            variant={is1920 ? "default" : "outline"}
            onClick={() => onCanvasPresetChange("1920x1080")}
          >
            1920 × 1080 px
          </Button>
          <Button
            type="button"
            size="sm"
            variant={is1440 ? "default" : "outline"}
            onClick={() => onCanvasPresetChange("1440x1800")}
          >
            1440 × 1800 px
          </Button>
        </div>
        {/* 🔹 Selector de colores del preview */}
<div className="mt-3 inline-flex gap-2 text-xs items-center">
  <label className="text-foreground">Fondo</label>
  <input
    type="color"
    value={previewBg}
    onChange={(e) => onPreviewBgChange(e.target.value)}
    className="w-8 h-8 rounded"
  />

  <label className="text-foreground">Texto</label>
  <input
    type="color"
    value={previewTextColor}
    onChange={(e) => onPreviewTextColorChange(e.target.value)}
    className="w-8 h-8 rounded"
  />
</div>

      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            type="text"
            placeholder="https://docs.google.com/spreadsheets/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isDisabled}
            className="flex-1"
            aria-label="Dataset URL"
          />
          <Button type="submit" disabled={!canSubmit}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Cargando
              </>
            ) : (
              "Cargar la hoja"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
