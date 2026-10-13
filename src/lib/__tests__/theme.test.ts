import { describe, it, expect } from "vitest";
import { isDarkOnly, resolveTheme, THEME_INIT_SCRIPT } from "@/lib/theme";

describe("isDarkOnly", () => {
  it("keeps the staff portals dark", () => {
    expect(isDarkOnly("/admin")).toBe(true);
    expect(isDarkOnly("/admin/leads/123")).toBe(true);
    expect(isDarkOnly("/agent")).toBe(true);
    expect(isDarkOnly("/partner/listings")).toBe(true);
    expect(isDarkOnly("/shower")).toBe(true);
  });

  it("leaves every public page light", () => {
    for (const p of ["/", "/index", "/search", "/buildings/bezel-miami-worldcenter", "/cities/miami", "/auth/login", "/administrative-fees"]) {
      expect(isDarkOnly(p)).toBe(false);
    }
  });
});

describe("resolveTheme", () => {
  it("is light unless the visitor chose dark or it's a portal", () => {
    expect(resolveTheme("/", null)).toBe("light");
    expect(resolveTheme("/", "light")).toBe("light");
    expect(resolveTheme("/", "dark")).toBe("dark");
    expect(resolveTheme("/admin", null)).toBe("dark");
    expect(resolveTheme("/admin", "light")).toBe("dark");
  });
});

describe("THEME_INIT_SCRIPT", () => {
  // Run the inline <head> script against a fake page and report the class it leaves.
  function run(pathname: string, search: string, stored: string | null) {
    const classes = new Set<string>();
    const storage = new Map<string, string>(stored ? [["staycio-theme", stored]] : []);
    let themeColor = "#ffffff";
    const fake = {
      location: { pathname, search },
      localStorage: {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => void storage.set(k, v),
      },
      document: {
        documentElement: { classList: { add: (c: string) => classes.add(c) } },
        querySelector: () => ({ setAttribute: (_: string, v: string) => (themeColor = v) }),
      },
      URLSearchParams,
    };
    new Function(...Object.keys(fake), THEME_INIT_SCRIPT)(...Object.values(fake));
    return { dark: classes.has("dark"), stored: storage.get("staycio-theme") ?? null, themeColor };
  }

  it("leaves the server's light page alone by default", () => {
    expect(run("/", "", null)).toEqual({ dark: false, stored: null, themeColor: "#ffffff" });
  });

  it("goes dark before first paint on a portal", () => {
    expect(run("/admin/leads", "", null)).toMatchObject({ dark: true, themeColor: "#000000" });
  });

  it("?theme=dark opts in and is remembered; ?theme=light opts back out", () => {
    expect(run("/", "?theme=dark", null)).toMatchObject({ dark: true, stored: "dark" });
    expect(run("/search", "", "dark")).toMatchObject({ dark: true });
    expect(run("/", "?theme=light", "dark")).toMatchObject({ dark: false, stored: "light" });
  });
});
