type EmptyStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-panel px-6 py-12 text-center">
      <p className="text-base font-semibold text-text">{title}</p>
      <p className="max-w-sm text-sm text-muted">{description}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 min-h-11 rounded-full bg-electric px-5 text-sm font-medium text-text transition-colors hover:bg-soft-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-midnight"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
