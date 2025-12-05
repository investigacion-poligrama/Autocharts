import { ChartConfig } from "@/lib/chartconfig";
import type { FrequencyData } from "@/app/page";

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

type BuildBarSvgArgs = {
  data: FrequencyData[];
  title: string;
  customColors?: Record<string, string>;
  sheetTitle?: string;
  width?: number;
  height?: number;
  backgroundColor?: string;
  textColor?: string;
};

function wrapBarLabel(text: string, maxChars = 18): string[] {
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

  // Máximo 2 líneas
  if (lines.length > 2) {
    return [lines[0], lines.slice(1).join(" ")];
  }

  return lines;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type WrappedTitle = {
  lines: string[];
  fontSize: number;
  blockHeight: number;
};

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


function darkenHexColor(hex: string, factor = 0.8): string {
  // espera formatos tipo "#rrggbb"
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return hex;

  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);

  const rd = Math.max(0, Math.min(255, Math.round(r * factor)));
  const gd = Math.max(0, Math.min(255, Math.round(g * factor)));
  const bd = Math.max(0, Math.min(255, Math.round(b * factor)));

  const toHex = (v: number) => v.toString(16).padStart(2, "0");

  return `#${toHex(rd)}${toHex(gd)}${toHex(bd)}`;
}
const CANVAS_W = 1920;
const CANVAS_H = 1080;

