import { Panel } from "@/components/ui/Panel";

type StatCardProps = {
  value: string | number;
  label: string;
  /** A second muted line under the label. */
  sublabel?: string;
};

export function StatCard({ value, label, sublabel }: StatCardProps) {
  return (
    <Panel className="p-4">
      <p className="text-2xl font-bold text-text">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
      {sublabel ? <p className="mt-1 text-xs text-soft-blue">{sublabel}</p> : null}
    </Panel>
  );
}
