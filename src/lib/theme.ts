// Light / dark theme switch.
//
// Dark is the default and what the server renders (<html class="dark">), so
// every page is cached exactly as before and nobody sees a change unless they
// opt in. `?theme=light` opts this browser in (remembered in localStorage),
// `?theme=dark` opts back out.
//
// Light only applies on routes whose markup has been converted to theme
// tokens. An unconverted page still hard-codes white-on-black, so showing it
// with the light palette would be broken — those stay dark either way.

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "staycio-theme";

/** Routes converted to theme tokens. Add a route here once its markup is. */
const LIGHT_READY_ROUTES: RegExp[] = [
  /^\/(index)?$/, // the homepage prerenders as "/index"
  /^\/search(\/|$)/,
  /^\/buildings\//, // building and unit pages
];

const THEME_COLOR: Record<Theme, string> = { light: "#ffffff", dark: "#000000" };

export function isLightReady(pathname: string): boolean {
  return LIGHT_READY_ROUTES.some((r) => r.test(pathname));
}

export function resolveTheme(pathname: string, preference: Theme | null): Theme {
  return preference === "light" && isLightReady(pathname) ? "light" : "dark";
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
 * Runs in <head> before first paint, so a light page never flashes dark.
 * Self-contained (no imports exist at that point), built from the same
 * route list and storage key as the functions above.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var routes=[${LIGHT_READY_ROUTES.map((r) => r.toString()).join(",")}];
var p=new URLSearchParams(location.search).get("theme"),pref=null;
if(p==="light"||p==="dark"){localStorage.setItem(${JSON.stringify(THEME_STORAGE_KEY)},p);pref=p;}
else{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(s==="light"||s==="dark")pref=s;}
if(pref==="light"&&routes.some(function(r){return r.test(location.pathname)})){
document.documentElement.classList.remove("dark");
var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",${JSON.stringify(THEME_COLOR.light)});
}}catch(e){}})();`;