export function buildBarSvg({
  data,
  title,
  customColors = {},
  sheetTitle,
  width,
  height,
  backgroundColor,
  textColor,
}: BuildBarSvgArgs): string {
  const W = width ?? CANVAS_W;
  const H = height ?? CANVAS_H;

  // 👇 usar colores configurables
  const bg = backgroundColor ?? "#000000";
  const mainTextColor = textColor ?? "#ffffff";
  const mutedTextColor = textColor ? textColor : "#bdbdbd";

  const baseTitleFs = ChartConfig.typography.title.fontSize;
  const footerFs = ChartConfig.typography.footer.fontSize;
  const headerFs = 40;
  const headerLine = headerFs * 1.1;

  const isTall1440 = W === 1440 && H === 1800;

  let marginLeft: number;
  let marginRight: number;
  let marginTop: number;
  let marginBottom: number;
  let marginLeftLabels: number;
  let titleY: number;

  if (isTall1440) {
    marginLeft = 100;
    marginRight = 100;
    marginTop = 170;
    marginBottom = 170;
    marginLeftLabels = 120;
    titleY = marginTop + 130;
  } else {
    marginLeft = 120;
    marginRight = 120;
    marginTop = 125;
    marginBottom = 125;
    marginLeftLabels = 120;
    titleY = marginTop + 130;
  }

  const maxTitleChars = isTall1440 ? 80 : 108;

  const {
    lines: titleLines,
    fontSize: titleFs,
    blockHeight: titleBlockH,
  } = prepareTitle(title, baseTitleFs, maxTitleChars);

  const lineY = titleY + titleBlockH + 16;

  const barAreaTop = lineY + 60;
  const barAreaBottom = H - marginBottom - 40;
  const barAreaHeight = barAreaBottom - barAreaTop;

  const x0 = marginLeftLabels;
  const x1 = W - marginRight;
  const percZoneWidth = 100;
  const barMaxWidth = x1 - x0 - percZoneWidth;

  const rows = data.length || 1;

  const normalized = data.map((d) => {
    const raw =
      typeof d.percentage === "number"
        ? d.percentage
        : typeof d.value === "number"
        ? d.value
        : 0;
    const value = Math.max(0, Math.min(100, raw));
    return { ...d, value };
  });

  const bars: string[] = [];

  type LayoutRow = {
    item: (typeof normalized)[number];
    col: number;
    rowInCol: number;
    rowsInCol: number;
    x0: number;
    x1: number;
    barMaxWidth: number;
    gap: number;
    barHeight: number;
  };

  const layouts: LayoutRow[] = [];

  const numCols = rows > 8 ? 2 : 1;

  if (numCols === 1) {
    const x0 = marginLeftLabels;
    const x1 = W - marginRight;
    const colWidth = x1 - x0;
    const barMaxWidth = colWidth - percZoneWidth;

    const gap = barAreaHeight / (rows * 2);
    const barHeight = gap;

    normalized.forEach((item, idx) => {
      layouts.push({
        item,
        col: 0,
        rowInCol: idx,
        rowsInCol: rows,
        x0,
        x1,
        barMaxWidth,
        gap,
        barHeight,
      });
    });
  } else {
    const totalWidth = W - marginLeftLabels - marginRight;
    const colGap = 80;

    const colWidth = (totalWidth - colGap) / 2;
    const rowsLeft = Math.ceil(rows / 2);
    const rowsRight = rows - rowsLeft;

    const makeCol = (col: number, startIdx: number, count: number) => {
      if (count <= 0) return;
      const x0 = marginLeftLabels + col * (colWidth + colGap);
      const x1 = x0 + colWidth;
      const barMaxWidth = colWidth - percZoneWidth;

      const gap = barAreaHeight / (count * 2);
      const barHeight = gap;

      for (let i = 0; i < count; i++) {
        const item = normalized[startIdx + i];
        layouts.push({
          item,
          col,
          rowInCol: i,
          rowsInCol: count,
          x0,
          x1,
          barMaxWidth,
          gap,
          barHeight,
        });
      }
    };

    makeCol(0, 0, rowsLeft);
    makeCol(1, rowsLeft, rowsRight);
  }

  // ---------- BARRAS + LABEL + % ----------
  layouts.forEach((layout, idx) => {
    const { item, x0, x1, barMaxWidth, gap, barHeight, rowInCol } = layout;

    const centerY = barAreaTop + gap * (1 + 2 * rowInCol);
    const top = centerY - barHeight / 2;
    const valueWidth = (barMaxWidth * item.value) / 100;

    const color = customColors[item.label] ?? PALETTE[idx % PALETTE.length];
    const darkBg = darkenHexColor(color, 0.7);

    bars.push(
      `<rect x="${x0}" y="${top}" width="${barMaxWidth}" height="${barHeight}" fill="${darkBg}" fill-opacity="0.3" />`
    );

    bars.push(
      `<rect x="${x0}" y="${top}" width="${valueWidth}" height="${barHeight}" fill="${color}" />`
    );

    const cleanLabel = esc(
      String(item.label)
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/\s*\n\s*/g, " ")
    );

    const labelFont = 22;
    const topLabelY = top - 12;

    bars.push(
      `<text
        x="${x0}"
        y="${topLabelY}"
        fill="${mainTextColor}"
        font-family="Helvetica, Arial, sans-serif"
        font-size="${labelFont}"
        font-weight="700"
        text-anchor="start"
      >
        ${cleanLabel}
      </text>`
    );

    const percText = `${item.value}%`;
    const percPaddingRight = 10;
    const percX = x1 - percPaddingRight;

    bars.push(
      `<text
        x="${percX}"
        y="${centerY}"
        fill="${mainTextColor}"
        font-family="Helvetica, Arial, sans-serif"
        font-size="25"
        font-weight="700"
        text-anchor="end"
        dominant-baseline="middle"
      >${percText}</text>`
    );
  });

  // ---------- CABECERA Y FOOTER ----------
  const parts: string[] = [];

  parts.push(
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${bg}"/>`
  );

  const titleLineGap = 6;
  titleLines.forEach((line, idx) => {
    const y = titleY + idx * (titleFs + titleLineGap);
    parts.push(
      `<text x="${marginLeft}" y="${y}" fill="${mainTextColor}" font-family="Helvetica, Arial, sans-serif" font-size="${titleFs}">${esc(
        line
      )}</text>`
    );
  });

  parts.push(
    `<line x1="${marginLeft}" y1="${lineY}" x2="${
      W - marginRight
    }" y2="${lineY}" stroke="${mainTextColor}" stroke-width="2"/>`
  );

  const logoX = W - marginRight;
  const logoY0 = marginTop - 24;

  if (sheetTitle) {
    let sheetTitleY = logoY0 + 40;
    if (W === 1440 && H === 1800) sheetTitleY = logoY0 + 60;

    parts.push(
      `<text x="${marginLeft}" y="${sheetTitleY}"
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

  parts.push(`<g>`, ...bars, `</g>`);

  parts.push(
    `<text x="${W - marginRight}" y="${H - marginBottom}" fill="${mutedTextColor}" font-family="Helvetica, Arial, sans-serif" font-size="${footerFs}" text-anchor="end">${esc(
      ChartConfig.footer
    )}</text>`
  );

  parts.push(`</svg>`);

  return parts.join("\n");
}
