"use client";

import { useRef, useState, type KeyboardEvent } from "react";

/**
 * Keyboard model shared by the charts: the chart is one tab stop; arrow keys,
 * Home and End move between marks. The focused or hovered mark shows its tooltip.
 */
export function useRovingMarks(count: number) {
  const [focusIndex, setFocusIndex] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const refs = useRef<Array<HTMLElement | null>>([]);

  function move(next: number) {
    const index = (next + count) % count;
    setFocusIndex(index);
    setActiveIndex(index);
    refs.current[index]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>, index: number) {
    const keys: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: count - 1,
    };
    if (event.key in keys) {
      event.preventDefault();
      move(keys[event.key]);
    } else if (event.key === "Escape") {
      setActiveIndex(null);
    }
  }

  /** Props for mark `index`. */
  function markProps(index: number) {
    return {
      ref: (el: HTMLElement | null) => {
        refs.current[index] = el;
      },
      tabIndex: index === Math.min(focusIndex, count - 1) ? 0 : -1,
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => onKeyDown(event, index),
      onFocus: () => {
        setFocusIndex(index);
        setActiveIndex(index);
      },
      onBlur: () => setActiveIndex((current) => (current === index ? null : current)),
      onPointerEnter: () => setActiveIndex(index),
      onPointerLeave: () => setActiveIndex((current) => (current === index ? null : current)),
    };
  }

  return { activeIndex, markProps };
}
