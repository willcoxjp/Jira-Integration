import type { Env } from '../types';
import { json } from '../utils/db-helpers';

export async function handleEffortMappings(
  method: string,
  id: string | undefined,
  request: Request,
  env: Env
): Promise<Response> {
  if (method === 'GET') {
    const result = await env.DB.prepare('SELECT * FROM effort_mappings ORDER BY hours').all();
    return json(result.results);
  }

  if (method === 'POST') {
    const body: any = await request.json();
    const result = await env.DB
      .prepare('INSERT INTO effort_mappings (effort_label, hours) VALUES (?, ?)')
      .bind(body.effort_label, body.hours)
      .run();
    return json({ id: result.meta.last_row_id }, 201);
  }

  if (method === 'PUT' && id) {
    const body: any = await request.json();
    await env.DB
      .prepare('UPDATE effort_mappings SET effort_label=?, hours=? WHERE id=?')
      .bind(body.effort_label, body.hours, id)
      .run();
    return json({ ok: true });
  }

  if (method === 'DELETE' && id) {
    await env.DB.prepare('DELETE FROM effort_mappings WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
