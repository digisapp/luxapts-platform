/**
 * RFC 4180 CSV parser for whole files. Quoted fields may span lines, which
 * Follow Up Boss exports rely on: its Texts, Calls and Notes columns hold
 * whole conversations. (The building importer's parser in
 * src/lib/admin/csv-parser.ts splits on newlines first and cannot read them.)
 *
 * Returns rows of raw strings; a UTF-8 byte order mark is dropped. Lines that
 * are entirely empty are skipped.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const endRow = () => {
    row.push(field);
    field = "";
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
      } else {
        field += char;
      }
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      endRow();
    } else if (char === "\r") {
      if (text[i + 1] === "\n") i++;
      endRow();
    } else {
      field += char;
    }
    i++;
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}
