interface ApartmentComplexJsonLdProps {
  name: string;
  description?: string;
  address: string;
  city: string;
  state?: string;
  zip?: string;
  url?: string;
  image?: string;
  priceRange?: { min: number; max: number };
  amenities?: string[];
  latitude?: number;
  longitude?: number;
}

export function ApartmentComplexJsonLd({
  name,
  description,
  address,
  city,
  state,
  zip,
  url,
  image,
  priceRange,
  amenities,
  latitude,
  longitude,
}: ApartmentComplexJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ApartmentComplex",
    name,
    description: description || `Luxury apartments at ${name} in ${city}`,
    address: {
      "@type": "PostalAddress",
      streetAddress: address,
      addressLocality: city,
      ...(state && { addressRegion: state }),
      ...(zip && { postalCode: zip }),
      addressCountry: "US",
    },
    ...(url && { url }),
    ...(image && { image }),
    ...(priceRange && {
      priceRange: `$${priceRange.min.toLocaleString()} - $${priceRange.max.toLocaleString()}/month`,
    }),
    ...(amenities?.length && {
      amenityFeature: amenities.map((a) => ({
        "@type": "LocationFeatureSpecification",
        name: a,
        value: true,
      })),
    }),
    ...(latitude &&
      longitude && {
        geo: {
          "@type": "GeoCoordinates",
          latitude,
          longitude,
        },
      }),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
    />
  );
}

interface WebsiteJsonLdProps {
  url?: string;
}

export function WebsiteJsonLd({
  url = "https://staycio.com",
}: WebsiteJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Staycio",
    url,
    description: "AI-Powered Luxury Apartment Search",
    potentialAction: {
      "@type": "SearchAction",
      target: `${url}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
    />
  );
}

/* ------------------------------------------------------------------------ */
/* Shared renderer                                                           */
/* ------------------------------------------------------------------------ */

function JsonLdScript({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

/* ------------------------------------------------------------------------ */
/* BreadcrumbList                                                            */
/* ------------------------------------------------------------------------ */

export interface Crumb {
  name: string;
  /** Site-relative path; omit on the current page (the last crumb). */
  path?: string;
}

/**
 * Google renders the breadcrumb trail in place of the URL in the SERP. Without
 * it, a building result showed the raw path — which, before slugs existed, was
 * a UUID. Emitted on every indexable page that sits below the root.
 */
export function BreadcrumbJsonLd({ items }: { items: Crumb[] }) {
  return (
    <JsonLdScript
      data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((c, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: c.name,
          ...(c.path ? { item: `https://staycio.com${c.path}` } : {}),
        })),
      }}
    />
  );
}

/* ------------------------------------------------------------------------ */
/* Organization                                                              */
/* ------------------------------------------------------------------------ */

export function OrganizationJsonLd() {
  return (
    <JsonLdScript
      data={{
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": "https://staycio.com/#organization",
        name: "Staycio",
        alternateName: "Staycio Apartments",
        url: "https://staycio.com",
        logo: {
          "@type": "ImageObject",
          url: "https://staycio.com/icons/icon-512.png",
          width: 512,
          height: 512,
        },
        image: "https://staycio.com/og-image.png",
        description:
          "Staycio is an AI-powered apartment search. Describe the apartment you want and Stacy searches live listings across New York, Miami, Los Angeles, Dallas, Austin, Nashville, Atlanta and Brooklyn.",
        areaServed: [
          "New York, NY",
          "Brooklyn, NY",
          "Miami, FL",
          "Los Angeles, CA",
          "Dallas, TX",
          "Austin, TX",
          "Nashville, TN",
          "Atlanta, GA",
        ].map((name) => ({ "@type": "City", name })),
      }}
    />
  );
}

/* ------------------------------------------------------------------------ */
/* ItemList (collection pages)                                               */
/* ------------------------------------------------------------------------ */

export interface ListedBuilding {
  name: string;
  path: string;
  image?: string | null;
  cityName?: string | null;
  address?: string | null;
  minPrice?: number | null;
}

/**
 * Tells Google a collection page is a ranked list of distinct properties
 * rather than one wall of text. City, neighborhood and facet pages all use it.
 */
export function BuildingItemListJsonLd({
  name,
  buildings,
}: {
  name: string;
  buildings: ListedBuilding[];
}) {
  if (buildings.length === 0) return null;
  return (
    <JsonLdScript
      data={{
        "@context": "https://schema.org",
        "@type": "ItemList",
        name,
        numberOfItems: buildings.length,
        itemListElement: buildings.map((b, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "ApartmentComplex",
            name: b.name,
            url: `https://staycio.com${b.path}`,
            ...(b.image ? { image: b.image } : {}),
            ...(b.address || b.cityName
              ? {
                  address: {
                    "@type": "PostalAddress",
                    ...(b.address ? { streetAddress: b.address } : {}),
                    ...(b.cityName ? { addressLocality: b.cityName } : {}),
                    addressCountry: "US",
                  },
                }
              : {}),
            ...(b.minPrice
              ? { priceRange: `From $${b.minPrice.toLocaleString()}/mo` }
              : {}),
          },
        })),
      }}
    />
  );
}

/* ------------------------------------------------------------------------ */
/* Available units as offers                                                 */
/* ------------------------------------------------------------------------ */

export interface UnitOffer {
  unitId: string;
  unitNumber?: string | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  price?: number | null;
  availableOn?: string | null;
}

/**
 * The real-estate rich result keys off priced Accommodation offers, not off the
 * ApartmentComplex node alone. Building pages carry live per-unit pricing that
 * was rendered as a plain HTML table and therefore invisible to it.
 */
export function UnitOffersJsonLd({
  buildingName,
  buildingUrl,
  units,
}: {
  buildingName: string;
  buildingUrl: string;
  units: UnitOffer[];
}) {
  const priced = units.filter((u) => typeof u.price === "number" && u.price > 0);
  if (priced.length === 0) return null;

  return (
    <JsonLdScript
      data={{
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: `Available units at ${buildingName}`,
        numberOfItems: priced.length,
        itemListElement: priced.map((u, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "Apartment",
            name: `${u.beds === 0 ? "Studio" : `${u.beds}-Bedroom`}${
              u.unitNumber ? ` #${u.unitNumber}` : ""
            } at ${buildingName}`,
            url: `${buildingUrl}/units/${u.unitId}`,
            ...(typeof u.beds === "number" ? { numberOfBedrooms: u.beds } : {}),
            ...(typeof u.baths === "number" ? { numberOfBathroomsTotal: u.baths } : {}),
            ...(u.sqft
              ? { floorSize: { "@type": "QuantitativeValue", value: u.sqft, unitCode: "FTK" } }
              : {}),
            offers: {
              "@type": "Offer",
              price: u.price,
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
              ...(u.availableOn ? { availabilityStarts: u.availableOn } : {}),
              businessFunction: "https://schema.org/LeaseOut",
              unitText: "MONTH",
            },
          },
        })),
      }}
    />
  );
}

/* ------------------------------------------------------------------------ */
/* FAQPage                                                                   */
/* ------------------------------------------------------------------------ */

export function FaqJsonLd({ items }: { items: { question: string; answer: string }[] }) {
  if (items.length === 0) return null;
  return (
    <JsonLdScript
      data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      }}
    />
  );
}
