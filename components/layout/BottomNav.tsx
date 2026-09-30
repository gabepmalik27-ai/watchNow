"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/cx";
import { NAV_ITEMS } from "@/lib/nav-items";

const ICONS: Record<string, React.ReactNode> = {
  "/": (
    <path
      d="M3 8.5L9 3l6 5.5V15a.5.5 0 01-.5.5H10V11H8v4.5H3.5a.5.5 0 01-.5-.5V8.5Z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  ),
  "/search": (
    <>
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  "/rate": (
    <path
      d="M9 2.5l2 4.2 4.6.7-3.3 3.2.8 4.6L9 13l-4.1 2.2.8-4.6L2.4 7.4l4.6-.7L9 2.5Z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  ),
  "/recommend": (
    <path
      d="M9 2.5l1.6 4.2 4.4.6-3.2 3 .8 4.3-3.6-2-3.6 2 .8-4.3-3.2-3 4.4-.6L9 2.5Z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  ),
  "/for-you": (
    <>
      <circle cx="9" cy="6.5" r="2.7" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M3.5 15c0-2.8 2.5-4.5 5.5-4.5s5.5 1.7 5.5 4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </>
  ),
};

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch justify-around border-t border-border bg-navigation tablet:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="flex min-w-11 flex-1 flex-col items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-inset"
          >
            <span
              className={cx(
                "flex h-8 w-8 items-center justify-center rounded-full",
                active ? "bg-electric text-text" : "text-muted",
              )}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                {ICONS[item.href]}
              </svg>
            </span>
            <span
              className={cx(
                "text-[11px]",
                active ? "font-semibold text-text" : "font-medium text-muted",
              )}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
