import type { ChartSvgArgs } from "@/lib/chart-svgs";

const CANVAS_W = 1920;
const CANVAS_H = 1080;

const FONT_FUTURA =
  'Futura Condensed ExtraBold, "Futura Condensed", Futura, Arial, sans-serif';

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ---------------- A1 helpers (summary) ---------------- */

function a1ToRowCol(a1: string) {
  const match = a1.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) throw new Error(`Referencia A1 inválida: ${a1}`);

  const [, colLetters, rowStr] = match;
  let col = 0;
  for (const ch of colLetters) col = col * 26 + (ch.charCodeAt(0) - 64);

  const row = parseInt(rowStr, 10);
  if (!row || row < 1) throw new Error(`Fila inválida en referencia A1: ${a1}`);

  return { row, col }; // 1-based
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

function parsePct(raw: unknown): number {
  if (raw == null) return 0;

  if (typeof raw === "number") {
    let v = raw;
    if (v > 0 && v <= 1) v *= 100;
    return Math.max(0, Math.min(100, v));
  }

  const s = String(raw).replace("%", "").replace(",", ".").trim();
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

type TableRow = { label: string; yes: number; no: number };

function extractTableSummary(sheetValues: any[][], answerRange?: string): TableRow[] | null {
  if (!sheetValues?.length) return null;
  if (!answerRange?.trim()) return null;

  let parsed;
  try {
    parsed = parseA1Range(answerRange.trim());
  } catch {
    return null;
  }

  const { rowStart, rowEnd, colStart, colEnd } = parsed;

  // esperamos 3 columnas: label | sí | no
  // si el usuario selecciona más, solo tomamos las 3 primeras dentro del rango
  const cLabel = colStart;
  const cYes = colStart + 1;
  const cNo = colStart + 2;

  if (cNo > colEnd) return null;

  const rows: TableRow[] = [];

  for (let r = rowStart; r <= rowEnd; r++) {
    const row = sheetValues[r - 1] || [];
    const label = row[cLabel - 1] != null ? String(row[cLabel - 1]).trim() : "";
    if (!label) continue;

    const yes = parsePct(row[cYes - 1]);
    const no = parsePct(row[cNo - 1]);

    rows.push({ label, yes, no });
  }

  return rows.length ? rows : null;
}

/* ---------------- wrap helper (para labels largos) ---------------- */

function wrapByChars(text: string, maxChars: number, maxLines: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";

  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (test.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines - 1) {
        const rest = [cur, ...words.slice(words.indexOf(w) + 1)].join(" ");
        lines.push(rest);
        return lines;
      }
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);

  if (lines.length <= maxLines) return lines;
  return [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(" ")];
}

function basicMessageSvg(message: string, bg: string, text: string): string {
  const W = CANVAS_W;
  const H = CANVAS_H;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${bg}" />`,
    `<text x="${W / 2}" y="${H / 2}" fill="${text}"
      font-family="${FONT_FUTURA}"
      font-size="28"
      text-anchor="middle"
      dominant-baseline="middle">${esc(message)}</text>`,
    `</svg>`,
  ].join("\n");
}

/* ---------------- main ---------------- */

