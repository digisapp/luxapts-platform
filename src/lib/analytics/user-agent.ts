// User-agent parsing shared by the analytics and client-error endpoints.

export function getDeviceType(userAgent: string): "desktop" | "tablet" | "mobile" {
  if (/tablet|ipad|playbook|silk/i.test(userAgent)) return "tablet";
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(userAgent)) return "mobile";
  return "desktop";
}

/**
 * Most specific first: every iPhone UA contains "Mac OS X", every Android UA
 * "Linux", and Edge, Opera and Samsung Internet all say "Chrome" — checked in
 * the old order, iPhones were recorded as macOS and Android phones as Linux.
 */
export function parseUserAgent(userAgent: string): { browser: string; os: string } {
  let browser = "Unknown";
  if (/Edg(e|A|iOS)?\//.test(userAgent)) browser = "Edge";
  else if (/OPR\/|Opera/.test(userAgent)) browser = "Opera";
  else if (userAgent.includes("SamsungBrowser")) browser = "Samsung Internet";
  else if (/Chrome\/|CriOS\//.test(userAgent)) browser = "Chrome";
  else if (/Firefox\/|FxiOS\//.test(userAgent)) browser = "Firefox";
  else if (userAgent.includes("Safari")) browser = "Safari";

  let os = "Unknown";
  if (/iPhone|iPad|iPod/.test(userAgent)) os = "iOS";
  else if (userAgent.includes("Android")) os = "Android";
  else if (userAgent.includes("CrOS")) os = "ChromeOS";
  else if (userAgent.includes("Windows")) os = "Windows";
  else if (userAgent.includes("Mac")) os = "macOS";
  else if (userAgent.includes("Linux")) os = "Linux";

  return { browser, os };
}

/** "17" from an iOS UA ("CPU iPhone OS 17_4 like Mac OS X"), "14" from Android; null otherwise. */
export function osMajorVersion(userAgent: string): string | null {
  const ios = /(?:iPhone|iPad|iPod).*? OS (\d+)_/.exec(userAgent);
  if (ios) return ios[1];
  const android = /Android (\d+)/.exec(userAgent);
  return android ? android[1] : null;
}

/** Crawlers, link previewers, uptime checks and headless browsers. */
export function isBotUserAgent(userAgent: string): boolean {
  if (!userAgent) return true;
  return /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|curl|wget|python-requests|go-http-client|axios|node-fetch/i.test(
    userAgent
  );
}
