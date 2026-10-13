// Light / dark theme switch.
//
// Light is the default and what the server renders (no class on <html>).
// Dark — the original black "liquid glass" look, `<html class="dark">` — is
// kept for the staff portals, which have not been redesigned, and for anyone
// who asks for it: `?theme=dark` opts this browser in (remembered in
// localStorage), `?theme=light` opts back out.

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "staycio-theme";

/** Staff portals: always dark, whatever the visitor chose. */
const DARK_ONLY_ROUTES: RegExp[] = [/^\/(admin|agent|partner|shower)(\/|$)/];

const THEME_COLOR: Record<Theme, string> = { light: "#ffffff", dark: "#000000" };

export function isDarkOnly(pathname: string): boolean {
  return DARK_ONLY_ROUTES.some((r) => r.test(pathname));
}

export function resolveTheme(pathname: string, preference: Theme | null): Theme {
  return preference === "dark" || isDarkOnly(pathname) ? "dark" : "light";
}

/** `?theme=` wins and is remembered; otherwise the remembered choice. */
export function readThemePreference(): Theme | null {
  try {
    const param = new URLSearchParams(window.location.search).get("theme");
    if (param === "light" || param === "dark") {
      localStorage.setItem(THEME_STORAGE_KEY, param);
      return param;
    }
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    // Private mode / blocked storage: the default theme
    return null;
  }
}

/** The theme for the page in this window right now. Client only. */
export function currentTheme(): Theme {
  return resolveTheme(window.location.pathname, readThemePreference());
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLOR[theme]);
}

/**
 * Runs in <head> before first paint, so a portal or an opted-in visitor never
 * flashes light. Self-contained (no imports exist at that point), built from
 * the same route list and storage key as the functions above.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var routes=[${DARK_ONLY_ROUTES.map((r) => r.toString()).join(",")}];
var p=new URLSearchParams(location.search).get("theme"),pref=null;
if(p==="light"||p==="dark"){localStorage.setItem(${JSON.stringify(THEME_STORAGE_KEY)},p);pref=p;}
else{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(s==="light"||s==="dark")pref=s;}
if(pref==="dark"||routes.some(function(r){return r.test(location.pathname)})){
document.documentElement.classList.add("dark");
var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",${JSON.stringify(THEME_COLOR.dark)});
}}catch(e){}})();`;
