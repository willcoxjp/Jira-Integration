import type { Env, PipelineConfig, RunStats, TransformResult } from '../types';
import { fetchJiraIssues } from './fetch-jira';
import { transformIssues } from './transform';
import { generateAllCsvFiles } from './csv-generator';
import { uploadToIntuiflow, executeCommands, postTransactions } from './upload-intuiflow';
import { loadSyncState, updateSyncState } from './sync-state';
import { loadPipelineConfig } from './config-loader';

export interface RunResult {
  runId: number;
  stats: RunStats;
}

/**
 * Main pipeline orchestrator.
 *
 * Steps:
 *   1. Create run record
 *   2. Load config from D1
 *   3. Fetch issues from Jira
 *   4. Load sync state
 *   5. Transform (apply all business rules)
 *   6. Generate CSVs
 *   7. Upload to Intuiflow
 *   8. Execute commands (release/close)
 *   9. Post transactions
 *  10. Update sync state
 *  11. Store CSVs for download
 *  12. Complete run
 */
export async function runPipeline(
  env: Env,
  triggerType: 'manual' | 'cron' = 'manual'
): Promise<RunResult> {
  // 1. Create run record
  const run = await env.DB
    .prepare("INSERT INTO runs (trigger_type) VALUES (?)")
    .bind(triggerType)
    .run();
  const runId = run.meta.last_row_id as number;

  try {
    // 2. Load config
    const config = await loadPipelineConfig(env);

    // Snapshot config for debugging
    await env.DB
      .prepare("UPDATE runs SET config_snapshot_json = ? WHERE id = ?")
      .bind(JSON.stringify({ jqlFilter: config.jqlFilter, priorityCutoff: config.priorityCutoff, location: config.location }), runId)
      .run();

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

    // 7. Upload work orders CSV to Intuiflow
    if (result.workOrders.length > 0) {
      await uploadToIntuiflow(env, csvFiles, config);
    }

    // 8. Execute command releases/closes
    if (result.commands.length > 0) {
      await executeCommands(
        env,
        result.commands.map(c => ({
          orderNumber: c.OrderNumber,
          partNumber: c.PartNumber,
          location: c.Location,
          command: c.Command,
        }))
      );
    }

    // 9. Post transactions
    if (result.transactions.length > 0) {
      await postTransactions(
        env,
        result.transactions.map(t => ({
          orderNumber: t.OrderNumber,
          partNumber: t.PartNumber,
          location: t.Location,
          operationSeq: t.OperationSequenceNumber,
          quantity: t.Quantity,
        }))
      );
    }

    // 10. Update sync state
    await updateSyncState(env, result);

    // 11. Store CSVs for download
    await storeCsvs(env, runId, csvFiles, result);

    // 12. Complete run
    await env.DB
      .prepare(
        "UPDATE runs SET finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), status = 'ok', stats_json = ? WHERE id = ?"
      )
      .bind(JSON.stringify(result.stats), runId)
      .run();

    return { runId, stats: result.stats };
  } catch (err: any) {
    // Log error
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
