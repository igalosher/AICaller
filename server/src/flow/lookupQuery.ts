import type { FlowLookupTableDef } from "./graphTypes.js";

export const MAX_LOOKUP_ROWS = 500;
export const MAX_LOOKUP_BYTES = 256 * 1024;

export function parseLookupRows(rows: unknown): Record<string, unknown>[] {
  if (!Array.isArray(rows)) {
    throw new Error("טבלת חיפוש חייבת להיות מערך JSON של אובייקטים");
  }
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("כל שורה בטבלת חיפוש חייבת להיות אובייקט JSON");
    }
  }
  return rows as Record<string, unknown>[];
}

export function lookupTableSizeBytes(table: FlowLookupTableDef): number {
  return Buffer.byteLength(JSON.stringify(table.rows), "utf8");
}

export function validateLookupTableSize(table: FlowLookupTableDef): string | null {
  if (table.rows.length > MAX_LOOKUP_ROWS) {
    return `טבלה "${table.name}" חורגת ממגבלת ${MAX_LOOKUP_ROWS} שורות`;
  }
  if (lookupTableSizeBytes(table) > MAX_LOOKUP_BYTES) {
    return `טבלה "${table.name}" חורגת ממגבלת גודל (${MAX_LOOKUP_BYTES} בתים)`;
  }
  return null;
}

export function listLookupColumns(rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) return [];
  return Object.keys(rows[0]!);
}

export function lookupExists(
  tables: FlowLookupTableDef[],
  tableName: string,
  column: string,
  value: unknown,
): boolean {
  const table = tables.find((t) => t.name === tableName);
  if (!table) return false;
  const needle = normalizeCompareValue(value);
  return table.rows.some((row) => normalizeCompareValue(row[column]) === needle);
}

function normalizeCompareValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value).trim();
}
