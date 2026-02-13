import type { Env } from '../types';
import { json } from '../utils/db-helpers';

export async function handlePriorityRules(
  method: string,
  id: string | undefined,
  request: Request,
  env: Env
): Promise<Response> {
  if (method === 'GET') {
    const result = await env.DB.prepare('SELECT * FROM priority_rules ORDER BY priority_prefix').all();
    return json(result.results);
  }

  if (method === 'POST') {
    const body: any = await request.json();
    const result = await env.DB
      .prepare('INSERT INTO priority_rules (priority_prefix, days_offset, fixed_date, description) VALUES (?, ?, ?, ?)')
      .bind(body.priority_prefix, body.days_offset ?? null, body.fixed_date ?? null, body.description || '')
      .run();
    return json({ id: result.meta.last_row_id }, 201);
  }

  if (method === 'PUT' && id) {
    const body: any = await request.json();
    await env.DB
      .prepare('UPDATE priority_rules SET priority_prefix=?, days_offset=?, fixed_date=?, description=? WHERE id=?')
      .bind(body.priority_prefix, body.days_offset ?? null, body.fixed_date ?? null, body.description || '', id)
      .run();
    return json({ ok: true });
  }

  if (method === 'DELETE' && id) {
    await env.DB.prepare('DELETE FROM priority_rules WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}

export async function handlePriorityValues(
  method: string,
  id: string | undefined,
  request: Request,
  env: Env
): Promise<Response> {
  if (method === 'GET') {
    const result = await env.DB.prepare('SELECT * FROM priority_values ORDER BY numeric_value').all();
    return json(result.results);
  }

  if (method === 'POST') {
    const body: any = await request.json();
    const result = await env.DB
      .prepare('INSERT INTO priority_values (jira_priority_name, numeric_value) VALUES (?, ?)')
      .bind(body.jira_priority_name, body.numeric_value)
      .run();
    return json({ id: result.meta.last_row_id }, 201);
  }

  if (method === 'PUT' && id) {
    const body: any = await request.json();
    await env.DB
      .prepare('UPDATE priority_values SET jira_priority_name=?, numeric_value=? WHERE id=?')
      .bind(body.jira_priority_name, body.numeric_value, id)
      .run();
    return json({ ok: true });
  }

  if (method === 'DELETE' && id) {
    await env.DB.prepare('DELETE FROM priority_values WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
