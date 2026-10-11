// get_microsite_stats casts scroll_depth's `depth` and time_on_page's `ms` to
// integers to count engaged sessions. The schema takes any properties object,
// so a single forged {"depth":"x"} used to be stored as sent and made that RPC
// throw for every window on /admin/microsites (migration 032 guards the casts
// too). A value the page script would never send is dropped; the event is kept.

function isIntBetween(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

export function sanitizeEventProperties(
  eventName: string,
  properties: Record<string, unknown> | undefined
): Record<string, unknown> {
  const props = { ...(properties ?? {}) };
  // The page sends depth as 25/50/75/100 and ms as Date.now() - t0.
  if (eventName === "scroll_depth" && !isIntBetween(props.depth, 0, 100)) delete props.depth;
  if (eventName === "time_on_page" && !isIntBetween(props.ms, 0, Number.MAX_SAFE_INTEGER)) delete props.ms;
  return props;
}
