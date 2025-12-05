import { ChartConfig } from "@/lib/chartconfig";

const CANVAS_W = 1920;
const CANVAS_H = 1080;

const PALETTE = [
  ChartConfig.colors.primary,
  ChartConfig.colors.danger,
  ChartConfig.colors.neutral,
  "#f39c12",
  "#2980b9",
  "#8e44ad",
  "#16a085",
  "#e91e63",
  "#c0ca33",
  "#8d6e63",
];

export type StackedSegment = {
  label: string;        // Ej: "Muy bueno"
  percentage: number;   // 0–100
};

export type StackedRow = {
  label: string;              // Ej: "Condiciones de las calles..."
  segments: StackedSegment[]; // Deben sumar aprox 100, pero no es obligatorio
};

type BuildStackedBarSvgArgs = {
  data: StackedRow[];
  title: string;
  customColors?: Record<string, string>;
  sheetTitle?: string;
  width?: number;
  height?: number;
  backgroundColor?: string;
  textColor?: string;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type WrappedTitle = {
  lines: string[];
  fontSize: number;
  blockHeight: number;
};

function wrapLabel(text: string, maxChars = 40): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const w of words) {
    const test = current ? current + " " + w : w;
    if (test.length > maxChars && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  // máximo 3 líneas
  if (lines.length > 4) {
    return [lines[0], lines[1], lines.slice(2).join(" ")];
  }
  return lines;
}

function prepareTitle(
  title: string,
  baseFontSize: number,
  maxChars = 115
): WrappedTitle {
  const MAX_CHARS = maxChars;

  const words = title.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const w of words) {
    const test = current ? current + " " + w : w;
    if (test.length > MAX_CHARS && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  let finalLines = lines;
  if (lines.length > 2) {
    finalLines = [lines[0], lines.slice(1).join(" ")];
  }

  const fs = baseFontSize;
  const lineGap = 6;

  const blockHeight =
    finalLines.length * fs + (finalLines.length - 1) * lineGap;

  return { lines: finalLines, fontSize: fs, blockHeight };
}

function colorForSegment(
  label: string,
  index: number,
  customColors?: Record<string, string>
): string {
  if (customColors && customColors[label]) return customColors[label];
  return PALETTE[index % PALETTE.length];
}

export function buildStackedBarSvg({
  data,
  title,
  customColors = {},
  sheetTitle,
  width,
  height,
  backgroundColor,
  textColor,
}: BuildStackedBarSvgArgs): string {
  const W = width ?? CANVAS_W;
  const H = height ?? CANVAS_H;

  const bg = backgroundColor ?? "#000000";
  const mainTextColor = textColor ?? "#ffffff";
  const mutedTextColor = textColor ?? "#bdbdbd";

  const isTall1440 = W === 1440 && H === 1800;

  const baseTitleFs = ChartConfig.typography.title.fontSize;
  const footerFs = ChartConfig.typography.footer.fontSize;
  const headerFs = 40;
  const headerLine = headerFs * 1.1;

  // --- márgenes dependientes del preset ---
  let marginLeft: number;
  let marginRight: number;
  let marginTop: number;
  let marginBottom: number;

  if (isTall1440) {
    marginLeft = 100;
    marginRight = 100;
    marginTop = 170;
    marginBottom = 170;
  } else {
    // layout original 1920×1080
    marginLeft = 90;
    marginRight = 90;
    marginTop = 80;
    marginBottom = 80;
  }

  const titleY = marginTop + 130;
  const maxTitleChars = isTall1440 ? 80 : 115;

  const {
    lines: titleLines,
    fontSize: titleFs,
    blockHeight: titleBlockH,
  } = prepareTitle(title, baseTitleFs, maxTitleChars);

  const lineY = titleY + titleBlockH + 16;

  if (!data || data.length === 0) {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
      `<rect width="100%" height="100%" fill="${bg}" />`,
      `<text x="${W / 2}" y="${H / 2}" fill="${mainTextColor}" font-family="Helvetica, Arial, sans-serif" font-size="24" text-anchor="middle" dominant-baseline="middle">No hay datos para el gráfico apilado</text>`,
      `</svg>`,
    ].join("\n");
  }

  // ---------- LAYOUT GENERAL ----------
  const marginLeftLabels = 420; // espacio para los textos largos de filas
  const x0 = marginLeftLabels;
  const x1 = W - marginRight;
  const stackedWidth = x1 - x0;

  const legendHeight = 40;
  const legendGap = 24;

  const barAreaTop = lineY + 60 + legendHeight + legendGap;
  const barAreaBottom = isTall1440
    ? H - marginBottom - 60
    : H - marginBottom - 40;

  const barAreaHeight = barAreaBottom - barAreaTop;

  const rows = data.length;
  const gap = barAreaHeight / (rows * 2); // gap ~ barHeight
  const barHeight = gap;

  // ---------- LEYENDA SUPERIOR ----------
  const firstRowSegments = data[0].segments || [];
  const legendLabels = firstRowSegments.map((s) => s.label);

  const legendY = lineY + 60; // justo encima de las barras
  const legendRectH = 50;
  const legendFs = 20;

  const legendParts: string[] = [];

  if (legendLabels.length > 0) {
    const nSeg = legendLabels.length;
    const colWidth = stackedWidth / nSeg;

    legendLabels.forEach((segLabel, i) => {
      const cx = x0 + colWidth * (i + 0.5);
      const rectW = colWidth - 8;
      const rectX = cx - rectW / 2;
      const rectY = legendY;

      const color = colorForSegment(segLabel, i, customColors);

      // fondo
      legendParts.push(
        `<rect x="${rectX}" y="${rectY}" width="${rectW}" height="${legendRectH}"
               rx="8" ry="8" fill="${color}" />`
      );

      // wrap del texto de la leyenda (1-2 líneas)
      const maxChars = 18;
      const words = segLabel.split(/\s+/);

      let lines: string[] = [];
      let current = "";

      for (const w of words) {
        const test = current ? current + " " + w : w;
        if (test.length > maxChars && current) {
          lines.push(current);
          current = w;
        } else {
          current = test;
        }
      }
      if (current) lines.push(current);

      if (lines.length > 2) {
        lines = [lines[0], lines.slice(1).join(" ")];
      }

      const textCenterY = rectY + legendRectH / 2;
      const lineGap = 2;
      const firstLineY =
        textCenterY -
        ((lines.length - 1) * (legendFs + lineGap)) / 2;

      legendParts.push(
        `<text x="${cx}" y="${firstLineY}"
               fill="#ffffff"
               font-family="Helvetica, Arial, sans-serif"
               font-size="${legendFs}"
               font-weight="700"
               text-anchor="middle"
               dominant-baseline="middle">` +
          lines
            .map(
              (line, idx) =>
                `<tspan x="${cx}" dy="${
                  idx === 0 ? 0 : legendFs + lineGap
                }">${esc(line)}</tspan>`
            )
            .join("") +
          `</text>`
      );
    });
  }

  // ---------- BARRAS APILADAS + LABELS FILA + % DENTRO ----------
  const bars: string[] = [];

  data.forEach((row, rowIdx) => {
    const centerY = barAreaTop + gap * (1 + 2 * rowIdx);
    const top = centerY - barHeight / 2;

    // label de la fila (a la izquierda)
    const rowLabelLines = wrapLabel(row.label, 35);
    const labelFont = 20;
    const labelLineGap = 4;
    const totalLines = rowLabelLines.length;

    const firstLineY =
      centerY -
      ((totalLines - 1) * (labelFont + labelLineGap)) / 2;

    bars.push(
      `<text x="${marginLeftLabels - 20}" y="${firstLineY}"
             fill="${mainTextColor}"
             font-family="Helvetica, Arial, sans-serif"
             font-size="${labelFont}"
             font-weight="700"
             text-anchor="end">` +
        rowLabelLines
          .map(
            (line, idx) =>
              `<tspan x="${marginLeftLabels - 30}" dy="${
                idx === 0 ? 0 : labelFont + labelLineGap
              }">${esc(line)}</tspan>`
          )
          .join("") +
        `</text>`
    );

    const segments = row.segments || [];
    const total =
      segments.reduce(
        (acc, s) =>
          acc + (typeof s.percentage === "number" ? s.percentage : 0),
        0
      ) || 1;

    let currentX = x0;

    segments.forEach((seg, segIdx) => {
      const value = Math.max(0, Math.min(100, seg.percentage || 0));
      const fraction = value / total;
      const widthPx = stackedWidth * fraction;

      if (widthPx <= 0) return;

      const color = colorForSegment(seg.label, segIdx, customColors);

      // rectángulo del segmento
      bars.push(
        `<rect x="${currentX}" y="${top}" width="${widthPx}" height="${barHeight}" fill="${color}" />`
      );

      // texto de porcentaje dentro del segmento (solo si hay espacio)
      const minPxForText = 40;
      if (widthPx > minPxForText && value > 0) {
        const textX = currentX + widthPx / 2;
        const textY = centerY + 3;

        bars.push(
          `<text x="${textX}" y="${textY}" fill="#ffffff" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="700" text-anchor="middle" dominant-baseline="middle">${value}%</text>`
        );
      }

      currentX += widthPx;
    });
  });

  // ---------- CABECERA / FOOTER / COMPOSICIÓN ----------
  const parts: string[] = [];

  parts.push(
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${bg}"/>`
  );

  // título
  const titleLineGap = 6;
  titleLines.forEach((line, idx) => {
    const y = titleY + idx * (titleFs + titleLineGap);
    parts.push(
      `<text x="${marginLeft}" y="${y}" fill="${mainTextColor}" font-family="Helvetica, Arial, sans-serif" font-size="${titleFs}">${esc(
        line
      )}</text>`
    );
  });

  // línea
  parts.push(
    `<line x1="${marginLeft}" y1="${lineY}" x2="${W - marginRight}" y2="${lineY}" stroke="${mainTextColor}" stroke-width="2"/>`
  );

  // Poligrama / Poder. / Ganar.
  const logoX = W - marginRight;
  const logoY0 = marginTop - 24;

  if (sheetTitle) {
    parts.push(
      `<text x="${marginLeft}" y="${logoY0}"
             fill="${mainTextColor}"
             font-family="Helvetica, Arial, sans-serif"
             font-size="30"
             text-anchor="start">
        ${esc(sheetTitle)}
       </text>`
    );
  }

  parts.push(
    `<text x="${logoX}" y="${logoY0}" fill="${mainTextColor}" font-family="Helvetica, Arial, sans-serif" font-size="${headerFs}" font-weight="700" text-anchor="end">Poligrama.</text>`,
    `<text x="${logoX}" y="${
      logoY0 + headerLine
    }" fill="${mainTextColor}" font-family="Helvetica, Arial, sans-serif" font-size="${headerFs}" font-weight="700" text-anchor="end">Poder.</text>`,
    `<text x="${logoX}" y="${
      logoY0 + headerLine * 2
    }" fill="${mainTextColor}" font-family="Helvetica, Arial, sans-serif" font-size="${headerFs}" font-weight="700" text-anchor="end">Ganar.</text>`
  );

  // leyenda + barras
  parts.push(`<g>`, ...legendParts, `</g>`);
  parts.push(`<g>`, ...bars, `</g>`);

  // footer
  parts.push(
    `<text x="${W - marginRight}" y="${H - marginBottom}" fill="${mutedTextColor}" font-family="Helvetica, Arial, sans-serif" font-size="${footerFs}" text-anchor="end">${esc(
      ChartConfig.footer
    )}</text>`
  );

  parts.push(`</svg>`);

  return parts.join("\n");
}
