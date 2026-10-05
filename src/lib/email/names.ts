/**
 * "jillian hughson" -> "Jillian", "Noa & Kay Scholer" -> "Noa & Kay", and
 * null for an empty name or an email address typed into the name field.
 * Only an all-lowercase or ALL-CAPS name is recapitalised ("ROBERT" ->
 * "Robert"); "DeShawn" and two-letter initials like "TJ" are left alone.
 *
 * Pure and dependency-free so the inbox UI can use it to start a reply.
 */
export function firstNameOf(name: string | null | undefined): string | null {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0 || parts[0].includes("@")) return null;
  const cap = (w: string) => {
    if (w === w.toLowerCase()) return w.charAt(0).toUpperCase() + w.slice(1);
    if (w === w.toUpperCase() && w.length > 2) return w.charAt(0) + w.slice(1).toLowerCase();
    return w;
  };
  if ((parts[1] === "&" || parts[1]?.toLowerCase() === "and") && parts[2]) {
    return `${cap(parts[0])} ${parts[1]} ${cap(parts[2])}`;
  }
  return cap(parts[0]);
}
