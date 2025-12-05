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

function darkerTransparent(base: string): string {
  const hex = base.replace("#", "");
  if (hex.length !== 6) return base;

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  const factor = 0.8; // un poco más oscuro
  const rd = Math.round(r * factor);
  const gd = Math.round(g * factor);
  const bd = Math.round(b * factor);

  // mismo tono, un poco más oscuro y semi-transparente
  return `rgba(${rd}, ${gd}, ${bd}, 0.9)`;
}

function wrapPartidoLabel(text: string, maxChars = 14): string[] {
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

  // máximo 2 líneas
  if (lines.length > 2) {
    return [lines[0], lines.slice(1).join(" ")];
  }

  return lines;
}

function prepareTitle(
  title: string,
  baseFontSize: number,
  maxChars = 110
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

/* ------------------------------------------------------------------ */
/*   Helpers                                                          */
/* ------------------------------------------------------------------ */

function getLogoInitials(label: string): string {
  const lower = label.toLowerCase();

  if (lower.includes("movimiento ciudadano")) return "MC";
  if (lower.includes("morena")) return "M";
  if (lower.includes("pri")) return "PRI";
  if (lower.includes("pan")) return "PAN";
  if (lower.includes("verde")) return "V";
  if (lower.includes("pt")) return "PT";
  if (lower.includes("vida")) return "VIDA";
  if (lower.includes("ninguno")) return "N";
  if (lower.includes("no sabe") || lower.includes("no contestó")) return "NS";

  return label.charAt(0).toUpperCase();
}

/* ------------------------------------------------------------------ */
/*   Builder principal SVG (Partido)                                  */
/* ------------------------------------------------------------------ */

export function buildPartidoSvg({
  data,
  title,
  customColors = {},
  sheetTitle,
  width,
  height,
}: ChartSvgArgs): string {
  const W = width ?? CANVAS_W;
  const H = height ?? CANVAS_H;
  const bg = "#000000";

  const isTall1440 = W === 1440 && H === 1800;

  const baseTitleFs = ChartConfig.typography.title.fontSize;
  const footerFs = ChartConfig.typography.footer.fontSize;
  const headerFs = 40;
  const headerLine = headerFs * 1.1;

  // márgenes dependientes del preset
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
    return basicPartidoMessageSvg("No hay datos para el gráfico de partidos");
  }

  // Layout tipo “pastilla”
  const logoSize = 48;
  const gapLogoLabel = 25;

  const pillX = marginLeft + logoSize + gapLogoLabel;
  const pillWidth = W - marginRight - pillX - 40;
  const pillHeight = (logoSize / 1.3) * 2;

  const contentTop = lineY + 70;
  const contentBottom = H - marginBottom - 40;
  const availableHeight = contentBottom - contentTop;

  const nRows = data.length;

  const minRowHeight = 56;
  const maxRowHeight = 110;
  const idealRowHeight = availableHeight / nRows;

  const rowHeight = Math.max(
    minRowHeight,
    Math.min(maxRowHeight, idealRowHeight)
  );

  const blockHeight = nRows * rowHeight;
  const startY = isTall1440
  ? marginTop + 350 
  : (blockHeight < availableHeight
      ? contentTop + (availableHeight - blockHeight) / 2
      : contentTop);


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

  /* -------------------- FILAS PARTIDO -------------------- */

  data.forEach((item, idx) => {
    const rowY = startY + idx * rowHeight;
    const centerY = rowY + rowHeight / 2;

    const barColor =
      customColors[item.label] ?? ChartConfig.colors.primary;
    const pct = Math.max(0, Math.min(100, item.percentage ?? 0));
    const logoInitials = getLogoInitials(item.label);

    // Círculo a la izquierda
    const logoCx = marginLeft + logoSize / 2;
    const logoCy = centerY;

    parts.push(
      `<circle cx="${logoCx}" cy="${logoCy}" r="${
        logoSize / 1.3
      }" fill="${barColor}" />`,
      `<text x="${logoCx}" y="${logoCy + 2}" fill="#ffffff" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="700" text-anchor="middle" dominant-baseline="middle">${esc(
        logoInitials
      )}</text>`
    );

    // Pastilla completa
    const pillY = centerY - pillHeight / 2;

    parts.push(
      `<rect x="${pillX}" y="${pillY}" width="${pillWidth}" height="${pillHeight}" rx="${pillHeight /
        2}" ry="${pillHeight / 2}" fill="${barColor}" />`
    );

    // Texto del candidato dentro de la pastilla (izquierda)
    const labelLines = [item.label];
    const labelFs = 22;
    const labelLineGap = 4;

    const labelStartX = pillX + 24; // padding dentro de la pastilla
    const firstLabelY =
      centerY -
      ((labelLines.length - 1) * (labelFs + labelLineGap)) / 2 +
      labelFs / 3;

    parts.push(
      `<text x="${labelStartX}" y="${firstLabelY}" 
         fill="#ffffff" font-family="Helvetica, Arial, sans-serif"
         font-size="${labelFs}" font-weight="700" text-anchor="start">
         ${esc(item.label)}
       </text>`
    );

    // Pastilla pequeña para el porcentaje (derecha)
    const pctPillWidth = 120;
    const pctPillHeight = 40;
    const pctPillX = pillX + pillWidth - pctPillWidth - 12;
    const pctPillY = centerY - pctPillHeight / 2;

    const pctPillColor = darkerTransparent(barColor);

    parts.push(
      `<rect x="${pctPillX}" y="${pctPillY}" width="${pctPillWidth}" height="${pctPillHeight}"
             rx="${pctPillHeight / 2}" ry="${pctPillHeight / 2}" fill="${pctPillColor}" />`
    );

    const pctX = pctPillX + pctPillWidth / 2;
    const pctY = centerY + 2;

    parts.push(
      `<text x="${pctX}" y="${pctY}" fill="#ffffff"
             font-family="Helvetica, Arial, sans-serif"
             font-size="24" font-weight="700"
             text-anchor="middle" dominant-baseline="middle">
        ${pct}%
       </text>`
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

function basicPartidoMessageSvg(message: string): string {
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
