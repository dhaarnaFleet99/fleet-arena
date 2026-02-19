#!/usr/bin/env node
// Fleet Arena — Clear All Data
// Usage: node scripts/clear-data.mjs
//
// Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Run from repo root: node scripts/clear-data.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local
try {
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  }
} catch {}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

const tables = [
  "behavioral_flags",
  "rankings",
  "responses",
  "turns",
  "sessions",
];

console.log("Clearing all arena data...\n");

for (const table of tables) {
  const { error, count } = await supabase
    .from(table)
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000") // delete all rows
    .select("*", { count: "exact", head: true });

  if (error) {
    console.error(`  ✗ ${table}: ${error.message}`);
  } else {
    console.log(`  ✓ ${table} cleared`);
  }
}

// Reset profile counters (keep accounts)
const { error: profileErr } = await supabase
  .from("profiles")
  .update({ total_sessions: 0, total_rankings: 0 })
  .neq("id", "00000000-0000-0000-0000-000000000000");

if (profileErr) {
  console.error(`  ✗ profiles reset: ${profileErr.message}`);
} else {
  console.log(`  ✓ profiles: counters reset (accounts kept)`);
}

console.log("\nDone.");
