/**
 * Building policy text (pets, parking, deposit) as scraped, minus filler.
 *
 * The AI extractor sometimes answers "Not specified in the provided HTML"
 * instead of leaving a field empty, or tacks such a clause onto a real policy.
 * Shown raw, that rendered on building pages, in their FAQ (and its JSON-LD),
 * as "Parking" chips on search cards and on the compare page — and it made a
 * building count as having a policy for the pets/parking search filters.
 *
 * Works clause by clause, so "Cats and dogs allowed; fees not specified in
 * the provided HTML" keeps "Cats and dogs allowed" rather than losing it all.
 * Every surface — pages, search filters, chat and voice — goes through these
 * helpers, so they cannot disagree about what counts as a policy.
 */

// The model describing its input rather than the building
const EXTRACTION_ARTIFACT = /\b(?:provided|given|source|the) (?:html|text|content|page|markup)\b|\bhtml\b/i;

// A clause that says nothing but "we don't know": "Pet policy not specified",
// "Parking: N/A", "No information available", "Unknown". Anchored to the
// clause end, so "Unknown breed restrictions apply" is kept.
const NO_INFORMATION =
  /^[\w\s/:'-]*?\b(?:not (?:specified|mentioned|provided|listed|stated|found|available|disclosed)|n\/a|unknown|tbd|none (?:listed|specified|provided)|no (?:information|info|details?|data)(?: (?:available|provided|found|listed|given))?)$/i;

// Clause boundaries: semicolons, sentence ends, parentheses and ", " — but not
// the comma inside "$1,500" or the dot in "$1.5k".
const CLAUSE_SPLIT = /\s*(?:;|\.\s+|\.$|,\s+|\(|\))\s*/;

function isFiller(clause: string): boolean {
  return EXTRACTION_ARTIFACT.test(clause) || NO_INFORMATION.test(clause);
}

export function policyText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return null;
  const clauses = text.split(CLAUSE_SPLIT).map((c) => c.trim()).filter(Boolean);
  const kept = clauses.filter((c) => !isFiller(c));
  if (kept.length === 0) return null;
  // Untouched text keeps its own punctuation; only a cleaned one is rebuilt.
  return kept.length === clauses.length ? text : kept.join("; ");
}

// "No pet rent" / "no pet deposit" are perks, not a ban.
const NO_PETS =
  /\bno pets\b|\bno pet\b(?! (?:rent|fees?|deposits?|charges?))|\bnot allowed\b|\bno animals?\b|\bpet-free\b/i;

/** True when the policy says pets are welcome — what a "Pets OK" chip claims. */
export function petsAllowed(value: unknown): boolean {
  const text = policyText(value);
  return !!text && !NO_PETS.test(text);
}

const NO_PARKING =
  /\bno (?:on-?site |resident |dedicated )?parking\b|\bparking (?:is )?not (?:available|offered|provided)\b/i;

/** True when the policy describes parking that exists — what a "Parking" chip claims. */
export function parkingAvailable(value: unknown): boolean {
  const text = policyText(value);
  return !!text && !NO_PARKING.test(text);
}

const POLICY_KEYS = ["pet_policy", "parking_policy", "deposit_policy"] as const;

/** A copy of a building row with its policy columns passed through policyText. */
export function withPolicyText<T>(building: T): T {
  if (!building || typeof building !== "object") return building;
  const out: Record<string, unknown> = { ...(building as Record<string, unknown>) };
  for (const key of POLICY_KEYS) if (key in out) out[key] = policyText(out[key]);
  return out as T;
}
