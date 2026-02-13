import type { Env } from '../types';
import { json } from '../utils/db-helpers';

export async function handleSettings(
  method: string,
  request: Request,
  env: Env
): Promise<Response> {
  if (method === 'GET') {
    const result = await env.DB.prepare('SELECT key, value, description FROM settings ORDER BY key').all();
    // Return as both array and object for flexibility
    const obj: Record<string, string> = {};
    for (const row of result.results as Array<{ key: string; value: string }>) {
      obj[row.key] = row.value;
    }
    return json({ settings: obj, rows: result.results });
  }

  if (method === 'PUT') {
    const body: any = await request.json();
    // Accepts { key: value, ... } to bulk-update settings
    const entries = Object.entries(body);
    for (const [key, value] of entries) {
      await env.DB
        .prepare(
          `INSERT INTO settings (key, value, updated_at)
           VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        )
        .bind(key, String(value))
        .run();
    }
    return json({ ok: true, updated: entries.length });
  }

  return json({ error: 'Method not allowed' }, 405);
}
