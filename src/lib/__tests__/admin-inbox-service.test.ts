/**
 * Admin inbox service against a scripted Supabase double: threading of
 * inbound mail (plus-tag, In-Reply-To, subject), the FK-safe "first message
 * is its own thread" insert, spam handling before/after migration 029, and
 * the compose path's Resend contract (hello@ From, per-thread Reply-To,
 * threading headers, idempotency key).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const send = vi.fn();
const cancel = vi.fn();
vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({ emails: { send, cancel } }),
  getFromEmail: () => "Staycio <hello@staycio.com>",
}));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => { throw new Error("not used"); } }));

const { createAdminInboxService, _resetInboxSchemaCache, isLikelySpam, toListItem, toDetail, checkOutgoingAttachments, leadAlertReply } = await import("@/lib/email/admin-inbox");

const T = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Call = { table: string; op: string; args: unknown[]; filters: Array<[string, ...unknown[]]> };

/**
 * A tiny chainable PostgREST double. Each `from()` starts a call; terminal
 * awaits resolve with the next scripted result for that table/op. The call
 * log is inspected by the tests.
 */
function fakeSupabase(script: Array<{ table?: string; op?: string; result: unknown }>) {
  const calls: Call[] = [];
  const results = [...script];
  const next = (call: Call) => {
    const i = results.findIndex((r) => (!r.table || r.table === call.table) && (!r.op || r.op === call.op));
    if (i < 0) return { data: null, error: null, count: 0 };
    return results.splice(i, 1)[0].result;
  };
  const builder = (call: Call) => {
    const chain: Record<string, unknown> = {};
    const filterNames = ["eq", "neq", "in", "or", "is", "not", "gt", "ilike", "order", "range", "limit"];
    for (const f of filterNames) {
      chain[f] = (...args: unknown[]) => {
        call.filters.push([f, ...args]);
        return chain;
      };
    }
    for (const op of ["select", "insert", "update", "delete", "upsert"]) {
      chain[op] = (...args: unknown[]) => {
        if (call.op === "from") call.op = op;
        call.args.push(...args);
        return chain;
      };
    }
    chain.maybeSingle = () => Promise.resolve(next(call));
    chain.single = () => Promise.resolve(next(call));
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(next(call)).then(resolve, reject);
    return chain;
  };
  const client = {
    from: (table: string) => {
      const call: Call = { table, op: "from", args: [], filters: [] };
      calls.push(call);
      return builder(call);
    },
  };
  return { client: client as never, calls };
}

const spamProbeOk = { table: "emails", op: "select", result: { data: [], error: null } };
const spamProbeMissing = { table: "emails", op: "select", result: { data: null, error: { code: "42703", message: "column emails.is_spam does not exist" } } };
const insertOk = { table: "emails", op: "insert", result: { data: { id: "stored" }, error: null } };

describe("isLikelySpam", () => {
  it("needs two patterns, a spam TLD or a link farm", () => {
    expect(isLikelySpam({ from: "a@b.com", subject: "Tour this weekend?", text: "Is the 2BR still available?" })).toBe(false);
    expect(isLikelySpam({ from: "a@b.com", subject: "viagra", text: "free money by wire transfer" })).toBe(true);
    expect(isLikelySpam({ from: "a@b.com", subject: "viagra", text: "casino" })).toBe(false); // one pattern group only
    expect(isLikelySpam({ from: "a@scam.xyz", subject: "hi", text: "hi" })).toBe(true);
    expect(isLikelySpam({ from: "a@b.com", subject: "links", text: Array(12).fill("http://x.y").join(" ") })).toBe(true);
  });
});

