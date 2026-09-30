import { Panel } from "@/components/ui/Panel";

type StatCardProps = {
  value: string | number;
  label: string;
};

export function StatCard({ value, label }: StatCardProps) {
  return (
    <Panel className="p-4">
      <p className="text-2xl font-bold text-text">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </Panel>
  );
}
