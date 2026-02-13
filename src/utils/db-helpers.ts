/** Helper to return a JSON Response */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Generic: list all rows from a table */
export async function listAll(db: D1Database, table: string): Promise<unknown[]> {
  const result = await db.prepare(`SELECT * FROM ${table}`).all();
  return result.results;
}

/** Generic: get one row by id */
export async function getById(db: D1Database, table: string, id: number | string): Promise<unknown> {
  const result = await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
  return result;
}

/** Generic: delete by id */
export async function deleteById(db: D1Database, table: string, id: number | string): Promise<void> {
  await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).run();
  await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
}

/** Load all settings as a key→value Map */
export async function loadSettings(db: D1Database): Promise<Map<string, string>> {
  const result = await db.prepare('SELECT key, value FROM settings').all();
  const map = new Map<string, string>();
  for (const row of result.results as Array<{ key: string; value: string }>) {
    map.set(row.key, row.value);
  }
  return map;
}

/** Get a single setting value, with a default */
export async function getSetting(db: D1Database, key: string, defaultValue = ''): Promise<string> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? defaultValue;
}