describe("storeInboundEmail", () => {
  beforeEach(() => {
    _resetInboxSchemaCache();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("threads by the plus-address tag when that thread exists", async () => {
    const { client, calls } = fakeSupabase([
      { table: "emails", op: "select", result: { data: null } }, // message-id dedupe
      { table: "emails", op: "select", result: { data: null } }, // resend-id dedupe
      spamProbeOk,
      { table: "emails", op: "select", result: { data: [{ id: T, thread_id: T, lead_id: "lead-1" }] } }, // tag lookup
      { table: "emails", op: "select", result: { data: [{ direction: "outbound", from_email: "hello@staycio.com", to_email: "Jane@Example.com" }] } }, // who the thread is with
      insertOk,
    ]);
    const svc = createAdminInboxService(client);
    await svc.storeInboundEmail({
      from: "jane@example.com",
      to: `replies+${T}@inbound.staycio.com`,
      subject: "Re: Tour",
      text: "Yes please",
      messageId: "<m1@x>",
      resendEmailId: "r1",
      threadIdHint: T,
    });
    const insert = calls.find((c) => c.op === "insert")!;
    const row = insert.args[0] as Record<string, unknown>;
    expect(row.thread_id).toBe(T);
    expect(row.lead_id).toBe("lead-1");
    expect(row.direction).toBe("inbound");
    expect(row.is_spam).toBe(false);
    expect(row.headers).toEqual({ "message-id": "<m1@x>", "in-reply-to": null, references: null });
    // No lead lookup when the thread already carries one.
    expect(calls.some((c) => c.table === "leads")).toBe(false);
  });

  it("never lets a stranger join a thread, even with its real plus tag and Message-ID", async () => {
    const { client, calls } = fakeSupabase([
      { table: "emails", op: "select", result: { data: null } },
      { table: "emails", op: "select", result: { data: null } },
      spamProbeOk,
      { table: "emails", op: "select", result: { data: [{ id: T, thread_id: T, lead_id: "lead-1" }] } }, // tag lookup
      { table: "emails", op: "select", result: { data: [{ direction: "outbound", from_email: "hello@staycio.com", to_email: "jane@example.com" }] } }, // thread is with jane
      { table: "emails", op: "select", result: { data: [{ id: T, thread_id: T, lead_id: "lead-1" }] } }, // in-reply-to lookup
      { table: "emails", op: "select", result: { data: [{ direction: "outbound", from_email: "hello@staycio.com", to_email: "jane@example.com" }] } }, // still jane
      { table: "emails", op: "select", result: { data: [] } }, // subject fallback: miss
      insertOk,
    ]);
    const svc = createAdminInboxService(client);
    await svc.storeInboundEmail({
      from: "stranger@evil.test",
      to: `replies+${T}@inbound.staycio.com`,
      subject: "Re: Tour",
      text: "quoting jane's message id",
      messageId: "<m9@x>",
      resendEmailId: "r9",
      inReplyToHeader: "<m1@x>",
      threadIdHint: T,
    });
    const row = calls.find((c) => c.op === "insert")!.args[0] as Record<string, unknown>;
    expect(row.thread_id).toBe(row.id); // its own thread
    expect(row.lead_id).toBeNull(); // not jane's lead
  });

  it("falls back to In-Reply-To, then to subject + counterpart, else opens its own thread", async () => {
    const { client, calls } = fakeSupabase([
      { table: "emails", op: "select", result: { data: null } },
      { table: "emails", op: "select", result: { data: null } },
      spamProbeOk,
      { table: "emails", op: "select", result: { data: [] } }, // in-reply-to: miss
      { table: "emails", op: "select", result: { data: [] } }, // subject: miss
      { table: "leads", op: "select", result: { data: { id: "lead-9" } } },
      insertOk,
    ]);
    const svc = createAdminInboxService(client);
    await svc.storeInboundEmail({
      from: "jane@example.com",
      to: "replies@inbound.staycio.com",
      subject: "Re: Pricing",
      text: "x",
      messageId: "<m2@x>",
      inReplyToHeader: "<unknown@x>",
    });
    const selects = calls.filter((c) => c.table === "emails" && c.op === "select");
    // [0] message-id dedupe, [1] spam probe, [2] in-reply-to, [3] subject fallback
    expect(selects[2].filters).toContainEqual(["eq", "headers->>message-id", "<unknown@x>"]);
    expect(selects[3].filters).toContainEqual(["eq", "subject", "Pricing"]);
    const row = calls.find((c) => c.op === "insert")!.args[0] as Record<string, unknown>;
    expect(row.id).toMatch(UUID_RE);
    expect(row.thread_id).toBe(row.id); // first message is its own thread (FK-safe)
    expect(row.lead_id).toBe("lead-9");
  });

  it("skips a duplicate delivery (same Message-ID)", async () => {
    const { client, calls } = fakeSupabase([{ table: "emails", op: "select", result: { data: { id: "dup" } } }]);
    const svc = createAdminInboxService(client);
    const stored = await svc.storeInboundEmail({ from: "a@b.com", to: "replies@inbound.staycio.com", subject: "s", messageId: "<dup@x>" });
    expect(stored).toBeNull();
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("treats a lost insert race (unique inbound resend id, 23505) as a duplicate, not a failure", async () => {
    const { client } = fakeSupabase([
      { table: "emails", op: "select", result: { data: null } }, // message-id dedupe
      { table: "emails", op: "select", result: { data: null } }, // resend-id dedupe
      spamProbeOk,
      { table: "emails", op: "insert", result: { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } } },
    ]);
    const svc = createAdminInboxService(client);
    await expect(
      svc.storeInboundEmail({ from: "a@b.com", to: "replies@inbound.staycio.com", subject: "s", messageId: "<m@x>", resendEmailId: "rcv_1" }),
    ).resolves.toBeNull();
  });

  it("stores spam into the Spam folder after migration 029, drops it before", async () => {
    const spam = { from: "x@scam.xyz", to: "replies@inbound.staycio.com", subject: "s", text: "t", messageId: "<s@x>" };

    const after = fakeSupabase([
      { table: "emails", op: "select", result: { data: null } },
      spamProbeOk,
      { table: "emails", op: "select", result: { data: [] } },
      { table: "leads", op: "select", result: { data: null } },
      insertOk,
    ]);
    await createAdminInboxService(after.client).storeInboundEmail(spam);
    expect((after.calls.find((c) => c.op === "insert")!.args[0] as Record<string, unknown>).is_spam).toBe(true);

    _resetInboxSchemaCache();
    const before = fakeSupabase([{ table: "emails", op: "select", result: { data: null } }, spamProbeMissing]);
    expect(await createAdminInboxService(before.client).storeInboundEmail(spam)).toBeNull();
    expect(before.calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("sanitizes the HTML body before storing", async () => {
    const { client, calls } = fakeSupabase([
      { table: "emails", op: "select", result: { data: null } },
      spamProbeOk,
      { table: "leads", op: "select", result: { data: null } },
      insertOk,
    ]);
    await createAdminInboxService(client).storeInboundEmail({
      from: "a@b.com",
      to: "replies@inbound.staycio.com",
      subject: "hi",
      html: '<p onclick="x()">Hello</p><script>alert(1)</script>',
      messageId: "<h@x>",
    });
    const row = calls.find((c) => c.op === "insert")!.args[0] as Record<string, unknown>;
    expect(row.body_html).toBe("<p>Hello</p>");
  });
});

describe("sendNewEmail", () => {
  beforeEach(() => {
    _resetInboxSchemaCache();
    send.mockReset();
    send.mockResolvedValue({ data: { id: "em_1" }, error: null });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("validates the recipient and subject without sending", async () => {
    const svc = createAdminInboxService(fakeSupabase([]).client);
    expect(await svc.sendNewEmail({ to: "nope", subject: "s", bodyHtml: "<p>x</p>", bodyText: "x" })).toMatchObject({ success: false, status: 400 });
    expect(await svc.sendNewEmail({ to: "a@b.co", subject: "  ", bodyHtml: "<p>x</p>", bodyText: "x" })).toMatchObject({ success: false, status: 400 });
    expect(send).not.toHaveBeenCalled();
  });

  it("opens a new thread: hello@ From, replies+<id> Reply-To, plain shell, idempotency key, self thread id", async () => {
    const { client, calls } = fakeSupabase([{ table: "leads", op: "select", result: { data: null } }, insertOk]);
    const r = await createAdminInboxService(client).sendNewEmail({
      to: "Renter@Example.com",
      subject: "Your tour",
      bodyHtml: "<p>See you Friday</p>",
      bodyText: "See you Friday",
      sentBy: "admin-1",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.threadId).toBe(r.id);
    const [payload, options] = send.mock.calls[0];
    expect(payload.from).toBe("Staycio <hello@staycio.com>");
    expect(payload.to).toEqual(["renter@example.com"]);
    expect(payload.replyTo).toBe(`replies+${r.threadId}@inbound.staycio.com`);
    expect(payload.html).toContain("<p>See you Friday</p>");
    // The shell is plain on purpose: no header, footer or brand strip.
    expect(payload.html).not.toMatch(/Staycio|<table|<img/);
    expect(payload.html).toContain('background:#ffffff');
    expect(payload.text).toBe("See you Friday");
    expect(payload).not.toHaveProperty("headers");
    expect(options).toEqual({ idempotencyKey: `admin-inbox-${r.id}` });
    const row = calls.find((c) => c.op === "insert")!.args[0] as Record<string, unknown>;
    expect(row).toMatchObject({ id: r.id, thread_id: r.id, direction: "outbound", status: "sent", resend_message_id: "em_1", sent_by: "admin-1", body_html: "<p>See you Friday</p>" });
  });

  it("answers a microsite lead as the building, with the caller's lead id and extra headers", async () => {
    const { client, calls } = fakeSupabase([
      { table: "leads", op: "select", result: { data: { source_detail: "downtown6miami.com" } } },
      insertOk,
    ]);
    const r = await createAdminInboxService(client).sendNewEmail({
      to: "renter@example.com",
      subject: "Downtown 6 Miami — 1 Bedroom Availability",
      bodyHtml: "<p>Hi Nathan,</p>",
      bodyText: "Hi Nathan,",
      leadId: "lead-1",
      extraHeaders: { "List-Unsubscribe": "<https://staycio.com/u>" },
    });
    expect(r.success).toBe(true);
    const [payload] = send.mock.calls.at(-1)!;
    expect(payload.from).toBe('"Downtown 6" <downtown6miami@staycio.com>');
    expect(payload.headers).toEqual({ "List-Unsubscribe": "<https://staycio.com/u>" });
    const row = calls.find((c) => c.op === "insert")!.args[0] as Record<string, unknown>;
    expect(row).toMatchObject({ from_email: "downtown6miami@staycio.com", from_name: "Downtown 6", lead_id: "lead-1" });
  });

  it("sends attachments to Resend, records them as sent, and (sent by an admin) moves a new lead to contacted", async () => {
    const { client, calls } = fakeSupabase([
      { table: "leads", op: "select", result: { data: { source_detail: "perrinbrickell.com" } } },
      insertOk,
    ]);
    const content = Buffer.from("%PDF-1.4 plan").toString("base64");
    const r = await createAdminInboxService(client).sendNewEmail({
      to: "jordan.reyes@example.com",
      subject: "Re: The Perrin Miami — 2 Bedroom Availability",
      bodyHtml: "<p>Floor plans attached.</p>",
      bodyText: "Floor plans attached.",
      leadId: "77777777-7777-4777-8777-777777777777",
      attachments: [{ filename: "Plan B.pdf", contentType: "application/pdf", content }],
      sentBy: "admin-1",
    });
    expect(r.success).toBe(true);
    const [payload] = send.mock.calls.at(-1)!;
    expect(payload.attachments).toEqual([{ filename: "Plan B.pdf", content: Buffer.from(content, "base64"), contentType: "application/pdf" }]);
    const row = calls.find((c) => c.op === "insert")!.args[0] as Record<string, unknown>;
    expect((row.metadata as { attachments: unknown[] }).attachments).toEqual([
      { id: "sent-0", filename: "Plan B.pdf", contentType: "application/pdf", size: 13, sent: true },
    ]);
    // Their "New lead" alert stops counting as unread.
    const alertClear = calls.find((c) => c.table === "emails" && c.op === "update")!;
    expect(alertClear.args[0]).toMatchObject({ status: "read" });
    expect(alertClear.filters).toEqual(expect.arrayContaining([["in", "lead_id", ["77777777-7777-4777-8777-777777777777"]], ["eq", "metadata->>kind", "lead_alert"]]));
    const statusUpdate = calls.find((c) => c.table === "leads" && c.op === "update")!;
    expect(statusUpdate.args[0]).toEqual({ status: "contacted" });
    // Only a "new" lead moves; touring/applied/leased are left alone.
    expect(statusUpdate.filters).toEqual(expect.arrayContaining([["eq", "id", "77777777-7777-4777-8777-777777777777"], ["eq", "status", "new"]]));
  });

  it("replies inside the original's thread with In-Reply-To/References and marks it replied", async () => {
    const original = {
      id: "orig-1",
      thread_id: T,
      direction: "inbound",
      from_email: "jane@example.com",
      from_name: "Jane",
      to_email: "replies@inbound.staycio.com",
      lead_id: "lead-1",
      headers: { "message-id": "<m1@x>", references: "<m0@x>" },
      metadata: {},
    };
    const { client, calls } = fakeSupabase([
      { table: "emails", op: "select", result: { data: original } },
      insertOk,
      { table: "emails", op: "update", result: { error: null } },
    ]);
    const r = await createAdminInboxService(client).sendNewEmail({
      to: "jane@example.com",
      subject: "Re: Tour",
      bodyHtml: "<p>Sure</p>",
      bodyText: "Sure",
      replyToEmailId: "11111111-1111-4111-8111-111111111111",
    });
    expect(r).toMatchObject({ success: true, threadId: T });
    const [payload] = send.mock.calls[0];
    expect(payload.replyTo).toBe(`replies+${T}@inbound.staycio.com`);
    expect(payload.headers).toEqual({ "In-Reply-To": "<m1@x>", References: "<m0@x> <m1@x>" });
    const row = calls.find((c) => c.op === "insert")!.args[0] as Record<string, unknown>;
    expect(row).toMatchObject({ thread_id: T, to_name: "Jane", lead_id: "lead-1", metadata: { headers: payload.headers } });
    const update = calls.find((c) => c.op === "update")!;
    expect(update.args[0]).toMatchObject({ status: "replied" });
  });

  it("reports a Resend error instead of storing", async () => {
    send.mockResolvedValue({ data: null, error: { message: "Domain not verified" } });
    const { client, calls } = fakeSupabase([{ table: "leads", op: "select", result: { data: null } }]);
    const r = await createAdminInboxService(client).sendNewEmail({ to: "a@b.co", subject: "s", bodyHtml: "<p>x</p>", bodyText: "x" });
    expect(r).toMatchObject({ success: false, error: "Domain not verified", status: 502 });
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("hands a scheduled note to Resend with its send time and records it, without cancelling anything", async () => {
    cancel.mockReset();
    const at = new Date(Date.now() + 15 * 60_000);
    const { client, calls } = fakeSupabase([{ table: "leads", op: "select", result: { data: { source_detail: "perrinbrickell.com" } } }, insertOk]);
    const r = await createAdminInboxService(client).sendNewEmail({
      to: "john@example.com",
      subject: "The Perrin Miami — 2 Bedroom Availability",
      bodyHtml: "<p>Hi John,</p>",
      bodyText: "Hi John,",
      leadId: "lead-9",
      scheduledAt: at,
    });
    expect(r.success).toBe(true);
    const [payload] = send.mock.calls.at(-1)!;
    expect(payload.scheduledAt).toBe(at.toISOString());
    const row = calls.find((c) => c.op === "insert")!.args[0] as Record<string, unknown>;
    expect(row).toMatchObject({ status: "sent", metadata: { scheduled_at: at.toISOString() } });
    // Only an immediate send looks for queued notes to pull back.
    expect(calls.filter((c) => c.table === "emails" && c.op === "select")).toHaveLength(0);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("ignores a send time already in the past", async () => {
    const { client, calls } = fakeSupabase([{ table: "leads", op: "select", result: { data: null } }, insertOk]);
    await createAdminInboxService(client).sendNewEmail({ to: "a@b.co", subject: "s", bodyHtml: "<p>x</p>", bodyText: "x", scheduledAt: new Date(Date.now() - 1000) });
    expect(send.mock.calls.at(-1)![0]).not.toHaveProperty("scheduledAt");
    const row = calls.find((c) => c.op === "insert")!.args[0] as Record<string, unknown>;
    expect(row.metadata).not.toHaveProperty("scheduled_at");
  });

  it("pulls back a queued note to the same person once an immediate send has gone", async () => {
    cancel.mockReset();
    cancel.mockResolvedValue({ data: { object: "email", id: "em_sched" }, error: null });
    const future = new Date(Date.now() + 10 * 60_000).toISOString();
    const { client, calls } = fakeSupabase([
      // cancelScheduledTo: the queued note, still pending
      { table: "emails", op: "select", result: { data: [{ id: "sched-1", resend_message_id: "em_sched", metadata: { scheduled_at: future, headers: { "List-Unsubscribe": "<u>" } } }], error: null } },
      { table: "emails", op: "update", result: { error: null } },
      { table: "leads", op: "select", result: { data: { source_detail: "perrinbrickell.com" } } },
      insertOk,
    ]);
    const r = await createAdminInboxService(client).sendNewEmail({
      to: "John@Example.com",
      subject: "Re: The Perrin",
      bodyHtml: "<p>Hi John, I just saw your note.</p>",
      bodyText: "Hi John, I just saw your note.",
      sentBy: "admin-1",
    });
    expect(r.success).toBe(true);
    expect(cancel).toHaveBeenCalledWith("em_sched");
    const lookup = calls.find((c) => c.table === "emails" && c.op === "select")!;
    expect(lookup.filters).toEqual(
      expect.arrayContaining([["eq", "direction", "outbound"], ["eq", "to_email", "john@example.com"], ["is", "metadata->>cancelled_at", null]])
    );
    expect(lookup.filters.some(([f, col]) => f === "gt" && col === "metadata->>scheduled_at")).toBe(true);
    const pulled = calls.find((c) => c.table === "emails" && c.op === "update")!;
    const meta = (pulled.args[0] as { metadata: Record<string, unknown> }).metadata;
    expect(meta.scheduled_at).toBe(future);
    expect(meta.headers).toEqual({ "List-Unsubscribe": "<u>" }); // the rest of the metadata survives
    expect(typeof meta.cancelled_at).toBe("string");
    expect(pulled.filters).toEqual(expect.arrayContaining([["eq", "id", "sched-1"]]));
    // The real reply still goes out.
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("leaves the row alone when Resend says the note already left", async () => {
    cancel.mockReset();
    cancel.mockResolvedValue({ data: null, error: { message: "Email is already sent" } });
    const future = new Date(Date.now() + 60_000).toISOString();
    const { client, calls } = fakeSupabase([
      { table: "emails", op: "select", result: { data: [{ id: "sched-2", resend_message_id: "em_gone", metadata: { scheduled_at: future } }], error: null } },
      { table: "leads", op: "select", result: { data: null } },
      insertOk,
    ]);
    const r = await createAdminInboxService(client).sendNewEmail({ to: "a@b.co", subject: "s", bodyHtml: "<p>x</p>", bodyText: "x" });
    expect(r.success).toBe(true);
    expect(calls.filter((c) => c.table === "emails" && c.op === "update")).toHaveLength(0);
    // The admin is told the canned note may still go out.
    expect(r.success && r.warning).toMatch(/could not be cancelled/);
  });
});

describe("sendNewEmail: who works the lead, and who it goes out as", () => {
  const LEAD = "55555555-5555-4555-8555-555555555555";

  beforeEach(() => {
    _resetInboxSchemaCache();
    send.mockReset();
    send.mockResolvedValue({ data: { id: "em_1" }, error: null });
    cancel.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("the automatic microsite note never marks the lead contacted or clears its alert", async () => {
    const { client, calls } = fakeSupabase([{ table: "leads", op: "select", result: { data: { source_detail: "downtown6miami.com" } } }, insertOk]);
    const r = await createAdminInboxService(client).sendNewEmail({
      to: "renter@example.com",
      subject: "Downtown 6 Miami — Availability",
      bodyHtml: "<p>Hi,</p>",
      bodyText: "Hi,",
      leadId: LEAD,
      scheduledAt: new Date(Date.now() + 15 * 60_000),
    });
    expect(r.success).toBe(true);
    expect(calls.some((c) => c.table === "leads" && c.op === "update")).toBe(false);
    expect(calls.some((c) => c.table === "emails" && c.op === "update")).toBe(false);
  });

  it("an immediate send with no admin behind it leaves the lead alone too", async () => {
    const { client, calls } = fakeSupabase([{ table: "leads", op: "select", result: { data: null } }, insertOk]);
    await createAdminInboxService(client).sendNewEmail({ to: "renter@example.com", subject: "s", bodyHtml: "<p>x</p>", bodyText: "x", leadId: LEAD });
    expect(calls.some((c) => c.table === "leads" && c.op === "update")).toBe(false);
    expect(calls.some((c) => c.table === "emails" && c.op === "update" && (c.args[0] as { status?: string }).status === "read")).toBe(false);
  });

  it("does not pull anything back when the send itself fails", async () => {
    send.mockResolvedValue({ data: null, error: { message: "Rate limited" } });
    const { client, calls } = fakeSupabase([{ table: "leads", op: "select", result: { data: null } }]);
    const r = await createAdminInboxService(client).sendNewEmail({ to: "a@b.co", subject: "s", bodyHtml: "<p>x</p>", bodyText: "x", sentBy: "admin-1" });
    expect(r.success).toBe(false);
    expect(calls.some((c) => c.table === "emails" && c.op === "select")).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("only pulls back notes about the conversation's lead", async () => {
    const { client, calls } = fakeSupabase([{ table: "leads", op: "select", result: { data: { source_detail: "perrinbrickell.com" } } }, insertOk]);
    await createAdminInboxService(client).sendNewEmail({ to: "renter@example.com", subject: "s", bodyHtml: "<p>x</p>", bodyText: "x", leadId: LEAD, sentBy: "admin-1" });
    const lookup = calls.find((c) => c.table === "emails" && c.op === "select")!;
    expect(lookup.filters).toEqual(expect.arrayContaining([["eq", "to_email", "renter@example.com"], ["in", "lead_id", [LEAD]]]));
  });

  it("a fresh compose goes out as Staycio even when the address belongs to a microsite lead, and still links the lead", async () => {
    const { client, calls } = fakeSupabase([{ table: "leads", op: "select", result: { data: { id: LEAD } } }, insertOk]);
    await createAdminInboxService(client).sendNewEmail({ to: "Renter@Example.com", subject: "Hello", bodyHtml: "<p>x</p>", bodyText: "x", sentBy: "admin-1" });
    expect(send.mock.calls[0][0].from).toBe("Staycio <hello@staycio.com>");
    // The building is never looked up for a fresh compose.
    expect(calls.some((c) => c.table === "leads" && c.op === "select" && c.args[0] === "source_detail")).toBe(false);
    const row = calls.find((c) => c.op === "insert")!.args[0] as Record<string, unknown>;
    expect(row).toMatchObject({ lead_id: LEAD, from_email: "hello@staycio.com" });
    // A guessed lead is linked, but the pull-back stays recipient-wide.
    const lookup = calls.find((c) => c.table === "emails" && c.op === "select")!;
    expect(lookup.filters.some(([f, col]) => f === "in" && col === "lead_id")).toBe(false);
  });

  it("matches the lead by address ignoring case, with LIKE wildcards escaped", async () => {
    const { client, calls } = fakeSupabase([{ table: "leads", op: "select", result: { data: null } }, insertOk]);
    await createAdminInboxService(client).sendNewEmail({ to: "Jo_hn%Doe@Example.com", subject: "s", bodyHtml: "<p>x</p>", bodyText: "x" });
    const lookup = calls.find((c) => c.table === "leads" && c.op === "select")!;
    expect(lookup.filters).toContainEqual(["ilike", "user_email", "jo\\_hn\\%doe@example.com"]);
  });

  it("a test send never resolves a lead or a building", async () => {
    const { client, calls } = fakeSupabase([insertOk]);
    const r = await createAdminInboxService(client).sendNewEmail({ to: "owner@example.com", subject: "Inbox test", bodyHtml: "<p>x</p>", bodyText: "x", sentBy: "admin-1", test: true });
    expect(r.success).toBe(true);
    expect(calls.some((c) => c.table === "leads")).toBe(false);
    expect(send.mock.calls[0][0].from).toBe("Staycio <hello@staycio.com>");
    expect((calls.find((c) => c.op === "insert")!.args[0] as Record<string, unknown>).lead_id).toBeNull();
  });

  it("a reply goes out as the lead carried elsewhere in the thread, as the lead card shows", async () => {
    const original = { id: "orig-2", thread_id: T, direction: "inbound", from_email: "jane@example.com", from_name: "Jane", to_email: "replies@inbound.staycio.com", reply_to: null, lead_id: null, headers: {}, metadata: {} };
    const { client, calls } = fakeSupabase([
      { table: "emails", op: "select", result: { data: original } },
      { table: "emails", op: "select", result: { data: { lead_id: LEAD } } }, // the thread's lead
      { table: "leads", op: "select", result: { data: { source_detail: "downtown6miami.com" } } },
      insertOk,
    ]);
    await createAdminInboxService(client).sendNewEmail({ to: "jane@example.com", subject: "Re: Tour", bodyHtml: "<p>x</p>", bodyText: "x", replyToEmailId: "11111111-1111-4111-8111-111111111111", sentBy: "admin-1" });
    expect(send.mock.calls[0][0].from).toBe('"Downtown 6" <downtown6miami@staycio.com>');
    const carrier = calls.filter((c) => c.table === "emails" && c.op === "select")[1];
    expect(carrier.filters).toContainEqual(["not", "lead_id", "is", null]);
  });

  it("refuses to write to our own addresses (a phone-only lead's alert is from leads@staycio.com)", async () => {
    const svc = createAdminInboxService(fakeSupabase([]).client);
    for (const to of ["leads@staycio.com", "replies@inbound.staycio.com", "Hello@Staycio.com"]) {
      expect(await svc.sendNewEmail({ to, subject: "s", bodyHtml: "<p>x</p>", bodyText: "x", sentBy: "admin-1" })).toMatchObject({ success: false, status: 400 });
    }
    expect(send).not.toHaveBeenCalled();
  });
});

describe("delivery status", () => {
  const LEAD = "66666666-6666-4666-8666-666666666666";

  it("puts the lead's alert back in Unread when a note bounces", async () => {
    const { client, calls } = fakeSupabase([{ table: "emails", op: "update", result: { data: [{ lead_id: LEAD }], error: null } }]);
    await createAdminInboxService(client).updateDeliveryStatus("em_9", "bounced");
    const [status, reopen] = calls.filter((c) => c.op === "update");
    expect(status.args[0]).toEqual({ status: "bounced" });
    expect(status.filters).toEqual(expect.arrayContaining([["eq", "resend_message_id", "em_9"], ["eq", "direction", "outbound"]]));
    expect(reopen.args[0]).toEqual({ status: "received", read_at: null });
    expect(reopen.filters).toEqual(
      expect.arrayContaining([["in", "lead_id", [LEAD]], ["eq", "direction", "inbound"], ["in", "status", ["read", "replied"]], ["eq", "metadata->>kind", "lead_alert"]])
    );
  });

  it("leaves alerts alone on delivery, and on a spam complaint", async () => {
    for (const [status, opts] of [["delivered", {}], ["failed", { reopenLeadAlert: false }]] as const) {
      const { client, calls } = fakeSupabase([{ table: "emails", op: "update", result: { data: [{ lead_id: LEAD }], error: null } }]);
      await createAdminInboxService(client).updateDeliveryStatus("em_9", status, opts);
      expect(calls.filter((c) => c.op === "update")).toHaveLength(1);
    }
  });
});

describe("advanceDuplicateSignups", () => {
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  it("moves the same person's other new leads for the same building, and clears their alerts", async () => {
    const { client, calls } = fakeSupabase([
      { table: "leads", op: "select", result: { data: [{ id: A, user_email: "Jane@Example.com ", source_detail: "downtown6miami.com" }], error: null } },
      {
        table: "leads",
        op: "select",
        result: {
          data: [
            { id: B, user_email: "jane@example.com", source_detail: "downtown6miami.com" }, // duplicate
            { id: C, user_email: "jane@example.com", source_detail: "perrinbrickell.com" }, // another building
            { id: D, user_email: "someone@example.com", source_detail: "downtown6miami.com" }, // another person
          ],
          error: null,
        },
      },
      { table: "leads", op: "update", result: { data: [{ id: B }], error: null } },
    ]);
    const moved = await createAdminInboxService(client).advanceDuplicateSignups([A], "contacted");
    expect(moved).toEqual([B]);
    const waiting = calls.filter((c) => c.table === "leads" && c.op === "select")[1];
    expect(waiting.filters).toEqual(expect.arrayContaining([["in", "source_detail", ["downtown6miami.com"]], ["eq", "status", "new"]]));
    const update = calls.find((c) => c.table === "leads" && c.op === "update")!;
    expect(update.args[0]).toEqual({ status: "contacted" });
    // Only rows still "new" move; nothing is merged or deleted.
    expect(update.filters).toEqual(expect.arrayContaining([["in", "id", [B]], ["eq", "status", "new"]]));
    expect(calls.some((c) => c.op === "delete")).toBe(false);
    const alerts = calls.find((c) => c.table === "emails" && c.op === "update")!;
    expect(alerts.filters).toEqual(expect.arrayContaining([["in", "lead_id", [B]], ["eq", "metadata->>kind", "lead_alert"]]));
    expect(calls.find((c) => c.table === "lead_events")!.args[0]).toEqual([
      { lead_id: B, type: "status_changed", payload: { new_status: "contacted", duplicate_signup: true } },
    ]);
  });

  it("does nothing for main-site or phone-line leads (no building), or a move back to new", async () => {
    const worked = [
      { id: A, user_email: "jane@example.com", source_detail: null },
      { id: C, user_email: "jane@example.com", source_detail: "phone:+13055550100" }, // every call shares the dialed number
    ];
    const { client, calls } = fakeSupabase([{ table: "leads", op: "select", result: { data: worked, error: null } }]);
    expect(await createAdminInboxService(client).advanceDuplicateSignups([A, C], "touring")).toEqual([]);
    expect(await createAdminInboxService(client).advanceDuplicateSignups([A], "new")).toEqual([]);
    expect(calls.filter((c) => c.table === "leads")).toHaveLength(1);
  });
});

describe("cancelScheduledForLeads", () => {
  it("pulls back every queued note to the leads being deleted", async () => {
    cancel.mockReset();
    cancel.mockResolvedValue({ data: { object: "email", id: "em_q" }, error: null });
    const L = "77777777-7777-4777-8777-777777777777";
    const { client, calls } = fakeSupabase([
      { table: "emails", op: "select", result: { data: [{ id: "q-1", resend_message_id: "em_q", metadata: { scheduled_at: new Date(Date.now() + 60_000).toISOString() } }], error: null } },
      { table: "emails", op: "update", result: { error: null } },
    ]);
    expect(await createAdminInboxService(client).cancelScheduledForLeads([L, "not-a-uuid"])).toEqual({ cancelled: 1, failed: 0 });
    expect(cancel).toHaveBeenCalledWith("em_q");
    expect(calls[0].filters).toEqual(expect.arrayContaining([["eq", "direction", "outbound"], ["in", "lead_id", [L]], ["is", "metadata->>cancelled_at", null]]));
  });
});

describe("Reply on a New lead alert", () => {
  const LEAD = "88888888-8888-4888-8888-888888888888";
  const base = {
    thread_id: null, resend_message_id: null, to_name: null, reply_to: null, cc: null, body_html: null, body_text: null,
    sent_by: null, lead_id: LEAD, is_starred: false, headers: {}, read_at: null, replied_at: null, ai_draft_html: null,
    ai_draft_text: null, ai_category: null, ai_confidence: null, ai_processed_at: null, ai_summary: null,
  } as const;
  const row = (r: Record<string, unknown>) => ({ ...base, ...r }) as unknown as Parameters<typeof toDetail>[0];
  const alert = toDetail(row({
    id: "alert-1", direction: "inbound", status: "received", from_email: "jane@example.com", from_name: "Jane Doe",
    to_email: "leads@staycio.com", reply_to: "jane@example.com", subject: "New Microsite Lead: Jane Doe · Downtown 6",
    metadata: { kind: "lead_alert" }, created_at: "2026-10-10T10:00:00Z",
  }));
  const lead = {
    id: LEAD, name: "Jane Doe", email: "jane@example.com", phone: null, status: "new" as const, domain: "downtown6miami.com",
    building: "Downtown 6", city: "Miami", unitType: "2 Bedroom", moveIn: null, sender: '"Downtown 6" <downtown6miami@staycio.com>', createdAt: "2026-10-10T10:00:00Z",
  };

  it("continues the lead's latest real conversation", () => {
    const answer = toDetail(row({
      id: "in-1", direction: "inbound", status: "read", from_email: "jane@example.com", from_name: "Jane", to_email: "replies+x@inbound.staycio.com",
      reply_to: "jane.work@example.com", subject: "Re: Downtown 6 Miami — 2 Bedroom Availability", metadata: {}, created_at: "2026-10-10T11:00:00Z",
    }));
    expect(leadAlertReply(alert, answer, lead)).toEqual({
      replyToEmailId: "in-1",
      to: "jane.work@example.com", // their Reply-To wins over From
      subject: "Re: Downtown 6 Miami — 2 Bedroom Availability",
      quoted: answer,
    });
    const note = toDetail(row({
      id: "out-1", direction: "outbound", status: "delivered", from_email: "downtown6miami@staycio.com", from_name: "Downtown 6",
      to_email: "jane@example.com", subject: "Downtown 6 Miami — 2 Bedroom Availability", metadata: {}, created_at: "2026-10-10T10:15:00Z",
    }));
    expect(leadAlertReply(alert, note, lead)).toMatchObject({ replyToEmailId: "out-1", to: "jane@example.com", subject: "Re: Downtown 6 Miami — 2 Bedroom Availability" });
  });

  it("with nothing sent yet, starts one under the automatic note's subject, never the alert's", () => {
    const r = leadAlertReply(alert, null, lead);
    expect(r).toEqual({ replyToEmailId: "alert-1", to: "jane@example.com", subject: "Downtown 6 Miami — 2 Bedroom Availability", quoted: null });
    expect(r.subject).not.toMatch(/New Microsite Lead/);
    expect(leadAlertReply(alert, null, null).subject).toBe("Your apartment search");
  });

  it("has no one to write to for a phone-only lead", () => {
    const phoneOnly = toDetail(row({
      id: "alert-2", direction: "inbound", status: "received", from_email: "leads@staycio.com", from_name: "Sam",
      to_email: "leads@staycio.com", reply_to: null, subject: "New Lead: Sam · Miami", metadata: { kind: "lead_alert" }, created_at: "2026-10-10T10:00:00Z",
    }));
    expect(leadAlertReply(phoneOnly, null, { ...lead, email: null }).to).toBeNull();
  });

  it("latestLeadMessage skips the alert, tests, cancelled and still-queued notes", async () => {
    const later = new Date(Date.now() + 10 * 60_000).toISOString();
    const rows = [
      row({ id: "queued", direction: "outbound", status: "sent", from_email: "a@staycio.com", from_name: null, to_email: "jane@example.com", subject: "q", metadata: { scheduled_at: later }, created_at: "2026-10-10T12:00:00Z" }),
      row({ id: "alert", direction: "inbound", status: "received", from_email: "jane@example.com", from_name: null, to_email: "leads@staycio.com", subject: "New", metadata: { kind: "lead_alert" }, created_at: "2026-10-10T11:30:00Z" }),
      row({ id: "pulled", direction: "outbound", status: "sent", from_email: "a@staycio.com", from_name: null, to_email: "jane@example.com", subject: "p", metadata: { cancelled_at: "2026-10-10T11:20:00Z" }, created_at: "2026-10-10T11:10:00Z" }),
      row({ id: "real", direction: "outbound", status: "delivered", from_email: "a@staycio.com", from_name: null, to_email: "jane@example.com", subject: "Downtown 6", metadata: {}, created_at: "2026-10-10T11:00:00Z" }),
    ];
    const { client, calls } = fakeSupabase([{ table: "emails", op: "select", result: { data: rows, error: null } }]);
    expect((await createAdminInboxService(client).latestLeadMessage(LEAD))?.id).toBe("real");
    expect(calls[0].filters).toEqual(expect.arrayContaining([["eq", "lead_id", LEAD], ["order", "created_at", { ascending: false }]]));
  });
});

describe("toListItem", () => {
  it("previews lead alerts from their HTML and flags them", () => {
    const item = toListItem({
      id: "1", direction: "inbound", thread_id: null, resend_message_id: null, from_email: "l@x.com", from_name: "Lead",
      to_email: "leads@staycio.com", to_name: null, reply_to: null, cc: null, subject: "New Microsite Lead", body_html: "<p>Jordan &amp; Sam</p><p>Downtown 6</p>",
      body_text: null, status: "received", sent_by: null, lead_id: "lead-1", is_starred: false, metadata: { kind: "lead_alert" }, headers: {},
      created_at: "2026-10-01T00:00:00Z", read_at: null, replied_at: null, ai_draft_html: null, ai_draft_text: null, ai_category: null,
      ai_confidence: null, ai_processed_at: null, ai_summary: null,
    });
    expect(item.threadId).toBe("1");
    expect(item.preview).toBe("Jordan & Sam Downtown 6");
    expect(item.isLeadAlert).toBe(true);
    expect(item.isRead).toBe(false);
  });
});

describe("checkOutgoingAttachments", () => {
  const pdf = { filename: "Floor plan B.pdf", contentType: "application/pdf", content: Buffer.from("%PDF-1.4 test").toString("base64") };

  it("accepts PDFs and images and strips a data: prefix", () => {
    const r = checkOutgoingAttachments([{ ...pdf, content: `data:application/pdf;base64,${pdf.content}` }]);
    expect(r).toEqual({ ok: true, files: [pdf] });
    expect(checkOutgoingAttachments(undefined)).toEqual({ ok: true, files: [] });
  });

  it("refuses executables, too many files, oversize totals and garbage", () => {
    expect(checkOutgoingAttachments([{ ...pdf, contentType: "application/x-msdownload", filename: "x.exe" }])).toMatchObject({ ok: false });
    expect(checkOutgoingAttachments(Array(6).fill(pdf))).toMatchObject({ ok: false, error: expect.stringMatching(/at most 5/) });
    const big = { ...pdf, content: "A".repeat(4.2 * 1024 * 1024) };
    expect(checkOutgoingAttachments([big])).toMatchObject({ ok: false, error: expect.stringMatching(/3 MB/) });
    expect(checkOutgoingAttachments([{ ...pdf, content: "not base64!!" }])).toMatchObject({ ok: false });
    expect(checkOutgoingAttachments("x")).toMatchObject({ ok: false });
  });

  it("cleans a filename that could break a header", () => {
    const r = checkOutgoingAttachments([{ ...pdf, filename: 'a"b/c\\d\r\n.pdf' }]);
    expect(r.ok && r.files[0].filename).toBe("a_b_c_d__.pdf");
  });
});
