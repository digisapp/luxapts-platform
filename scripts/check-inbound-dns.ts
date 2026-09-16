/**
 * Lead replies are dead until inbound.staycio.com can receive mail.
 *
 * Prints the exact GoDaddy records, checks whether each is live, and asks
 * Resend to re-verify once they are. Run it after adding the records:
 *
 *   npx tsx scripts/check-inbound-dns.ts
 */
import { promises as dns } from "node:dns";

const DOMAIN_ID = "cce6354b-d86c-4cf6-a293-4ca9612868e9";
const APEX = "staycio.com";

type Rec = { kind: "MX" | "TXT" | "CNAME"; host: string; value: string; why: string };

// `host` is what GoDaddy wants typed — relative to staycio.com, not an FQDN.
// That relative-vs-absolute distinction is the usual reason these fail.
const RECORDS: Rec[] = [
  { kind: "MX", host: "inbound", value: "inbound-smtp.us-east-1.amazonaws.com", why: "receives the replies (priority 10)" },
  { kind: "TXT", host: "resend._domainkey.inbound", value: "<long p=... value from Resend>", why: "DKIM signing" },
  { kind: "MX", host: "send.inbound", value: "feedback-smtp.us-east-1.amazonses.com", why: "bounce feedback (priority 10)" },
  { kind: "TXT", host: "send.inbound", value: "v=spf1 include:amazonses.com ~all", why: "SPF" },
  { kind: "CNAME", host: "rsend.inbound", value: "send.forge.rmta.net", why: "tracking" },
];

async function live(r: Rec): Promise<boolean> {
  const fqdn = `${r.host}.${APEX}`;
  try {
    if (r.kind === "MX") return (await dns.resolveMx(fqdn)).length > 0;
    if (r.kind === "CNAME") return (await dns.resolveCname(fqdn)).length > 0;
    const txt = await dns.resolveTxt(fqdn);
    return txt.flat().join("").length > 0;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`\nRecords to add at GoDaddy (DNS for ${APEX}).`);
  console.log(`Type the Host column EXACTLY as shown — it is relative to ${APEX}.`);
  console.log(`Get the DKIM value from https://resend.com/domains/${DOMAIN_ID}\n`);

  let missing = 0;
  for (const r of RECORDS) {
    const ok = await live(r);
    if (!ok) missing++;
    console.log(`  ${ok ? "✓" : "·"} ${r.kind.padEnd(5)} ${r.host.padEnd(28)} ${r.value}`);
    console.log(`    ${r.why}${ok ? "" : "  — NOT FOUND"}`);
  }

  if (missing) {
    console.log(`\n${missing} of ${RECORDS.length} not live yet. GoDaddy can take up to an hour.\n`);
    return;
  }

  console.log("\nAll records are live. Asking Resend to verify…");
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log("RESEND_API_KEY not set — verify manually in the Resend dashboard.\n");
    return;
  }
  await fetch(`https://api.resend.com/domains/${DOMAIN_ID}/verify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
  });
  const res = await fetch(`https://api.resend.com/domains/${DOMAIN_ID}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const json = (await res.json()) as { status?: string };
  console.log(`Resend status: ${json.status}`);
  console.log(
    json.status === "verified"
      ? "Replies now land in the admin inbox at /admin/email.\n"
      : "Verification can lag DNS by a few minutes — re-run this shortly.\n"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
