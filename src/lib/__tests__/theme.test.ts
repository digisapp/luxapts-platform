import { describe, it, expect } from "vitest";
import { isLightReady, resolveTheme, THEME_INIT_SCRIPT } from "@/lib/theme";

describe("isLightReady", () => {
  it("covers the converted pages", () => {
    expect(isLightReady("/")).toBe(true);
    expect(isLightReady("/index")).toBe(true); // the homepage prerenders as /index
    expect(isLightReady("/search")).toBe(true);
    expect(isLightReady("/buildings/bezel-miami-worldcenter")).toBe(true);
    expect(isLightReady("/buildings/bezel-miami-worldcenter/units/45b0c863")).toBe(true);
  });

  it("leaves everything else dark until it is converted", () => {
    expect(isLightReady("/cities/miami")).toBe(false);
    expect(isLightReady("/admin")).toBe(false);
    expect(isLightReady("/searches")).toBe(false);
    expect(isLightReady("/buildings")).toBe(false);
  });
});

describe("resolveTheme", () => {
  it("is dark unless this browser opted in to light", () => {
    expect(resolveTheme("/", null)).toBe("dark");
    expect(resolveTheme("/", "dark")).toBe("dark");
    expect(resolveTheme("/", "light")).toBe("light");
  });

  it("never applies light to a page that isn't ready for it", () => {
    expect(resolveTheme("/admin/leads", "light")).toBe("dark");
  });
});

describe("THEME_INIT_SCRIPT", () => {
  // Run the inline <head> script against a fake page and report the class it leaves.
  function run(pathname: string, search: string, stored: string | null) {
    const classes = new Set(["dark"]);
    const storage = new Map<string, string>(stored ? [["staycio-theme", stored]] : []);
    let themeColor = "#000000";
    const fake = {
      location: { pathname, search },
      localStorage: {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => void storage.set(k, v),
      },
      document: {
        documentElement: { classList: { remove: (c: string) => classes.delete(c) } },
        querySelector: () => ({ setAttribute: (_: string, v: string) => (themeColor = v) }),
      },
      URLSearchParams,
    };
    new Function(...Object.keys(fake), THEME_INIT_SCRIPT)(...Object.values(fake));
    return { dark: classes.has("dark"), stored: storage.get("staycio-theme") ?? null, themeColor };
  }

  it("keeps the server's dark class by default", () => {
    expect(run("/", "", null)).toMatchObject({ dark: true, stored: null });
  });

  it("switches a ready page to light from ?theme=light and remembers it", () => {
    expect(run("/", "?theme=light", null)).toEqual({ dark: false, stored: "light", themeColor: "#ffffff" });
    expect(run("/search", "", "light")).toMatchObject({ dark: false });
  });

  it("stays dark on a page that isn't ready, even when opted in", () => {
    expect(run("/cities/miami", "", "light")).toMatchObject({ dark: true });
  });

  it("?theme=dark opts back out", () => {
    expect(run("/", "?theme=dark", "light")).toMatchObject({ dark: true, stored: "dark" });
  });
});
