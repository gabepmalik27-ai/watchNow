import type { RankDiagnostics } from "@/lib/recommender";

type DiagnosticsPanelProps = {
  diagnostics: RankDiagnostics;
};

/** ?debug=1: where the pool's candidates went, and why a list came back short. */
export function DiagnosticsPanel({ diagnostics: d }: DiagnosticsPanelProps) {
  const short = d.returned < d.requested;
  const reasons = [
    d.excludedByUser > 0 ? `${d.excludedByUser} already rated, watched, watchlisted or dismissed` : null,
    d.removedByTimeFilter > 0 ? `${d.removedByTimeFilter} outside the time filter` : null,
    d.removedByDirectorCap > 0 ? `${d.removedByDirectorCap} skipped by the per-director cap` : null,
    d.missingFromCatalog > 0 ? `${d.missingFromCatalog} missing from the catalog` : null,
  ].filter((reason) => reason !== null);

  return (
    <div className="rounded-xl border border-border bg-panel p-4 text-xs text-muted">
      <p className="font-semibold text-text">
        {d.returned} of {d.requested} requested · pool {d.poolSize}
        {short ? " · short list" : ""}
      </p>
      {reasons.length > 0 ? (
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-4">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
