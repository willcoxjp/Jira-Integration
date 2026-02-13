import type { Env } from '../types';
import { json } from '../utils/db-helpers';
import { runPipeline } from '../pipeline/runner';

export async function handleRuns(
  method: string,
  id: string | undefined,
  sub: string | undefined,
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  // POST /api/runs/trigger
  if (method === 'POST' && id === 'trigger') {
    try {
      const result = await runPipeline(env, 'manual');
      return json({ ok: true, runId: result.runId, stats: result.stats });
    } catch (err: any) {
      return json({ ok: false, error: err?.message || String(err) }, 500);
    }
  }

  // GET /api/runs/:id/csv?type=work_orders|commands|transactions
  if (method === 'GET' && id && sub === 'csv') {
    const csvType = url.searchParams.get('type') || 'work_orders';
    const row = await env.DB
      .prepare('SELECT csv_content, csv_type FROM run_csvs WHERE run_id = ? AND csv_type = ?')
      .bind(id, csvType)
      .first<{ csv_content: string; csv_type: string }>();

    if (!row) return json({ error: 'CSV not found' }, 404);

    return new Response(row.csv_content, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="run-${id}-${csvType}.csv"`,
      },
    });
  }

  // GET /api/runs/:id
  if (method === 'GET' && id) {
    const run = await env.DB.prepare('SELECT * FROM runs WHERE id = ?').bind(id).first();
    if (!run) return json({ error: 'Not found' }, 404);

    const details = await env.DB
      .prepare('SELECT * FROM run_details WHERE run_id = ? ORDER BY id')
      .bind(id)
      .all();

    const errors = await env.DB
      .prepare('SELECT * FROM errors WHERE run_id = ? ORDER BY id')
      .bind(id)
      .all();

    const csvs = await env.DB
      .prepare('SELECT run_id, csv_type, row_count, created_at FROM run_csvs WHERE run_id = ?')
      .bind(id)
      .all();

    return json({
      run,
      details: details.results,
      errors: errors.results,
      csvs: csvs.results,
    });
  }

  // GET /api/runs
  if (method === 'GET' && !id) {
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = 20;
    const offset = (page - 1) * limit;

    const result = await env.DB
      .prepare('SELECT * FROM runs ORDER BY id DESC LIMIT ? OFFSET ?')
      .bind(limit, offset)
      .all();

    const countRow = await env.DB.prepare('SELECT COUNT(*) as total FROM runs').first<{ total: number }>();

    return json({
      runs: result.results,
      total: countRow?.total ?? 0,
      page,
      pageSize: limit,
    });
  }

  return json({ error: 'Method not allowed' }, 405);
}
