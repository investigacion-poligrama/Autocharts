import { ChartConfig } from "@/lib/chartconfig";
import type { FrequencyData } from "@/app/page";
import { getBrandTheme } from "@/lib/brand-theme";
import { COOLVETICA_WOFF2_BASE64 } from "@/coolvetica.b64";
import type { Brand } from "@/types/brand";

const esc = (s: string) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

type BuildBarNarrowSvgArgs = {
  data: FrequencyData[];
  title: string;
  sheetTitle?: string;
  width?: number;
  height?: number;
  backgroundColor?: string;
  textColor?: string;
  brand?: Brand;
  headerLeftLabel?: string;
};

type WrappedTitle = {
  lines: string[];
  fontSize: number;
  blockHeight: number;
};

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

function monthLabelEs(d: Date) {
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
  const m = monthNamesEs[d.getMonth()];
  const M = m.charAt(0).toUpperCase() + m.slice(1);
  return `${M} ${d.getFullYear()}`;
}

export function buildBarNarrowSvg({
  data,
  title,
  sheetTitle,
  width,
  height,
  backgroundColor,
  textColor,
  brand,
  headerLeftLabel = "Monterrey, Nuevo León",
}: BuildBarNarrowSvgArgs): string {
  const theme = getBrandTheme(brand ?? "poligrama");
  const isCensBrand = brand === "censEdmundSinsa";

  const W = isCensBrand ? 612 : width ?? 1920;
  const H = isCensBrand ? 792 : height ?? 1080;
  const BASE_W = 1440;
  const BASE_H = 1800;
  const scale = isCensBrand ? Math.min(W / BASE_W, H / BASE_H) : 1;
  const S = (n: number) => n * scale;

  const wantsCoolvetica = /coolvetica rg/i.test(theme.fontFamily || "");
  const FONT_STACK = theme.fontFamily || "Helvetica, Arial, sans-serif";

  const bg = backgroundColor ?? theme.defaultBackground;
  const mainTextColor = textColor ?? theme.defaultTextColor;
  const useTallRules = isCensBrand || (W === 1440 && H === 1800);

  let marginLeft = useTallRules ? S(100) : 120;
  let marginRight = useTallRules ? S(100) : 120;
  let marginTop = useTallRules ? S(170) : 125;
  let marginBottom = useTallRules ? S(170) : 125;

  // --- título ---
  const baseTitleFs = useTallRules ? S(75) : 75;
  const maxTitleChars = useTallRules ? 34 : 50;
  const titleY = marginTop + S(130);

  const { lines: titleLines, fontSize: titleFs, blockHeight: titleBlockH } =
  prepareTitle(title, baseTitleFs, 30, 4);


  const titleLineGapRender = useTallRules ? S(22) : 22;
  const titleWeight = 600;

  // --- header ---
  const headerY = marginTop - S(24);
  const centerX = W / 2;
  const rightX = W - marginRight;
  const headerDateLabel = monthLabelEs(new Date());

  // --- layout de líneas ---
  const listTop = titleY + titleBlockH + S(120);
  const listBottom = H - marginBottom - S(120);
  const listHeight = Math.max(1, listBottom - listTop);

  const items = (data || [])
    .map((d) => {
      const raw =
        typeof d.percentage === "number"
          ? d.percentage
          : typeof d.value === "number"
          ? d.value
          : 0;
      const value = Math.max(0, Math.min(100, raw));
      return { label: String(d.label ?? ""), value };
    })
    .filter((x) => x.label.trim() !== "");

  if (!items.length) {
    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
      `<rect width="100%" height="100%" fill="${bg}" />`,
      `<text x="${marginLeft}" y="${titleY}" fill="${mainTextColor}" font-family="${FONT_STACK}" font-size="${S(
        32
      )}">Sin datos</text>`,
      `</svg>`,
    ].join("\n");
  }

  const linesLeft = marginLeft + (useTallRules ? S(40) : 60);

  // ✅ antes: -420 y 0.62 (pensado para 1440/1920)
  // ahora: lo escalamos y además lo “clamp” para que nunca quede negativo
  const proposedRight = W - marginRight - S(420);
  const pctRight = W * 0.62;
  const linesRight = Math.max(linesLeft + S(200), Math.min(proposedRight, pctRight));
  const maxLineWidth = Math.max(S(200), linesRight - linesLeft);

  const rows = items.length;
  const baseRowGap = rows <= 1 ? 0 : listHeight / (rows - 1);
  const rowGap = useTallRules ? baseRowGap : baseRowGap * 1.3;

  const strokeW = useTallRules ? S(6) : 4;
  const pctFs = useTallRules ? S(45) : 26;
  const labelFs = useTallRules ? S(37) : 20;
  const labelWeight = 600;

  const pctDy = useTallRules ? -S(10) : -10;
  const labelDy = useTallRules ? S(18) : 18;

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

  // HEADER
  if (sheetTitle) {
    parts.push(
      `<text x="${marginLeft}" y="${headerY}"
             fill="${mainTextColor}" font-family="${FONT_STACK}"
             font-size="${useTallRules ? S(26) : 26}" font-weight="600" text-anchor="start">${esc(
               headerLeftLabel
             )}</text>`,
      `<text x="${centerX}" y="${headerY}"
             fill="${mainTextColor}" font-family="${FONT_STACK}"
             font-size="${useTallRules ? S(30) : 30}" font-weight="600" text-anchor="middle">${esc(
               sheetTitle
             )}</text>`,
      `<text x="${rightX}" y="${headerY}"
             fill="${mainTextColor}" font-family="${FONT_STACK}"
             font-size="${useTallRules ? S(26) : 26}" font-weight="600" text-anchor="end">${esc(
               headerDateLabel
             )}</text>`
    );
  }

  // TITLE
  titleLines.forEach((line, idx) => {
    const y = titleY + idx * (baseTitleFs + titleLineGapRender);
    parts.push(
      `<text x="${marginLeft}" y="${y}"
             fill="${mainTextColor}"
             font-family="${FONT_STACK}"
             font-size="${baseTitleFs}"
             font-weight="${titleWeight}"
             text-anchor="start">${esc(line)}</text>`
    );
  });

  // LIST
  items.forEach((it, i) => {
    const y = listTop + i * rowGap;
    const lineLen = (maxLineWidth * it.value) / 100;
    const x1 = linesLeft;
    const x2 = linesLeft + lineLen;

    parts.push(
      `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"
             stroke="${mainTextColor}" stroke-width="${strokeW}" stroke-linecap="butt" />`
    );

    const pctX = x2 + S(10);
    parts.push(
      `<text x="${pctX}" y="${y + pctDy}"
             fill="${mainTextColor}"
             font-family="${FONT_STACK}"
             font-size="${pctFs}"
             font-weight="700"
             text-anchor="start">${esc(`${Math.round(it.value)}%`)}</text>`
    );

    parts.push(
      `<text x="${pctX}" y="${y + labelDy}"
             fill="${mainTextColor}"
             font-family="${FONT_STACK}"
             font-size="${labelFs}"
             font-weight="${labelWeight}"
             text-anchor="start">${esc(it.label)}</text>`
    );
  });

  parts.push(`</svg>`);
  return parts.join("\n");
}
