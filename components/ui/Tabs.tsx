"use client";

import { useRef } from "react";
import { cx } from "@/lib/cx";

export type TabItem = {
  id: string;
  label: string;
};

type TabsProps = {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  /** Accessible name for the tablist. */
  label?: string;
  /**
   * When set, tab i gets id `${idPrefix}-tab-${id}` and aria-controls
   * `${idPrefix}-panel-${id}`, so the caller's tabpanels can point back.
   */
  idPrefix?: string;
};

export function Tabs({ tabs, activeId, onChange, label = "Sections", idPrefix }: TabsProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function focusTab(index: number) {
    const el = buttonRefs.current[index];
    el?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      const next = (index + 1) % tabs.length;
      onChange(tabs[next].id);
      focusTab(next);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      const prev = (index - 1 + tabs.length) % tabs.length;
      onChange(tabs[prev].id);
      focusTab(prev);
    } else if (event.key === "Home") {
      event.preventDefault();
      onChange(tabs[0].id);
      focusTab(0);
    } else if (event.key === "End") {
      event.preventDefault();
      const last = tabs.length - 1;
      onChange(tabs[last].id);
      focusTab(last);
    }
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-2 overflow-x-auto pb-1"
    >
      {tabs.map((tab, index) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            role="tab"
            id={idPrefix ? `${idPrefix}-tab-${tab.id}` : undefined}
            aria-controls={idPrefix ? `${idPrefix}-panel-${tab.id}` : undefined}
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cx(
              "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-midnight",
              active
                ? "bg-electric text-text"
                : "text-muted hover:bg-raised hover:text-text",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
