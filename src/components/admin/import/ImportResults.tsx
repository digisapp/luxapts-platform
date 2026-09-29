"use client";

import { CheckCircle, XCircle, RefreshCw, Plus } from "lucide-react";
import type { ImportResponse } from "@/types/import";

interface ImportResultsProps {
  results: ImportResponse;
}

export function ImportResults({ results }: ImportResultsProps) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="p-4 rounded-lg bg-muted">
          <p className="text-sm text-muted-foreground">Total Processed</p>
          <p className="text-2xl font-bold">{results.total}</p>
        </div>
        <div className="p-4 rounded-lg bg-green-500/10">
          <div className="flex items-center gap-2 text-green-300">
            <Plus className="h-4 w-4" />
            <p className="text-sm">Created</p>
          </div>
          <p className="text-2xl font-bold text-green-300">
            {results.created}
          </p>
        </div>
        <div className="p-4 rounded-lg bg-blue-500/10">
          <div className="flex items-center gap-2 text-blue-300">
            <RefreshCw className="h-4 w-4" />
            <p className="text-sm">Updated</p>
          </div>
          <p className="text-2xl font-bold text-blue-300">
            {results.updated}
          </p>
        </div>
        <div className="p-4 rounded-lg bg-red-500/10">
          <div className="flex items-center gap-2 text-red-300">
            <XCircle className="h-4 w-4" />
            <p className="text-sm">Failed</p>
          </div>
          <p className="text-2xl font-bold text-red-300">
            {results.failed}
          </p>
        </div>
      </div>

      {/* Status Message */}
      {results.success ? (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 text-green-300">
          <CheckCircle className="h-5 w-5" />
          <p className="font-medium">
            Import completed successfully! All {results.total} buildings were
            processed.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-yellow-500/10 text-yellow-300">
          <XCircle className="h-5 w-5" />
          <p className="font-medium">
            Import completed with {results.failed} error(s). Please review the
            failed rows below.
          </p>
        </div>
      )}

      {/* Failed rows detail */}
      {results.failed > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-muted font-medium text-sm">
            Failed Rows
          </div>
          <div className="max-h-60 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Row</th>
                  <th className="px-4 py-2 text-left font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {results.results
                  .filter((r) => !r.success)
                  .map((row) => (
                    <tr key={row.rowIndex} className="border-t">
                      <td className="px-4 py-2">{row.rowIndex}</td>
                      <td className="px-4 py-2 text-red-400">{row.error}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
