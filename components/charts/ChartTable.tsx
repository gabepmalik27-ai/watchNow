import type { ChartDatum } from "@/components/charts/types";

type ChartTableProps = {
  caption: string;
  categoryHeader: string;
  valueHeader: string;
  data: readonly ChartDatum[];
};

/** The table-view twin every chart ships with: the same values, no color or hover needed. */
export function ChartTable({ caption, categoryHeader, valueHeader, data }: ChartTableProps) {
  return (
    <details className="group mt-2">
      <summary className="inline-flex min-h-11 cursor-pointer items-center rounded text-sm font-medium text-soft-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric">
        <span className="group-open:hidden">Show as table</span>
        <span className="hidden group-open:inline">Hide table</span>
      </summary>
      <table className="mt-2 w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-muted">
            <th scope="col" className="py-2 font-medium">{categoryHeader}</th>
            <th scope="col" className="py-2 text-right font-medium">{valueHeader}</th>
            <th scope="col" className="py-2 pl-4 font-medium">Detail</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key} className="border-b border-border last:border-b-0">
              <th scope="row" className="py-2 font-normal text-text">{d.label}</th>
              <td className="py-2 text-right tabular-nums text-text">{d.valueText}</td>
              <td className="py-2 pl-4 text-muted">{d.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
