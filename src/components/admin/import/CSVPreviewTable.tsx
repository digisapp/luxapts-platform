"use client";

import type { BuildingCSVRow } from "@/types/import";

interface CSVPreviewTableProps {
  data: BuildingCSVRow[];
}

export function CSVPreviewTable({ data }: CSVPreviewTableProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No data to preview
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto max-h-96">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0">
            <tr>
              <th className="px-4 py-2 text-left font-medium">#</th>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">Address</th>
              <th className="px-4 py-2 text-left font-medium">City</th>
              <th className="px-4 py-2 text-left font-medium">Neighborhood</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 50).map((row, index) => (
              <tr key={index} className="border-t">
                <td className="px-4 py-2 text-muted-foreground">{index + 1}</td>
                <td className="px-4 py-2 font-medium">{row.name || "-"}</td>
                <td className="px-4 py-2">
                  {row.address_1 || "-"}
                  {row.address_2 && `, ${row.address_2}`}
                </td>
                <td className="px-4 py-2">{row.city_slug || "-"}</td>
                <td className="px-4 py-2">{row.neighborhood_slug || "-"}</td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.status === "active"
                        ? "bg-green-100 text-green-800"
                        : row.status === "inactive"
                        ? "bg-gray-100 text-gray-800"
                        : row.status === "coming_soon"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {row.status || "active"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length > 50 && (
        <div className="px-4 py-2 bg-muted text-sm text-muted-foreground text-center">
          Showing first 50 of {data.length} rows
        </div>
      )}
    </div>
  );
}
