import { ChartConfig } from "@/lib/chartconfig";
import type { ChartSvgArgs } from "@/lib/chart-svgs";
import type { DatasetColumn } from "@/app/page";
import { getBrandTheme } from "@/lib/brand-theme";
import { COOLVETICA_WOFF2_BASE64 } from "@/coolvetica.b64";

const CANVAS_W = 1920;
const CANVAS_H = 1080;

// Solo para Cens/Edmund/Sinsa
const CENS_W = 612;
const CENS_H = 792;

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
  maxChars = 70,
  maxLines = 3
): WrappedTitle {
  const words = String(title || "").trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  let truncated = false;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const test = current ? `${current} ${w}` : w;

    if (test.length <= maxChars) {
      current = test;
      continue;
    }

    if (current) {
      lines.push(current);
      current = w;
    } else {
      lines.push(w.slice(0, maxChars));
      current = "";
    }

    if (lines.length === maxLines) {
      truncated = i < words.length - 1 || (current.length > maxChars);
      current = "";
      break;
    }
  }

  if (current) lines.push(current);

  if (lines.length > maxLines) {
    lines.length = maxLines;
    truncated = true;
  }

  if (truncated && lines.length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/\.*$/, "") + "…";
  }

  const fs = baseFontSize;
  const lineGap = 6;
  const blockHeight = lines.length * fs + (lines.length - 1) * lineGap;

  return { lines, fontSize: fs, blockHeight };
}

function a1ToRowColSummary(a1: string) {
  const match = a1.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) throw new Error(`Referencia A1 inválida: ${a1}`);
  const [, colLetters, rowStr] = match;
  let col = 0;
  for (const ch of colLetters) col = col * 26 + (ch.charCodeAt(0) - 64);
  const row = parseInt(rowStr, 10);
  if (!row || row < 1) throw new Error(`Fila inválida en referencia A1: ${a1}`);
  return { row, col };
}

function parseA1RangeSummary(range: string) {
  const [startStr, endStr] = range.split(":");
  const start = a1ToRowColSummary(startStr);
  const end = endStr ? a1ToRowColSummary(endStr) : start;

  return {
    rowStart: Math.min(start.row, end.row),
    rowEnd: Math.max(start.row, end.row),
    colStart: Math.min(start.col, end.col),
    colEnd: Math.max(start.col, end.col),
  };
}

function extractTrackingData(columns: DatasetColumn[]) {
  const MONTHS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

  const monthCol = columns.find(
    (c) =>
      /mes/i.test(c.name ?? "") &&
      c.values.some((v) => MONTHS.includes(String(v || "").slice(0, 3).toUpperCase()))
  );

  const problemCol = columns.find((c) => /(problema|categor[ií]a|tema)/i.test(c.name ?? ""));
  const valueCol = columns.find((c) => /(porcentaje|valor|rango)/i.test(c.name ?? ""));

  if (!monthCol || !problemCol) return null;

  const monthsUsed = Array.from(
    new Set(
      monthCol.values
        .filter(Boolean)
        .map((v) => String(v).slice(0, 3).toUpperCase())
    )
  );
  const months = monthsUsed.sort((a, b) => MONTHS.indexOf(a) - MONTHS.indexOf(b));
  const problems = Array.from(new Set(problemCol.values.filter(Boolean)));

  const hasNumeric =
    !!valueCol &&
    valueCol.values.some((v) => v !== "" && !isNaN(Number(String(v).replace(",", "."))));

  const categories = problems.map((p) => ({
    name: p,
    values: months.map(() => 0),
  }));

  if (hasNumeric && valueCol) {
    for (let i = 0; i < monthCol.values.length; i++) {
      const m = String(monthCol.values[i] || "").slice(0, 3).toUpperCase();
      const p = problemCol.values[i];
      const raw = String(valueCol.values[i] ?? "").replace(",", ".");
      if (!m || !p || raw === "") continue;

      const mIdx = months.indexOf(m);
      const cIdx = categories.findIndex((c) => c.name === p);
      if (mIdx === -1 || cIdx === -1) continue;

      let v = Number(raw);
      if (v <= 1) v = v * 100;
      categories[cIdx].values[mIdx] = Math.round(v * 10) / 10;
    }
  } else {
    months.forEach((m, mIdx) => {
      let totalMes = 0;
      for (let i = 0; i < monthCol.values.length; i++) {
        if (String(monthCol.values[i] || "").slice(0, 3).toUpperCase() === m) totalMes++;
      }

      problems.forEach((p, cIdx) => {
        let count = 0;
        for (let i = 0; i < monthCol.values.length; i++) {
          const mVal = String(monthCol.values[i] || "").slice(0, 3).toUpperCase();
          if (mVal === m && problemCol.values[i] === p) count++;
        }
        categories[cIdx].values[mIdx] =
          totalMes > 0 ? Math.round((count / totalMes) * 1000) / 10 : 0;
      });
    });
  }

  return { months, categories };
}

