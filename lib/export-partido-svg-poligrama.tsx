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

function darkerTransparent(base: string): { fill: string; opacity: number } {
  const hex = base.replace("#", "");
  if (hex.length !== 6) return { fill: base, opacity: 0.35 };

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  const factor = 0.8;
  const rd = Math.max(0, Math.min(255, Math.round(r * factor)));
  const gd = Math.max(0, Math.min(255, Math.round(g * factor)));
  const bd = Math.max(0, Math.min(255, Math.round(b * factor)));

  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  const fill = `#${toHex(rd)}${toHex(gd)}${toHex(bd)}`;

  // 👇 Para que se vea como tu 2ª imagen: fondo más “suave”
  return { fill, opacity: 0.35 };
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
  const blockHeight = finalLines.length * fs + (finalLines.length - 1) * lineGap;

  return { lines: finalLines, fontSize: fs, blockHeight };
}

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
  width,
  height,
  backgroundColor,
  textColor,
}: ChartSvgArgs): string {
  const W = width ?? CANVAS_W;
  const H = height ?? CANVAS_H;

  const bg = backgroundColor ?? "#000000";
  const mainTextColor = textColor ?? "#ffffff";

  const isTall1440 = W === 1440 && H === 1800;

  const baseTitleFs = ChartConfig.typography.title.fontSize;
  const headerFs = 40;

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
    return basicPartidoMessageSvg("No hay datos para el gráfico de partidos");
  }

  const logoSizeBase = 48;
const gapLogoLabel = 25;

// carril fijo para logos (no depende del número de filas)
const logoLaneW = logoSizeBase; // 48 (si quieres más aire, pon 56 o 64)

// pillX ya NO depende del logoSize dinámico
const pillX = marginLeft + logoLaneW + gapLogoLabel;
const pillWidth = W - marginRight - pillX - 40;


  const contentTop = lineY + 70;
  const contentBottom = H - marginBottom - 40;
  const availableHeight = contentBottom - contentTop;

  const nRows = data.length;

// Gap vertical entre barras (ajusta si quieres)
const minGap = 10;
const maxGap = 24;

// Calcula gap dinámico: más filas => menos gap
const rowGap = Math.max(
  minGap,
  Math.min(maxGap, Math.round(availableHeight * 0.015))
);

// Altura de fila para que quepan SIEMPRE todas
// (sumamos gaps entre filas)
const rowHeight = availableHeight / nRows;

// Altura real de la barra (pill) dentro de la fila
// Clamp para que no se hagan ridículamente delgadas ni enormes
const minPillH = 22;
const maxPillH = isTall1440 ? 90 : 70;

const pillHeight = Math.max(
  minPillH,
  Math.min(maxPillH, rowHeight - rowGap)
);

const logoSize = Math.max(30, Math.min(48, pillHeight));

// Recalculamos el alto del bloque real (pill + gap)
const blockHeight = nRows * (pillHeight + rowGap) - rowGap;

