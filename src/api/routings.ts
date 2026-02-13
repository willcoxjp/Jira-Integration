import type { Env } from '../types';
import { json } from '../utils/db-helpers';

export async function handleRoutings(
  method: string,
  id: string | undefined,
  request: Request,
  env: Env
): Promise<Response> {
  if (method === 'GET' && !id) {
    // Return routings grouped by part type
    const result = await env.DB
      .prepare(
        `SELECT rd.*, pt.jira_issue_type, pt.intuiflow_part_number
         FROM routing_definitions rd
         JOIN part_types pt ON rd.part_type_id = pt.id
         ORDER BY pt.jira_issue_type, rd.sort_order`
      )
      .all();
    return json(result.results);
  }

  if (method === 'GET' && id) {
    const row = await env.DB.prepare('SELECT * FROM routing_definitions WHERE id = ?').bind(id).first();
    return row ? json(row) : json({ error: 'Not found' }, 404);
  }

  if (method === 'POST') {
    const body: any = await request.json();
    const result = await env.DB
      .prepare(
        `INSERT INTO routing_definitions
         (part_type_id, operation_seq, operation_name, resource_name, run_rate, setup_time, fixed_offset, is_primary_constraint, family, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        body.part_type_id,
        body.operation_seq,
        body.operation_name,
        body.resource_name,
        body.run_rate ?? 1,
        body.setup_time ?? 0,
        body.fixed_offset ?? 0,
        body.is_primary_constraint ?? 0,
        body.family || 'Single Constraint',
        body.sort_order ?? 0
      )
      .run();
    return json({ id: result.meta.last_row_id }, 201);
  }

  if (method === 'PUT' && id) {
    const body: any = await request.json();
    await env.DB
      .prepare(
        `UPDATE routing_definitions SET
         part_type_id=?, operation_seq=?, operation_name=?, resource_name=?,
         run_rate=?, setup_time=?, fixed_offset=?, is_primary_constraint=?, family=?, sort_order=?
         WHERE id=?`
      )
      .bind(
        body.part_type_id, body.operation_seq, body.operation_name, body.resource_name,
        body.run_rate ?? 1, body.setup_time ?? 0, body.fixed_offset ?? 0,
        body.is_primary_constraint ?? 0, body.family || 'Single Constraint', body.sort_order ?? 0, id
      )
      .run();
    return json({ ok: true });
  }

  if (method === 'DELETE' && id) {
    await env.DB.prepare('DELETE FROM routing_definitions WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
