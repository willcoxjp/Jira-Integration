import type { Env, PipelineConfig, RunStats, TransformResult, CsvFiles } from '../types';
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

export interface RunOptions {
  /** Skip all Intuiflow uploads — just fetch, transform, and store CSVs */
  dryRun?: boolean;
  /** Run only a specific phase: 'wo' (work orders + import), 'commands', 'transactions' */
  phase?: string;
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
  const { dryRun = false, phase } = options;

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
      return await runPhase(env, runId, phase, config);
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

    if (dryRun) {
      // Dry run: stop here, don't touch Intuiflow
      await completeRun(env, runId, result.stats, 'dry_run');
      return { runId, stats: result.stats };
    }

    // Full execution — upload everything
    if (result.workOrders.length > 0) {
      await uploadToIntuiflow(env, csvFiles, config);
    }

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
 */
async function runPhase(
  env: Env,
  runId: number,
  phase: string,
  config: PipelineConfig
): Promise<RunResult> {
  // Find the most recent dry run that has stored CSVs
  const lastDryRun = await env.DB
    .prepare("SELECT id FROM runs WHERE status = 'dry_run' ORDER BY id DESC LIMIT 1")
    .first<{ id: number }>();

  if (!lastDryRun) {
    throw new Error('No dry run found. Run a dry run first to generate CSVs before uploading.');
  }

  const sourceRunId = lastDryRun.id;
  const stats: RunStats = { fetched: 0, excluded: 0, workOrders: 0, commands: 0, transactions: 0, closed: 0, errors: 0 };

  // Load the stored stats from the dry run
  const dryRunRow = await env.DB
    .prepare("SELECT stats_json FROM runs WHERE id = ?")
    .bind(sourceRunId)
    .first<{ stats_json: string }>();
  if (dryRunRow?.stats_json) {
    try { Object.assign(stats, JSON.parse(dryRunRow.stats_json)); } catch {}
  }

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

  if (phase === 'commands') {
    // Load commands CSV from the dry run and parse it back
    const csvRow = await env.DB
      .prepare("SELECT csv_content, row_count FROM run_csvs WHERE run_id = ? AND csv_type = 'commands'")
      .bind(sourceRunId)
      .first<{ csv_content: string; row_count: number }>();

    if (!csvRow || csvRow.row_count === 0) {
      throw new Error(`No commands CSV found in dry run #${sourceRunId}.`);
    }

    const commands = parseCsvToCommands(csvRow.csv_content);
    await executeCommands(env, commands);
    stats.commands = commands.length;

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

    const transactions = parseCsvToTransactions(csvRow.csv_content);
    await postTransactions(env, transactions);
    stats.transactions = transactions.length;

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

/**
 * Parse a commands CSV back into command objects.
 * CSV format: OrderNumber,PartNumber,Location,Command,OperationSequenceNumber
 */
function parseCsvToCommands(csv: string): Array<{ orderNumber: string; partNumber: string; location: string; command: string }> {
  const lines = csv.split('\n').filter(l => l.trim());
  // Skip header row
  return lines.slice(1).map(line => {
    const cols = parseCsvLine(line);
    return {
      orderNumber: cols[0],
      partNumber: cols[1],
      location: cols[2],
      command: cols[3],
    };
  });
}

/**
 * Parse a transactions CSV back into transaction objects.
 * CSV format: OrderNumber,PartNumber,Location,OperationSequenceNumber,EntryDate,EntryType,Quantity,IsLastBatch,BackfillPrevious,Notes
 */
function parseCsvToTransactions(csv: string): Array<{ orderNumber: string; partNumber: string; location: string; operationSeq: number; quantity: number }> {
  const lines = csv.split('\n').filter(l => l.trim());
  return lines.slice(1).map(line => {
    const cols = parseCsvLine(line);
    return {
      orderNumber: cols[0],
      partNumber: cols[1],
      location: cols[2],
      operationSeq: parseInt(cols[3], 10),
      quantity: parseFloat(cols[6]),
    };
  });
}

/** Simple CSV line parser that handles quoted fields */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}
