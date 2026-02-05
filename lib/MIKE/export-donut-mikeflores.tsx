// export-donut-mikeflores.tsx
import type { ChartSvgArgs } from "@/lib/chart-svgs";

const CANVAS_W = 1920;
const CANVAS_H = 1080;

const FONT_FUTURA = "Futura Condensed ExtraBold, Futura, Arial, sans-serif";

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function clampPercent(raw: unknown): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw.replace("%", "").replace(",", ".").trim())
        : 0;

  let v = Number.isFinite(n) ? n : 0;
  if (v > 0 && v <= 1) v *= 100; // 0–1 -> 0–100
  return Math.max(0, Math.min(100, v));
}

function wrapTitle(title: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";

  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (test.length > maxCharsPerLine && cur) {
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

type WrappedTitle = { lines: string[]; fontSize: number; blockHeight: number };

function prepareTitleMike(title: string, W: number, H: number): WrappedTitle {
  const isVertical = H > W;
  const fontSize = Math.round(isVertical ? W * 0.04 : H * 0.060);
  const maxChars = isVertical ? 26 : 40;
  const lines = wrapTitle(title || "", maxChars, 3);
  const lineGap = Math.round(fontSize * 0.16);
  const blockHeight = lines.length * fontSize + (lines.length - 1) * lineGap;
  return { lines, fontSize, blockHeight };
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180.0;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

// Arc path for stroke-donut segments
function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
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

// Paleta tipo PDF
const FALLBACK_PALETTE = ["#39a935", "#b81d2c", "#f39c12", "#1e88e5", "#7e57c2", "#9e9e9e"];

function normalizeKey(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getSliceColor(label: string, customColors: Record<string, string>, idx: number) {
  if (!label) return FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length];

  // exact
  if (customColors?.[label]) return customColors[label];

  // normalized
  const target = normalizeKey(label);
  const found = Object.keys(customColors || {}).find((k) => normalizeKey(k) === target);
  if (found) return customColors[found];

  return FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length];
}

type Slice = {
  label: string;
  value: number; // percent-ish
  color: string;
  startAngle: number;
  endAngle: number;
  midAngle: number;
};

export function buildDonutMikeFloresSvg({
  data = [],
  title,
  width,
  height,
  backgroundColor,
  textColor,
  isCombinedMode,
  customColors = {},
}: ChartSvgArgs): string {
  const W = width ?? CANVAS_W;
  const H = height ?? CANVAS_H;

  const bg =
    backgroundColor && backgroundColor.trim() && backgroundColor !== "transparent"
      ? backgroundColor
      : "#232323";

  const mainText =
    textColor && textColor.trim() && textColor !== "transparent" ? textColor : "#ffffff";

  if (!data?.length) return basicMessageSvg("No hay datos para el donut.", bg, mainText);

  // Build items from FrequencyData (label + percentage/value)
  const rawItems = (data as any[])
    .map((d) => ({
      label: String(d?.label ?? "").trim(),
      value: clampPercent(d?.percentage ?? d?.value),
    }))
    .filter((d) => d.label && d.value > 0);

  if (!rawItems.length) return basicMessageSvg("No hay datos válidos para el donut.", bg, mainText);

  // Normalize so sum = 100
  const sum = rawItems.reduce((a, b) => a + b.value, 0);
  const items = rawItems.map((it) => ({
    ...it,
    value: sum > 0 ? (it.value / sum) * 100 : it.value,
  }));

  // ----- Title -----
  const { lines: titleLines, fontSize: titleFs, blockHeight: titleBlockH } = prepareTitleMike(
    title || "",
    W,
    H
  );

  const titleLineGap = Math.round(titleFs * 0.16);
  const titleTop = Math.round(H * 0.17);
  const titleStartY = titleTop - Math.round(titleBlockH / 2);
  const titleBottomY = titleStartY + titleBlockH;

  // ----- Donut geometry (posicionado debajo del título) -----
  const gapAfterTitle = Math.round(H * 0.08);
  const cx = Math.round(W * 0.50);

  const outerR = Math.round(Math.min(W, H) * 0.205);
  const strokeW = Math.round(outerR * 0.33);
  const r = outerR - strokeW / 2;

  const cy = Math.round(titleBottomY + gapAfterTitle + outerR);

  // Callout styling
  const labelFs = Math.round(H * 0.02);
  const pctFs = Math.round(H * 0.030);
  const calloutW = Math.max(6, Math.round(H * 0.004));

  const outLen = Math.round(W * 0.040);

  const anchorR = outerR;
  const elbowR = outerR + Math.round(H * 0.020);

  // Build slice angles
  let ang = 0;
  const slices: Slice[] = items.map((it, idx) => {
    const span = (it.value / 100) * 360;
    const startAngle = ang;
    const endAngle = ang + span;
    const midAngle = (startAngle + endAngle) / 2;

    const color = getSliceColor(it.label, customColors, idx);

    ang = endAngle;
    return { label: it.label, value: it.value, color, startAngle, endAngle, midAngle };
  });

  // Callouts (ordenados por Y y con anti-colisión)
  const callouts = slices
    .map((s, idx) => {
      const a = s.midAngle;
      const anchor = polarToCartesian(cx, cy, anchorR, a);
      const elbowPt = polarToCartesian(cx, cy, elbowR, a);

      const isRight = Math.cos(((a - 90) * Math.PI) / 180) > 0;
      const endX = elbowPt.x + (isRight ? outLen : -outLen);

      return { idx, slice: s, anchor, elbow: elbowPt, isRight, endX, y: elbowPt.y };
    })
    .sort((a, b) => a.y - b.y);

  const minGap = Math.round(H * 0.060);
  for (let i = 1; i < callouts.length; i++) {
    if (callouts[i].y - callouts[i - 1].y < minGap) {
      callouts[i].y = callouts[i - 1].y + minGap;
    }
  }

  const yMin = Math.round(H * 0.30);
  const yMax = Math.round(H * 0.86);
  callouts.forEach((c) => {
    c.y = Math.max(yMin, Math.min(yMax, c.y));
  });

  // ----- SVG build -----
  const parts: string[] = [];
  parts.push(
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${bg}" />`
  );

  // Title markup (fuera o dentro según combined)
  const titleMarkup: string[] = [];
  titleLines.forEach((line, i) => {
    const y = titleStartY + i * (titleFs + titleLineGap);
    titleMarkup.push(
      `<text x="${Math.round(W / 2)}" y="${y}"
        fill="${mainText}"
        font-family="${FONT_FUTURA}"
        font-size="${titleFs}"
        font-weight="800"
        text-anchor="middle"
        dominant-baseline="hanging">${esc(line)}</text>`
    );
  });

  if (!isCombinedMode) parts.push(...titleMarkup);

  // chart-content (incluye título en combined)
  parts.push(`<g id="chart-content">`);
  if (isCombinedMode) parts.push(...titleMarkup);

  // content-bounds para crop en combined
  const boundsX = 0;
  const boundsY = Math.max(0, titleStartY);
  const boundsW = W;
  const boundsBottom = Math.min(H, cy + outerR + Math.round(H * 0.12));
  const boundsH = Math.max(1, boundsBottom - boundsY);

  parts.push(
    `<rect id="content-bounds" x="${boundsX}" y="${boundsY}" width="${boundsW}" height="${boundsH}"
      fill="none" opacity="0" />`
  );

  // Slices
  slices.forEach((s) => {
    const d = arcPath(cx, cy, r, s.startAngle, s.endAngle);
    parts.push(
      `<path d="${d}" fill="none" stroke="${s.color}"
        stroke-width="${strokeW}" stroke-linecap="butt" />`
    );
  });

  // Callouts
  callouts.forEach((c) => {
    const s = c.slice;

    const elbowX = c.elbow.x;
    const elbowY = c.y;
    const endX = c.endX;

    parts.push(
      `<path d="M ${c.anchor.x} ${c.anchor.y}
               L ${c.elbow.x} ${c.elbow.y}
               L ${elbowX} ${elbowY}
               L ${endX} ${elbowY}"
        fill="none" stroke="${s.color}" stroke-width="${calloutW}" />`
    );

    const label = s.label;
    const pct = `${Math.round(s.value)}%`;

    const textX = endX + (c.isRight ? Math.round(W * 0.006) : -Math.round(W * 0.006));
    const align = c.isRight ? "start" : "end";

    const labelOffsetY = Math.round(H * 0.014);
    const pctOffsetY = Math.round(H * 0.018);

    // label
    parts.push(
      `<text x="${textX}" y="${elbowY - labelOffsetY}"
        fill="${mainText}"
        font-family="${FONT_FUTURA}"
        font-size="${labelFs}"
        font-style="italic"
        font-weight="700"
        text-anchor="${align}"
        dominant-baseline="alphabetic">${esc(label)}</text>`
    );

    // percent
    parts.push(
      `<text x="${textX}" y="${elbowY + pctOffsetY}"
        fill="${mainText}"
        font-family="${FONT_FUTURA}"
        font-size="${pctFs}"
        font-weight="400"
        font-style="italic"
        text-anchor="${align}"
        dominant-baseline="alphabetic">${esc(pct)}</text>`
    );
  });

  parts.push(`</g>`);
  parts.push(`</svg>`);
  return parts.join("\n");
}