function extractTrackingDataSummary(values: any[][], range?: string) {
  if (!values.length) return null;
  if (!range || !range.trim()) return null;

  let parsed;
  try {
    parsed = parseA1RangeSummary(range.trim());
  } catch (err) {
    console.warn("Rango A1 inválido para tracking summary:", range, err);
    return null;
  }

  const { rowStart, rowEnd, colStart, colEnd } = parsed;

  const headerRow = values[rowStart - 1] || [];
  const months: string[] = [];
  for (let c = colStart + 1; c <= colEnd; c++) {
    const raw = headerRow[c - 1];
    if (raw == null || raw === "") continue;
    months.push(String(raw).trim());
  }
  if (!months.length) return null;

  const categories: { name: string; values: number[] }[] = [];

  for (let r = rowStart + 1; r <= rowEnd; r++) {
    const row = values[r - 1] || [];
    const problemCell = row[colStart - 1];
    const name = problemCell != null ? String(problemCell).trim() : "";
    if (!name) continue;

    const vals: number[] = [];

    for (let mIdx = 0; mIdx < months.length; mIdx++) {
      const c = colStart + 1 + mIdx;
      const cell = row[c - 1];

      let perc = 0;

      if (typeof cell === "number") {
        let v = cell;
        if (v > 0 && v <= 1) v = v * 100;
        perc = Number(v.toFixed(1));
      } else if (typeof cell === "string") {
        const cleaned = cell.replace("%", "").replace(",", ".").trim();
        const parsedNum = parseFloat(cleaned);
        if (!Number.isNaN(parsedNum)) perc = Number(parsedNum.toFixed(1));
      }

      vals.push(perc);
    }

    categories.push({ name, values: vals });
  }

  return { months, categories };
}

function colorForProblem(problemName: string, customColors: Record<string, string>) {
  const normalize = (str: string) =>
    str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "")
      .trim();

  const normalized = normalize(problemName);

  const directColor = customColors[problemName];
  if (directColor) return directColor;

  const matchedKey = Object.keys(customColors).find((k) => normalize(k) === normalized);
  if (matchedKey) return customColors[matchedKey];

  const matrixColors = (ChartConfig.colors as any).matrixColors;
  const paletteColor = matrixColors?.tracking?.[normalized];
  if (paletteColor) return paletteColor;

  return ChartConfig.colors.neutral;
}

