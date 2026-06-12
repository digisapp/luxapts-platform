import { describe, it, expect } from "vitest";
import { isSafeUrl } from "@/lib/scraper/fetcher";

describe("isSafeUrl (SSRF guard)", () => {
  it("allows normal public websites", () => {
    expect(isSafeUrl("https://www.example-apartments.com/floorplans")).toBe(true);
    expect(isSafeUrl("http://example.com")).toBe(true);
    expect(isSafeUrl("https://8.8.8.8/page")).toBe(true);
  });

  it("blocks non-http(s) schemes", () => {
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeUrl("ftp://example.com")).toBe(false);
    expect(isSafeUrl("gopher://example.com")).toBe(false);
    expect(isSafeUrl("not a url")).toBe(false);
  });

  it("blocks localhost and internal hostnames", () => {
    expect(isSafeUrl("http://localhost:3000")).toBe(false);
    expect(isSafeUrl("http://foo.localhost")).toBe(false);
    expect(isSafeUrl("http://db.internal")).toBe(false);
    expect(isSafeUrl("http://printer.local")).toBe(false);
  });

  it("blocks private and reserved IPv4 ranges", () => {
    expect(isSafeUrl("http://127.0.0.1")).toBe(false);
    expect(isSafeUrl("http://10.0.0.5")).toBe(false);
    expect(isSafeUrl("http://172.16.0.1")).toBe(false);
    expect(isSafeUrl("http://172.31.255.255")).toBe(false);
    expect(isSafeUrl("http://192.168.1.1")).toBe(false);
    expect(isSafeUrl("http://169.254.169.254/latest/meta-data/")).toBe(false); // cloud metadata
    expect(isSafeUrl("http://100.64.0.1")).toBe(false); // CGNAT
    expect(isSafeUrl("http://0.0.0.0")).toBe(false);
    expect(isSafeUrl("http://224.0.0.1")).toBe(false); // multicast
  });

  it("blocks IPv6 literals", () => {
    expect(isSafeUrl("http://[::1]/")).toBe(false);
    expect(isSafeUrl("http://[fd00::1]/")).toBe(false);
  });
});
