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
 * Flow (from Access DB VBA — mdlPOST_Request, mdlPOST_WorkOrder_CSV, mdlPOST_FinalRequest):
 *   1. POST /api/v2/import                        → create import session (returns Id)
 *   2. POST /api/v2/import/{id}/item?type=WorkOrder → upload CSV (text/csv body)
 *   3. POST /api/v2/import/{id}/run                → execute the import
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

  // Step 2: Upload work orders CSV
  if (csvFiles.workOrdersCsv && csvFiles.workOrdersCsv.split('\n').length > 1) {
    await uploadCsvItem(base, apiKey, importId, csvFiles.workOrdersCsv, 'WorkOrder');
    result.workOrdersUploaded = true;
  }

  // Step 3: Execute import
  await executeImportRun(base, apiKey, importId);

  return result;
}

/**
 * Execute command releases via the Intuiflow scheduling orders API.
 * Commands like Release, Close, Hold, etc.
 *
 * From VBA: POST /api/v2/scheduling/orders/{transaction}
 * where transaction is one of: Lock, Unlock, Release, Unrelease, PartialUnrelease,
 * Hold, Unhold, Close, Reopen
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

/**
 * Step 1: Create import session.
 * VBA: mdlPOST_Request.SendPOSTRequest
 *   POST /api/v2/import?api_key=KEY
 *   Body: { Mode: "ReplaceByLocation", Type: "Host", Option: "None", IgnoreSourceERP: "True" }
 *   Response field: "Id"
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
 * VBA: mdlPOST_WorkOrder_CSV.ExportWorkOrderDataToCSV
 *   POST /api/v2/import/{id}/item?type=WorkOrder&api_key=KEY
 *   Content-Type: text/csv
 *   Body: raw CSV string
 */
async function uploadCsvItem(
  base: string,
  apiKey: string,
  importId: number,
  csvContent: string,
  itemType: string
): Promise<void> {
  const res = await fetch(
    `${base}/api/v2/import/${importId}/item?type=${itemType}&api_key=${apiKey}`,
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
    throw new Error(`CSV upload failed for import ${importId} (${itemType}): ${res.status} :: ${text}`);
  }
}

/**
 * Step 3: Execute the import.
 * VBA: mdlPOST_FinalRequest.SendFinalPOSTRequest
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
