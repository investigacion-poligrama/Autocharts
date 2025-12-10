import { ChartConfig } from "@/lib/chartconfig";
import type { ChartSvgArgs } from "@/lib/chart-svgs";
import type { DatasetColumn } from "@/app/page";
import { getBrandTheme } from "@/lib/brand-theme";
import { COOLVETICA_WOFF2_BASE64 } from "@/coolvetica.b64";


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

/* ------------------------------------------------------------------ */
/*   Helpers A1 para tabla de resultados (summary)                    */
/* ------------------------------------------------------------------ */

function a1ToRowColSummary(a1: string) {
  const match = a1.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) {
    throw new Error(`Referencia A1 inválida: ${a1}`);
  }
  const [, colLetters, rowStr] = match;
  let col = 0;
  for (const ch of colLetters) {
    col = col * 26 + (ch.charCodeAt(0) - 64); // A=1
  }
  const row = parseInt(rowStr, 10);
  if (!row || row < 1) {
    throw new Error(`Fila inválida en referencia A1: ${a1}`);
  }
  return { row, col }; // 1-based
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

/* ------------------------------------------------------------------ */
/*   Extracción de datos como en tracking                             */
/* ------------------------------------------------------------------ */

function extractTrackingData(columns: DatasetColumn[], mainColumnName: string) {
  const MONTHS = [
    "ENE",
    "FEB",
    "MAR",
    "ABR",
    "MAY",
    "JUN",
    "JUL",
    "AGO",
    "SEP",
    "OCT",
    "NOV",
    "DIC",
  ];

  const monthCol = columns.find(
    (c) =>
      /mes/i.test(c.name ?? "") &&
      c.values.some((v) => {
        const abbr = String(v || "").slice(0, 3).toUpperCase();
        return MONTHS.includes(abbr);
      })
  );

  const problemCol = columns.find((c) =>
    /(problema|categor[ií]a|tema)/i.test(c.name ?? "")
  );

  const valueCol = columns.find((c) =>
    /(porcentaje|valor|rango)/i.test(c.name ?? "")
  );

  if (!monthCol || !problemCol) return null;

  const monthsUsed = Array.from(
    new Set(
      monthCol.values
        .filter(Boolean)
        .map((v) => String(v).slice(0, 3).toUpperCase())
    )
  );
  const months = monthsUsed.sort(
    (a, b) => MONTHS.indexOf(a) - MONTHS.indexOf(b)
  );
  const problems = Array.from(new Set(problemCol.values.filter(Boolean)));

  const hasNumeric =
    !!valueCol &&
    valueCol.values.some(
      (v) => v !== "" && !isNaN(Number(String(v).replace(",", ".")))
    );

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
    // formato crudo: frecuencias
    months.forEach((m, mIdx) => {
      let totalMes = 0;
      for (let i = 0; i < monthCol.values.length; i++) {
        if (
          String(monthCol.values[i] || "").slice(0, 3).toUpperCase() === m
        )
          totalMes++;
      }

      problems.forEach((p, cIdx) => {
        let count = 0;
        for (let i = 0; i < monthCol.values.length; i++) {
          const mVal = String(monthCol.values[i] || "")
            .slice(0, 3)
            .toUpperCase();
          if (mVal === m && problemCol.values[i] === p) count++;
        }

        categories[cIdx].values[mIdx] =
          totalMes > 0
            ? Math.round((count / totalMes) * 1000) / 10
            : 0;
      });
    });
  }

  return { months, categories };
}

function extractTrackingDataSummary(
  values: any[][],
  range?: string
): { months: string[]; categories: { name: string; values: number[] }[] } | null {
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
        if (!Number.isNaN(parsedNum)) {
          perc = Number(parsedNum.toFixed(1));
        }
      }

      vals.push(perc);
    }

    categories.push({ name, values: vals });
  }

  return { months, categories };
}

// color por problema (misma lógica que tracking)
function colorForProblem(
  problemName: string,
  customColors: Record<string, string>
) {
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

  const matchedKey = Object.keys(customColors).find(
    (k) => normalize(k) === normalized
  );
  if (matchedKey) return customColors[matchedKey];

  const matrixColors = (ChartConfig.colors as any).matrixColors;
  const paletteColor = matrixColors?.tracking?.[normalized];
  if (paletteColor) return paletteColor;

  return ChartConfig.colors.neutral;
}

