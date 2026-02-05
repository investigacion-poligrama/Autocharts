import { ChartConfig } from "@/lib/chartconfig";
import type { ChartSvgArgs } from "@/lib/chart-svgs";
import type { DatasetColumn } from "@/app/page";
import { getBrandTheme } from "@/lib/brand-theme";
import { COOLVETICA_WOFF2_BASE64 } from "@/coolvetica.b64";

const CENS_W = 612;
const CENS_H = 792;

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type WrappedTitle = { lines: string[]; fontSize: number; blockHeight: number };

function prepareTitle(
  title: string,
  baseFontSize: number,
  maxChars = 55,
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

function a1ToRowCol(a1: string) {
  const match = a1.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) throw new Error(`Referencia A1 inválida: ${a1}`);
  const [, colLetters, rowStr] = match;

  let col = 0;
  for (const ch of colLetters) col = col * 26 + (ch.charCodeAt(0) - 64);
  const row = parseInt(rowStr, 10);
  if (!row || row < 1) throw new Error(`Fila inválida en referencia A1: ${a1}`);
  return { row, col };
}

function parseA1Range(range: string) {
  const [startStr, endStr] = range.split(":");
  const start = a1ToRowCol(startStr);
  const end = endStr ? a1ToRowCol(endStr) : start;

  return {
    rowStart: Math.min(start.row, end.row),
    rowEnd: Math.max(start.row, end.row),
    colStart: Math.min(start.col, end.col),
    colEnd: Math.max(start.col, end.col),
  };
}

function extractTableSummary(values: any[][], range?: string) {
  if (!values.length) return null;
  if (!range || !range.trim()) return null;

  let parsed;
  try {
    parsed = parseA1Range(range.trim());
  } catch {
    return null;
  }

  const { rowStart, rowEnd, colStart, colEnd } = parsed;

  const headerRow = values[rowStart - 1] || [];
  const months: string[] = [];
  for (let c = colStart; c <= colEnd; c++) {
    const raw = headerRow[c - 1];
    if (raw == null || raw === "") continue;
    months.push(String(raw).trim());
  }
  if (!months.length) return null;

  const categories: { name: string; values: number[] }[] = [];

  const row = values[rowStart] || []; // rowStart+1 en 1-based => rowStart en 0-based
const vals: number[] = [];

for (let mIdx = 0; mIdx < months.length; mIdx++) {
  const c = colStart + mIdx;          // <-- ya no +1
  const cell = row[c - 1];

  let v = 0;
  if (typeof cell === "number") v = cell;
  else if (typeof cell === "string") {
    const cleaned = cell.replace("%", "").replace(",", ".").trim();
    const num = parseFloat(cleaned);
    if (!Number.isNaN(num)) v = num;
  }

  vals.push(Number(v.toFixed(1)));
}

categories.push({ name: "Tracking", values: vals });

  return { months, categories };
}

function extractRaw(columns: DatasetColumn[]) {
  const MONTHS = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];

  const monthCol = columns.find(
    (c) =>
      /mes/i.test(c.name ?? "") &&
      c.values.some((v) => MONTHS.includes(String(v || "").slice(0, 3).toUpperCase()))
  );
  const catCol = columns.find((c) => /(problema|categor[ií]a|tema)/i.test(c.name ?? ""));
  const valCol = columns.find((c) => /(valor|promedio|media|score|calif|rating|porcentaje|rango)/i.test(c.name ?? ""));

  if (!monthCol || !catCol) return null;

  const monthsUsed = Array.from(
    new Set(monthCol.values.filter(Boolean).map((v) => String(v).slice(0, 3).toUpperCase()))
  );
  const months = monthsUsed.sort((a, b) => MONTHS.indexOf(a) - MONTHS.indexOf(b));
  const cats = Array.from(new Set(catCol.values.filter(Boolean)));

  const categories = cats.map((name) => ({ name, values: months.map(() => 0) }));

  const hasNumeric =
    !!valCol &&
    valCol.values.some((v) => v !== "" && !Number.isNaN(Number(String(v).replace(",", "."))));

  if (!hasNumeric || !valCol) return { months, categories };

  // Detecta si es escala 0–10 (score) o porcentaje
  const nums = valCol.values
    .map((x) => Number(String(x ?? "").replace(",", ".")))
    .filter((n) => Number.isFinite(n));
  const maxNum = nums.length ? Math.max(...nums) : 0;
  const looksLikeScore10 = maxNum > 0 && maxNum <= 10.5;

  for (let i = 0; i < monthCol.values.length; i++) {
    const m = String(monthCol.values[i] || "").slice(0, 3).toUpperCase();
    const c = catCol.values[i];
    const raw = String(valCol.values[i] ?? "").replace(",", ".");
    if (!m || !c || raw === "") continue;

    const mIdx = months.indexOf(m);
    const cIdx = categories.findIndex((x) => x.name === c);
    if (mIdx === -1 || cIdx === -1) continue;

    let v = Number(raw);
    if (!Number.isFinite(v)) continue;

    if (!looksLikeScore10) {
      if (v > 0 && v <= 1) v = v * 100;
      // aquí sería porcentaje (0–100)
      categories[cIdx].values[mIdx] = Number(v.toFixed(1));
    } else {
      // score 0–10
      categories[cIdx].values[mIdx] = Number(v.toFixed(1));
    }
  }

  return { months, categories, looksLikeScore10 };
}

