/**
 * Escape a single CSV field value per RFC 4180.
 * - null/undefined → empty string
 * - Numbers → string representation
 * - Strings with commas, quotes, or newlines → wrapped in quotes with doubled internal quotes
 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Generate a CSV string from columns and row objects.
 * Columns define the order; missing fields become empty strings.
 */
export function generateCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const header = columns.join(',');
  if (rows.length === 0) return header;

  const body = rows
    .map(row =>
      columns.map(col => escapeCsvField(row[col])).join(',')
    )
    .join('\n');

  return header + '\n' + body;
}
