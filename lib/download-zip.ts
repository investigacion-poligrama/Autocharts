"use client";

import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { SavedChart } from "@/types/charts";

export async function downloadChartsZip(charts: SavedChart[]) {
  if (charts.length === 0) return;

  const zip = new JSZip();

  charts.forEach((chart, index) => {
    const safeTitle = chart.title
      .toLowerCase()
      .replace(/[^\w\-]+/g, "_")
      .slice(0, 60);

    const filename = `${String(index + 1).padStart(2, "0")}_${safeTitle}_${chart.chartType}.svg`;

    zip.file(filename, chart.svg);
  });

  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, "graficos_poligrama.zip");
}
