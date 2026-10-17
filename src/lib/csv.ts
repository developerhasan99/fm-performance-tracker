type Cell = string | number | boolean | Date | null | undefined;

// Leading = + - @ (or tab/CR) make Excel/Sheets run the cell as a formula; customer-written text must not.
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: Cell) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 16).replace("T", " ");
  if (typeof value !== "string") return String(value);
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export const toCsv = (rows: Cell[][]) => rows.map((row) => row.map(cell).join(",")).join("\r\n");

/** CSV download; the BOM makes Excel read UTF-8 (ä, ö, ß) correctly. Dates are UTC. */
export function csvResponse(name: string, rows: Cell[][]) {
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${toCsv(rows)}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
