// Where a staycio.com visitor came from, resolved from what the analytics
// session recorded: the utm_source on the landing URL (user_sessions) and the
// browser referrer on each page view (page_views).
//
// ChatGPT is the case this exists for. Its links carry
// ?utm_source=chatgpt.com and usually send no referrer, so the utm wins over
// the referrer. Google and Bing send a referrer and no utm.

import type { SupabaseClient } from "@supabase/supabase-js";
import { MICROSITE_BUILDINGS } from "@/lib/microsites";

export type ReferralSource =
  | "chatgpt"
  | "perplexity"
  | "claude"
  | "gemini"
  | "copilot"
  | "google"
  | "bing"
  | "duckduckgo"
  | "yahoo"
  | "brave"
  | "facebook"
  | "instagram"
  | "email"
  | "microsite"
  | "other"
  | "direct";

export interface Referral {
  source: ReferralSource;
  /** The raw utm_source or referrer host it was derived from. */
  detail: string | null;
}

// Order matters: AI assistants and webmail before the search engines that
// host them (gemini.google.com and the Gmail app are not Google search).
const HOST_RULES: [RegExp, ReferralSource][] = [
  [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$/, "chatgpt"],
  [/(^|\.)perplexity\.ai$/, "perplexity"],
  [/(^|\.)claude\.ai$/, "claude"],
  [/^gemini\.google\.com$|^bard\.google\.com$/, "gemini"],
  [/^copilot\.microsoft\.com$/, "copilot"],
  [/^com\.google\.android\.gm$|(^|\.)mail\.google\.com$|(^|\.)outlook\.live\.com$|(^|\.)mail\.yahoo\.com$/, "email"],
  [/(^|\.)google\.[a-z.]+$|^com\.google\.android\.googlequicksearchbox$/, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
  [/(^|\.)yahoo\.com$/, "yahoo"],
  [/(^|\.)search\.brave\.com$/, "brave"],
  [/(^|\.)facebook\.com$|^l\.facebook\.com$|^m\.facebook\.com$/, "facebook"],
  [/(^|\.)instagram\.com$/, "instagram"],
];

function sourceForHost(host: string): ReferralSource | null {
  for (const [re, source] of HOST_RULES) if (re.test(host)) return source;
  return null;
}

function hostOf(referrer: string): string | null {
  try {
    return new URL(referrer).host.toLowerCase();
  } catch {
    // Android app referrers arrive as "android-app://com.google.android.gm/"
    const m = /^android-app:\/\/([^/]+)/.exec(referrer);
    return m ? m[1].toLowerCase() : null;
  }
}

/** The site's own hosts: a referrer from one of these is navigation, not a source. */
function isOwnHost(host: string): boolean {
  return /(^|\.)staycio\.com$/.test(host) || /^localhost(:\d+)?$/.test(host) || host.endsWith(".vercel.app");
}

/**
 * Pure classification. `utmSource` is the session's utm_source; `referrers`
 * are the page-view referrers in time order (nulls allowed).
 */
export function classifyReferral(utmSource: string | null | undefined, referrers: (string | null | undefined)[]): Referral {
  const utm = utmSource?.trim().toLowerCase();
  if (utm) {
    const asHost = sourceForHost(utm) ?? sourceForHost(utm.replace(/^www\./, ""));
    if (asHost) return { source: asHost, detail: utm };
    // Bare names some tools send instead of a domain
    if (/^(chatgpt|openai)$/.test(utm)) return { source: "chatgpt", detail: utm };
    if (utm === "perplexity") return { source: "perplexity", detail: utm };
    // The building microsites link here with utm_source=<domain minus .com>
    if (MICROSITE_BUILDINGS[`${utm}.com`] || MICROSITE_BUILDINGS[utm]) {
      return { source: "microsite", detail: utm.replace(/\.com$/, "") };
    }
    return { source: "other", detail: utm };
  }

  for (const ref of referrers) {
    if (!ref) continue;
    const host = hostOf(ref);
    if (!host || isOwnHost(host)) continue;
    const source = sourceForHost(host);
    if (source) return { source, detail: host };
    const bare = host.replace(/^www\./, "");
    if (MICROSITE_BUILDINGS[bare]) return { source: "microsite", detail: bare.replace(/\.com$/, "") };
    return { source: "other", detail: host };
  }

  return { source: "direct", detail: null };
}

export const REFERRAL_LABELS: Record<ReferralSource, string> = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  claude: "Claude",
  gemini: "Gemini",
  copilot: "Copilot",
  google: "Google",
  bing: "Bing",
  duckduckgo: "DuckDuckGo",
  yahoo: "Yahoo",
  brave: "Brave Search",
  facebook: "Facebook",
  instagram: "Instagram",
  email: "Email",
  microsite: "Microsite",
  other: "Other site",
  direct: "Direct",
};

export function referralLabel(source: string | null | undefined, detail?: string | null): string | null {
  if (!source) return null;
  const label = REFERRAL_LABELS[source as ReferralSource] ?? source;
  return source === "other" && detail ? detail.replace(/^www\./, "") : label;
}

export interface ResolvedReferral extends Referral {
  landingPage: string | null;
}

/**
 * Look the session up and classify it. Returns null when the session left no
 * trace (analytics blocked, or the lead came from somewhere without one).
 */
export async function resolveReferral(
  supabase: SupabaseClient,
  sessionId: string
): Promise<ResolvedReferral | null> {
  const [sessionRes, viewsRes] = await Promise.all([
    supabase
      .from("user_sessions")
      .select("utm_source, landing_page")
      .eq("session_id", sessionId)
      .maybeSingle(),
    supabase
      .from("page_views")
      .select("path, referrer")
      .eq("session_id", sessionId)
      .is("duration_ms", null)
      .order("created_at", { ascending: true })
      .limit(20),
  ]);

  const session = sessionRes.data as { utm_source: string | null; landing_page: string | null } | null;
  const views = (viewsRes.data ?? []) as { path: string; referrer: string | null }[];
  if (!session && views.length === 0) return null;

  const referral = classifyReferral(
    session?.utm_source,
    views.map((v) => v.referrer)
  );
  return { ...referral, landingPage: session?.landing_page ?? views[0]?.path ?? null };
}
