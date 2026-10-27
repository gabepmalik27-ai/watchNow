// Run with: npm run measure
// Read-only. Asks TMDB discover how many movies each seed bucket would hold at
// several vote floors (using total_results), so the seed floors and quotas can
// be chosen from numbers. Never writes anything.
//
// Two TMDB quirks shape this script:
// - total_results tops out at 20,001. A cell at the ceiling is split by
//   release-date range and the halves are summed, so every count is exact.
// - discover ignores without_original_language, but with_original_language
//   accepts a pipe-separated OR list. non-English is every TMDB language
//   except "en", OR-ed together.

import { nonEnglishFilter, tmdb } from "@/lib/tmdb-ingest";

if (!process.env.TMDB_READ_TOKEN) {
  console.error("Missing env var: TMDB_READ_TOKEN (set it in .env.local)");
  process.exit(1);
}

const FLOORS = [200, 100, 50] as const;
const RECENT_MONTHS = 18;
const BASE_FLOOR = 200;
const NICHE_FLOOR = 50;
const QUOTA_WARNING = 4000; // Step 3 caps any bucket above this
const DISCOVER_RESULT_CAP = 500 * 20; // 500 pages × 20 results: the most one discover query can return
const TOTAL_RESULTS_CEILING = 20_000; // TMDB reports 20,001 for anything at or past this
const EARLIEST_RELEASE = "1870-01-01";

type DiscoverCount = { total_results: number };

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const today = new Date();
const recentStart = new Date(today);
recentStart.setMonth(recentStart.getMonth() - RECENT_MONTHS);

type Row = { label: string; filter: Record<string, string> };

const rows = (nonEnglish: Record<string, string>): Row[] => [
  { label: "all", filter: {} },
  { label: "Documentary", filter: { with_genres: "99" } },
  { label: "Animation", filter: { with_genres: "16" } },
  { label: "English", filter: { with_original_language: "en" } },
  { label: "non-English", filter: nonEnglish },
  {
    label: `Recent (${RECENT_MONTHS} mo)`,
    filter: {
      "primary_release_date.gte": isoDate(recentStart),
      "primary_release_date.lte": isoDate(today),
    },
  },
];

async function totalResults(params: Record<string, string>): Promise<number> {
  const result = await tmdb<DiscoverCount>("/discover/movie", {
    include_adult: "false",
    page: "1",
    ...params,
  });
  return result.total_results;
}

const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
};

/**
 * Exact count for one cell. A count at the ceiling is split into two release
 * date ranges and summed. Movies with no release date are only counted when
 * the first, unsplit request is under the ceiling (they're a handful).
 */
async function count(filter: Record<string, string>, floor: number): Promise<number> {
  const params = { ...filter, "vote_count.gte": String(floor) };
  const whole = await totalResults(params);
  if (whole < TOTAL_RESULTS_CEILING) return whole;

  const latest = addDays(isoDate(today), 365 * 3);
  async function inRange(from: string, to: string): Promise<number> {
    const value = await totalResults({
      ...params,
      // A filter's own date window (Recent) narrows the split range.
      "primary_release_date.gte": from,
      "primary_release_date.lte": to,
    });
    if (value < TOTAL_RESULTS_CEILING || from === to) return value;
    const fromMs = Date.parse(from);
    const mid = isoDate(new Date(fromMs + Math.floor((Date.parse(to) - fromMs) / 2)));
    const [left, right] = await Promise.all([inRange(from, mid), inRange(addDays(mid, 1), to)]);
    return left + right;
  }
  return inRange(filter["primary_release_date.gte"] ?? EARLIEST_RELEASE, filter["primary_release_date.lte"] ?? latest);
}

async function main() {
  const ROWS = rows(await nonEnglishFilter());
  const counts = new Map<string, number>();
  const key = (label: string, floor: number) => `${label}@${floor}`;

  await Promise.all(
    ROWS.flatMap(({ label, filter }) =>
      FLOORS.map(async (floor) => counts.set(key(label, floor), await count(filter, floor))),
    ),
  );

  const labelWidth = Math.max(...ROWS.map((row) => row.label.length));
  const cell = (value: string) => value.padStart(9);
  console.log(`TMDB discover counts, include_adult=false (as of ${isoDate(today)})`);
  console.log(`Recent = primary release ${isoDate(recentStart)} to ${isoDate(today)}\n`);
  console.log(`${"".padEnd(labelWidth)}${FLOORS.map((floor) => cell(`≥${floor}`)).join("")}`);
  for (const { label } of ROWS) {
    const values = FLOORS.map((floor) => counts.get(key(label, floor))!);
    console.log(`${label.padEnd(labelWidth)}${values.map((value) => cell(value.toLocaleString("en-US"))).join("")}`);
  }

  // Cross-check: all − English should be close to the direct non-English count
  // (it differs only by movies with no original_language).
  const gaps = FLOORS.map((floor) => {
    const derived = counts.get(key("all", floor))! - counts.get(key("English", floor))!;
    return `≥${floor}: ${derived.toLocaleString("en-US")}`;
  });
  console.log(`\nCheck, all − English: ${gaps.join(", ")}`);

  const niches = ROWS.filter((row) => row.label !== "all" && row.label !== "English");
  const base = counts.get(key("all", BASE_FLOOR))!;
  const nicheCounts = niches.map(({ label }) => ({ label, value: counts.get(key(label, NICHE_FLOOR))! }));
  const projected = base + nicheCounts.reduce((sum, { value }) => sum + value, 0);

  console.log(`\nPlan: base ≥${BASE_FLOOR} ∪ each niche ≥${NICHE_FLOOR} (before dedupe)`);
  console.log(`  base (all ≥${BASE_FLOOR}): ${base.toLocaleString("en-US")}`);
  for (const { label, value } of nicheCounts) {
    const flags = [
      value > QUOTA_WARNING ? `over ${QUOTA_WARNING.toLocaleString("en-US")}: needs a quota` : null,
      value > DISCOVER_RESULT_CAP ? `over the ${DISCOVER_RESULT_CAP.toLocaleString("en-US")} discover cap` : null,
    ].filter(Boolean);
    console.log(`  + ${label} ≥${NICHE_FLOOR}: ${value.toLocaleString("en-US")}${flags.length ? `  (${flags.join("; ")})` : ""}`);
  }
  console.log(`  = projected total before dedupe: ${projected.toLocaleString("en-US")}`);
  for (const { label } of ROWS) {
    const floor = label === "all" ? BASE_FLOOR : NICHE_FLOOR;
    const value = counts.get(key(label, floor))!;
    if (label !== "English" && value > DISCOVER_RESULT_CAP) {
      console.log(
        `  note: ${label} ≥${floor} (${value.toLocaleString("en-US")}) is past the ${DISCOVER_RESULT_CAP.toLocaleString("en-US")}-result paging cap; the seed must page it in date slices`,
      );
    }
  }
}

main().catch((error: unknown) => {
  console.error(`Measure failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
});
