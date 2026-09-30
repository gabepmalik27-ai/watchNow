import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

type PanelProps = {
  children: ReactNode;
  className?: string;
};

export function Panel({ children, className }: PanelProps) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-border bg-panel p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
