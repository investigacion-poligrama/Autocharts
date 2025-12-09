import { ChartConfig } from "@/lib/chartconfig";
import type { ChartSvgArgs } from "@/lib/chart-svgs";
import type { DatasetColumn } from "@/app/page";

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
/*   Helpers                                                          */
/* ------------------------------------------------------------------ */

// --- Helpers A1 para tabla de resultados (summary) ---

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

function extractTrackingData(columns: DatasetColumn[], mainColumnName: string) {
  // detectar columnas por nombre
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

  // 👉 detectar columna de MES usando solo las 3 primeras letras del valor
  const monthCol = columns.find(
    (c) =>
      /mes/i.test(c.name ?? "") &&
      c.values.some((v) => {
        const abbr = String(v || "").slice(0, 3).toUpperCase(); // "Febrero" -> "FEB"
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

  // ¿tenemos columna numérica?
  const hasNumeric =
    !!valueCol &&
    valueCol.values.some(
      (v) =>
        v !== "" &&
        !isNaN(Number(String(v).replace(",", ".")))
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
      if (v <= 1) v = v * 100; // aceptar 0–1
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


// color por problema (misma lógica que en tu componente)
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

  // 1) custom color exacto
  const directColor = customColors[problemName];
  if (directColor) return directColor;

  // 2) match "suave"
  const matchedKey = Object.keys(customColors).find(
    (k) => normalize(k) === normalized
  );
  if (matchedKey) return customColors[matchedKey];

  // 3) paleta interna (tracking)
  const matrixColors = (ChartConfig.colors as any).matrixColors;
  const paletteColor = matrixColors?.tracking?.[normalized];
  if (paletteColor) return paletteColor;

  // 4) fallback
  return ChartConfig.colors.neutral;
}

/* ------------------------------------------------------------------ */
/*   Builder principal SVG                                            */
/* ------------------------------------------------------------------ */

export function buildTrackingSvg({
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
}: ChartSvgArgs): string {
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
    marginLeft = 120;
    marginRight = 120;
    marginTop = 125;
    marginBottom = 125;
  }

  const titleY = marginTop + 130;
  const maxTitleChars = isTall1440 ? 80 : 115;

  const {
    lines: titleLines,
    fontSize: titleFs,
    blockHeight: titleBlockH,
  } = prepareTitle(title, baseTitleFs, maxTitleChars);

  const lineY = titleY + titleBlockH + 16;

  let trackingData:
    | { months: string[]; categories: { name: string; values: number[] }[] }
    | null = null;

  if (inputMode === "summary") {
    // TABLA DE RESULTADOS
    trackingData = extractTrackingDataSummary(sheetValues || [], answerRange);
    if (!trackingData) {
      return basicTrackingMessageSvg(
        "No se pudo leer la tabla de tracking (revisa el rango)."
      );
    }
  } else {
    // MODO BASE DE DATOS
    if (!columns || columns.length === 0) {
      return basicTrackingMessageSvg(
        "No hay columnas suficientes para tracking"
      );
    }
    trackingData = extractTrackingData(columns, title);
    if (!trackingData) {
      return basicTrackingMessageSvg(
        "No se detectaron columnas de meses (ENE, FEB, MAR, etc.)"
      );
    }
  }

  let { months, categories } = trackingData;
if (!months.length || !categories.length) {
  return basicTrackingMessageSvg("No hay datos suficientes para tracking");
}

// labels activos (no excluidos) según dataForChart
const dragOrder = (data || []).map((d) => d.label);

if (dragOrder.length) {
  const byName = new Map(categories.map((c) => [c.name, c]));
  const orderedCats: typeof categories = [];

  for (const label of dragOrder) {
    const cat = byName.get(label);
    if (cat) {
      orderedCats.push(cat);
    }
  }

  categories = orderedCats;
}

// si el usuario excluyó TODO, evita crashear
if (!categories.length) {
  return basicTrackingMessageSvg("No hay datos (todas las categorías excluidas).");
}


  // --- Layout general: leyenda izquierda, gráfico derecha ---

  const contentTop = lineY + 60;
  const contentBottom = H - marginBottom - (isTall1440 ? 160 : 120);
  const contentHeight = contentBottom - contentTop;

  const legendWidth = 420;

  const chartX0 = marginLeft + legendWidth + 120;
  const chartY0 = contentTop;
  const chartWidth = W - chartX0 - marginRight;
  const chartHeight = contentHeight;

  const maxValue = Math.max(
    10,
    ...categories.flatMap((c) => c.values)
  );
  const yMax = Math.ceil(maxValue / 10) * 10;

  const monthsCount = months.length;
  const innerMarginX = 40;
  const usableWidth = chartWidth - innerMarginX * 2;

  const xStep = monthsCount > 1 ? usableWidth / (monthsCount - 1) : 0;

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
      `<text x="${marginLeft}" y="${y}" fill="${mainTextColor}" font-family="Helvetica, Arial, sans-serif" font-size="${titleFs}">${esc(
        line
      )}</text>`
    );
  });

  // Línea
  parts.push(
    `<line x1="${marginLeft}" y1="${lineY}" x2="${
      W - marginRight
    }" y2="${lineY}" stroke="${mainTextColor}" stroke-width="2" />`
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

  /* -------------------- LEYENDA (pills) -------------------- */

  const legendX = marginLeft;
  const pillCols = 2;
  const pillGapX = 16;
  const pillGapY = 25;
  const pillWidth = ((legendWidth - pillGapX) / pillCols) + 20;
  const pillHeight = 80;

  const legendRows = Math.ceil(categories.length / pillCols);
  const legendTotalHeight =
    legendRows * pillHeight + (legendRows - 1) * pillGapY;
  const legendY = contentTop + (contentHeight - legendTotalHeight) / 2;

  categories.forEach((cat, idx) => {
    const colIdx = idx % pillCols;
    const rowIdx = Math.floor(idx / pillCols);

    const x = legendX + colIdx * (pillWidth + pillGapX);
    const y = legendY + rowIdx * (pillHeight + pillGapY);

    const color = colorForProblem(cat.name, customColors);

    parts.push(
      `<rect x="${x}" y="${y}" width="${pillWidth}" height="${pillHeight}" rx="20" ry="20" fill="${color}" />`
    );

    // texto del pill, con wrap a 2 líneas (siempre blanco sobre color)
    const legendFs = 22;
    const maxChars = 18;
    const cx = x + pillWidth / 2;
    const cy = y + pillHeight / 2;

    const words = cat.name.split(/\s+/);
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

    const lineGap = 2;
    const firstLineY =
      cy - ((lines.length - 1) * (legendFs + lineGap)) / 2;

    parts.push(
      `<text x="${cx}" y="${firstLineY}"
        fill="#ffffff"
        font-family="Helvetica, Arial, sans-serif"
        font-size="${legendFs}"
        font-weight="700"
        text-anchor="middle">` +
        lines
          .map(
            (line, idx2) =>
              `<tspan x="${cx}" dy="${
                idx2 === 0 ? 0 : legendFs + lineGap
              }">${esc(line)}</tspan>`
          )
          .join("") +
        `</text>`
    );
  });

  /* -------------------- GRID + Y labels -------------------- */

  const gridLines = 10;
  for (let i = 0; i <= gridLines; i++) {
    const t = i / gridLines;
    const y = chartY0 + chartHeight * t;
    const value = yMax * (1 - t);

    parts.push(
      `<line x1="${chartX0}" y1="${y}" x2="${
        chartX0 + chartWidth
      }" y2="${y}" stroke="${ChartConfig.colors.neutral}" stroke-width="0.5" opacity="0.3" />`,
      `<text x="${
        chartX0 - 10
      }" y="${y + 4}" fill="${mainTextColor}" font-family="Helvetica, Arial, sans-serif" font-size="20" text-anchor="end">${Math.round(
        value
      )}</text>`
    );
  }

  /* -------------------- Meses (X labels) -------------------- */

  months.forEach((month, i) => {
    const x =
      monthsCount > 1
        ? chartX0 + innerMarginX + i * xStep
        : chartX0 + chartWidth / 2;

    parts.push(
      `<text x="${x}" y="${
        chartY0 + chartHeight + 24
      }" fill="${mainTextColor}" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="700" text-anchor="middle">${esc(
        month
      )}</text>`
    );
  });

  /* -------------------- Líneas y puntos -------------------- */
  function darken(hex: string, amount: number = 0.3): string {
    let c = hex.replace("#", "");
    if (c.length === 3) {
      c = c
        .split("")
        .map((ch: string) => ch + ch)
        .join("");
    }

    const num = parseInt(c, 16);
    let r = (num >> 16) & 255;
    let g = (num >> 8) & 255;
    let b = num & 255;

    r = Math.floor(r * (1 - amount));
    g = Math.floor(g * (1 - amount));
    b = Math.floor(b * (1 - amount));

    return `rgb(${r},${g},${b})`;
  }

  const labelSlots: number[][] = [];

  categories.forEach((cat) => {
    const color = colorForProblem(cat.name, customColors);
    const points: { x: number; y: number; v: number; monthIdx: number }[] = [];

    cat.values.forEach((value, i) => {
      const x =
        monthsCount > 1
          ? chartX0 + innerMarginX + i * xStep
          : chartX0 + chartWidth / 2;

      const y =
        chartY0 +
        chartHeight -
        (value / yMax) * chartHeight;

      points.push({ x, y, v: value, monthIdx: i });
    });

    // path de la línea
    if (points.length > 1) {
      let d = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        d += ` L ${points[i].x} ${points[i].y}`;
      }
      parts.push(
        `<path d="${d}" stroke="${color}" stroke-width="6" fill="none" />`
      );
    }

    // puntos + etiquetas con anti-overlap
    points.forEach((pt) => {
      const baseY = pt.y - 8;

      const textColorPoint = darken(color, 0.35);

      // sistema anti-overlap por mes
      if (!labelSlots[pt.monthIdx]) labelSlots[pt.monthIdx] = [];
      const placed = labelSlots[pt.monthIdx];

      let finalY = baseY;
      const minDistance = 14;

      for (const prevY of placed) {
        if (Math.abs(finalY - prevY) < minDistance) {
          finalY = prevY - minDistance;
        }
      }

      placed.push(finalY);

      // punto
      parts.push(
        `<circle cx="${pt.x}" cy="${pt.y}" r="4" fill="${color}" stroke="#ffffff" stroke-width="2" />`
      );

      // número
      parts.push(
        `<text x="${pt.x}" y="${finalY}"
        fill="${textColorPoint}"
        stroke="#000000"
        stroke-width="2"
        paint-order="stroke"
        font-family="Helvetica, Arial, sans-serif"
        font-size="25" font-weight="700"
        text-anchor="middle">
        ${pt.v}%
      </text>`
      );
    });
  });

  // Footer
  parts.push(
    `<text x="${W - marginRight}" y="${H - marginBottom}" fill="${mutedTextColor}" font-family="Helvetica, Arial, sans-serif" font-size="${footerFs}" text-anchor="end">${esc(
      ChartConfig.footer
    )}</text>`
  );

  parts.push(`</svg>`);

  return parts.join("\n");
}

/* ------------------------------------------------------------------ */
/*   Mensaje básico SVG si no hay datos                               */
/* ------------------------------------------------------------------ */

function basicTrackingMessageSvg(message: string): string {
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
