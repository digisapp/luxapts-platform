// One-off: give staycio.com form leads created before migration 039 the
// referral source new leads get automatically.
//
// Those leads never stored their analytics session, so each is matched to the
// session that viewed its target building in the 15 minutes before the lead
// was created (the form is on that page). Written only when that is
// unambiguous: one session, or several that all came from the same source
// (then the most recent one, which is the one that submitted). Everything
// else is listed and left alone.
//
// Run with: npx tsx scripts/backfill-lead-referrals.ts [--apply]

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";
import { resolveReferral } from "../src/lib/analytics/referral";

const WINDOW_MS = 15 * 60_000;

async function main() {
  const apply = process.argv.includes("--apply");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, created_at, name, lead_targets(building_id, buildings:building_id(slug))")
    .eq("source", "web_form")
    .is("referral_source", null)
    .order("created_at");
  if (error) throw error;

  for (const lead of leads ?? []) {
    const target = (lead.lead_targets as { buildings: { slug: string | null } | null }[])?.[0];
    const slug = target?.buildings?.slug;
    const label = `${lead.created_at.slice(0, 16)} ${lead.name ?? "(no name)"}`;
    if (!slug) {
      console.log(`skip   ${label}: no target building`);
      continue;
    }

    const created = new Date(lead.created_at).getTime();
    const { data: views, error: vErr } = await supabase
      .from("page_views")
      .select("session_id, created_at")
      .like("path", `/buildings/${slug}%`)
      .is("source_domain", null)
      .gte("created_at", new Date(created - WINDOW_MS).toISOString())
      .lte("created_at", lead.created_at)
      .order("created_at", { ascending: false });
    if (vErr) throw vErr;

    // Most recent first
    const sessions = [...new Set((views ?? []).map((v) => v.session_id))];
    if (sessions.length === 0) {
      console.log(`skip   ${label}: no session on /buildings/${slug} in the window`);
      continue;
    }

    const referrals = await Promise.all(sessions.map((id) => resolveReferral(supabase, id)));
    const sources = new Set(referrals.map((r) => r?.source ?? "unknown"));
    const referral = referrals[0];
    if (sources.size !== 1 || !referral) {
      console.log(`skip   ${label}: ${sessions.length} sessions disagree (${[...sources].join(", ")})`);
      continue;
    }

    console.log(
      `${apply ? "write" : "would"}  ${label}: ${referral.source} (${referral.detail ?? "-"}) landing ${referral.landingPage} session ${sessions[0]}`
    );
    if (apply) {
      const { error: uErr } = await supabase
        .from("leads")
        .update({
          session_id: sessions[0],
          referral_source: referral.source,
          referral_detail: referral.detail,
          landing_page: referral.landingPage,
        })
        .eq("id", lead.id)
        .is("referral_source", null);
      if (uErr) throw uErr;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
