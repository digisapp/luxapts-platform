import type { BuildingCSVRow } from "@/types/import";

// Handle quoted values and commas within quotes
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.replace(/^"|"$/g, "").trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.replace(/^"|"$/g, "").trim());

  return result;
}

// Parse CSV text into BuildingCSVRow array
export function parseCSV(text: string): BuildingCSVRow[] {
  const lines = text.split("\n").filter((line) => line.trim());
  if (lines.length < 2) {
    throw new Error("CSV must have header and at least one data row");
  }

  // Parse headers
  const headers = parseCSVLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/\s+/g, "_")
  );

  // Validate required columns
  const requiredColumns = ["name", "address_1", "city_slug"];
  const missingColumns = requiredColumns.filter((col) => !headers.includes(col));
  if (missingColumns.length > 0) {
    throw new Error(`Missing required columns: ${missingColumns.join(", ")}`);
  }

  const rows: BuildingCSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};

    headers.forEach((header, idx) => {
      row[header] = values[idx] || "";
    });

    // Skip completely empty rows
    if (!row.name && !row.address_1 && !row.city_slug) {
      continue;
    }

    rows.push({
      name: row.name || "",
      address_1: row.address_1 || "",
      address_2: row.address_2 || undefined,
      zip: row.zip || undefined,
      city_slug: row.city_slug || "",
      neighborhood_slug: row.neighborhood_slug || undefined,
      year_built: row.year_built ? parseInt(row.year_built) : undefined,
      stories: row.stories ? parseInt(row.stories) : undefined,
      description: row.description || undefined,
      website_url: row.website_url || undefined,
      leasing_phone: row.leasing_phone || undefined,
      leasing_email: row.leasing_email || undefined,
      pet_policy: row.pet_policy || undefined,
      parking_policy: row.parking_policy || undefined,
      status: parseStatus(row.status),
    });
  }

  return rows;
}

function parseStatus(
  value: string | undefined
): "active" | "inactive" | "coming_soon" | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase().trim();
  if (normalized === "active") return "active";
  if (normalized === "inactive") return "inactive";
  if (normalized === "coming_soon" || normalized === "coming soon") {
    return "coming_soon";
  }
  return undefined;
}

// Generate CSV template content
export function generateCSVTemplate(): string {
  const headers = [
    "name",
    "address_1",
    "address_2",
    "zip",
    "city_slug",
    "neighborhood_slug",
    "year_built",
    "stories",
    "description",
    "website_url",
    "leasing_phone",
    "leasing_email",
    "pet_policy",
    "parking_policy",
    "status",
  ];

  const exampleRow = [
    "Luxury Tower",
    "123 Main Street",
    "Suite 100",
    "33131",
    "miami",
    "brickell",
    "2020",
    "40",
    "Modern luxury living in the heart of Miami",
    "https://luxurytower.com",
    "(305) 555-1234",
    "leasing@luxurytower.com",
    "Cats and dogs allowed, 2 pet max",
    "Covered parking available",
    "active",
  ];

  return `${headers.join(",")}\n${exampleRow.join(",")}`;
}
