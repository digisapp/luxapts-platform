// MLS lease listings over the RESO Web API (OData), the format both of
// Miami REALTORS' IDX providers serve: Trestle (head brokers; OAuth2 client
// credentials) and Bridge (agents; a server token per dataset).
//
// Field names are the RESO Data Dictionary's, so nothing here is specific to
// one MLS. Configuration comes from the environment:
//   MLS_PROVIDER=trestle  MLS_CLIENT_ID, MLS_CLIENT_SECRET
//                         [MLS_TOKEN_URL, MLS_BASE_URL to override defaults]
//   MLS_PROVIDER=bridge   MLS_BRIDGE_TOKEN, MLS_BRIDGE_DATASET (e.g. the
//                         dataset id shown in the Bridge dashboard)

export interface ResoConfig {
  provider: "trestle" | "bridge";
  /** OData service root; the Property resource is `${baseUrl}/Property`. */
  baseUrl: string;
  /** Headers or query parameters that authenticate one request. */
  authorize: () => Promise<{ headers: Record<string, string>; query: Record<string, string> }>;
}

export function resoConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ResoConfig | null {
  const provider = env.MLS_PROVIDER?.toLowerCase();
  if (provider === "trestle") {
    const clientId = env.MLS_CLIENT_ID;
    const clientSecret = env.MLS_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    const tokenUrl = env.MLS_TOKEN_URL || "https://api-trestle.corelogic.com/trestle/oidc/connect/token";
    let cached: { token: string; expiresAt: number } | null = null;
    return {
      provider: "trestle",
      baseUrl: env.MLS_BASE_URL || "https://api-trestle.corelogic.com/trestle/odata",
      authorize: async () => {
        if (!cached || Date.now() > cached.expiresAt - 60_000) {
          const res = await fetch(tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "client_credentials",
              client_id: clientId,
              client_secret: clientSecret,
              scope: "api",
            }),
          });
          if (!res.ok) throw new Error(`Trestle token request failed: HTTP ${res.status}`);
          const json = (await res.json()) as { access_token: string; expires_in?: number };
          cached = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
        }
        return { headers: { Authorization: `Bearer ${cached.token}` }, query: {} };
      },
    };
  }
  if (provider === "bridge") {
    const token = env.MLS_BRIDGE_TOKEN;
    const dataset = env.MLS_BRIDGE_DATASET;
    if (!token || !dataset) return null;
    return {
      provider: "bridge",
      baseUrl: env.MLS_BASE_URL || `https://api.bridgedataoutput.com/api/v2/OData/${encodeURIComponent(dataset)}`,
      authorize: async () => ({ headers: {}, query: { access_token: token } }),
    };
  }
  return null;
}

/** Active lease listings in the given ZIP codes, optionally only those modified since an instant. Pure. */
export function leaseFilter(postalCodes: string[], modifiedSince?: string): string {
  const zips = postalCodes.map((z) => `PostalCode eq '${z.replace(/'/g, "")}'`).join(" or ");
  return [
    "PropertyType eq 'ResidentialLease'",
    "StandardStatus eq 'Active'",
    `(${zips})`,
    ...(modifiedSince ? [`ModificationTimestamp gt ${modifiedSince}`] : []),
  ].join(" and ");
}

/** The subset of a RESO Property record the site uses. */
export interface ResoProperty {
  ListingKey: string;
  ListingId?: string | null;
  StandardStatus?: string | null;
  PropertyType?: string | null;
  ListPrice?: number | null;
  BedroomsTotal?: number | null;
  BathroomsTotalInteger?: number | null;
  BathroomsTotalDecimal?: number | null;
  LivingArea?: number | null;
  UnitNumber?: string | null;
  StreetNumber?: string | null;
  StreetName?: string | null;
  StreetSuffix?: string | null;
  StreetDirPrefix?: string | null;
  UnparsedAddress?: string | null;
  PostalCode?: string | null;
  City?: string | null;
  BuildingName?: string | null;
  AvailabilityDate?: string | null;
  LeaseTerm?: string | null;
  Furnished?: string | null;
  PetsAllowed?: string[] | string | null;
  PublicRemarks?: string | null;
  ListOfficeName?: string | null;
  ListOfficePhone?: string | null;
  ListAgentFullName?: string | null;
  ModificationTimestamp?: string | null;
  Media?: { MediaURL?: string | null; Order?: number | null; MediaCategory?: string | null }[] | null;
  [key: string]: unknown;
}

