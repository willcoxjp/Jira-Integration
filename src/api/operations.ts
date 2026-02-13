import type { Env } from '../types';
import { json } from '../utils/db-helpers';

export async function handleOperations(
  method: string,
  id: string | undefined,
  request: Request,
  env: Env
): Promise<Response> {
  if (method === 'GET' && !id) {
    const result = await env.DB.prepare('SELECT * FROM operations_lookup ORDER BY operation_seq').all();
    return json(result.results);
  }

  if (method === 'POST') {
    const body: any = await request.json();
    const result = await env.DB
      .prepare('INSERT INTO operations_lookup (jira_status, operation_seq, operation_name) VALUES (?, ?, ?)')
      .bind(body.jira_status, body.operation_seq, body.operation_name)
      .run();
    return json({ id: result.meta.last_row_id }, 201);
  }

  if (method === 'PUT' && id) {
    const body: any = await request.json();
    await env.DB
      .prepare('UPDATE operations_lookup SET jira_status=?, operation_seq=?, operation_name=? WHERE id=?')
      .bind(body.jira_status, body.operation_seq, body.operation_name, id)
      .run();
    return json({ ok: true });
  }

  if (method === 'DELETE' && id) {
    await env.DB.prepare('DELETE FROM operations_lookup WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
