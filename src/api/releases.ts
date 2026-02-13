import type { Env } from '../types';
import { json } from '../utils/db-helpers';

export async function handleReleaseDates(
  method: string,
  id: string | undefined,
  request: Request,
  env: Env
): Promise<Response> {
  if (method === 'GET') {
    const result = await env.DB.prepare('SELECT * FROM release_dates ORDER BY release_date DESC').all();
    return json(result.results);
  }

  if (method === 'POST') {
    const body: any = await request.json();
    const result = await env.DB
      .prepare(
        'INSERT INTO release_dates (version_name, status, start_date, release_date, description) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(body.version_name, body.status || null, body.start_date || null, body.release_date || null, body.description || null)
      .run();
    return json({ id: result.meta.last_row_id }, 201);
  }

  if (method === 'PUT' && id) {
    const body: any = await request.json();
    await env.DB
      .prepare(
        `UPDATE release_dates SET version_name=?, status=?, start_date=?, release_date=?, description=?,
         updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`
      )
      .bind(body.version_name, body.status || null, body.start_date || null, body.release_date || null, body.description || null, id)
      .run();
    return json({ ok: true });
  }

  if (method === 'DELETE' && id) {
    await env.DB.prepare('DELETE FROM release_dates WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
