import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let currentUser: { id: string } | null = null;
let currentRole: string | null = null;

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: currentRole ? { role: currentRole } : null }) }),
      }),
    }),
  }),
}));

import { gatePathname, updateSession } from "./middleware";

const gate = (path: string) => updateSession(new NextRequest(`https://staycio.com${path}`));
const location = (res: Response) => {
  const loc = res.headers.get("location");
  return loc ? new URL(loc).pathname : null;
};

describe("gatePathname", () => {
  it("decodes, collapses slashes and lowercases", () => {
    expect(gatePathname("/%61dmin")).toBe("/admin");
    expect(gatePathname("/%2Fadmin/leads")).toBe("/admin/leads");
    expect(gatePathname("//admin")).toBe("/admin");
    expect(gatePathname("/Admin")).toBe("/admin");
    expect(gatePathname("/buildings/abc")).toBe("/buildings/abc");
  });
  it("returns null for a path that cannot be decoded", () => {
    expect(gatePathname("/%E0%A4%A")).toBeNull();
    expect(gatePathname("/admin%")).toBeNull();
  });
});

describe("updateSession role gate", () => {
  beforeEach(() => {
    currentUser = null;
    currentRole = null;
  });

  it("sends a signed-out visitor on an encoded admin path to login", async () => {
    expect(location(await gate("/%61dmin/leads"))).toBe("/auth/login");
    expect(location(await gate("/admin/leads"))).toBe("/auth/login");
  });

  it("treats an undecodable path as protected", async () => {
    expect(location(await gate("/%E0%A4%A"))).toBe("/auth/login");
  });

  it("leaves public pages alone", async () => {
    expect(location(await gate("/buildings/abc"))).toBeNull();
  });

  it("keeps a signed-in renter out of an encoded admin path", async () => {
    currentUser = { id: "u1" };
    currentRole = "renter";
    expect(location(await gate("/%61dmin"))).toBe("/");
  });

  it("lets an admin through", async () => {
    currentUser = { id: "u1" };
    currentRole = "admin";
    expect(location(await gate("/%61dmin"))).toBeNull();
  });
});
