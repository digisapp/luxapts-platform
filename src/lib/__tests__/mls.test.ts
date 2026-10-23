import { describe, it, expect } from "vitest";
import { leaseFilter, toListingRow, resoConfigFromEnv } from "@/lib/mls/reso";
import { buildAddressIndex, matchListing } from "@/lib/mls/match";
import { addressKey } from "@/lib/address-key";

describe("leaseFilter", () => {
  it("asks for active leases in the given ZIPs", () => {
    expect(leaseFilter(["33131", "33130"])).toBe(
      "PropertyType eq 'ResidentialLease' and StandardStatus eq 'Active' and (PostalCode eq '33131' or PostalCode eq '33130')"
    );
    expect(leaseFilter(["33131"], "2026-10-22T00:00:00Z")).toContain("ModificationTimestamp gt 2026-10-22T00:00:00Z");
    expect(leaseFilter(["33131' or 1 eq 1"])).not.toContain("'33131' or");
  });
});

describe("toListingRow", () => {
  it("keeps the RESO fields the page shows, with photos in order", () => {
    const row = toListingRow({
      ListingKey: "abc",
      ListingId: "A11234567",
      StandardStatus: "Active",
      PropertyType: "ResidentialLease",
      ListPrice: 4500,
      BedroomsTotal: 1,
      BathroomsTotalDecimal: 1.5,
      LivingArea: 812.4,
      UnitNumber: " 3407 ",
      StreetNumber: "465",
      StreetName: "Brickell",
      StreetSuffix: "Ave",
      PostalCode: "33131-1234",
      ListOfficeName: "Example Realty",
      PetsAllowed: ["Yes", "Size Limit"],
      Media: [
        { MediaURL: "https://cdn/2.jpg", Order: 2, MediaCategory: "Photo" },
        { MediaURL: "https://cdn/1.jpg", Order: 1, MediaCategory: "Photo" },
        { MediaURL: "https://cdn/plan.pdf", Order: 0, MediaCategory: "Document" },
      ],
    });
    expect(row).toMatchObject({
      listing_id: "A11234567",
      is_active: true,
      list_price: 4500,
      bathrooms: 1.5,
      living_area: 812,
      unit_number: "3407",
      street_name: "Brickell Ave",
      postal_code: "33131",
      list_office_name: "Example Realty",
      pets_allowed: "Yes, Size Limit",
      photo_urls: ["https://cdn/1.jpg", "https://cdn/2.jpg"],
    });
    expect(toListingRow({ ListingKey: "x", StandardStatus: "Pending" }).is_active).toBe(false);
  });
});

describe("matchListing", () => {
  const index = buildAddressIndex([
    { id: "icon-1", address_1: "465 Brickell Ave", zip: "33131" },
    { id: "jade", address_1: "1331 Brickell Bay Drive", zip: "33131", addresses: ["1331 Brickell Bay Dr"] },
    { id: "flatiron", address_1: "1000 Brickell Plaza", zip: "33131" },
  ]);

  it("matches on the normalized street address", () => {
    expect(matchListing({ street_number: "465", street_name: "Brickell Avenue", postal_code: "33131", unparsed_address: null }, index)).toBe("icon-1");
    expect(matchListing({ street_number: "1331", street_name: "Brickell Bay Dr", postal_code: "33131", unparsed_address: null }, index)).toBe("jade");
  });

  it("falls back to number + ZIP + street name's first word", () => {
    expect(matchListing({ street_number: "1000", street_name: "Brickell", postal_code: "33131", unparsed_address: null }, index)).toBe("flatiron");
  });

  it("does not guess across different streets", () => {
    expect(matchListing({ street_number: "465", street_name: "NE 2nd Ave", postal_code: "33131", unparsed_address: null }, index)).toBeNull();
  });
});

describe("addressKey", () => {
  it("normalizes abbreviations, directions, ordinals and unit numbers", () => {
    expect(addressKey("100 West 31st Street")).toBe(addressKey("100 W. 31 St."));
    expect(addressKey("2600 Biscayne Boulevard Unit 1205")).toBe(addressKey("2600 Biscayne Blvd"));
    expect(addressKey("55 Northeast 2nd Avenue")).toBe(addressKey("55 NE 2nd Ave"));
  });
});

describe("resoConfigFromEnv", () => {
  it("is off until credentials exist", () => {
    expect(resoConfigFromEnv({} as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(resoConfigFromEnv({ MLS_PROVIDER: "trestle", MLS_CLIENT_ID: "x" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(resoConfigFromEnv({ MLS_PROVIDER: "bridge", MLS_BRIDGE_TOKEN: "t", MLS_BRIDGE_DATASET: "miamire" } as unknown as NodeJS.ProcessEnv)?.baseUrl).toBe(
      "https://api.bridgedataoutput.com/api/v2/OData/miamire"
    );
  });
});
