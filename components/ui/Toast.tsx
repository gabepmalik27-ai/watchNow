"use client";

import { useEffect, useRef } from "react";

const DISMISS_MS = 4000;

type ToastProps = {
  /** Changes whenever a new toast should replace the current one. */
  toastKey: number;
  message: string;
  actionLabel: string;
  onAction: () => void;
  onDismiss: () => void;
};

/**
 * Rendered as a manual popover so it lives in the browser's top layer.
 * A plain fixed element would sit behind a modal <dialog>'s backdrop, and
 * ratings are made from inside that dialog.
 */
export function Toast({ toastKey, message, actionLabel, onAction, onDismiss }: ToastProps) {
  const ref = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Re-show so a newer toast is stacked above any dialog opened since.
    if (el.matches(":popover-open")) el.hidePopover();
    el.showPopover();
    const timer = window.setTimeout(() => dismissRef.current(), DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toastKey]);

  return (
    <div
      ref={ref}
      popover="manual"
      role="status"
      className="fixed inset-x-4 bottom-20 top-auto m-0 mx-auto flex w-auto max-w-md items-center justify-between gap-4 overflow-visible rounded-2xl border border-border bg-raised px-4 py-2 text-sm text-text tablet:bottom-8"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onAction}
        className="min-h-11 shrink-0 rounded-full px-3 font-semibold text-soft-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric"
      >
        {actionLabel}
      </button>
    </div>
  );
}
