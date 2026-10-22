// IndexNow: tells Bing (and Yandex, Seznam, Naver — they share submissions)
// that pages changed, so they are recrawled within hours instead of whenever
// Bingbot next gets to them. ChatGPT search leans on Bing's index, so a price
// change reaches ChatGPT answers sooner.
//
// The key is public by design: it is verified by fetching
// https://staycio.com/<key>.txt, committed as public/<key>.txt (70361aa).

export const INDEXNOW_KEY = "b3cf5795b633271ae0b26ee982d06033";
const HOST = "staycio.com";
const ENDPOINT = "https://api.indexnow.org/indexnow";
/** Protocol limit per request. */
const MAX_URLS = 10_000;

export interface IndexNowResult {
  submitted: number;
  status: number | null;
  error?: string;
}

/**
 * Submit absolute https://staycio.com URLs. 200 and 202 both mean accepted
 * (202: key validation pending). Anything else is reported, never thrown.
 */
export async function submitToIndexNow(urls: string[]): Promise<IndexNowResult> {
  const own = [...new Set(urls)].filter((u) => {
    try {
      return new URL(u).host === HOST;
    } catch {
      return false;
    }
  });
  if (own.length === 0) return { submitted: 0, status: null };

  let submitted = 0;
  let status: number | null = null;
  for (let i = 0; i < own.length; i += MAX_URLS) {
    const batch = own.slice(i, i + MAX_URLS);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          host: HOST,
          key: INDEXNOW_KEY,
          keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`,
          urlList: batch,
        }),
      });
      status = res.status;
      if (res.status !== 200 && res.status !== 202) {
        return { submitted, status, error: (await res.text().catch(() => "")).slice(0, 300) };
      }
      submitted += batch.length;
    } catch (err) {
      return { submitted, status, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { submitted, status };
}
