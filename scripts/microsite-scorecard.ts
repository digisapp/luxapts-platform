// Per-microsite scorecard: what each building page is actually producing.
//
//   npx tsx scripts/microsite-scorecard.ts                 # last 30 days
//   npx tsx scripts/microsite-scorecard.ts --days 14
//   npx tsx scripts/microsite-scorecard.ts --save          # also write microsites/_metrics/<today>-<days>d.json
//   npx tsx scripts/microsite-scorecard.ts --compare microsites/_metrics/2026-10-13-30d.json
//
// "visitors" on these domains is mostly scanners (see migration 027), so the
// columns that matter are search (arrived from a search engine), engaged
// (scrolled half the page, stayed 10s+, clicked a CTA, started the form or used
// Stacy), form starts and leads. "worked" is leads that got past "new".
// Google impressions and clicks are not here: they only exist in Search Console.
// Read-only.

import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

try {
  const envFile = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
  for (const line of envFile.split("\n")) {
    const [key, ...valueParts] = line.split("=");
    if (key && valueParts.length && !process.env[key.trim()]) {
      process.env[key.trim()] = valueParts.join("=").trim().replace(/^"|"$/g, "");
    }
  }
} catch {
  console.log("Could not load .env.local");
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const days = Number(arg("--days") ?? 30);
const save = process.argv.includes("--save");
const compareFile = arg("--compare");

type Row = {
  domain: string;
  search: number;
  engaged: number;
  formStarts: number;
  leads: number;
  worked: number;
  statuses: Record<string, number>;
};

async function main() {
  const { data: stats, error } = await supabase.rpc("get_microsite_stats", { days_back: days });
  if (error) throw error;

  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data: leads, error: leadErr } = await supabase
    .from("leads")
    .select("source_detail, status")
    .eq("source", "microsite")
    .gte("created_at", since);
  if (leadErr) throw leadErr;

  const statusesBy = new Map<string, Record<string, number>>();
  for (const l of leads ?? []) {
    if (!l.source_detail) continue;
    const s = statusesBy.get(l.source_detail) ?? {};
    s[l.status] = (s[l.status] ?? 0) + 1;
    statusesBy.set(l.source_detail, s);
  }

  const rows: Row[] = (stats ?? [])
    .filter((r: { domain: string }) => /\.com$/.test(r.domain))
    .map((r: { domain: string; search_visitors: number; engaged: number; form_starts: number; leads: number }) => {
      const statuses = statusesBy.get(r.domain) ?? {};
      const worked = Object.entries(statuses)
        .filter(([s]) => s !== "new")
        .reduce((n, [, c]) => n + c, 0);
      return {
        domain: r.domain,
        search: Number(r.search_visitors),
        engaged: Number(r.engaged),
        formStarts: Number(r.form_starts),
        leads: Number(r.leads),
        worked,
        statuses,
      };
    })
    .sort((a: Row, b: Row) => b.search - a.search || b.engaged - a.engaged);

  const before = compareFile ? (JSON.parse(readFileSync(compareFile, "utf8")) as { rows: Row[]; date: string }) : null;
  const prev = new Map((before?.rows ?? []).map((r) => [r.domain, r]));
  const delta = (now: number, was: number | undefined) =>
    before ? `${now}${was === undefined ? " (new)" : now === was ? "" : ` (${now > was ? "+" : ""}${now - was})`}` : String(now);

  console.log(`Microsite scorecard — last ${days} days, ${new Date().toISOString().slice(0, 10)}` +
    (before ? ` · compared with ${before.date}` : ""));
  console.log("");
  const head = ["domain", "search", "engaged", "form starts", "leads", "worked", "conv"];
  const lines = rows.map((r) => {
    const p = prev.get(r.domain);
    return [
      r.domain,
      delta(r.search, p?.search),
      delta(r.engaged, p?.engaged),
      delta(r.formStarts, p?.formStarts),
      delta(r.leads, p?.leads),
      delta(r.worked, p?.worked),
      r.engaged ? `${Math.round((r.leads / r.engaged) * 100)}%` : "—",
    ];
  });
  const widths = head.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
  const fmt = (cells: string[]) => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join("  ");
  console.log(fmt(head));
  for (const l of lines) console.log(fmt(l));

  const total = (k: keyof Omit<Row, "domain" | "statuses">) => rows.reduce((n, r) => n + (r[k] as number), 0);
  console.log("");
  console.log(`Totals: ${total("search")} search · ${total("engaged")} engaged · ${total("formStarts")} form starts · ` +
    `${total("leads")} leads · ${total("worked")} worked past "new"`);
  console.log(`conv = leads / engaged. Google impressions and clicks live in Search Console, per property.`);

  if (save) {
    const dir = join(process.cwd(), "microsites", "_metrics");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const file = join(dir, `${date}-${days}d.json`);
    writeFileSync(file, JSON.stringify({ date, days, rows }, null, 2) + "\n");
    console.log(`\nSaved ${file}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
