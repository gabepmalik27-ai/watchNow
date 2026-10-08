// Run with: npm run check-env
// Prints only SET/MISSING, PASS/FAIL, and OK/FAIL + HTTP status. Never prints values.

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 6)) {
  console.error("Node 20.6 or newer is required for --env-file. Please upgrade Node.");
  process.exit(1);
}

type Check = { name: string; valid: (v: string) => boolean };

const checks: Check[] = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    valid: (v) => v.startsWith("https://") && v.endsWith(".supabase.co"),
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    valid: (v) => v.startsWith("sb_publishable_") || v.startsWith("eyJ"),
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    valid: (v) => v.startsWith("sb_secret_") || v.startsWith("eyJ"),
  },
  {
    name: "TMDB_READ_TOKEN",
    valid: (v) => v.startsWith("eyJ"),
  },
];

for (const { name, valid } of checks) {
  const value = process.env[name];
  const set = typeof value === "string" && value.length > 0;
  const format = set ? (valid(value) ? "PASS" : "FAIL") : "FAIL";
  console.log(`${name}: ${set ? "SET" : "MISSING"} | format ${format}`);
}

async function ping(label: string, url: string, headers: Record<string, string>) {
  try {
    const res = await fetch(url, { headers });
    console.log(`${label}: ${res.ok ? "OK" : "FAIL"} (HTTP ${res.status})`);
  } catch {
    console.log(`${label}: FAIL (no response)`);
  }
}

async function main() {
  const tmdb = process.env.TMDB_READ_TOKEN;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (tmdb) {
    await ping("TMDB connectivity", "https://api.themoviedb.org/3/configuration", {
      Authorization: `Bearer ${tmdb}`,
    });
  } else {
    console.log("TMDB connectivity: FAIL (token missing)");
  }

  if (supaUrl && anon) {
    await ping("Supabase connectivity", `${supaUrl}/auth/v1/health`, { apikey: anon });
  } else {
    console.log("Supabase connectivity: FAIL (url or anon key missing)");
  }
}

main();
