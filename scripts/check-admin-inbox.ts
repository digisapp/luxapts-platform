// Prints whether /admin/email can receive mail right now (same check as
// GET /api/admin/inbox/status), read-only against Resend. Run with:
//   npx tsx scripts/check-admin-inbox.ts
// Loads .env.local before importing the email modules.
import { readFileSync } from "fs";
import { resolve } from "path";

const envContent = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^=#]+)=(.*)$/);
  if (m && !process.env[m[1].trim()]) {
    process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const { getInboxStatus } = await import("@/lib/email/inbox-status");
  const s = await getInboxStatus({ fresh: true });
  console.log(`Inbox address : ${s.inboundAddress}`);
  console.log(`Replies from  : ${s.from}`);
  console.log(
    `Domain        : ${s.inboundDomain} → ${s.domain.found ? `${s.domain.status}, receiving ${s.domain.receiving}` : "NOT IN RESEND"}`
  );
  for (const r of s.domain.records) {
    console.log(`  ${r.status.padEnd(9)} ${r.record.padEnd(9)} ${r.type.padEnd(5)} ${r.host.padEnd(28)} ${r.priority ?? ""} ${r.value.slice(0, 60)}`);
  }
  console.log(
    `Webhook       : ${s.webhook.endpoint ?? "none"} (${s.webhook.status ?? "-"}; canonical=${s.webhook.canonical}; received=${s.webhook.hasReceivedEvent})`
  );
  console.log(`Env           : apiKey=${s.env.resendApiKey} webhookSecret=${s.env.webhookSecret} xai=${s.env.xaiApiKey}`);
  console.log(`READY         : ${s.ready}`);
  if (s.problems.length) {
    console.log("Problems:");
    s.problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
