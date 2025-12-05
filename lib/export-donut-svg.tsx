import { ChartConfig } from "@/lib/chartconfig";
import type { FrequencyData } from "@/app/page";

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

type BuildDonutSvgArgs = {
  data: FrequencyData[];
  title: string;
  customColors?: Record<string, string>;
  sheetTitle?: string;
  width?: number;
  height?: number;
};

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



export function buildDonutSvg({
  data,
  title,
  customColors = {},
  sheetTitle,
  width,
  height,
}: BuildDonutSvgArgs): string {
  const W = width ?? CANVAS_W;
  const H = height ?? CANVAS_H;

  const bg = "#000000";

  const baseTitleFs = ChartConfig.typography.title.fontSize;
  const footerFs = ChartConfig.typography.footer.fontSize;
  const headerFs = 40;
  const headerLine = headerFs * 1.1;

  // 🔹 detectar preset alto
  const isTall1440 = W === 1440 && H === 1800;

  let marginLeft: number;
  let marginRight: number;
  let marginTop: number;
  let marginBottom: number;

  if (isTall1440) {
    // layout especial para 1440×1800
    marginLeft = 100;
    marginRight = 100;
    marginTop = 170;
    marginBottom = 170;
  } else {
    // layout original 1920×1080 (no lo rompemos)
     marginLeft = 120;
    marginRight = 120;
    marginTop = 125;
    marginBottom = 125;
  }

  const titleY = marginTop + 130;
  const maxTitleChars = isTall1440 ? 80 : 108;

  const {
    lines: titleLines,
    fontSize: titleFs,
    blockHeight: titleBlockH,
  } = prepareTitle(title, baseTitleFs, maxTitleChars);

  const lineY = titleY + titleBlockH + 16;

  // ----- Área del donut -----
  let donutAreaTop = lineY - 100;
  let donutAreaBottom = H - marginBottom;
  if (isTall1440) {
    // usamos más altura para que el canvas no se vea vacío
    donutAreaTop = lineY - 40;
    donutAreaBottom = H - marginBottom - 40;
  }
  const donutAreaHeight = donutAreaBottom - donutAreaTop;
  const side = Math.min(W, donutAreaHeight) * (isTall1440 ? 0.55 : 0.6);
  const outerR = side / 2;
  const innerR = outerR * 0.73;

  const cx = W * 0.68;
  const cy = donutAreaTop + donutAreaHeight / 2;

  const safeData = data.filter((d) => d.percentage > 0);
  const totalPerc =
    safeData.reduce((acc, d) => acc + d.percentage, 0) || 1;

  // ----- Donut -----
  const slices: string[] = [];
  let currentAngle = -Math.PI / 2;

  for (let i = 0; i < safeData.length; i++) {
    const item = safeData[i];
    const fraction = item.percentage / totalPerc;
    const angleSpan = 2 * Math.PI * fraction;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angleSpan;
    currentAngle = endAngle;

    const largeArcFlag = angleSpan > Math.PI ? 1 : 0;
    const color =
      customColors[item.label] ?? PALETTE[i % PALETTE.length];

    const x0o = cx + outerR * Math.cos(startAngle);
    const y0o = cy + outerR * Math.sin(startAngle);
    const x1o = cx + outerR * Math.cos(endAngle);
    const y1o = cy + outerR * Math.sin(endAngle);

    const x1i = cx + innerR * Math.cos(endAngle);
    const y1i = cy + innerR * Math.sin(endAngle);
    const x0i = cx + innerR * Math.cos(startAngle);
    const y0i = cy + innerR * Math.sin(startAngle);

    const dPath =
      "M " +
      x0o +
      " " +
      y0o +
      " A " +
      outerR +
      " " +
      outerR +
      " 0 " +
      largeArcFlag +
      " 1 " +
      x1o +
      " " +
      y1o +
      " L " +
      x1i +
      " " +
      y1i +
      " A " +
      innerR +
      " " +
      innerR +
      " 0 " +
      largeArcFlag +
      " 0 " +
      x0i +
      " " +
      y0i +
      " Z";

    slices.push(
      `<path d="${dPath}" fill="${color}" stroke="none"/>`
    );
  }

  // ----- Leyenda -----
    const fsPercent = Math.max(
    22,
    ChartConfig.typography.legend.percentageSize
  );
  const fsLabel = ChartConfig.typography.legend.fontSize;
  const legendData = safeData;
  const colCount = legendData.length;
  const leftAreaWidth = W / 2 - marginLeft - 40;
  const colWidth = leftAreaWidth / Math.max(colCount, 3);

  const xCenter = marginLeft + leftAreaWidth / 2;
  const legendTop = cy - (isTall1440 ? 260 : 180);

  const legendItems: string[] = [];

  for (let i = 0; i < legendData.length; i++) {
    const item = legendData[i];
    const color =
      customColors[item.label] ?? PALETTE[i % PALETTE.length];

    const pillWidth = (isTall1440 ? colWidth * 3.2 : colWidth * 3);
    const pillHeight = 60;

    legendItems.push(
      `<g transform="translate(${xCenter}, ${
        legendTop + i * (pillHeight + 20)
      })">` +
        `<rect x="${-pillWidth / 2}" y="0" width="${pillWidth}" height="${pillHeight}" rx="12" ry="12" fill="${color}"/>` +
        `<text x="0" y="24" text-anchor="middle" fill="#ffffff" font-family="Helvetica, Arial, sans-serif" font-size="${fsPercent}" font-weight="700">${item.percentage}%</text>` +
        `<text x="0" y="44" text-anchor="middle" fill="#ffffff" font-weight="700" font-family="Helvetica, Arial, sans-serif" font-size="${fsLabel}">${esc(
          item.label
        )}</text>` +
      `</g>`
    );
  }

  // ----- Composición final -----
  const parts: string[] = [];

  parts.push(
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${bg}"/>`
  );

  // Título
  const titleLineGap = 6;
  titleLines.forEach((line, idx) => {
    const y = titleY + idx * (titleFs + titleLineGap);
    parts.push(
      `<text x="${marginLeft}" y="${y}" fill="#ffffff" font-family="Helvetica, Arial, sans-serif" font-size="${titleFs}">${esc(
        line
      )}</text>`
    );
  });

  // Línea
  parts.push(
    `<line x1="${marginLeft}" y1="${lineY}" x2="${
      W - marginRight
    }" y2="${lineY}" stroke="#ffffff" stroke-width="2"/>`
  );

  // Poligrama / Poder. / Ganar.
  const logoX = W - marginRight;
  const logoY0 = marginTop - 24;

  if (sheetTitle) {
    parts.push(
      `<text x="${marginLeft}" y="${logoY0}"
             fill="#ffffff"
             font-family="Helvetica, Arial, sans-serif"
             font-size="30"
             text-anchor="start">
        ${esc(sheetTitle)}
       </text>`
    );
  }

  parts.push(
    `<text x="${logoX}" y="${logoY0}" fill="#ffffff" font-family="Helvetica, Arial, sans-serif" font-size="${headerFs}" font-weight="700" text-anchor="end">Poligrama.</text>`,
    `<text x="${logoX}" y="${
      logoY0 + headerLine
    }" fill="#ffffff" font-family="Helvetica, Arial, sans-serif" font-size="${headerFs}" font-weight="700" text-anchor="end">Poder.</text>`,
    `<text x="${logoX}" y="${
      logoY0 + headerLine * 2
    }" fill="#ffffff" font-family="Helvetica, Arial, sans-serif" font-size="${headerFs}" font-weight="700" text-anchor="end">Ganar.</text>`
  );

  // Donut
  parts.push(`<g>`, ...slices, `</g>`);

  // Leyenda
  parts.push(...legendItems);

  // Footer
  parts.push(
    `<text x="${W - marginRight}" y="${H - marginBottom}" fill="#bdbdbd" font-family="Helvetica, Arial, sans-serif" font-size="${footerFs}" text-anchor="end">${esc(
      ChartConfig.footer
    )}</text>`
  );

  parts.push(`</svg>`);

  return parts.join("\n");
}