export interface MlsListingRow {
  listing_key: string;
  listing_id: string | null;
  standard_status: string;
  is_active: boolean;
  property_type: string | null;
  list_price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  living_area: number | null;
  unit_number: string | null;
  street_number: string | null;
  street_name: string | null;
  unparsed_address: string | null;
  postal_code: string | null;
  city: string | null;
  building_name: string | null;
  available_date: string | null;
  lease_term: string | null;
  furnished: string | null;
  pets_allowed: string | null;
  public_remarks: string | null;
  photo_urls: string[];
  list_office_name: string | null;
  list_office_phone: string | null;
  list_agent_name: string | null;
  modification_timestamp: string | null;
  raw: ResoProperty;
}

const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);

/** One RESO record as an mls_listings row. Pure. */
export function toListingRow(p: ResoProperty): MlsListingRow {
  const street = [p.StreetDirPrefix, p.StreetName, p.StreetSuffix].filter(Boolean).join(" ") || null;
  const photos = (p.Media ?? [])
    .filter((m) => m.MediaURL && (!m.MediaCategory || /photo/i.test(m.MediaCategory)))
    .sort((a, b) => (a.Order ?? 0) - (b.Order ?? 0))
    .map((m) => m.MediaURL as string)
    .slice(0, 12);
  const status = p.StandardStatus ?? "Unknown";
  return {
    listing_key: p.ListingKey,
    listing_id: p.ListingId ?? null,
    standard_status: status,
    is_active: status === "Active",
    property_type: p.PropertyType ?? null,
    list_price: int(p.ListPrice),
    bedrooms: int(p.BedroomsTotal),
    bathrooms:
      typeof p.BathroomsTotalDecimal === "number"
        ? p.BathroomsTotalDecimal
        : typeof p.BathroomsTotalInteger === "number"
          ? p.BathroomsTotalInteger
          : null,
    living_area: int(p.LivingArea),
    unit_number: p.UnitNumber?.trim() || null,
    street_number: p.StreetNumber?.trim() || null,
    street_name: street,
    unparsed_address: p.UnparsedAddress ?? null,
    postal_code: p.PostalCode?.slice(0, 5) ?? null,
    city: p.City ?? null,
    building_name: p.BuildingName?.trim() || null,
    available_date: p.AvailabilityDate?.slice(0, 10) ?? null,
    lease_term: p.LeaseTerm ?? null,
    furnished: p.Furnished ?? null,
    pets_allowed: Array.isArray(p.PetsAllowed) ? p.PetsAllowed.join(", ") : (p.PetsAllowed ?? null),
    public_remarks: p.PublicRemarks ?? null,
    photo_urls: photos,
    list_office_name: p.ListOfficeName ?? null,
    list_office_phone: p.ListOfficePhone ?? null,
    list_agent_name: p.ListAgentFullName ?? null,
    modification_timestamp: p.ModificationTimestamp ?? null,
    raw: p,
  };
}

/**
 * Every page of active lease listings for the ZIP codes, following
 * @odata.nextLink. Yields one page (array of records) at a time.
 */
export async function* fetchLeaseListings(
  cfg: ResoConfig,
  postalCodes: string[],
  opts: { modifiedSince?: string; pageSize?: number } = {}
): AsyncGenerator<ResoProperty[]> {
  const first = new URL(`${cfg.baseUrl}/Property`);
  first.searchParams.set("$filter", leaseFilter(postalCodes, opts.modifiedSince));
  first.searchParams.set("$top", String(opts.pageSize ?? 200));
  first.searchParams.set("$expand", "Media");
  let next: string | null = first.toString();

  while (next) {
    const auth = await cfg.authorize();
    const url = new URL(next);
    for (const [k, v] of Object.entries(auth.query)) if (!url.searchParams.has(k)) url.searchParams.set(k, v);
    const res = await fetch(url, { headers: { Accept: "application/json", ...auth.headers } });
    if (!res.ok) throw new Error(`RESO request failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { value?: ResoProperty[]; "@odata.nextLink"?: string };
    yield body.value ?? [];
    next = body["@odata.nextLink"] ?? null;
  }
}
