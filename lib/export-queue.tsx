"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { SavedChart } from "@/types/charts";

type ExportQueueContextValue = {
  items: SavedChart[];
  addChart: (chart: Omit<SavedChart, "id" | "createdAt">) => void;
  removeChart: (id: string) => void;
  clearAll: () => void;
  downloadZip: () => Promise<void>;
};

const ExportQueueContext = createContext<ExportQueueContextValue | null>(null);

const STORAGE_KEY = "poligrama-export-queue-v1";
const TTL_MS = 60 * 60 * 1000; // 1 hora

function loadFromStorage(): SavedChart[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedChart[];
    const now = Date.now();
    // limpia los viejos (>1h)
    return parsed.filter((item) => now - item.createdAt < TTL_MS);
  } catch {
    return [];
  }
}

function saveToStorage(items: SavedChart[]) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function ExportQueueProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<SavedChart[]>([]);

  useEffect(() => {
    setItems(loadFromStorage());
  }, []);

  useEffect(() => {
    saveToStorage(items);
  }, [items]);

  const addChart: ExportQueueContextValue["addChart"] = (chart) => {
    setItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        ...chart,
      },
    ]);
  };

  const removeChart = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const clearAll = () => setItems([]);

  const downloadZip = async () => {
    if (items.length === 0) return;

    const zip = new JSZip();

    items.forEach((chart, idx) => {
      // usa el título para el nombre
      const safeTitle = chart.title
        .slice(0, 60)
        .replace(/[^\wáéíóúÁÉÍÓÚñÑ]+/g, "_");

      const fileName = `${String(idx + 1).padStart(2, "0")}_${safeTitle}.svg`;

      // asumimos que SavedChart tiene la propiedad svg
      zip.file(fileName, chart.svg);
    });

    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, "graficas-poligrama.zip");

    // limpia cola y storage
    setItems([]);
    sessionStorage.removeItem(STORAGE_KEY);
  };

  return (
    <ExportQueueContext.Provider
      value={{ items, addChart, removeChart, clearAll, downloadZip }}
    >
      {children}
    </ExportQueueContext.Provider>
  );
}

export function useExportQueue() {
  const ctx = useContext(ExportQueueContext);
  if (!ctx) throw new Error("useExportQueue must be used inside ExportQueueProvider");
  return ctx;
}
