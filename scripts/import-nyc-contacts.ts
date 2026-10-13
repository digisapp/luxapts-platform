/**
 * Imports a Follow Up Boss export (People → Export, All Columns) into the NYC
 * contacts book (/admin/nyc). Same mapping, matching and history parsing as
 * the importer page at /admin/nyc/import; this is for files too big to sit
 * in a browser tab comfortably, and for the first 36k-row load.
 *
 *   npx tsx --env-file=.env.local scripts/import-nyc-contacts.ts "<file.csv>"           # dry run: counts only, writes nothing
 *   npx tsx --env-file=.env.local scripts/import-nyc-contacts.ts "<file.csv>" --apply   # write
 *
 * Options: --limit N (first N rows), --batch-size N (default 250).
 *
 * Safe to rerun: rows match by Follow Up Boss ID (then email/phone), merges
 * never overwrite what is already in the book, and history entries are keyed
 * so nothing is added twice.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseCsv } from "@/lib/crm/csv";
import { agentKeysFrom, FIELD_LABELS, guessMapping, rowToContact, type ImportContact } from "@/lib/crm/import-map";
import { importContacts } from "@/lib/crm/service";
import { isRelayEmail } from "@/lib/crm/normalize";
import { createAdminClient } from "@/lib/supabase/server";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const apply = args.includes("--apply");
const option = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const limit = option("limit", Infinity);
const batchSize = option("batch-size", 250);

async function main() {
  if (!file) throw new Error('Usage: import-nyc-contacts.ts "<file.csv>" [--apply]');
  const started = Date.now();
  const [headers, ...rows] = parseCsv(readFileSync(file, "utf8"));
  const mapping = guessMapping(headers);
  const agents = agentKeysFrom(rows, mapping);

  console.log(`${rows.length} rows, ${headers.length} columns`);
  for (const [field, cols] of Object.entries(mapping.fields)) {
    console.log(`  ${FIELD_LABELS[field as keyof typeof FIELD_LABELS].padEnd(18)} ← ${cols.map((c) => headers[c]).join(", ")}`);
  }
  console.log(`  kept as extra fields: ${mapping.extra.length} columns`);

  const contacts: ImportContact[] = [];
  let skipped = 0;
  for (const row of rows.slice(0, limit)) {
    const c = rowToContact(row, mapping, agents);
    if (c) contacts.push(c);
    else skipped++;
  }

  const kinds = new Map<string, number>();
  for (const c of contacts) for (const a of c.activities) kinds.set(a.kind, (kinds.get(a.kind) ?? 0) + 1);
  const count = (pred: (c: ImportContact) => boolean) => contacts.filter(pred).length;
  console.log(`\n${contacts.length} contacts, ${skipped} rows skipped (no name, email or phone)`);
  console.log(
    `  with phone ${count((c) => c.phones.length > 0)}, with a real email ${count((c) => c.emails.some((e) => !isRelayEmail(e)))}, relay email only ${count((c) => c.emails.length > 0 && c.emails.every(isRelayEmail))}`
  );
  console.log(`  with a neighborhood ${count((c) => !!c.neighborhood)}, with a price ${count((c) => c.price !== null)}`);
  console.log(`  contacted ${count((c) => c.contacted)}, replied before ${count((c) => !!c.last_inbound_at)}`);
  console.log(`  Florida inquiries ${count((c) => c.tags.includes("Florida inquiry"))}`);
  console.log(`  history: ${Array.from(kinds, ([k, n]) => `${n} ${k}`).join(", ")}`);

  if (!apply) {
    console.log("\nDry run. Nothing written. Add --apply to import.");
    return;
  }

  const supabase = createAdminClient();
  const batch = `${basename(file)} ${new Date().toISOString().slice(0, 10)}`;
  const totals = { created: 0, merged: 0, activities: 0 };
  for (let i = 0; i < contacts.length; i += batchSize) {
    const result = await importContacts(supabase, contacts.slice(i, i + batchSize), batch);
    totals.created += result.created;
    totals.merged += result.merged;
    totals.activities += result.activities;
    process.stdout.write(`\r  ${Math.min(i + batchSize, contacts.length)} / ${contacts.length}`);
  }
  console.log(
    `\nDone in ${Math.round((Date.now() - started) / 1000)}s: ${totals.created} created, ${totals.merged} merged into existing, ${totals.activities} history entries written or already there.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
