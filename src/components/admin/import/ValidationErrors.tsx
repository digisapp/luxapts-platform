"use client";

import { AlertCircle, AlertTriangle } from "lucide-react";
import type { ValidationResponse } from "@/types/import";

interface ValidationErrorsProps {
  validation: ValidationResponse;
}

export function ValidationErrors({ validation }: ValidationErrorsProps) {
  const rowsWithIssues = validation.results.filter(
    (r) => r.errors.length > 0 || r.warnings.length > 0
  );

  if (rowsWithIssues.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex gap-4">
        {validation.invalidRows > 0 && (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" />
            {validation.invalidRows} row(s) with errors
          </div>
        )}
        {rowsWithIssues.filter((r) => r.warnings.length > 0).length > 0 && (
          <div className="flex items-center gap-2 text-sm text-yellow-600">
            <AlertTriangle className="h-4 w-4" />
            {rowsWithIssues.filter((r) => r.warnings.length > 0).length} row(s) with
            warnings
          </div>
        )}
      </div>

      {/* Detailed errors */}
      <div className="border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0">
            <tr>
              <th className="px-4 py-2 text-left font-medium w-16">Row</th>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">Issues</th>
            </tr>
          </thead>
          <tbody>
            {rowsWithIssues.map((row) => (
              <tr key={row.rowIndex} className="border-t">
                <td className="px-4 py-2 font-medium">{row.rowIndex}</td>
                <td className="px-4 py-2">{row.data.name || "(empty)"}</td>
                <td className="px-4 py-2">
                  <div className="space-y-1">
                    {row.errors.map((error, i) => (
                      <div
                        key={`error-${i}`}
                        className="flex items-center gap-2 text-red-600"
                      >
                        <AlertCircle className="h-3 w-3 flex-shrink-0" />
                        {error}
                      </div>
                    ))}
                    {row.warnings.map((warning, i) => (
                      <div
                        key={`warning-${i}`}
                        className="flex items-center gap-2 text-yellow-600"
                      >
                        <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                        {warning}
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