/* ------------------------------------------------------------------ */
/*   Builder principal: barras apiladas verticales por ola            */
/* ------------------------------------------------------------------ */

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
  const W = width ?? CANVAS_W;
  const H = height ?? CANVAS_H;
  const isCensBrand = brand === "censEdmundSinsa";
  const FONT_STACK =
    theme.fontFamily || "Helvetica, Arial, sans-serif";
  const wantsCoolvetica = /coolvetica rg/i.test(theme.fontFamily);
  const themeBg = theme.defaultBackground;
  const themeText = theme.defaultTextColor;
  const bg = backgroundColor ?? themeBg;
  const mainTextColor = textColor ?? themeText;
  const mutedTextColor = themeText === "#ffffff" ? "#bdbdbd" : themeText;
  const footerText = theme.footer ?? ChartConfig.footer;

  const isTall1440 = W === 1440 && H === 1800;

  const baseTitleFs = ChartConfig.typography.title.fontSize;
  const footerFs = ChartConfig.typography.footer.fontSize;

  // márgenes según preset
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
  const monthLabel =
    monthName.charAt(0).toUpperCase() + monthName.slice(1);
    const headerDateLabel = `${monthLabel} ${now.getFullYear()}`;
  const titleY = marginTop + 130;
  const maxTitleChars = isTall1440 ? 43 : 115;

  const {
  lines: titleLines,
  fontSize: titleFs,
  blockHeight: titleBlockH,
} = prepareTitle(title, baseTitleFs, maxTitleChars);

let lineY: number;
let trackingLabelY = 0;
let trackingLabelFs = 0;

