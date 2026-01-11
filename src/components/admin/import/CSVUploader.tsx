"use client";

import { useState, useCallback } from "react";
import { Upload, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CSVPreviewTable } from "./CSVPreviewTable";
import { ValidationErrors } from "./ValidationErrors";
import { ImportResults } from "./ImportResults";
import { parseCSV } from "@/lib/admin/csv-parser";
import type {
  BuildingCSVRow,
  ValidationResponse,
  ImportResponse,
} from "@/types/import";

type ImportStep =
  | "upload"
  | "preview"
  | "validating"
  | "validated"
  | "importing"
  | "complete";

export function CSVUploader() {
  const [step, setStep] = useState<ImportStep>("upload");
  const [parsedData, setParsedData] = useState<BuildingCSVRow[]>([]);
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [results, setResults] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setError(null);
      setFileName(file.name);

      try {
        const text = await file.text();
        const data = parseCSV(text);
        setParsedData(data);
        setStep("preview");
      } catch (err) {
        setError(`Failed to parse CSV: ${err instanceof Error ? err.message : String(err)}`);
        setStep("upload");
      }
    },
    []
  );

  const handleValidate = async () => {
    setStep("validating");
    setError(null);

    try {
      const res = await fetch("/api/admin/import/buildings/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsedData }),
      });

      if (!res.ok) {
        throw new Error("Validation request failed");
      }

      const result: ValidationResponse = await res.json();
      setValidation(result);
      setStep("validated");
    } catch (err) {
      setError(`Validation failed: ${err instanceof Error ? err.message : String(err)}`);
      setStep("preview");
    }
  };

  const handleImport = async () => {
    if (!validation || validation.invalidRows > 0) return;

    setStep("importing");
    setError(null);

    try {
      const res = await fetch("/api/admin/import/buildings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsedData }),
      });

      if (!res.ok) {
        throw new Error("Import request failed");
      }

      const result: ImportResponse = await res.json();
      setResults(result);
      setStep("complete");
    } catch (err) {
      setError(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      setStep("validated");
    }
  };

  const handleReset = () => {
    setStep("upload");
    setParsedData([]);
    setValidation(null);
    setResults(null);
    setError(null);
    setFileName(null);
  };

  return (
    <div className="space-y-6">
      {/* Error display */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Upload step */}
      {step === "upload" && (
        <div className="border-2 border-dashed rounded-lg p-8 text-center">
          <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium mb-2">Upload CSV File</p>
          <p className="text-sm text-muted-foreground mb-4">
            Drag and drop or click to select a file
          </p>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
            id="csv-upload"
          />
          <label htmlFor="csv-upload">
            <Button asChild>
              <span>Select File</span>
            </Button>
          </label>
        </div>
      )}

      {/* Preview step */}
      {step === "preview" && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{fileName}</p>
              <p className="text-sm text-muted-foreground">
                {parsedData.length} row(s) found
              </p>
            </div>
          </div>
          <CSVPreviewTable data={parsedData} />
          <div className="flex gap-4">
            <Button variant="outline" onClick={handleReset}>
              Cancel
            </Button>
            <Button onClick={handleValidate}>Validate Data</Button>
          </div>
        </>
      )}

      {/* Validating step */}
      {step === "validating" && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-lg font-medium">Validating data...</p>
          <p className="text-sm text-muted-foreground">
            Checking {parsedData.length} rows
          </p>
        </div>
      )}

      {/* Validated step */}
      {step === "validated" && validation && (
        <>
          {validation.invalidRows > 0 ? (
            <>
              <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400">
                <AlertCircle className="h-5 w-5" />
                <p className="font-medium">
                  {validation.invalidRows} row(s) have errors. Please fix them
                  and re-upload.
                </p>
              </div>
              <ValidationErrors validation={validation} />
              <div className="flex gap-4">
                <Button variant="outline" onClick={handleReset}>
                  Upload Different File
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400">
                <CheckCircle className="h-5 w-5" />
                <div>
                  <p className="font-medium">
                    All {validation.validRows} rows passed validation
                  </p>
                  {validation.results.some((r) => r.warnings.length > 0) && (
                    <p className="text-sm opacity-80">
                      Some rows have warnings (non-blocking)
                    </p>
                  )}
                </div>
              </div>
              {validation.results.some((r) => r.warnings.length > 0) && (
                <ValidationErrors validation={validation} />
              )}
              <div className="flex gap-4">
                <Button variant="outline" onClick={handleReset}>
                  Cancel
                </Button>
                <Button onClick={handleImport}>Import Buildings</Button>
              </div>
            </>
          )}
        </>
      )}

      {/* Importing step */}
      {step === "importing" && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-lg font-medium">Importing buildings...</p>
          <p className="text-sm text-muted-foreground">
            Processing {parsedData.length} rows
          </p>
        </div>
      )}

      {/* Complete step */}
      {step === "complete" && results && (
        <>
          <ImportResults results={results} />
          <Button onClick={handleReset}>Import Another File</Button>
        </>
      )}
    </div>
  );
}