// Centramos verticalmente el bloque
const startY = contentTop + Math.max(0, (availableHeight - blockHeight) / 2);

  const parts: string[] = [];

  parts.push(
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${bg}" />`
  );

  // --------- TÍTULO ----------
  const titleLineGap = 6;
  titleLines.forEach((line, idx) => {
    const y = titleY + idx * (titleFs + titleLineGap);
    parts.push(
      `<text x="${marginLeft}" y="${y}" fill="${mainTextColor}" font-family="Helvetica, Arial, sans-serif" font-size="${titleFs}">${esc(
        line
      )}</text>`
    );
  });

  // --------- LÍNEA ----------
  parts.push(
    `<line x1="${marginLeft}" y1="${lineY}" x2="${W - marginRight}" y2="${lineY}" stroke="${mainTextColor}" stroke-width="2" />`
  );

  // ------------------------------------------------------------
  // DEFINICIONES: clipPaths (SOLO aquí, nada visible)
  // ------------------------------------------------------------
  parts.push(`<defs>`);

  data.forEach((item, idx) => {
    const rowY = startY + idx * (pillHeight + rowGap);
const centerY = rowY + pillHeight / 2;

    const pct = Math.max(0, Math.min(100, item.percentage ?? 0));
    const pillY = centerY - pillHeight / 2;

    const barTrackWidth = pillWidth;
    const fillWidth = (pct / 100) * barTrackWidth;

    // Clip para que el fill solo ocupe el %,
    // manteniendo la esquina izquierda redonda.
    parts.push(
      `<clipPath id="clip_${idx}">
        <rect x="${pillX}" y="${pillY}" width="${fillWidth}" height="${pillHeight}"
              rx="${pillHeight / 2}" ry="${pillHeight / 2}" />
      </clipPath>`
    );
  });

  parts.push(`</defs>`);

  // ------------------------------------------------------------
  // CONTENIDO
  // ------------------------------------------------------------
  parts.push(`<g id="chart-content">`);

  data.forEach((item, idx) => {
    const rowY = startY + idx * (pillHeight + rowGap);
const centerY = rowY + pillHeight / 2;


    const barColor = customColors[item.label] ?? ChartConfig.colors.primary;
    const pct = Math.max(0, Math.min(100, item.percentage ?? 0));
    const logoInitials = getLogoInitials(item.label);

    // ---- círculo izquierdo ----
const logoR = Math.max(14, Math.min(logoSize / 1.3, pillHeight / 2));
const logoCx = marginLeft + logoLaneW / 2;
const logoCy = centerY;


// dibuja círculo + iniciales
parts.push(
  `<circle cx="${logoCx}" cy="${logoCy}" r="${logoR}" fill="${barColor}" />`,
  `<text x="${logoCx}" y="${logoCy + 2}" fill="${mainTextColor}"
         font-family="Helvetica, Arial, sans-serif"
         font-size="${Math.max(16, Math.min(30, logoR * 1.2))}"
         font-weight="700"
         text-anchor="middle"
         dominant-baseline="middle">${esc(logoInitials)}</text>`
);

    // ---- barra 100% (fondo) + barra % (fill) ----
    const pillY = centerY - pillHeight / 2;
    const bgPill = darkerTransparent(barColor);

    const barTrackWidth = pillWidth;

    // Fondo 100%
    parts.push(
      `<rect x="${pillX}" y="${pillY}" width="${barTrackWidth}" height="${pillHeight}"
             rx="${pillHeight / 2}" ry="${pillHeight / 2}"
             fill="${bgPill.fill}" fill-opacity="${bgPill.opacity}" />`
    );

    // Fill %
    parts.push(
  `<rect x="${pillX}" y="${pillY}" width="${barTrackWidth}" height="${pillHeight}"
         fill="${barColor}" clip-path="url(#clip_${idx})" />`
);


    // ---- label dentro ----
    const labelFs = 22;
    const labelStartX = pillX + 24;
    const labelY = centerY + labelFs / 3;

    parts.push(
      `<text x="${labelStartX}" y="${labelY}"
             fill="${mainTextColor}" font-family="Helvetica, Arial, sans-serif"
             font-size="${labelFs}" font-weight="700" text-anchor="start"
             dominant-baseline="middle">
        ${esc(item.label)}
      </text>`
    );

    // ---- % dentro de la barra, a la derecha ----
    const pctText = `${Number(pct).toFixed(1)}%`;
    const pctTextX = pillX + barTrackWidth - 24;
    const pctTextY = centerY + 2;

    parts.push(
      `<text x="${pctTextX}" y="${pctTextY}"
             fill="${mainTextColor}"
             font-family="Helvetica, Arial, sans-serif"
             font-size="28"
             font-weight="700"
             text-anchor="end"
             dominant-baseline="middle">
        ${esc(pctText)}
      </text>`
    );
  });

  parts.push(`</g>`);
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
