import { NextResponse } from "next/server";

/** Standard JSON error response. Replaces repeated NextResponse.json({ error }, { status }) calls. */
export function apiError(message: string, status: number = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Standard JSON success response. */
export function apiSuccess<T>(data: T, status: number = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Whether the dev-only data-fabrication routes (/api/fix-data,
 * /api/generate-units, /api/generate-images) are reachable. They invent units,
 * prices and stock photography that are indistinguishable from scraped data
 * once written, so in production they are off unless deliberately enabled.
 */
export function devRoutesEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_DEV_ROUTES === "1";
}

/** 404 used to hide a disabled route entirely. */
export function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
