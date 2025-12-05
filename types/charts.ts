export type SavedChart = {
  id: string;             // uuid o timestamp
  title: string;
  chartType: string;      // "donut" | "matrix" | ...
  svg: string;
  createdAt: number;      // Date.now()
};
