import type { DatasetColumn, FrequencyData } from "@/app/page"; 

export function sortFrequenciesSmart(arr: FrequencyData[]): FrequencyData[] {
  const parsed = arr.map((f, i) => {
    const m = f.label.trim().match(/^([A-ZÁÉÍÓÚÑ])\./i);
    return { f, inciso: m ? m[1].toUpperCase() : null, i };
  });

  const hasIncisos = parsed.some((p) => p.inciso);
  if (!hasIncisos) {
    return [...arr].sort((a, b) => b.value - a.value);
  }

  const withInciso = parsed
    .filter((p) => p.inciso)
    .sort((a, b) => a.inciso!.localeCompare(b.inciso!, "es"));

  const withoutInciso = parsed
    .filter((p) => !p.inciso)
    .sort((a, b) => a.f.label.localeCompare(b.f.label, "es"));

  return [...withInciso, ...withoutInciso].map((p) => p.f);
}

export function parsePercentageValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;

  if (typeof raw === "number") {
    if (raw <= 1) return Number((raw * 100).toFixed(1));
    return Number(raw.toFixed(1));
  }

  let s = String(raw).trim();
  if (!s) return null;

  s = s.replace(",", ".").replace("%", "");
  const n = parseFloat(s);
  if (Number.isNaN(n)) return null;

  if (n <= 1) return Number((n * 100).toFixed(1));
  return Number(n.toFixed(1));
}

export function calculateRawFrequencies(
  columns: DatasetColumn[],
  columnName: string
): FrequencyData[] {
  const column = columns.find((col) => col.name === columnName);
  if (!column) return [];

  const counts: Record<string, number> = {};
  column.values.forEach((value) => {
    const v = String(value ?? "");
    counts[v] = (counts[v] || 0) + 1;
  });

  const total = column.values.length;
  const raw: FrequencyData[] = Object.entries(counts).map(([label, count]) => ({
    label,
    value: count,
    percentage: Number(((count / total) * 100).toFixed(1)),
  }));

  return sortFrequenciesSmart(raw);
}

export function calculateSummaryFrequencies(
  columns: DatasetColumn[],
  labelColumnName: string,
  percentColumnName?: string,
  options?: { enforceTotal100?: boolean } 
): FrequencyData[] {
  const enforceTotal100 = options?.enforceTotal100 ?? true;

  const labelCol = columns.find((c) => c.name === labelColumnName);
  if (!labelCol || !percentColumnName) return [];

  const percCol = columns.find((c) => c.name === percentColumnName);
  if (!percCol) return [];

  const len = Math.max(labelCol.values.length, percCol.values.length);
  const rows: FrequencyData[] = [];

  for (let i = 0; i < len; i++) {
    const label = String(labelCol.values[i] ?? "").trim();
    if (!label) continue;

    const perc = parsePercentageValue(percCol.values[i]);
    if (perc === null) continue;

    rows.push({
      label,
      value: perc,
      percentage: perc,
    });
  }

  if (enforceTotal100) {
    const total = rows.reduce((s, r) => s + r.percentage, 0);
    if (Math.abs(total - 100) > 1) {
      if (typeof window !== "undefined") {
        alert("Asegúrate antes de que la tabla de resultados sume 100%.");
      }
      return [];
    }
  }

  return sortFrequenciesSmart(rows);
}

export function parseSpreadsheetId(urlOrId: string): string | null {
  const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9-_]+$/.test(urlOrId)) return urlOrId;
  return null;
}
