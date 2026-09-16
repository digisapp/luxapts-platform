import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractAddress,
  getLeadNotificationRecipients,
  getReplyToAddress,
} from "@/lib/email/recipients";

function fakeSupabase(adminIds: string[], emails: Record<string, string | undefined>) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: async () => ({ data: adminIds.map((id) => ({ id })) }),
        }),
      }),
    }),
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: emails[id] ? { email: emails[id] } : null },
        }),
      },
    },
  } as never;
}

describe("email recipients", () => {
  const original = process.env.LEAD_NOTIFY_EMAIL;
  beforeEach(() => {
    delete process.env.LEAD_NOTIFY_EMAIL;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    if (original === undefined) delete process.env.LEAD_NOTIFY_EMAIL;
    else process.env.LEAD_NOTIFY_EMAIL = original;
    vi.restoreAllMocks();
  });

  it("extracts a bare address from a display-name form", () => {
    expect(extractAddress("Staycio <hello@staycio.com>")).toBe("hello@staycio.com");
    expect(extractAddress("  ops@staycio.com ")).toBe("ops@staycio.com");
  });

  it("prefers LEAD_NOTIFY_EMAIL, splitting and deduping", async () => {
    process.env.LEAD_NOTIFY_EMAIL = "a@x.com, Ops <b@x.com>; a@x.com not-an-email";
    const out = await getLeadNotificationRecipients(fakeSupabase([], {}));
    expect(out).toEqual(["a@x.com", "b@x.com"]);
  });

  it("falls back to admin account emails", async () => {
    const out = await getLeadNotificationRecipients(
      fakeSupabase(["u1", "u2", "u3"], { u1: "admin@x.com", u2: undefined, u3: "admin@x.com" })
    );
    expect(out).toEqual(["admin@x.com"]);
  });

  it("returns [] and logs when nothing usable is configured", async () => {
    const out = await getLeadNotificationRecipients(fakeSupabase([], {}));
    expect(out).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });

  it("derives reply-to from the first configured address", () => {
    expect(getReplyToAddress()).toBeUndefined();
    process.env.LEAD_NOTIFY_EMAIL = "junk, Ops <b@x.com>";
    expect(getReplyToAddress()).toBe("b@x.com");
  });
});
