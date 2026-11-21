#!/usr/bin/env node
// Turns a Homeday backup (backup/backup.json from the "Weekly backup" job) into SQL that puts the rows
// back. Rows that still exist are left alone, so it's safe to run on a database that lost only some data.
//
//   node scripts/backup-to-sql.mjs backup/backup.json > restore.sql
//
// Then run restore.sql in the Supabase SQL editor (or with psql). Photos are restored separately:
// see docs/operations.md.
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

// Parents first, so foreign keys are satisfied. Tables with "generated always" ids need
// OVERRIDING SYSTEM VALUE to keep their original ids, and their counters moved past them.
const TABLES = [
  { name: "timelines", identity: false },
  { name: "guestbook", identity: true },
  { name: "orders", identity: true },
  { name: "reminders", identity: true },
];

export function backupToSql(backup) {
  if (!backup || backup.format !== 1 || typeof backup.tables !== "object") throw new Error("This isn't a Homeday backup (format 1).");
  const out = [`-- Homeday restore, from the backup taken ${backup.taken_at}`, "begin;"];
  for (const t of TABLES) {
    const rows = backup.tables[t.name] || [];
    if (!Array.isArray(rows)) throw new Error(`Table ${t.name} isn't a list.`);
    const json = JSON.stringify(rows);
    let tag;
    do tag = "hd" + randomBytes(6).toString("hex"); while (json.includes(`$${tag}$`));
    out.push(`-- ${t.name}: ${rows.length} row${rows.length === 1 ? "" : "s"}`);
    out.push(`insert into public.${t.name}${t.identity ? " overriding system value" : ""} select * from jsonb_populate_recordset(null::public.${t.name}, $${tag}$${json}$${tag}$::jsonb) on conflict do nothing;`);
    if (t.identity) out.push(`select setval(pg_get_serial_sequence('public.${t.name}', 'id'), coalesce((select max(id) from public.${t.name}), 0) + 1, false);`);
  }
  out.push("commit;", "");
  return out.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) { console.error("Usage: node scripts/backup-to-sql.mjs backup/backup.json > restore.sql"); process.exit(1); }
  process.stdout.write(backupToSql(JSON.parse(readFileSync(file, "utf8"))));
}
