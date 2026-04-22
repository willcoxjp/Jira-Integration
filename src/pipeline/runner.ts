import type { Env, PipelineConfig, RunStats, TransformResult, CsvFiles } from '../types';
import { fetchJiraIssues } from './fetch-jira';
import { transformIssues } from './transform';
import { generateAllCsvFiles } from './csv-generator';
import { uploadToIntuiflow, uploadCommands, uploadTransactions, runScheduler } from './upload-intuiflow';
import { loadSyncState, updateSyncState } from './sync-state';
import { loadPipelineConfig } from './config-loader';

export interface RunResult {
  runId: number;
  stats: RunStats;
}

export interface RunOptions {
  /** Skip all Intuiflow uploads — just fetch, transform, and store CSVs */
  dryRun?: boolean;
  /** Run only a specific phase: 'wo', 'reschedule', 'commands', 'transactions', 'sync' */
  phase?: string;
  /** Explicit dry run ID to source CSVs from (used by queue-chained cron phases) */
  sourceRunId?: number;
}

/**
 * Main pipeline orchestrator.
 *
 * Modes:
 *   - dry_run=true: Fetch from Jira, transform, generate CSVs, store them. No Intuiflow upload.
 *   - phase=wo: Upload work orders CSV to Intuiflow (uses stored CSVs from last dry run).
 *   - phase=commands: Execute command releases/closes (uses stored data from last dry run).
 *   - phase=transactions: Post transactions (uses stored data from last dry run).
 *   - (no options): Full pipeline — all steps.
 */
export async function runPipeline(
  env: Env,
  triggerType: 'manual' | 'cron' = 'manual',
  options: RunOptions = {}
): Promise<RunResult> {
  const { dryRun = false, phase, sourceRunId: explicitSourceRunId } = options;

  // 1. Create run record
  const runLabel = dryRun ? 'dry_run' : phase ? `phase:${phase}` : triggerType;
  const run = await env.DB
    .prepare("INSERT INTO runs (trigger_type) VALUES (?)")
    .bind(runLabel)
    .run();
  const runId = run.meta.last_row_id as number;

  try {
    // 2. Load config
    const config = await loadPipelineConfig(env);

    await env.DB
      .prepare("UPDATE runs SET config_snapshot_json = ? WHERE id = ?")
      .bind(JSON.stringify({ jqlFilter: config.jqlFilter, priorityCutoff: config.priorityCutoff, location: config.location, dryRun, phase }), runId)
      .run();

    // For phase-based execution, reuse stored CSVs from the most recent dry run
    // instead of re-fetching from Jira (which would exceed the subrequest limit)
    if (phase) {
      return await runPhase(env, runId, phase, config, explicitSourceRunId);
    }

    // 3. Fetch from Jira
    const issues = await fetchJiraIssues(env, config);

    // 4. Load sync state
    const syncState = await loadSyncState(env);

    // 5. Transform
    const result = transformIssues(issues, config, syncState);

    // 6. Generate CSVs
    const csvFiles = generateAllCsvFiles(
      result.workOrders,
      result.commands,
      result.transactions
    );

    // 7. Store CSVs (always — so we can review before uploading)
    await storeCsvs(env, runId, csvFiles, result);

    // Store sync state snapshot (for phase=sync to replay later)
    const syncSnapshot = result.workOrders.map(wo => ({
      key: wo.WorkOrderNumber,
      partNumber: wo.PartNumber,
      status: result.issueStatuses.get(wo.WorkOrderNumber) ?? '',
      released: result.releasedKeys.includes(wo.WorkOrderNumber) ? 1 : 0,
      closed: result.closedKeys.includes(wo.WorkOrderNumber) ? 1 : 0,
      quantity: wo.WorkOrderQuantity,
      priority: wo.Priority,
    }));
    await env.DB
      .prepare("INSERT INTO run_csvs (run_id, csv_type, csv_content, row_count) VALUES (?, 'sync_snapshot', ?, ?)")
      .bind(runId, JSON.stringify(syncSnapshot), syncSnapshot.length)
      .run();

    if (dryRun) {
      // Dry run: stop here, don't touch Intuiflow
      await completeRun(env, runId, result.stats, 'dry_run');
      return { runId, stats: result.stats };
    }

    // Full execution — upload all CSVs via import API (batch)
    await uploadToIntuiflow(env, csvFiles, config);

    // Update sync state
    await updateSyncState(env, result);

    await completeRun(env, runId, result.stats, 'ok');
    return { runId, stats: result.stats };
  } catch (err: any) {
    await env.DB
      .prepare(
        "UPDATE runs SET finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), status = 'error', error_text = ? WHERE id = ?"
      )
      .bind(err?.stack || String(err), runId)
      .run();

    await env.DB
      .prepare("INSERT INTO errors (run_id, stage, error_text) VALUES (?, 'pipeline', ?)")
      .bind(runId, err?.message || String(err))
      .run();

    throw err;
  }
}

/**
 * Run a single phase using stored CSVs from the most recent dry run.
 * This avoids re-fetching from Jira and hitting the subrequest limit.
 * Pass explicitSourceRunId when chaining phases via queue to avoid race conditions.
 */