export function buildTableMikeFloresSvg({
  data = [],
  title,
  width,
  height,
  sheetValues,
  answerRange,
  backgroundColor,
  textColor,
  isCombinedMode,
}: ChartSvgArgs): string {
  const W = width ?? CANVAS_W;
  const H = height ?? CANVAS_H;

  const bg =
    backgroundColor && backgroundColor.trim() && backgroundColor !== "transparent"
      ? backgroundColor
      : "#232323";

  const mainText =
    textColor && textColor.trim() && textColor !== "transparent"
      ? textColor
      : "#ffffff";

  // 1) intenta summary (tabla)
  let rows: TableRow[] | null = extractTableSummary(sheetValues || [], answerRange);

  // 2) fallback raw: data = %Sí (y No = 100 - Sí)
  if (!rows) {
    const raw = (data || [])
      .map((d: any) => {
        const label = String(d?.label ?? "").trim();
        if (!label) return null;

        const yes = parsePct((d as any)?.percentage ?? (d as any)?.value);
        const no = Math.max(0, Math.min(100, 100 - yes));
        return { label, yes, no };
      })
      .filter(Boolean) as TableRow[];

    rows = raw.length ? raw : null;
  }

  if (!rows?.length) {
    return basicMessageSvg("No hay datos para la tabla.", bg, mainText);
  }

  /* ---------------- layout ---------------- */

  // title block (similar a tus otros charts)
  const titleFs = Math.round(H * 0.060);
  const titleLineGap = Math.round(titleFs * 0.16);
  const titleLines = wrapByChars(title || "", 34, 3);
  const titleBlockH = titleLines.length * titleFs + (titleLines.length - 1) * titleLineGap;

  const titleTop = Math.round(H * 0.17);
  const titleStartY = titleTop - Math.round(titleBlockH / 2);

  const topPad = Math.round(H * 0.08);
  const afterTitleGap = Math.round(H * 0.06);

  const tableTop = topPad + titleBlockH + afterTitleGap;

  // si se usa en combined, normalmente queremos que no “coma” tanto espacio
  const tableBottom = isCombinedMode ? Math.round(H * 0.92) : Math.round(H * 0.90);
  const tableH = Math.max(240, tableBottom - tableTop);

  // columnas
  const leftX = Math.round(W * 0.15);
  const rightX = Math.round(W * 0.85);
  const totalW = rightX - leftX;

  // ancho label grande + dos cols
  const labelW = Math.round(totalW * 0.58);
  const colGap = Math.round(totalW * 0.035);
  const colW = Math.round((totalW - labelW - colGap) / 2);

  const labelX = leftX;
  const yesX = labelX + labelW + colGap;
  const noX = yesX + colW + colGap;

  // pills sizing
  const rowsCount = rows.length;
  const gapY = Math.round(H * 0.020);

  // pillH debe “caber” en el alto disponible
  let pillH = Math.floor((tableH - gapY * (rowsCount - 1) - Math.round(H * 0.08)) / rowsCount);
  pillH = Math.max(56, Math.min(pillH, Math.round(H * 0.075)));

  const rx = Math.round(pillH / 2);

  const headerFs = Math.max(34, Math.round(H * 0.040));
  const cellFs = Math.max(34, Math.round(pillH * 0.55));
  const labelFs = Math.max(32, Math.round(pillH * 0.50));

  // header Y
  const headerY = tableTop + Math.round(headerFs * 0.2);
  const firstRowY = tableTop + Math.round(H * 0.08);

  // colors
  const labelFill = "#9fa1a4"; // gris claro como screenshot
  const labelFillDark = "#6e7073"; // una variante por si quieres alternar
  const yesFill = "#3f8f62"; // verde
  const noFill = "#8f2f2f"; // rojo
  const labelText = "#ffffff";

  /* ---------------- svg ---------------- */

  const parts: string[] = [];
  parts.push(
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${bg}" />`
  );

  // title
  titleLines.forEach((line, i) => {
    const y = titleStartY + i * (titleFs + titleLineGap);
    parts.push(
      `<text x="${Math.round(W / 2)}" y="${y}"
        fill="${mainText}"
        font-family="${FONT_FUTURA}"
        font-size="${titleFs}"
        font-weight="800"
        text-anchor="middle"
        dominant-baseline="hanging">${esc(line)}</text>`
    );
  });

  parts.push(`<g id="chart-content">`);

  // headers "Sí" y "No"
  parts.push(
    `<text x="${yesX + colW / 2}" y="${headerY}"
      fill="${mainText}"
      font-family="${FONT_FUTURA}"
      font-size="${headerFs}"
      font-weight="800"
      text-anchor="middle"
      dominant-baseline="alphabetic">Sí</text>`
  );
  parts.push(
    `<text x="${noX + colW / 2}" y="${headerY}"
      fill="${mainText}"
      font-family="${FONT_FUTURA}"
      font-size="${headerFs}"
      font-weight="800"
      text-anchor="middle"
      dominant-baseline="alphabetic">No</text>`
  );

  // rows
  rows.forEach((r, idx) => {
    const y = firstRowY + idx * (pillH + gapY);

    // label pill
    const fill = idx % 2 === 0 ? labelFill : labelFill; // si quieres alternar: labelFillDark
    parts.push(
      `<rect x="${labelX}" y="${y}" width="${labelW}" height="${pillH}"
        rx="${rx}" ry="${rx}" fill="${fill}" opacity="0.95" />`
    );

    const labelLines = wrapByChars(r.label, 26, 2);
    const labelLineGap = 2;
    const labelBlockH = labelLines.length * labelFs + (labelLines.length - 1) * labelLineGap;
    const labelBaseY = y + pillH / 2 - labelBlockH / 2 + labelFs;

    parts.push(
      `<text x="${labelX + labelW / 2}" y="${labelBaseY}"
        fill="${labelText}"
        font-family="${FONT_FUTURA}"
        font-size="${labelFs}"
        font-weight="800"
        text-anchor="middle">` +
        labelLines
          .map(
            (ln, j) =>
              `<tspan x="${labelX + labelW / 2}" dy="${j === 0 ? 0 : labelFs + labelLineGap}">${esc(
                ln
              )}</tspan>`
          )
          .join("") +
        `</text>`
    );

    // yes pill
    parts.push(
      `<rect x="${yesX}" y="${y}" width="${colW}" height="${pillH}"
        rx="${rx}" ry="${rx}" fill="${yesFill}" />`
    );
    parts.push(
      `<text x="${yesX + colW / 2}" y="${y + pillH / 2}"
        fill="#ffffff"
        font-family="${FONT_FUTURA}"
        font-size="${cellFs}"
        font-weight="800"
        text-anchor="middle"
        dominant-baseline="middle">${Math.round(r.yes)}%</text>`
    );

    // no pill
    parts.push(
      `<rect x="${noX}" y="${y}" width="${colW}" height="${pillH}"
        rx="${rx}" ry="${rx}" fill="${noFill}" />`
    );
    parts.push(
      `<text x="${noX + colW / 2}" y="${y + pillH / 2}"
        fill="#ffffff"
        font-family="${FONT_FUTURA}"
        font-size="${cellFs}"
        font-weight="800"
        text-anchor="middle"
        dominant-baseline="middle">${Math.round(r.no)}%</text>`
    );
  });

  parts.push(`</g>`);
  parts.push(`</svg>`);

  return parts.join("\n");
}
