import type { CalibrationInfo, RankDiagnostics } from "@/lib/recommender";

type DiagnosticsPanelProps = {
  diagnostics: RankDiagnostics;
  calibration: CalibrationInfo | null;
};

const pct = (share: number | undefined) => `${Math.round((share ?? 0) * 100)}%`;

/**
 * ?debug=1: where the pool's candidates went (and why a list came back
 * short), plus the genre calibration: target p, the list's mix q before and
 * after re-ranking, and their L1 distances.
 */
export function DiagnosticsPanel({ diagnostics: d, calibration: c }: DiagnosticsPanelProps) {
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
      {c ? (
        <>
          <p className="mt-4 font-semibold text-text">
            Calibration · λ {c.lambda} · L1 {c.l1Before.toFixed(3)} → {c.l1After.toFixed(3)}
          </p>
          <table className="mt-2 w-full max-w-md text-left">
            <thead>
              <tr>
                <th className="font-semibold">Genre</th>
                <th className="font-semibold">Target p</th>
                <th className="font-semibold">Score order q</th>
                <th className="font-semibold">Final q</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(c.target)
                .filter(([genre, share]) => share > 0.02 || (c.after[genre] ?? 0) > 0 || (c.before[genre] ?? 0) > 0)
                .sort(([, a], [, b]) => b - a)
                .map(([genre, share]) => (
                  <tr key={genre}>
                    <td>{genre}</td>
                    <td>{pct(share)}</td>
                    <td>{pct(c.before[genre])}</td>
                    <td>{pct(c.after[genre])}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="mt-2">Calibration skipped (cold start or no watched genres).</p>
      )}
    </div>
  );
}