async function runPhase(
  env: Env,
  runId: number,
  phase: string,
  config: PipelineConfig,
  explicitSourceRunId?: number
): Promise<RunResult> {
  let sourceRunId: number;

  if (explicitSourceRunId !== undefined) {
    sourceRunId = explicitSourceRunId;
  } else {
    const lastDryRun = await env.DB
      .prepare("SELECT id FROM runs WHERE status = 'dry_run' ORDER BY id DESC LIMIT 1")
      .first<{ id: number }>();
    if (!lastDryRun) {
      throw new Error('No dry run found. Run a dry run first to generate CSVs before uploading.');
    }
    sourceRunId = lastDryRun.id;
  }
  const stats: RunStats = { fetched: 0, excluded: 0, workOrders: 0, commands: 0, transactions: 0, closed: 0, errors: 0 };

  if (phase === 'wo') {
    // Load work orders CSV from the dry run
    const csvRow = await env.DB
      .prepare("SELECT csv_content, row_count FROM run_csvs WHERE run_id = ? AND csv_type = 'work_orders'")
      .bind(sourceRunId)
      .first<{ csv_content: string; row_count: number }>();

    if (!csvRow || csvRow.row_count === 0) {
      throw new Error(`No work orders CSV found in dry run #${sourceRunId}.`);
    }

    const csvFiles: CsvFiles = {
      workOrdersCsv: csvRow.csv_content,
      commandsCsv: '',
      transactionsCsv: '',
    };

    await uploadToIntuiflow(env, csvFiles, config);
    stats.workOrders = csvRow.row_count;

    await completeRun(env, runId, stats, 'ok');
    return { runId, stats };
  }

  if (phase === 'sync') {
    // Populate sync state from the dry run's stored snapshot — no external calls
    const snapRow = await env.DB
      .prepare("SELECT csv_content, row_count FROM run_csvs WHERE run_id = ? AND csv_type = 'sync_snapshot'")
      .bind(sourceRunId)
      .first<{ csv_content: string; row_count: number }>();

    if (!snapRow) {
      throw new Error(`No sync snapshot found in dry run #${sourceRunId}. Run a new dry run first.`);
    }

    const snapshot: Array<{ key: string; partNumber: string; status: string; released: number; closed: number; quantity: number; priority: number }> = JSON.parse(snapRow.csv_content);
    const now = new Date().toISOString();

    const upsertSql = `INSERT INTO order_sync_state
      (jira_key, jira_issue_type, last_jira_status, last_jira_updated, was_released, was_closed, last_quantity, last_priority, last_synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(jira_key) DO UPDATE SET
        last_jira_status = excluded.last_jira_status,
        last_jira_updated = excluded.last_jira_updated,
        was_released = CASE WHEN excluded.was_released = 1 THEN 1 ELSE order_sync_state.was_released END,
        was_closed = CASE WHEN excluded.was_closed = 1 THEN 1 ELSE order_sync_state.was_closed END,
        last_quantity = excluded.last_quantity,
        last_priority = excluded.last_priority,
        last_synced_at = excluded.last_synced_at`;

    const statements = snapshot.map(s =>
      env.DB.prepare(upsertSql).bind(s.key, s.partNumber, s.status, now, s.released, s.closed, s.quantity, s.priority, now)
    );

    await env.DB.batch(statements);
    stats.workOrders = snapshot.length;

    await completeRun(env, runId, stats, 'ok');
    return { runId, stats };
  }

  if (phase === 'reschedule') {
    await runScheduler(env, config);
    await completeRun(env, runId, stats, 'ok');
    return { runId, stats };
  }

  if (phase === 'commands') {
    const csvRow = await env.DB
      .prepare("SELECT csv_content, row_count FROM run_csvs WHERE run_id = ? AND csv_type = 'commands'")
      .bind(sourceRunId)
      .first<{ csv_content: string; row_count: number }>();

    if (!csvRow || csvRow.row_count === 0) {
      throw new Error(`No commands CSV found in dry run #${sourceRunId}.`);
    }

    // Upload entire commands CSV as a batch via import API
    await uploadCommands(env, csvRow.csv_content, config);
    stats.commands = csvRow.row_count;

    await completeRun(env, runId, stats, 'ok');
    return { runId, stats };
  }

  if (phase === 'transactions') {
    const csvRow = await env.DB
      .prepare("SELECT csv_content, row_count FROM run_csvs WHERE run_id = ? AND csv_type = 'transactions'")
      .bind(sourceRunId)
      .first<{ csv_content: string; row_count: number }>();

    if (!csvRow || csvRow.row_count === 0) {
      throw new Error(`No transactions CSV found in dry run #${sourceRunId}. (This is normal for the first run — transactions only appear after sync state is populated.)`);
    }

    // Upload entire transactions CSV as a batch via import API
    await uploadTransactions(env, csvRow.csv_content, config);
    stats.transactions = csvRow.row_count;

    await completeRun(env, runId, stats, 'ok');
    return { runId, stats };
  }

  throw new Error(`Unknown phase: ${phase}`);
}

async function completeRun(env: Env, runId: number, stats: RunStats, status: string): Promise<void> {
  await env.DB
    .prepare(
      "UPDATE runs SET finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), status = ?, stats_json = ? WHERE id = ?"
    )
    .bind(status, JSON.stringify(stats), runId)
    .run();
}

async function storeCsvs(
  env: Env,
  runId: number,
  csvFiles: { workOrdersCsv: string; commandsCsv: string; transactionsCsv: string },
  result: TransformResult
): Promise<void> {
  const inserts = [
    { type: 'work_orders', content: csvFiles.workOrdersCsv, count: result.workOrders.length },
    { type: 'commands', content: csvFiles.commandsCsv, count: result.commands.length },
    { type: 'transactions', content: csvFiles.transactionsCsv, count: result.transactions.length },
  ];

  for (const { type, content, count } of inserts) {
    if (count > 0) {
      await env.DB
        .prepare("INSERT INTO run_csvs (run_id, csv_type, csv_content, row_count) VALUES (?, ?, ?, ?)")
        .bind(runId, type, content, count)
        .run();
    }
  }
}

