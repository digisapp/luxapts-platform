/**
 * Admin inbox service against a scripted Supabase double: threading of
 * inbound mail (plus-tag, In-Reply-To, subject), the FK-safe "first message
 * is its own thread" insert, spam handling before/after migration 029, and
 * the compose path's Resend contract (hello@ From, per-thread Reply-To,
 * threading headers, idempotency key).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const send = vi.fn();
vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({ emails: { send } }),
  getFromEmail: () => "Staycio <hello@staycio.com>",
}));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => { throw new Error("not used"); } }));

const { createAdminInboxService, _resetInboxSchemaCache, isLikelySpam, toListItem, checkOutgoingAttachments } = await import("@/lib/email/admin-inbox");

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
    const filterNames = ["eq", "neq", "in", "or", "is", "gt", "ilike", "order", "range", "limit"];
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

  it("sends attachments to Resend, records them as sent, and moves a new lead to contacted", async () => {
    const { client, calls } = fakeSupabase([
      { table: "leads", op: "select", result: { data: { source_detail: "perrinbrickell.com" } } },
      insertOk,
    ]);
    const content = Buffer.from("%PDF-1.4 plan").toString("base64");
    const r = await createAdminInboxService(client).sendNewEmail({
      to: "cgparker44@gmail.com",
      subject: "Re: The Perrin Miami — 2 Bedroom Availability",
      bodyHtml: "<p>Floor plans attached.</p>",
      bodyText: "Floor plans attached.",
      leadId: "77777777-7777-4777-8777-777777777777",
      attachments: [{ filename: "Plan B.pdf", contentType: "application/pdf", content }],
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
