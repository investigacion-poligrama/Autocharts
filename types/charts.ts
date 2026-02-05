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
export type SavedChart = {
  id: string;
  createdAt: number;
  title: string;
  chartType: ChartType;
  svg: string;
};

export interface FrequencyData {
  label: string;
  value: number;
  percentage: number;
}
