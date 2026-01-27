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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

interface WebsiteJsonLdProps {
  url?: string;
}

export function WebsiteJsonLd({
  url = "https://luxapts.co",
}: WebsiteJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "LuxApts",
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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
