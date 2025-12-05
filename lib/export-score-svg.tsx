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

function prepareTitle(
  title: string,
  baseFontSize: number,
  maxChars = 108
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

function parseNum(s: string): number {
  const m = String(s).trim().match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

export function buildScoreSvg({
  data,
  title,
  sheetTitle,
  width,
  height,
  backgroundColor,
  textColor,
}: ChartSvgArgs): string {
  const W = width ?? CANVAS_W;
  const H = height ?? CANVAS_H;

  const bg = backgroundColor ?? "#000000";
  const mainTextColor = textColor ?? "#ffffff";
  const mutedTextColor = textColor ? textColor : "#bdbdbd";

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

  // --- 1) Calcular PROMEDIO 0–10 desde la distribución ---

  if (!data || data.length === 0) {
    return basicScoreMessageSvg("No hay datos para calcular el promedio", bg, mainTextColor);
  }

  const hasCounts = data.some((d) => d.value && d.value > 0);
  const weights = hasCounts
    ? data.map((d) => ({ x: parseNum(d.label), w: d.value ?? 0 }))
    : data.map((d) => ({ x: parseNum(d.label), w: d.percentage ?? 0 }));

  const filtered = weights.filter(
    (p) => !Number.isNaN(p.x) && p.w > 0 && p.x >= 0
  );

  const Wtotal = filtered.reduce((acc, p) => acc + p.w, 0);
  const sumWX = filtered.reduce((acc, p) => acc + p.x * p.w, 0);

  let avg = Wtotal > 0 ? sumWX / Wtotal : 0;
  avg = Math.max(0, Math.min(10, avg)); // clamp [0,10]
  const avgDisp = avg.toFixed(1);

  const ringValue = avg;
  const ringRest = Math.max(0, 10 - ringValue);

  // --- 2) Layout del gauge tipo dona ---

  let gaugeTop = lineY + 80;
  let gaugeBottom = H - marginBottom - 80;

  if (isTall1440) {
    gaugeTop = lineY + 40;
    gaugeBottom = H - marginBottom - 140;
  }

  const gaugeHeight = gaugeBottom - gaugeTop;

  let side = Math.min(W, gaugeHeight * 1.3) * 0.5;
  if (isTall1440) {
    side *= 0.8;
  }

  const outerR = side / 1.2;
  const innerR = outerR * 0.7;

  const cx = W / 2;
  const cy = gaugeTop + gaugeHeight / 2;

  // Dona con dos segmentos [Score, Resto]
  const total = Math.max(0.0001, ringValue + ringRest);
  const segments = [
    { label: "Score", value: ringValue, color: ChartConfig.colors.lightDonut },
    { label: "Resto", value: ringRest, color: ChartConfig.colors.darkDonut },
  ];

  const slices: string[] = [];
  let currentAngle = -Math.PI / 2;

  segments.forEach((seg) => {
    if (seg.value <= 0) return;

    const fraction = seg.value / total;
    const angleSpan = 2 * Math.PI * fraction;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angleSpan;
    currentAngle = endAngle;

    const largeArcFlag = angleSpan > Math.PI ? 1 : 0;

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

    slices.push(`<path d="${dPath}" fill="${seg.color}" stroke="none" />`);
  });

  // --- 3) Composición general del SVG ---

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
      `<text x="${marginLeft}" y="${y}" fill="${mainTextColor}" font-family="Helvetica, Arial, sans-serif" font-size="${titleFs}">${esc(
        line
      )}</text>`
    );
  });

  // Línea
  parts.push(
    `<line x1="${marginLeft}" y1="${lineY}" x2="${
      W - marginRight
    }" y2="${lineY}" stroke="${mainTextColor}" stroke-width="2"/>`
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

  // Dona de score
  parts.push(`<g>`, ...slices, `</g>`);

  // --- 4) Overlay centrado: "Promedio" + línea + valor ---

  parts.push(
    `<text x="${cx}" y="${cy - 25}" text-anchor="middle" fill="${mainTextColor}" font-family="Helvetica, Arial, sans-serif" font-size="50">Promedio</text>`
  );

  parts.push(
    `<line x1="${cx - 130}" y1="${cy - 15}" x2="${cx + 130}" y2="${cy - 15}" stroke="${mainTextColor}" stroke-width="2"/>`
  );

  parts.push(
    `<text x="${cx}" y="${cy + 60}" text-anchor="middle" fill="${mainTextColor}" font-family="Helvetica, Arial, sans-serif" font-size="75" font-weight="700">${avgDisp}</text>`
  );

  // Footer
  parts.push(
    `<text x="${W - marginRight}" y="${H - marginBottom}" fill="${mutedTextColor}" font-family="Helvetica, Arial, sans-serif" font-size="${footerFs}" text-anchor="end">${esc(
      ChartConfig.footer
    )}</text>`
  );

  parts.push(`</svg>`);

  return parts.join("\n");
}

/** SVG básico con mensaje centrado, si no hay datos */
function basicScoreMessageSvg(
  message: string,
  bg: string,
  textColor: string
): string {
  const W = CANVAS_W;
  const H = CANVAS_H;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${bg}" />`,
    `<text x="${W / 2}" y="${H / 2}" fill="${textColor}" font-family="Helvetica, Arial, sans-serif" font-size="24" text-anchor="middle" dominant-baseline="middle">${esc(
      message
    )}</text>`,
    `</svg>`,
  ].join("\n");
}
