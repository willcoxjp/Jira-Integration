import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPipeline } from '../src/pipeline/runner';

// Mock upload-intuiflow so no real HTTP calls are made
vi.mock('../src/pipeline/upload-intuiflow', () => ({
  uploadToIntuiflow: vi.fn().mockResolvedValue({ importId: 1, workOrdersUploaded: true, commandsUploaded: false, transactionsUploaded: false }),
  uploadCommands: vi.fn().mockResolvedValue({ importId: 2, commandsUploaded: true }),
  uploadTransactions: vi.fn().mockResolvedValue({ importId: 3, transactionsUploaded: true }),
  runScheduler: vi.fn().mockResolvedValue(undefined),
}));

function chainable(runVal: any = {}, firstVal: any = null, allVal: any = { results: [] }) {
  const stmt: any = {
    run: vi.fn().mockResolvedValue(runVal),
    first: vi.fn().mockResolvedValue(firstVal),
    all: vi.fn().mockResolvedValue(allVal),
  };
  stmt.bind = vi.fn().mockReturnValue(stmt);
  return stmt;
}

function makeMockEnv() {
  const insertResult = { meta: { last_row_id: 99 } };

  const prepare = vi.fn().mockImplementation((sql: string) => {
    if (sql.includes('INSERT INTO runs')) return chainable(insertResult);
    if (sql.includes('UPDATE runs')) return chainable();
    if (sql.includes('INSERT INTO errors')) return chainable();
    // All SELECT queries return empty
    return chainable({}, null, { results: [] });
  });

  return {
    env: { DB: { prepare, batch: vi.fn().mockResolvedValue([]) } } as any,
    prepare,
  };
}

describe('phase=reschedule', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls runScheduler when phase is reschedule', async () => {
    const { env } = makeMockEnv();
    const { runScheduler } = await import('../src/pipeline/upload-intuiflow');

    await runPipeline(env, 'manual', { phase: 'reschedule', sourceRunId: 1 });

    expect(runScheduler).toHaveBeenCalledOnce();
  });

  it('completes with status ok (no error thrown)', async () => {
    const { env } = makeMockEnv();
    const result = await runPipeline(env, 'manual', { phase: 'reschedule', sourceRunId: 1 });
    expect(result.runId).toBe(99);
  });

  it('does not call uploadToIntuiflow during reschedule', async () => {
    const { env } = makeMockEnv();
    const { uploadToIntuiflow } = await import('../src/pipeline/upload-intuiflow');

    await runPipeline(env, 'manual', { phase: 'reschedule', sourceRunId: 1 });

    expect(uploadToIntuiflow).not.toHaveBeenCalled();
  });
});

describe('sourceRunId option', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses provided sourceRunId for work orders query instead of latest dry run', async () => {
    const { env, prepare } = makeMockEnv();

    // Override prepare to track which run_id is queried for work_orders CSV
    const queriedRunIds: number[] = [];
    prepare.mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO runs')) return chainable({ meta: { last_row_id: 99 } });
      if (sql.includes('UPDATE runs')) return chainable();
      if (sql.includes('INSERT INTO errors')) return chainable();
      if (sql.includes("csv_type = 'work_orders'")) {
        // Capture the run_id that gets bound
        const stmt = chainable({}, { csv_content: 'header\nrow', row_count: 1 });
        const origBind = stmt.bind;
        stmt.bind = vi.fn().mockImplementation((...args: any[]) => {
          queriedRunIds.push(args[0]); // First bind arg is the run_id
          return origBind(...args);
        });
        return stmt;
      }
      return chainable({}, null, { results: [] });
    });

    await runPipeline(env, 'manual', { phase: 'wo', sourceRunId: 42 });

    expect(queriedRunIds).toContain(42);
  });

  it('does not query for latest dry run when sourceRunId is provided', async () => {
    const { env, prepare } = makeMockEnv();

    await runPipeline(env, 'manual', { phase: 'reschedule', sourceRunId: 42 });

    // The "SELECT id FROM runs WHERE status = 'dry_run'" query should not be called
    const dryRunQuery = prepare.mock.calls.find(
      ([sql]: [string]) => sql.includes("status = 'dry_run'")
    );
    expect(dryRunQuery).toBeUndefined();
  });
});
