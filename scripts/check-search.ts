// Run with: npm run check-search
// Calls public.search_catalog directly with the anon key (never the service role),
// prints PASS/FAIL and the actual top 3 for each case, and exits 1 on any FAIL.
// Needs supabase/migrations/0005_search.sql applied.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import type { SearchResult } from "../types/movie";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing from .env.local");
  process.exit(1);
}

const supabase = createClient<Database>(url, anonKey);

/** A failure reason, or null when the results are acceptable. */
type Check = (rows: SearchResult[]) => string | null;

type Case = { name: string; q: string; check: Check };

const topIs =
  (title: string): Check =>
  (rows) =>
    rows[0]?.title === title ? null : `expected #1 to be "${title}"`;

const topMatches =
  (pattern: RegExp, description: string): Check =>
  (rows) =>
    rows[0] && pattern.test(rows[0].title) ? null : `expected #1 to be ${description}`;

/**
 * At least 3 results, and the first 3 are all hits naming `person` as a
 * director or cast member (kinds in `kinds`), with at least one `kind` hit.
 * Someone who both directs and acts (Tom Hanks) can legitimately have a
 * director hit ahead of his cast hits, since tier 4 outranks tier 5.
 */
const topThreeAre =
  (kind: "director" | "cast", person: string, kinds: ReadonlyArray<string> = [kind]): Check =>
  (rows) => {
    if (rows.length < 3) return `expected at least 3 results, got ${rows.length}`;
    const top = rows.slice(0, 3);
    const bad = top.find(
      (row) => !kinds.includes(row.match_kind) || !row.match_person?.includes(person),
    );
    if (bad) {
      const who = bad.match_person ? ` (${bad.match_person})` : "";
      return `"${bad.title}" is ${bad.match_kind}${who}, expected ${kinds.join("/")} "${person}"`;
    }
    return top.some((row) => row.match_kind === kind) ? null : `expected a ${kind} hit in the top 3`;
  };

const cases: Case[] = [
  { name: "up", q: "up", check: topIs("Up") },
  { name: "us", q: "us", check: topIs("Us") },
  { name: "her", q: "her", check: topIs("Her") },
  { name: "it", q: "it", check: topIs("It") },
  { name: "amelie (accent-insensitive)", q: "amelie", check: topIs("Amélie") },
  { name: "tar (accent-insensitive)", q: "tar", check: topIs("TÁR") },
  {
    name: "spider man (punctuation-insensitive)",
    q: "spider man",
    check: (rows) =>
      topMatches(/^spider-man/i, 'a "Spider-Man" title')(rows) ??
      (rows[0].match_kind === "title" ? null : "expected a title match"),
  },
  { name: "the godfather", q: "the godfather", check: topIs("The Godfather") },
  { name: "nolan (director)", q: "nolan", check: topThreeAre("director", "Nolan") },
  { name: "tom hanks (cast)", q: "tom hanks", check: topThreeAre("cast", "Tom Hanks", ["director", "cast"]) },
  {
    name: "interstelar (typo, fuzzy)",
    q: "interstelar",
    check: (rows) =>
      topIs("Interstellar")(rows) ??
      (rows[0].match_kind === "fuzzy" ? null : `expected match_kind fuzzy, got ${rows[0].match_kind}`),
  },
  {
    name: "up (no mid-word matches)",
    q: "up",
    check: (rows) => {
      // Every hit must be explained by something other than a mid-word title match:
      // a word-start in the title, or a director/cast hit.
      const bad = rows.find(
        (row) => row.match_kind === "title" && !/(^|[^a-z0-9])up/i.test(row.title.normalize("NFKD")),
      );
      return bad ? `"${bad.title}" only matches mid-word` : null;
    },
  },
];

function describe(row: SearchResult): string {
  const hint = row.match_person ? `: ${row.match_person}` : "";
  return `${row.title} (${row.release_year ?? "n/a"}) [${row.match_kind}${hint}]`;
}

async function main(): Promise<number> {
  let failures = 0;
  for (const { name, q, check } of cases) {
    const { data, error } = await supabase.rpc("search_catalog", { q, genre: null, max_results: 40 });
    if (error) {
      failures++;
      console.log(`FAIL  ${name}  q="${q}"\n      rpc error: ${error.message}`);
      continue;
    }
    const rows = data ?? [];
    const reason = check(rows);
    if (reason) failures++;
    console.log(`${reason ? "FAIL" : "PASS"}  ${name}  q="${q}"${reason ? `\n      ${reason}` : ""}`);
    if (rows.length === 0) console.log("      (no results)");
    rows.slice(0, 3).forEach((row, index) => console.log(`      ${index + 1}. ${describe(row)}`));
  }

  console.log(`\n${cases.length - failures}/${cases.length} passed`);
  return failures;
}

main().then((failures) => process.exit(failures > 0 ? 1 : 0));
