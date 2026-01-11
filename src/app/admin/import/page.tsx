import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CSVUploader } from "@/components/admin/import/CSVUploader";
import { generateCSVTemplate } from "@/lib/admin/csv-parser";

export default function ImportPage() {
  const templateContent = generateCSVTemplate();
  const templateBlob = `data:text/csv;charset=utf-8,${encodeURIComponent(templateContent)}`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Bulk Import</h1>
        <p className="text-muted-foreground">
          Import buildings from CSV files
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Import Buildings</CardTitle>
          <CardDescription>
            Upload a CSV file with building data. Required columns: name,
            address_1, city_slug
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CSVUploader />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CSV Template</CardTitle>
          <CardDescription>
            Download a template with all supported columns and an example row
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href={templateBlob}
            download="buildings-import-template.csv"
            className="inline-flex items-center gap-2 text-primary hover:underline"
          >
            Download Template
          </a>

          <div className="mt-6">
            <h4 className="font-medium mb-3">Supported Columns</h4>
            <div className="grid gap-2 text-sm">
              <div className="grid grid-cols-3 gap-4 py-2 border-b">
                <span className="font-medium">Column</span>
                <span className="font-medium">Required</span>
                <span className="font-medium">Description</span>
              </div>
              {[
                { name: "name", required: true, desc: "Building name" },
                { name: "address_1", required: true, desc: "Street address" },
                { name: "address_2", required: false, desc: "Suite, floor, etc." },
                { name: "zip", required: false, desc: "ZIP/postal code" },
                { name: "city_slug", required: true, desc: "City slug (e.g., miami, new-york)" },
                { name: "neighborhood_slug", required: false, desc: "Neighborhood slug" },
                { name: "year_built", required: false, desc: "Year building was constructed" },
                { name: "stories", required: false, desc: "Number of floors" },
                { name: "description", required: false, desc: "Building description" },
                { name: "website_url", required: false, desc: "Building/leasing website" },
                { name: "leasing_phone", required: false, desc: "Leasing office phone" },
                { name: "leasing_email", required: false, desc: "Leasing office email" },
                { name: "pet_policy", required: false, desc: "Pet policy description" },
                { name: "parking_policy", required: false, desc: "Parking info" },
                { name: "status", required: false, desc: "active, inactive, or coming_soon" },
              ].map((col) => (
                <div key={col.name} className="grid grid-cols-3 gap-4 py-2 border-b">
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded w-fit">
                    {col.name}
                  </code>
                  <span className={col.required ? "text-red-600" : "text-muted-foreground"}>
                    {col.required ? "Yes" : "No"}
                  </span>
                  <span className="text-muted-foreground">{col.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
