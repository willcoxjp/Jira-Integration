import type { Env } from '../types';
import { json } from '../utils/db-helpers';

export async function handleConnectors(
  method: string,
  id: string | undefined,
  request: Request,
  env: Env
): Promise<Response> {
  if (method === 'GET' && !id) {
    const result = await env.DB.prepare('SELECT * FROM connectors ORDER BY id').all();
    return json(result.results);
  }

  if (method === 'GET' && id) {
    const row = await env.DB.prepare('SELECT * FROM connectors WHERE id = ?').bind(id).first();
    return row ? json(row) : json({ error: 'Not found' }, 404);
  }

  if (method === 'POST') {
    const body: any = await request.json();
    const result = await env.DB
      .prepare(
        `INSERT INTO connectors (name, kind, base_url, auth_type, secret_ref, config_json, is_enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        body.name,
        body.kind,
        body.base_url,
        body.auth_type || 'basic',
        body.secret_ref || null,
        body.config_json || '{}',
        body.is_enabled ?? 1
      )
      .run();
    return json({ id: result.meta.last_row_id }, 201);
  }

  if (method === 'PUT' && id) {
    const body: any = await request.json();
    await env.DB
      .prepare(
        `UPDATE connectors SET name=?, base_url=?, auth_type=?, secret_ref=?, config_json=?, is_enabled=?,
         updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`
      )
      .bind(
        body.name,
        body.base_url,
        body.auth_type,
        body.secret_ref || null,
        body.config_json || '{}',
        body.is_enabled ?? 1,
        id
      )
      .run();
    return json({ ok: true });
  }

  if (method === 'DELETE' && id) {
    await env.DB.prepare('DELETE FROM connectors WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
