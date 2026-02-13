import type { Env } from '../types';
import { json } from '../utils/db-helpers';

export async function handlePartTypes(
  method: string,
  id: string | undefined,
  request: Request,
  env: Env
): Promise<Response> {
  if (method === 'GET' && !id) {
    const result = await env.DB.prepare('SELECT * FROM part_types ORDER BY jira_issue_type').all();
    return json(result.results);
  }

  if (method === 'GET' && id) {
    const row = await env.DB.prepare('SELECT * FROM part_types WHERE id = ?').bind(id).first();
    return row ? json(row) : json({ error: 'Not found' }, 404);
  }

  if (method === 'POST') {
    const body: any = await request.json();
    const result = await env.DB
      .prepare(
        `INSERT INTO part_types (jira_issue_type, intuiflow_part_number, is_included, first_operation_seq)
         VALUES (?, ?, ?, ?)`
      )
      .bind(body.jira_issue_type, body.intuiflow_part_number, body.is_included ?? 1, body.first_operation_seq ?? 100)
      .run();
    return json({ id: result.meta.last_row_id }, 201);
  }

  if (method === 'PUT' && id) {
    const body: any = await request.json();
    await env.DB
      .prepare(
        `UPDATE part_types SET jira_issue_type=?, intuiflow_part_number=?, is_included=?, first_operation_seq=? WHERE id=?`
      )
      .bind(body.jira_issue_type, body.intuiflow_part_number, body.is_included ?? 1, body.first_operation_seq ?? 100, id)
      .run();
    return json({ ok: true });
  }

  if (method === 'DELETE' && id) {
    await env.DB.prepare('DELETE FROM part_types WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
