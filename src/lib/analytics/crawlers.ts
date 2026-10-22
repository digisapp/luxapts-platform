// AI assistant crawlers worth counting, by the user-agent token each vendor
// documents. The *-User agents fetch a page live because someone asked the
// assistant a question; the others build the vendor's search index (or, for
// GPTBot/ClaudeBot, training data). Bingbot is here because ChatGPT search
// leans on Bing's index. Googlebot is left out on purpose: its volume would
// dwarf the rest and Search Console already reports it.

const CRAWLERS: [RegExp, string][] = [
  [/ChatGPT-User/i, "ChatGPT-User"],
  [/OAI-SearchBot/i, "OAI-SearchBot"],
  [/GPTBot/i, "GPTBot"],
  [/Perplexity-User/i, "Perplexity-User"],
  [/PerplexityBot/i, "PerplexityBot"],
  [/Claude-User/i, "Claude-User"],
  [/Claude-SearchBot/i, "Claude-SearchBot"],
  [/ClaudeBot/i, "ClaudeBot"],
  [/bingbot/i, "Bingbot"],
];

/** The crawler's canonical name, or null for anything else (people included). */
export function detectCrawler(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  for (const [re, name] of CRAWLERS) if (re.test(userAgent)) return name;
  return null;
}

/** What each crawler's visits mean, for the admin page. */
export const CRAWLER_NOTES: Record<string, string> = {
  "ChatGPT-User": "ChatGPT opened the page while answering someone",
  "OAI-SearchBot": "ChatGPT search indexing",
  GPTBot: "OpenAI model training",
  "Perplexity-User": "Perplexity opened the page while answering someone",
  PerplexityBot: "Perplexity search indexing",
  "Claude-User": "Claude opened the page while answering someone",
  "Claude-SearchBot": "Claude search indexing",
  ClaudeBot: "Anthropic model training",
  Bingbot: "Bing indexing (feeds ChatGPT search)",
};

/**
 * Fire-and-forget insert through PostgREST. Plain fetch rather than a
 * supabase-js client: this runs in the proxy on every crawler request.
 */
export async function recordCrawlerHit(bot: string, path: string, userAgent: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || process.env.NODE_ENV === "development") return;
  try {
    await fetch(`${url}/rest/v1/crawler_hits`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ bot, path: path.slice(0, 500), user_agent: userAgent.slice(0, 500) }),
    });
  } catch {
    // Logging must never affect the response.
  }
}