if (isCensBrand) {
  // tamaño grande tipo ejemplo de Juárez
  trackingLabelFs = isTall1440 ? 75 : 60;

  // un poco de espacio debajo de la pregunta
  trackingLabelY = titleY + titleBlockH + 100;

  // la línea verde va debajo de “Tracking”
  lineY = trackingLabelY + 40;
} else {
  // resto de marcas: como antes
  lineY = titleY + titleBlockH + 16;
}


  let trackingData:
    | { months: string[]; categories: { name: string; values: number[] }[] }
    | null = null;

  if (inputMode === "summary") {
    trackingData = extractTrackingDataSummary(sheetValues || [], answerRange);
    if (!trackingData) {
      return basicMsg(
        "No se pudo leer la tabla de tracking (revisa el rango)."
      );
    }
  } else {
    if (!columns || columns.length === 0) {
      return basicMsg("No hay columnas suficientes para tracking");
    }
    trackingData = extractTrackingData(columns as DatasetColumn[], title);
    if (!trackingData) {
      return basicMsg(
        "No se detectaron columnas de meses (ENE, FEB, MAR, etc.)"
      );
    }
  }

  let { months, categories } = trackingData;
  if (!months.length || !categories.length) {
    return basicMsg("No hay datos suficientes para tracking");
  }

  // respeta orden / exclusiones del draglist (dataForChart)
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

    // NO agregamos el resto: así los excluidos desaparecen
    categories = orderedCats;
  }

  if (!categories.length) {
    return basicMsg("No hay datos (todas las categorías excluidas).");
  }

  // ---------- layout general: eje Y + barras, leyenda abajo ----------

  const axisLeft = marginLeft + 40;
  const barsLeft = axisLeft + 40;
  const barsRight = W - marginRight;
  const barsWidth = barsRight - barsLeft;

  const chartTop = lineY + 80;
  const chartBottom = H - marginBottom - 220;
  const chartHeight = chartBottom - chartTop;

  const monthsCount = months.length;
  const barSlot = monthsCount > 0 ? barsWidth / monthsCount : 0;
  const barWidth = barSlot * 0.36;

  // escala 0–100 fija
  const yMax = 100;
  const yTicks = [0, 20, 40, 60, 80, 100];

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

  // título (pregunta)
  const titleWeight = 600; 
  const titleLineGapRender = 25;
  titleLines.forEach((line, idx) => {
    const y = titleY + idx * (titleFs + titleLineGapRender);
    parts.push(
      `<text
         x="${marginLeft}"
         y="${y}"
         fill="${mainTextColor}"
         font-family="${FONT_STACK}"
         font-size="75"
         font-weight="${titleWeight}"
       >${esc(line)}</text>`
    );
  });
  parts.push(
    `<text
       x="${marginLeft}"
       y="${trackingLabelY}"
       fill="${mainTextColor}"
       font-family="${FONT_STACK}"
       font-size="${trackingLabelFs}"
       font-weight="700"
     >Tracking</text>`
  );

    // HEADER
  if (sheetTitle) {
    const headerY = marginTop - 24;
    const centerX = W / 2;
    const rightX = W - marginRight;
      parts.push(
        `<text x="${marginLeft}" y="${headerY}"
               fill="${mainTextColor}"
               font-family="${FONT_STACK}"
               font-size="26"
               font-weight="600"
               text-anchor="start">Monterrey, Nuevo León</text>`
      );
      parts.push(
        `<text x="${centerX}" y="${headerY}"
               fill="${mainTextColor}"
               font-family="${FONT_STACK}"
               font-size="30"
               font-weight="600"
               text-anchor="middle">${esc(sheetTitle)}</text>`
      );
      parts.push(
        `<text x="${rightX}" y="${headerY}"
               fill="${mainTextColor}"
               font-family="${FONT_STACK}"
               font-size="26"
               font-weight="600"
               text-anchor="end">${esc(headerDateLabel)}</text>`
      );
    }
  

  // ---------- grid y eje Y 0–100 ----------
  yTicks.forEach((v) => {
    const t = v / yMax;
    const y = chartBottom - t * chartHeight;
  });

  // eje vertical
  parts.push(
    `<line x1="${barsLeft}" y1="${chartTop}" x2="${barsLeft}" y2="${chartBottom}"
           stroke="${mainTextColor}" stroke-width="2" />`
  );

  // ---------- barras apiladas ----------
  const minSegmentPxForLabel = 24;

  months.forEach((month, mIdx) => {
    const cx = barsLeft + barSlot * (mIdx + 0.5);
    const x = cx - barWidth / 2;

    let currentY = chartBottom; // va subiendo de abajo hacia arriba

    categories.forEach((cat) => {
      const value = Math.max(0, Math.min(100, cat.values[mIdx] ?? 0));
      if (value <= 0) return;

      const h = (value / yMax) * chartHeight;
      if (h <= 0) return;

      const yTop = currentY - h;
      const color = colorForProblem(cat.name, customColors);

      // rectángulo del segmento
            // rectángulo del segmento
      parts.push(
        `<rect x="${x}" y="${yTop}" width="${barWidth}" height="${h}"
               fill="${color}" />`
      );

      // etiquetas de porcentaje
      if (isCensBrand) {
        // 👉 Cens / Edmund / Sinsa: % a la derecha de la barra
        const offset = 14; // separacion respecto al borde derecho de la barra
        const textX = x + barWidth + offset;
        const textY = yTop + h / 2 + 4;

        parts.push(
          `<text x="${textX}" y="${textY}"
                 fill="${color}"
                 font-family="${FONT_STACK}"
                 font-size="18"
                 font-weight="600"
                 text-anchor="start"
                 dominant-baseline="middle">${value}%</text>`
        );
      } else if (h >= minSegmentPxForLabel) {
        // 👉 Resto de marcas: % dentro del segmento como antes
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

    // etiqueta del mes debajo de la barra (1–2 líneas)
    const monthWords = String(month).split(/\s+/);
    let lines: string[] = [];
    let current = "";
    const maxChars = 10;

    for (const w of monthWords) {
      const test = current ? current + " " + w : w;
      if (test.length > maxChars && current) {
        lines.push(current);
        current = w;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    if (lines.length > 2) lines = [lines[0], lines.slice(1).join(" ")];

    const baseY = chartBottom + 28;
    const lineGap = 4;

    parts.push(
      `<text x="${cx}" y="${baseY}"
             fill="${mainTextColor}"
             font-family="${FONT_STACK}"
             font-size="20"
             font-weight="700"
             text-anchor="middle">` +
        lines
          .map(
            (line, idx) =>
              `<tspan x="${cx}" dy="${
                idx === 0 ? 0 : 20 + lineGap
              }">${esc(line)}</tspan>`
          )
          .join("") +
        `</text>`
    );
  });

   // ---------- leyenda inferior (2 columnas) ----------
  const legendTop = chartBottom + 110;
  const legendCols = 2;
  const legendItemHeight = 30;
  const legendGapY = 10;

  // Longitud máxima de label por columna
  const colLabelMaxLens = new Array(legendCols).fill(0);
  categories.forEach((cat, idx) => {
    const colIdx = idx % legendCols;
    const len = cat.name.length;
    if (len > colLabelMaxLens[colIdx]) {
      colLabelMaxLens[colIdx] = len;
    }
  });

  const colTextWidths = colLabelMaxLens.map((len) => len * 10); 
  const colWidths = colTextWidths.map((textW) => 18 + 10 + textW + 40);
  // Área disponible entre márgenes
  const legendAreaLeft = barsLeft;
  const legendAreaRight = barsRight;
  const legendAreaWidth = legendAreaRight - legendAreaLeft;

  // Ancho total real del bloque de leyenda
  const legendBlockWidth = colWidths.reduce((sum, w) => sum + w, 0);

  // X inicial del bloque centrado
  const legendLeft =
    legendAreaLeft + (legendAreaWidth - legendBlockWidth) / 2;

  // Offsets acumulados por columna
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

    const squareSize = 18;
    const squareX = baseX;
    const squareY = y;

    const textX = squareX + squareSize + 10;
    const textY = squareY + squareSize - 3;

    parts.push(
      `<rect x="${squareX}" y="${squareY}" width="${squareSize}" height="${squareSize}"
             fill="${color}" />`,
      `<text x="${textX}" y="${textY}"
             fill="${mainTextColor}"
             font-family="${FONT_STACK}"
             font-size="18"
             text-anchor="start">${esc(cat.name)}</text>`
    );
  });


  // footer

  parts.push(`</svg>`);

  return parts.join("\n");
}

/* ------------------------------------------------------------------ */
/*   Mensaje básico si algo falla                                     */
/* ------------------------------------------------------------------ */

function basicMsg(message: string): string {
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
