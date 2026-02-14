import type { Env, CsvFiles, PipelineConfig } from '../types';

export interface UploadResult {
  importId: number;
  workOrdersUploaded: boolean;
  commandsUploaded: boolean;
  transactionsUploaded: boolean;
}

/**
 * Upload CSV files to Intuiflow via the /api/v2/import API.
 *
 * Flow:
 *   1. POST /api/v2/import  → create import session
 *   2. Upload CSV file(s) to the import session
 *   3. PUT /api/v2/import/{id} → execute the import
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

  // Step 2: Upload work orders CSV (supply orders)
  if (csvFiles.workOrdersCsv && csvFiles.workOrdersCsv.split('\n').length > 1) {
    await uploadCsvContent(base, apiKey, importId, csvFiles.workOrdersCsv, 'text/csv');
    result.workOrdersUploaded = true;
  }

  // Step 3: Execute import
  await executeImport(base, apiKey, importId, config);

  // For command releases and transactions, use the transaction APIs directly
  // These don't go through the CSV import flow
  // (handled separately via the scheduling/orders API)

  return result;
}

/**
 * Execute command releases via the Intuiflow scheduling orders API.
 * Commands like Release, Close, Hold, etc.
 */
export async function executeCommands(
  env: Env,
  commands: Array<{ orderNumber: string; partNumber: string; location: string; command: string }>
): Promise<void> {
  const base = await getIntuiflowBaseUrl(env);
  const apiKey = env.INTUIFLOW_API_KEY;
  if (!apiKey) throw new Error('Missing INTUIFLOW_API_KEY secret');

  for (const cmd of commands) {
    const url = new URL(`${base}/api/v2/scheduling/orders/${cmd.command}`);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('location', cmd.location);
    url.searchParams.set('orderNumber', cmd.orderNumber);
    url.searchParams.set('partNumber', cmd.partNumber);

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Command ${cmd.command} failed for ${cmd.orderNumber}: ${res.status} :: ${text}`
      );
    }
  }
}

/**
 * Post transaction entries via the Intuiflow scheduling transactions API.
 */
export async function postTransactions(
  env: Env,
  transactions: Array<{
    orderNumber: string;
    partNumber: string;
    location: string;
    operationSeq: number;
    quantity: number;
  }>
): Promise<void> {
  const base = await getIntuiflowBaseUrl(env);
  const apiKey = env.INTUIFLOW_API_KEY;
  if (!apiKey) throw new Error('Missing INTUIFLOW_API_KEY secret');

  for (const txn of transactions) {
    const url = new URL(
      `${base}/api/v2/scheduling/orders/transactions/${txn.operationSeq}/receive`
    );
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('orderNumber', txn.orderNumber);
    url.searchParams.set('partNumber', txn.partNumber);
    url.searchParams.set('location', txn.location);

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Quantity: txn.quantity,
        IsLastBatch: true,
        DoBackFill: true,
        Notes: '',
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Transaction failed for ${txn.orderNumber} op ${txn.operationSeq}: ${res.status} :: ${text}`
      );
    }
  }
}

// --- Internal helpers ---

async function createImportSession(
  base: string,
  apiKey: string,
  config: PipelineConfig
): Promise<number> {
  const res = await fetch(`${base}/api/v2/import?api_key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Mode: 'Update',
      Type: 'Host',
      Option: 'None',
      BaseCultureInfoName: config.importCulture,
      FileDelimiter: config.importDelimiter,
      RunRateUnits: 'UnitsPerHour',
      BufferUnits: 'Minutes',
      SetupTimeUnits: 'Minutes',
      FixedOffsetUnits: 'Minutes',
      FamilyFieldLocation: 'RoutingsFile',
      IsLocationRecordInferred: false,
      IgnoreSourceERP: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Import session create failed: ${res.status} :: ${text}`);
  }

  const data: any = await res.json();
  const importId = data.EntityID ?? data.Id ?? data.id ?? data.ImportId ?? data.importId;
  if (importId === undefined || importId === null) {
    throw new Error(`Import session created but no ID found in response: ${JSON.stringify(data)}`);
  }
  return importId;
}

async function uploadCsvContent(
  base: string,
  apiKey: string,
  importId: number,
  csvContent: string,
  _contentType: string
): Promise<void> {
  // Upload CSV content directly to the import session
  const res = await fetch(`${base}/api/v2/import/${importId}?api_key=${apiKey}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/csv',
    },
    body: csvContent,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CSV upload failed for import ${importId}: ${res.status} :: ${text}`);
  }
}

async function executeImport(
  base: string,
  apiKey: string,
  importId: number,
  config: PipelineConfig
): Promise<void> {
  const res = await fetch(`${base}/api/v2/import/${importId}?api_key=${apiKey}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Mode: 'Update',
      BaseCultureInfoName: config.importCulture,
      FileDelimiter: config.importDelimiter,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Import execution failed for ${importId}: ${res.status} :: ${text}`);
  }
}

async function getIntuiflowBaseUrl(env: Env): Promise<string> {
  const row = await env.DB
    .prepare("SELECT base_url FROM connectors WHERE kind='intuiflow' AND is_enabled=1 LIMIT 1")
    .first<{ base_url: string }>();
  if (!row) throw new Error('No enabled Intuiflow connector configured');
  return row.base_url;
}
