import type { Env } from '../types';
import { json } from '../utils/db-helpers';

export async function handleResources(
  method: string,
  id: string | undefined,
  request: Request,
  env: Env
): Promise<Response> {
  if (method === 'GET') {
    const result = await env.DB.prepare('SELECT * FROM resources ORDER BY resource_name').all();
    return json(result.results);
  }

  if (method === 'POST') {
    const body: any = await request.json();
    const result = await env.DB
      .prepare(
        `INSERT INTO resources (resource_name, location, resource_type, capacity_count, crew_size, efficiency, resource_calendar, is_active, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        body.resource_name,
        body.location || 'DD Tech',
        body.resource_type || 'Resource',
        body.capacity_count ?? 1,
        body.crew_size ?? 1,
        body.efficiency ?? 100,
        body.resource_calendar || 'Standard Calendar (M-F)',
        body.is_active ?? 1,
        body.description || null
      )
      .run();
    return json({ id: result.meta.last_row_id }, 201);
  }

  if (method === 'PUT' && id) {
    const body: any = await request.json();
    await env.DB
      .prepare(
        `UPDATE resources SET resource_name=?, location=?, resource_type=?, capacity_count=?,
         crew_size=?, efficiency=?, resource_calendar=?, is_active=?, description=? WHERE id=?`
      )
      .bind(
        body.resource_name, body.location || 'DD Tech', body.resource_type || 'Resource',
        body.capacity_count ?? 1, body.crew_size ?? 1, body.efficiency ?? 100,
        body.resource_calendar || 'Standard Calendar (M-F)', body.is_active ?? 1,
        body.description || null, id
      )
      .run();
    return json({ ok: true });
  }

  if (method === 'DELETE' && id) {
    await env.DB.prepare('DELETE FROM resources WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