function monthLabelEs(d: Date) {
  const monthNamesEs = [
    "enero","febrero","marzo","abril","mayo","junio",
    "julio","agosto","septiembre","octubre","noviembre","diciembre",
  ];
  const m = monthNamesEs[d.getMonth()];
  return `${m.charAt(0).toUpperCase() + m.slice(1)} ${d.getFullYear()}`;
}

function basicMsg(message: string) {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CENS_W}" height="${CENS_H}" viewBox="0 0 ${CENS_W} ${CENS_H}">`,
    `<rect width="100%" height="100%" fill="#000" />`,
    `<text x="${CENS_W / 2}" y="${CENS_H / 2}" fill="#fff" font-family="Helvetica, Arial, sans-serif" font-size="18" text-anchor="middle" dominant-baseline="middle">${esc(message)}</text>`,
    `</svg>`,
  ].join("\n");
}

/**
 * Score arriba (último mes) + Tracking abajo (barras) para 1 categoría.
 * SOLO Cens/Edmund/Sinsa.
 */
export function buildScoreTrackingCensSvg({
  data = [],
  title,
  columns,
  sheetTitle,
  inputMode,
  sheetValues,
  answerRange,
  backgroundColor,
  textColor,
  brand,
}: ChartSvgArgs): string {
  if (brand !== "censEdmundSinsa") {
    return basicMsg("Este layout es solo para Cens / Edmund / Sinsa.");
  }

  const theme = getBrandTheme("censEdmundSinsa");
  const W = CENS_W;
  const H = CENS_H;

  const wantsCoolvetica = /coolvetica rg/i.test(theme.fontFamily || "");
  const FONT_STACK = theme.fontFamily || "Helvetica, Arial, sans-serif";

  const bg = backgroundColor ?? theme.defaultBackground;
  const mainTextColor = textColor ?? theme.defaultTextColor;

  const BASE_W = 1440;
const BASE_H = 1800;
const scale = Math.min(W / BASE_W, H / BASE_H);
const S = (n: number) => n * scale;

const marginLeft = S(100);
const marginRight = S(100);
const marginTop = S(170);
const marginBottom = S(170);

const headerY = marginTop - S(24);

  const centerX = W / 2;
  const rightX = W - marginRight;

  const headerLeft = "Monterrey, Nuevo León";
  const headerDate = monthLabelEs(new Date());

  const titleY = marginTop + S(130);

const baseTitleFs = S(75);
const { lines: titleLines, fontSize: titleFs, blockHeight: titleBlockH } =
  prepareTitle(title, baseTitleFs, 30, 5);



  const selectedCategoryName = String(data?.[0]?.label ?? "").trim();

  let months: string[] = [];
  let categories: { name: string; values: number[] }[] = [];
  let yMax = 10;

  if (inputMode === "summary") {
    const table = extractTableSummary(sheetValues || [], answerRange);
    if (!table) return basicMsg("No se pudo leer la tabla (revisa el rango).");
    months = table.months;
    categories = table.categories;
    // asumimos score 0–10 en este modo para este chart
    yMax = 10;
  } else {
    if (!columns?.length) return basicMsg("No hay columnas suficientes.");
    const raw = extractRaw(columns as DatasetColumn[]);
    if (!raw) return basicMsg("No se detectaron columnas de mes/categoría.");
    months = raw.months;
    categories = raw.categories;
    // si no parece score, igual lo forzamos a 0–10 para este layout
    yMax = (raw as any).looksLikeScore10 ? 10 : 10;
  }

  if (!months.length || !categories.length) return basicMsg("No hay datos suficientes.");

  const cat =
    (selectedCategoryName &&
      categories.find((c) => String(c.name).trim() === selectedCategoryName)) ||
    categories[0];

  const values = cat.values.map((v) => {
    // clamp 0–10
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(10, n));
  });

  const lastIdx = Math.max(0, months.length - 1);
  const lastValue = values[lastIdx] ?? 0;

  // --- Layout: Score arriba ---
  const scoreAreaTop = titleY + titleBlockH + 55;
  const scoreBarY = scoreAreaTop + 0;
  const scoreBarX = marginLeft;
  const scoreBarW = W - marginLeft - marginRight;
  const scoreBarH = 32;

  const markerW = 44;
  const markerH = 48;
  const t = yMax > 0 ? lastValue / yMax : 0;
  const markerCenterX = scoreBarX + t * scoreBarW;
  const markerX = Math.max(scoreBarX, Math.min(scoreBarX + scoreBarW - markerW, markerCenterX - markerW / 2));
  const markerY = scoreBarY - (markerH - scoreBarH) / 2;

  const bigValueY = scoreBarY - 22;

  // --- Layout: Tracking abajo ---
  const trackingLabelY = scoreBarY + 100;

  const chartTop = trackingLabelY + 45 ;
  const chartBottom = H - marginBottom - 10;
  const chartHeight = Math.max(1, chartBottom - chartTop);

  const axisX = marginLeft;
  const barsLeft = axisX + 34;
  const barsRight = W - marginRight-70;
  const barsW = barsRight - barsLeft - 185;

  const nMonths = months.length;
  const slot = nMonths > 0 ? barsW / nMonths : 0;
  const barW = slot * 0.2;

  const yTicks = [0, 2, 4, 6, 8, 10];

  // Meses abreviados (ENE/FEB/...)
  const monthShort = (m: string) => {
    const s = String(m).trim();
    const up = s.slice(0, 3).toUpperCase();
    // si viene "Febrero", toma "FEB"; si viene "FEB", deja igual
    return up;
  };

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

  // Header
  if (sheetTitle) {
    parts.push(
      `<text x="${marginLeft}" y="${headerY}" fill="${mainTextColor}" font-family="${FONT_STACK}" font-size="${S(26)}" font-weight="600" text-anchor="start">${esc(headerLeft)}</text>`,
      `<text x="${centerX}" y="${headerY}" fill="${mainTextColor}" font-family="${FONT_STACK}" font-size="${S(30)}" font-weight="600" text-anchor="middle">${esc(sheetTitle)}</text>`,
      `<text x="${rightX}" y="${headerY}" fill="${mainTextColor}" font-family="${FONT_STACK}" font-size="${S(26)}" font-weight="600" text-anchor="end">${esc(headerDate)}</text>`
    );
  }

  // Título (pregunta)
  const titleGap = S(22);
  titleLines.forEach((line, idx) => {
    const y = titleY + idx * (titleFs + titleGap);
    parts.push(
      `<text x="${marginLeft}" y="${y}" fill="${mainTextColor}" font-family="${FONT_STACK}" font-size="${titleFs}" font-weight="700" text-anchor="start">${esc(line)}</text>`
    );
  });

  // Score bar (arriba)
  parts.push(
    `<rect x="${scoreBarX}" y="${scoreBarY}" width="${scoreBarW}" height="${scoreBarH}" fill="${mainTextColor}" fill-opacity="0.25" stroke="${mainTextColor}" stroke-width="1" />`,
    `<rect x="${markerX}" y="${markerY}" width="${markerW}" height="${markerH}" fill="${mainTextColor}" />`,
    `<text x="${markerCenterX}" y="${bigValueY}" fill="${mainTextColor}" font-family="${FONT_STACK}" font-size="56" font-weight="800" text-anchor="middle">${esc(lastValue.toFixed(1).replace(/\.0$/, ""))}</text>`
  );

  // Tracking label
  parts.push(
    `<text x="${marginLeft}" y="${trackingLabelY}" fill="${mainTextColor}" font-family="${FONT_STACK}" font-size="34" font-weight="800" text-anchor="start">Tracking</text>`
  );

  // Y axis labels
  yTicks.forEach((v) => {
    const y = chartBottom - (v / yMax) * chartHeight;
    parts.push(
      `<text x="${axisX + 10}" y="${y + 5}" fill="${mainTextColor}" font-family="${FONT_STACK}" font-size="10" font-weight="700" text-anchor="end">${v}</text>`
    );
  });

  // Bars
  for (let i = 0; i < nMonths; i++) {
    const cx = barsLeft + slot * (i + 0.5);
    const x = cx - barW / 2;
    const v = values[i] ?? 0;
    const h = (v / yMax) * chartHeight;
    const yTop = chartBottom - h;

    parts.push(
      `<rect x="${x}" y="${yTop}" width="${barW}" height="${h}" fill="${mainTextColor}" fill-opacity="0.85" />`,
      `<text x="${cx}" y="${yTop - 6}" fill="${mainTextColor}" font-family="${FONT_STACK}" font-size="25" font-weight="800" text-anchor="middle">${esc(v.toFixed(1).replace(/\.0$/, ""))}</text>`,
      `<text x="${cx}" y="${chartBottom + 26}" fill="${mainTextColor}" font-family="${FONT_STACK}" font-size="12" font-weight="800" text-anchor="middle">${esc(monthShort(months[i]))}</text>`
    );
  }

  parts.push(`</svg>`);
  return parts.join("\n");
}
