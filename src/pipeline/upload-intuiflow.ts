import type { Env, CsvFiles, PipelineConfig } from '../types';

export interface UploadResult {
  importId: number;
  workOrdersUploaded: boolean;
  commandsUploaded: boolean;
  transactionsUploaded: boolean;
}

/**
 * Upload all CSV files to Intuiflow via the /api/v2/import API.
 *
 * Flow:
 *   1. POST /api/v2/import                    → create import session (returns Id)
 *   2. POST /api/v2/import/{id}/item          → upload each CSV (type auto-detected from headers)
 *   3. POST /api/v2/import/{id}/run           → execute the import
 *
 * The API auto-detects item type from CSV column headers:
 *   - WorkOrderNumber,... → WorkOrder
 *   - OrderNumber,PartNumber,Location,Command → SchedulingOrderCommand
 *   - OrderNumber,PartNumber,Location,OperationSequenceNumber,... → SchedulingTransaction (TBD)
 */
export async function uploadToIntuiflow(
  env: Env,
  csvFiles: CsvFiles,
  config: PipelineConfig
): Promise<UploadResult> {
  const base = await getIntuiflowBaseUrl(env);
  const apiKey = env.INTUIFLOW_API_KEY;
  if (!apiKey) throw new Error('Missing INTUIFLOW_API_KEY secret');

  // Step 1: Create import session
  const importId = await createImportSession(base, apiKey, config);

  const result: UploadResult = {
    importId,
    workOrdersUploaded: false,
    commandsUploaded: false,
    transactionsUploaded: false,
  };

  // Step 2: Upload CSVs (type auto-detected from headers)
  if (csvFiles.workOrdersCsv && csvFiles.workOrdersCsv.split('\n').length > 1) {
    await uploadCsvItem(base, apiKey, importId, csvFiles.workOrdersCsv);
    result.workOrdersUploaded = true;
  }

  if (csvFiles.commandsCsv && csvFiles.commandsCsv.split('\n').length > 1) {
    await uploadCsvItem(base, apiKey, importId, csvFiles.commandsCsv);
    result.commandsUploaded = true;
  }

  if (csvFiles.transactionsCsv && csvFiles.transactionsCsv.split('\n').length > 1) {
    await uploadCsvItem(base, apiKey, importId, csvFiles.transactionsCsv);
    result.transactionsUploaded = true;
  }

  // Step 3: Execute import
  await executeImportRun(base, apiKey, importId);

  return result;
}

/**
 * Upload only commands CSV via the import API.
 */
export async function uploadCommands(
  env: Env,
  commandsCsv: string,
  config: PipelineConfig
): Promise<UploadResult> {
  const base = await getIntuiflowBaseUrl(env);
  const apiKey = env.INTUIFLOW_API_KEY;
  if (!apiKey) throw new Error('Missing INTUIFLOW_API_KEY secret');

  const importId = await createImportSession(base, apiKey, config);

  await uploadCsvItem(base, apiKey, importId, commandsCsv);

  await executeImportRun(base, apiKey, importId);

  return {
    importId,
    workOrdersUploaded: false,
    commandsUploaded: true,
    transactionsUploaded: false,
  };
}

/**
 * Upload only transactions CSV via the import API.
 */
export async function uploadTransactions(
  env: Env,
  transactionsCsv: string,
  config: PipelineConfig
): Promise<UploadResult> {
  const base = await getIntuiflowBaseUrl(env);
  const apiKey = env.INTUIFLOW_API_KEY;
  if (!apiKey) throw new Error('Missing INTUIFLOW_API_KEY secret');

  const importId = await createImportSession(base, apiKey, config);

  await uploadCsvItem(base, apiKey, importId, transactionsCsv);

  await executeImportRun(base, apiKey, importId);

  return {
    importId,
    workOrdersUploaded: false,
    commandsUploaded: false,
    transactionsUploaded: true,
  };
}

// --- Internal helpers ---

/**
 * Step 1: Create import session.
 *   POST /api/v2/import?api_key=KEY
 *   Body: { Mode: "ReplaceByLocation", Type: "Host", Option: "None", IgnoreSourceERP: true }
 */
async function createImportSession(
  base: string,
  apiKey: string,
  _config: PipelineConfig
): Promise<number> {
  const res = await fetch(`${base}/api/v2/import?api_key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Mode: 'ReplaceByLocation',
      Type: 'Host',
      Option: 'None',
      IgnoreSourceERP: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Import session create failed: ${res.status} :: ${text}`);
  }

  const data: any = await res.json();
  const importId = data.Id ?? data.EntityID ?? data.id ?? data.ImportId;
  if (importId === undefined || importId === null) {
    throw new Error(`Import session created but no ID found in response: ${JSON.stringify(data)}`);
  }
  return importId;
}

/**
 * Step 2: Upload CSV data to the import session.
 * No ?type= param needed — API auto-detects from CSV column headers.
 *   POST /api/v2/import/{id}/item?api_key=KEY
 *   Content-Type: text/csv
 *   Body: raw CSV string
 */
async function uploadCsvItem(
  base: string,
  apiKey: string,
  importId: number,
  csvContent: string,
): Promise<void> {
  const res = await fetch(
    `${base}/api/v2/import/${importId}/item?api_key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'text/csv',
      },
      body: csvContent,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CSV upload failed for import ${importId}: ${res.status} :: ${text}`);
  }
}

/**
 * Step 3: Execute the import.
 *   POST /api/v2/import/{id}/run?api_key=KEY
 */
async function executeImportRun(
  base: string,
  apiKey: string,
  importId: number
): Promise<void> {
  const res = await fetch(
    `${base}/api/v2/import/${importId}/run?api_key=${apiKey}`,
    {
      method: 'POST',
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Import run failed for ${importId}: ${res.status} :: ${text}`);
  }
}

async function getIntuiflowBaseUrl(env: Env): Promise<string> {
  const row = await env.DB
    .prepare("SELECT base_url FROM connectors WHERE kind='intuiflow' AND is_enabled=1 LIMIT 1")
    .first<{ base_url: string }>();
  if (!row) throw new Error('No enabled Intuiflow connector configured');
  return row.base_url;
}
