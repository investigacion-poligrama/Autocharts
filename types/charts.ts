// types/charts.ts
export type ChartType =
  | "donut"
  | "bar"
  | "matrix"
  | "score"
  | "approval"
  | "partido"
  | "tracking"
  | "stacked"
  | "mediumdonut"
  | "barnarrow"
  | "stackedvertical"
  | "narrowvertbars"
  | "combined"
  | "mikebar"
  | "trackingpills"
  | "table"
  | "singletrack";

export interface DatasetColumn {
  name: string;
  values: string[];
}

export interface FrequencyData {
  label: string;
  value: number;
  percentage: number;
}
