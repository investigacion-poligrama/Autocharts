import { ChartConfig } from "@/lib/chartconfig";
import type { ChartSvgArgs } from "@/lib/chart-svgs";

const CANVAS_W = 1920;
const CANVAS_H = 1080;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type WrappedTitle = {
  lines: string[];
  fontSize: number;
  blockHeight: number;
};

function wrapLabel(label: string, maxChars = 10): string[] {
  const words = label.split(/\s+/);
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

  // permitir hasta 3 líneas
  if (lines.length > 3) {
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


// Mapeos como en tu componente React
const APPROVAL_COLORS: Record<string, string> = {
  "muy efectivo": ChartConfig.colors.effectiveness.muy,
  "algo efectivo": ChartConfig.colors.effectiveness.algo,
  "poco efectivo": ChartConfig.colors.effectiveness.algo,
  "nada efectivo": ChartConfig.colors.effectiveness.nada,
  "no sabe": ChartConfig.colors.neutral,
};

const APPROVAL_BG_COLORS: Record<string, string> = {
  "muy efectivo": ChartConfig.colors.effectiveness.fuerte.muy,
  "algo efectivo": ChartConfig.colors.effectiveness.fuerte.algo,
  "poco efectivo": ChartConfig.colors.effectiveness.fuerte.poco,
  "nada efectivo": ChartConfig.colors.effectiveness.fuerte.nada,
  "no sabe": ChartConfig.colors.effectiveness.nsnc,
};

function normalizeLabel(label: string): string {
  return label.toLowerCase().trim();
}

// color principal (borde/parte llena)
function mainColorFor(
  label: string,
  customColors: Record<string, string>
): string {
  if (customColors[label]) return customColors[label];
  const norm = normalizeLabel(label);
  return APPROVAL_COLORS[norm] ?? ChartConfig.colors.primary;
}

// color de fondo de la barra (columna completa)
function bgColorFor(
  label: string,
  customColors: Record<string, string>
): string {
  const custom = mainColorFor(label, customColors);

  const norm = normalizeLabel(label);
  if (APPROVAL_BG_COLORS[norm]) return APPROVAL_BG_COLORS[norm];

  const hex = custom.replace("#", "");
  if (hex.length !== 6) return custom;

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.25)`;
}

// extendemos el tipo para aceptar width/height opcionales
type ApprovalSvgArgs = ChartSvgArgs & {
  width?: number;
  height?: number;
};

/* ------------------------------------------------------------------ */
/*   Builder principal SVG (Approval)                                 */
/* ------------------------------------------------------------------ */
export function buildApprovalSvg({
  data,
  title,
  customColors = {},
  sheetTitle,
  width,
  height,
}: ApprovalSvgArgs): string {
  const W = width ?? CANVAS_W;
  const H = height ?? CANVAS_H;
  const bg = "#000000";

  const baseTitleFs = ChartConfig.typography.title.fontSize;
  const footerFs = ChartConfig.typography.footer.fontSize;
  const headerFs = 40;
  const headerLine = headerFs * 1.1;

  const isTall1440 = W === 1440 && H === 1800;

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

  if (!data || data.length === 0) {
    return basicApprovalMessageSvg("No hay datos para el gráfico de aprobación");
  }

  const items = data.slice();

  /* ------------ área vertical disponible ------------ */

  const labelsBlock = isTall1440 ? 120 : 90;
  const footerPadding = isTall1440 ? 40 : 30;

  const barsAreaTop = lineY + (isTall1440 ? 140 : 80);
  const barsAreaBottom = H - marginBottom - labelsBlock - footerPadding;
  const barsAreaHeight = Math.max(0, barsAreaBottom - barsAreaTop);

  const idealMaxBarHeight = isTall1440 ? 900 : 450;
  const maxBarHeight = Math.min(idealMaxBarHeight, barsAreaHeight);

  const barBaseHeight = maxBarHeight;

  const n = items.length;

  /* ------------ ancho dinámico por número de barras ------------ */

  const innerWidth = W - marginLeft - marginRight;
  const slotWidth = innerWidth / Math.max(n, 1);

  // barWidth máximo 120px, mínimo 20px, y ~60% del slot
  const barWidth = Math.max(
    20,
    Math.min(120, slotWidth * 0.6)
  );

  const barsBottomY = barsAreaBottom;
  const labelsY = barsBottomY + (isTall1440 ? 50 : 40);

  const parts: string[] = [];

  parts.push(
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${bg}" />`
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
    }" y2="${lineY}" stroke="#ffffff" stroke-width="2" />`
  );

  // Poligrama / Poder. / Ganar. + hoja
  const logoX = W - marginRight;
  const logoY0 = marginTop - 24;

  if (sheetTitle) {
    let sheetTitleY = logoY0 + 40;
    if (isTall1440) sheetTitleY = logoY0 + 60;

    parts.push(
      `<text x="${marginLeft}" y="${sheetTitleY}"
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

  /* -------------------- BARRAS -------------------- */

  items.forEach((item, idx) => {
    const pct = item.percentage ?? 0;
    const barHeight = (Math.max(0, Math.min(100, pct)) / 100) * barBaseHeight;

    // centro del slot
    const slotCenterX = marginLeft + slotWidth * (idx + 0.5);
    const x = slotCenterX - barWidth / 2;

    const yBase = barsBottomY;
    const yTopFilled = yBase - barHeight;
    const yTopBg = yBase - barBaseHeight;

    const mainColor = mainColorFor(item.label, customColors);
    const bgColor = bgColorFor(item.label, customColors);

    // columna de fondo
    parts.push(
      `<rect x="${x}" y="${yTopBg}" width="${barWidth}" height="${barBaseHeight}" rx="8" ry="8" fill="${bgColor}" />`
    );

    // parte llena
    parts.push(
      `<rect x="${x}" y="${yTopFilled}" width="${barWidth}" height="${barHeight}" rx="8" ry="8" fill="${mainColor}" />`
    );

    // porcentaje encima
    const textPctY = yTopBg - 16;
    parts.push(
      `<text x="${
        x + barWidth / 2
      }" y="${textPctY}" fill="#ffffff" font-family="Helvetica, Arial, sans-serif" font-size="25" font-weight="700" text-anchor="middle">${pct}%</text>`
    );

    // label debajo
    const labelLines = wrapLabel(item.label, 18);
    const labelFs = 14;
    const lineGap = 8;

    const firstLineY =
      labelsY - ((labelLines.length - 1) * (labelFs + lineGap)) / 2;

    parts.push(
      `<text x="${x + barWidth / 2}" y="${firstLineY}" fill="#ffffff" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="700" text-anchor="middle">` +
        labelLines
          .map((line, i) =>
            `<tspan x="${x + barWidth / 2}" dy="${
              i === 0 ? 0 : labelFs + lineGap
            }">${esc(line)}</tspan>`
          )
          .join("") +
        `</text>`
    );
  });

  // Footer
  parts.push(
    `<text x="${W - marginRight}" y="${H - marginBottom}" fill="#bdbdbd" font-family="Helvetica, Arial, sans-serif" font-size="${footerFs}" text-anchor="end">${esc(
      ChartConfig.footer
    )}</text>`
  );

  parts.push(`</svg>`);

  return parts.join("\n");
}



/* ------------------------------------------------------------------ */
/*   Mensaje básico si no hay datos                                   */
/* ------------------------------------------------------------------ */

function basicApprovalMessageSvg(message: string): string {
  const W = CANVAS_W;
  const H = CANVAS_H;
  const bg = "#000000";

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${bg}" />`,
    `<text x="${W / 2}" y="${H / 2}" fill="#ffffff" font-family="Helvetica, Arial, sans-serif" font-size="24" text-anchor="middle" dominant-baseline="middle">${esc(
      message
    )}</text>`,
    `</svg>`,
  ].join("\n");
}
