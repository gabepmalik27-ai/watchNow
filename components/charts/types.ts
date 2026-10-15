/** One mark in a chart: a bar or a column. */
export type ChartDatum = {
  key: string;
  /** Category name shown on the axis, e.g. "Drama" or "4.5". */
  label: string;
  value: number;
  /** The value as displayed at the bar tip, in the table and the tooltip, e.g. "4.3". */
  valueText: string;
  /** Secondary tooltip / table line, e.g. "from 7 ratings". */
  detail: string;
};
