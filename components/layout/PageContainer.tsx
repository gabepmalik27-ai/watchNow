import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

type PageContainerProps = {
  children: ReactNode;
  className?: string;
};

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div
      className={cx(
        "mx-auto w-full max-w-[1440px] px-4 tablet:px-8 desktop:px-[72px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