export function buildStackedVerticalSvg({
  data = [],
  title,
  columns,
  customColors = {},
  sheetTitle,
  width,
  height,
  inputMode,
  sheetValues,
  answerRange,
  backgroundColor,
  textColor,
  brand,
}: ChartSvgArgs): string {
  const theme = getBrandTheme(brand ?? "poligrama");
  const isCensBrand = brand === "censEdmundSinsa";

  // No tocar Poligrama/Desk. Solo Cens se fuerza a 612x792.
  const W = isCensBrand ? CENS_W : width ?? CANVAS_W;
  const H = isCensBrand ? CENS_H : height ?? CANVAS_H;

  const wantsCoolvetica = /coolvetica rg/i.test(theme.fontFamily || "");
  const FONT_STACK = theme.fontFamily || "Helvetica, Arial, sans-serif";

  const bg = backgroundColor ?? theme.defaultBackground;
  const mainTextColor = textColor ?? theme.defaultTextColor;

  const isTall1440 = W === 1440 && H === 1800;

  // Escala solo cuando forzamos 612x792 (para que no “explote” el layout)
  const scale = isCensBrand ? Math.min(W / 1440, H / 1800) : 1;
  const S = (n: number) => Math.max(1, Math.round(n * scale));

  let marginLeft = 120;
  let marginRight = 120;
  let marginTop = 125;
  let marginBottom = 125;

  if (isTall1440) {
    marginLeft = 100;
    marginRight = 100;
    marginTop = 170;
    marginBottom = 170;
  }

  // En Cens usamos “reglas 1440”, pero escaladas al tamaño 612x792
  if (isCensBrand) {
    marginLeft = S(100);
    marginRight = S(100);
    marginTop = S(170);
    marginBottom = S(170);
  }

  const now = new Date();
  const monthNamesEs = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  const monthName = monthNamesEs[now.getMonth()];
  const monthLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const headerDateLabel = `${monthLabel} ${now.getFullYear()}`;

  const titleY = marginTop + S(130);

  const baseTitleFs = isCensBrand ? S(50) : ChartConfig.typography.title.fontSize;
  const maxTitleChars = isTall1440 ? 43 : 80;
  const maxTitleCharsUsed = isCensBrand ? 43 : maxTitleChars;

 const { lines: titleLines, fontSize: titleFs, blockHeight: titleBlockH } =
  prepareTitle(title, baseTitleFs, 54, 3);


  let trackingLabelY = 0;
  let trackingLabelFs = 0;
  let lineY: number;

  if (isCensBrand) {
    trackingLabelFs = S(60);
    trackingLabelY = titleY + titleBlockH + S(60);
    lineY = trackingLabelY + S(40);
  } else {
    lineY = titleY + titleBlockH + 16;
  }

  let trackingData:
    | { months: string[]; categories: { name: string; values: number[] }[] }
    | null = null;

  if (inputMode === "summary") {
    trackingData = extractTrackingDataSummary(sheetValues || [], answerRange);
    if (!trackingData) return basicMsg("No se pudo leer la tabla de tracking (revisa el rango).", W, H);
  } else {
    if (!columns || columns.length === 0) return basicMsg("No hay columnas suficientes para tracking", W, H);
    trackingData = extractTrackingData(columns as DatasetColumn[]);
    if (!trackingData) return basicMsg("No se detectaron columnas de meses (ENE, FEB, MAR, etc.)", W, H);
  }

  let { months, categories } = trackingData;
  if (!months.length || !categories.length) return basicMsg("No hay datos suficientes para tracking", W, H);

  const dragOrder = (data || []).map((d) => d.label);
  if (dragOrder.length) {
    const byName = new Map(categories.map((c) => [c.name, c]));
    const orderedCats: typeof categories = [];
    for (const label of dragOrder) {
      const cat = byName.get(label);
      if (cat) {
        orderedCats.push(cat);
        byName.delete(label);
      }
    }
    categories = orderedCats;
  }
  if (!categories.length) return basicMsg("No hay datos (todas las categorías excluidas).", W, H);

  const axisLeft = marginLeft + S(40);
  const barsLeft = axisLeft + S(40);
  const barsRight = W - marginRight;
  const barsWidth = barsRight - barsLeft;

  const chartTop = lineY + S(80);
  const chartBottom = H - marginBottom - S(220);
  const chartHeight = chartBottom - chartTop;

  const monthsCount = months.length;
  const barSlot = monthsCount > 0 ? barsWidth / monthsCount : 0;
  const barWidth = barSlot * (isCensBrand ? 0.44 : 0.36);

  const yMax = 100;

  const parts: string[] = [];
  parts.push(
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    wantsCoolvetica
      ? `<style type="text/css">
  @font-face {
    font-family: 'Coolvetica Rg';
    src: url("data:font/woff2;base64,${COOLVETICA_WOFF2_BASE64}") format("woff2");
    font-weight: 400;
    font-style: normal;
  }
</style>`
      : "",
    `<rect width="100%" height="100%" fill="${bg}" />`
  );

  if (sheetTitle) {
    const headerY = marginTop - S(24);
    const centerX = W / 2;
    const rightX = W - marginRight;

    const headerFsLeft = isCensBrand ? S(26) : 26
    const headerFsMid = isCensBrand ? S(30) : 30
    const headerFsRight = isCensBrand ? S(26) : 26;

    parts.push(
      `<text x="${marginLeft}" y="${headerY}"
             fill="${mainTextColor}"
             font-family="${FONT_STACK}"
             font-size="${headerFsLeft}"
             font-weight="600"
             text-anchor="start">Monterrey, Nuevo León</text>`,
      `<text x="${centerX}" y="${headerY}"
             fill="${mainTextColor}"
             font-family="${FONT_STACK}"
             font-size="${headerFsMid}"
             font-weight="600"
             text-anchor="middle">${esc(sheetTitle)}</text>`,
      `<text x="${rightX}" y="${headerY}"
             fill="${mainTextColor}"
             font-family="${FONT_STACK}"
             font-size="${headerFsRight}"
             font-weight="600"
             text-anchor="end">${esc(headerDateLabel)}</text>`
    );
  }

  const titleWeight = 600;
  const titleLineGapRender = isCensBrand ? S(18) : 25;

  titleLines.forEach((line, idx) => {
    const y = titleY + idx * (titleFs + titleLineGapRender);
    parts.push(
      `<text x="${marginLeft}" y="${y}"
             fill="${mainTextColor}"
             font-family="${FONT_STACK}"
             font-size="${baseTitleFs}"
             font-weight="${titleWeight}"
             text-anchor="start">${esc(line)}</text>`
    );
  });

  if (isCensBrand) {
    parts.push(
      `<text x="${marginLeft}" y="${trackingLabelY}"
             fill="${mainTextColor}"
             font-family="${FONT_STACK}"
             font-size="${trackingLabelFs}"
             font-weight="700"
             text-anchor="start">Tracking</text>`
    );
  }

  parts.push(
    `<line x1="${barsLeft}" y1="${chartTop}" x2="${barsLeft}" y2="${chartBottom}"
           stroke="${mainTextColor}" stroke-width="${isCensBrand ? S(2) : 2}" />`
  );
  // --- Y axis labels (0–100) + grid lines ---
const yTicks = [0, 20, 40, 60, 80, 100];
const yLabelFs = isCensBrand ? S(18) : 18;

yTicks.forEach((v) => {
  const t = v / yMax;
  const y = chartBottom - t * chartHeight;

  // número del eje
  parts.push(
    `<text x="${barsLeft - S(14)}" y="${y + S(6)}"
           fill="${mainTextColor}"
           font-family="${FONT_STACK}"
           font-size="${yLabelFs}"
           font-weight="600"
           text-anchor="end">${v}</text>`
  );
});


  const minSegmentPxForLabel = isCensBrand ? S(30) : 24;

  months.forEach((month, mIdx) => {
    const cx = barsLeft + barSlot * (mIdx + 0.5);
    const x = cx - barWidth / 2;

    let currentY = chartBottom;

    categories.forEach((cat) => {
      const value = Math.max(0, Math.min(100, cat.values[mIdx] ?? 0));
      if (value <= 0) return;

      const h = (value / yMax) * chartHeight;
      if (h <= 0) return;

      const yTop = currentY - h;
      const color = colorForProblem(cat.name, customColors);

      parts.push(`<rect x="${x}" y="${yTop}" width="${barWidth}" height="${h}" fill="${color}" />`);

      if (isCensBrand) {
        const offset = S(10);
        const textX = x + barWidth + offset;
        const textY = yTop + h / 2;

        parts.push(
          `<text x="${textX}" y="${textY}"
                 fill="${color}"
                 font-family="${FONT_STACK}"
                 font-size="${S(16)}"
                 font-weight="700"
                 text-anchor="start"
                 dominant-baseline="middle">${value}%</text>`
        );
      } else if (h >= minSegmentPxForLabel) {
        const textX = cx;
        const textY = yTop + h / 2 + 4;

        parts.push(
          `<text x="${textX}" y="${textY}"
                 fill="#ffffff"
                 font-family="${FONT_STACK}"
                 font-size="18"
                 font-weight="700"
                 text-anchor="middle"
                 dominant-baseline="middle">${value}%</text>`
        );
      }

      currentY = yTop;
    });

    const monthWords = String(month).split(/\s+/);
    let mLines: string[] = [];
    let cur = "";
    const maxChars = isCensBrand ? 8 : 10;

    for (const w of monthWords) {
      const test = cur ? cur + " " + w : w;
      if (test.length > maxChars && cur) {
        mLines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) mLines.push(cur);
    if (mLines.length > 2) mLines = [mLines[0], mLines.slice(1).join(" ")];

    const baseY = chartBottom + S(28);
    const lineGap = S(4);
    const monthFs = isCensBrand ? S(27) : 20;

    parts.push(
      `<text x="${cx}" y="${baseY}"
             fill="${mainTextColor}"
             font-family="${FONT_STACK}"
             font-size="${monthFs}"
             font-weight="700"
             text-anchor="middle">` +
        mLines
          .map(
            (line, idx) =>
              `<tspan x="${cx}" dy="${idx === 0 ? 0 : monthFs + lineGap}">${esc(line)}</tspan>`
          )
          .join("") +
        `</text>`
    );
  });

  const legendTop = chartBottom + S(90);
  const legendCols = 2;
  const legendItemHeight = S(18);
  const legendGapY = S(8);

  const squareSize = S(10);
  const legendFontSize = isCensBrand ? S(20) : 20;

  const colLabelMaxLens = new Array(legendCols).fill(0);
  categories.forEach((cat, idx) => {
    const colIdx = idx % legendCols;
    const len = String(cat.name || "").length;
    if (len > colLabelMaxLens[colIdx]) colLabelMaxLens[colIdx] = len;
  });

  const approxCharW = isCensBrand ? 6 : 10;
  const colTextWidths = colLabelMaxLens.map((len) => len * approxCharW);
  const colWidths = colTextWidths.map((textW) => squareSize + S(8) + textW + S(18));

  const legendAreaLeft = barsLeft;
  const legendAreaRight = barsRight;
  const legendAreaWidth = legendAreaRight - legendAreaLeft;
  const legendBlockWidth = colWidths.reduce((sum, w) => sum + w, 0);

  const legendLeft = legendAreaLeft + Math.max(0, (legendAreaWidth - legendBlockWidth) / 2);

  const colOffsets: number[] = [];
  colWidths.reduce((acc, w, idx) => {
    colOffsets[idx] = acc;
    return acc + w;
  }, 0);

  categories.forEach((cat, idx) => {
    const colIdx = idx % legendCols;
    const rowIdx = Math.floor(idx / legendCols);

    const baseX = legendLeft + colOffsets[colIdx];
    const y = legendTop + rowIdx * (legendItemHeight + legendGapY);

    const color = colorForProblem(cat.name, customColors);

    const squareX = baseX;
    const squareY = y;
    const textX = squareX + squareSize + S(6);
    const textY = squareY + squareSize - S(1);

    parts.push(
      `<rect x="${squareX}" y="${squareY}" width="${squareSize}" height="${squareSize}" fill="${color}" />`,
      `<text x="${textX}" y="${textY}"
             fill="${mainTextColor}"
             font-family="${FONT_STACK}"
             font-size="${legendFontSize}"
             text-anchor="start">${esc(String(cat.name || ""))}</text>`
    );
  });

  parts.push(`</svg>`);
  return parts.join("\n");
}

function basicMsg(message: string, W = CANVAS_W, H = CANVAS_H): string {
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
