import type { Env } from '../types';
import { json } from '../utils/db-helpers';
import { handleConnectors } from './connectors';
import { handleSettings } from './settings';
import { handlePartTypes } from './part-types';
import { handleRoutings } from './routings';
import { handleOperations } from './operations';
import { handlePriorityRules, handlePriorityValues } from './priorities';
import { handleEffortMappings } from './effort';
import { handleReleaseDates } from './releases';
import { handleResources } from './resources';
import { handleRuns } from './runs';

/**
 * Dispatch API requests to the appropriate handler.
 * All routes are under /api/.
 */
export async function apiRouter(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  const method = request.method;
  const path = url.pathname.replace(/^\/api\/?/, '');
  const segments = path.split('/').filter(Boolean);
  const [resource, id, sub] = segments;

  try {
    switch (resource) {
      case 'connectors':
        return await handleConnectors(method, id, request, env);
      case 'settings':
        return await handleSettings(method, request, env);
      case 'part-types':
        return await handlePartTypes(method, id, request, env);
      case 'routings':
        return await handleRoutings(method, id, request, env);
      case 'operations':
        return await handleOperations(method, id, request, env);
      case 'priority-rules':
        return await handlePriorityRules(method, id, request, env);
      case 'priority-values':
        return await handlePriorityValues(method, id, request, env);
      case 'effort-mappings':
        return await handleEffortMappings(method, id, request, env);
      case 'release-dates':
        return await handleReleaseDates(method, id, request, env);
      case 'resources':
        return await handleResources(method, id, request, env);
      case 'runs':
        return await handleRuns(method, id, sub, request, env, url);
      case 'diag': {
        if (id === 'import-types') {
          // GET /api/diag/import-types — test what item types the import API accepts
          const ifRow = await env.DB
            .prepare("SELECT base_url FROM connectors WHERE kind='intuiflow' AND is_enabled=1 LIMIT 1")
            .first<{ base_url: string }>();
          if (!ifRow) return json({ error: 'No Intuiflow connector configured' });
          const apiKey = env.INTUIFLOW_API_KEY;
          if (!apiKey) return json({ error: 'Missing INTUIFLOW_API_KEY secret' });

          // Create a test import session
          const sessionRes = await fetch(`${ifRow.base_url}/api/v2/import?api_key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ Mode: 'ReplaceByLocation', Type: 'Host', Option: 'None', IgnoreSourceERP: true }),
          });
          const sessionText = await sessionRes.text();
          let sessionJson: any;
          try { sessionJson = JSON.parse(sessionText); } catch { sessionJson = null; }
          const importId = sessionJson?.Id ?? sessionJson?.EntityID;

          // Try posting a dummy CSV to different item types
          // Test 1: Fetch the swagger spec for import API
          let swaggerData: any = null;
          const swaggerUrls = [
            '/swagger/v2/swagger.json',
            '/swagger/v2-import/swagger.json',
            '/swagger/v1/swagger.json',
          ];
          for (const su of swaggerUrls) {
            const sr = await fetch(`${ifRow.base_url}${su}`);
            if (sr.ok) {
              const st = await sr.text();
              // Find item-related paths
              const itemPaths = st.match(/"\/api\/v2\/import[^"]*item[^"]*"/g) || [];
              const typeEnum = st.match(/"type"[^}]*"enum"\s*:\s*\[([^\]]*)\]/g) || [];
              swaggerData = { url: su, itemPaths, typeEnum: typeEnum.map((t: string) => t.substring(0, 200)) };
              break;
            }
          }

          // Test 2: Try /item WITHOUT ?type= query param (maybe type is in headers or auto-detected)
          let itemNoType: any = null;
          if (importId) {
            const dummyCsv = 'OrderNumber,PartNumber,Location,Command\nTEST-001,TestPart,DD Tech,Release';
            const r = await fetch(
              `${ifRow.base_url}/api/v2/import/${importId}/item?api_key=${apiKey}`,
              { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: dummyCsv }
            );
            itemNoType = { status: r.status, response: (await r.text()).substring(0, 500) };
          }

          // Test 3: Try valid types we know work, plus some new guesses with different CSV shapes
          const typeTests: Record<string, any> = {};
          if (importId) {
            const tests: Array<[string, string]> = [
              ['WorkOrder', 'WorkOrderNumber,OrderDate,PartNumber,Location,RoutingName,WorkOrderQuantity,EndRequestDate,Priority\nTEST-001,3/18/2026,Task,DD Tech,Standard,1,12/31/2045,99'],
              ['SupplyOrder', 'OrderNumber,PartNumber,Location,Command\nTEST-001,Task,DD Tech,Release'],
            ];
            for (const [t, csv] of tests) {
              const r = await fetch(
                `${ifRow.base_url}/api/v2/import/${importId}/item?type=${t}&api_key=${apiKey}`,
                { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: csv }
              );
              typeTests[t] = { status: r.status, response: (await r.text()).substring(0, 500) };
            }
          }

          return json({ importId, swagger: swaggerData, itemNoType, typeTests });
        }

        if (id === 'command') {
          // GET /api/diag/command?orderNumber=IF-9307&partNumber=Feature&command=Release
          const orderNumber = url.searchParams.get('orderNumber');
          if (!orderNumber) return json({ error: 'Missing ?orderNumber= param' }, 400);

          const ifRow = await env.DB
            .prepare("SELECT base_url FROM connectors WHERE kind='intuiflow' AND is_enabled=1 LIMIT 1")
            .first<{ base_url: string }>();
          if (!ifRow) return json({ error: 'No Intuiflow connector configured' });

          const apiKey = env.INTUIFLOW_API_KEY;
          if (!apiKey) return json({ error: 'Missing INTUIFLOW_API_KEY secret' });

          // Look up the part number from the most recent dry run CSV
          let partNumber = url.searchParams.get('partNumber');
          if (!partNumber) {
            const lastDryRun = await env.DB
              .prepare("SELECT id FROM runs WHERE status = 'dry_run' ORDER BY id DESC LIMIT 1")
              .first<{ id: number }>();
            if (lastDryRun) {
              const csvRow = await env.DB
                .prepare("SELECT csv_content FROM run_csvs WHERE run_id = ? AND csv_type = 'commands'")
                .bind(lastDryRun.id)
                .first<{ csv_content: string }>();
              if (csvRow) {
                const match = csvRow.csv_content.split('\n').find(l => l.startsWith(orderNumber + ','));
                if (match) partNumber = match.split(',')[1];
              }
            }
          }
          if (!partNumber) return json({ error: `Could not find partNumber for ${orderNumber}. Pass ?partNumber= explicitly.` }, 400);

          const command = url.searchParams.get('command') || 'Release';
          const locRow = await env.DB
            .prepare("SELECT value FROM settings WHERE key = 'location'")
            .first<{ value: string }>();
          const location = url.searchParams.get('location') || locRow?.value || 'DD Tech';

          const cmdUrl = new URL(`${ifRow.base_url}/api/v2/scheduling/orders/${command}`);
          cmdUrl.searchParams.set('api_key', apiKey);
          cmdUrl.searchParams.set('location', location);
          cmdUrl.searchParams.set('orderNumber', orderNumber);
          cmdUrl.searchParams.set('partNumber', partNumber);

          const cmdRes = await fetch(cmdUrl.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          const cmdText = await cmdRes.text();

          return json({
            test: 'single_command',
            command,
            orderNumber,
            partNumber,
            location,
            url: cmdUrl.toString().replace(apiKey, '***'),
            httpStatus: cmdRes.status,
            httpStatusText: cmdRes.statusText,
            response: cmdText.substring(0, 1000),
          });
        }

        // GET /api/diag — tests Jira connectivity
        const jiraRow = await env.DB
          .prepare("SELECT base_url FROM connectors WHERE kind='jira' AND is_enabled=1 LIMIT 1")
          .first<{ base_url: string }>();
        if (!jiraRow) return json({ error: 'No Jira connector configured' });

        const auth = env.JIRA_BASIC_AUTH;
        if (!auth) return json({ error: 'Missing JIRA_BASIC_AUTH secret' });

        const jqlRow = await env.DB
          .prepare("SELECT value FROM settings WHERE key = 'jql_filter'")
          .first<{ value: string }>();
        const jql = jqlRow?.value || 'project = "IF"';

        const diagRes = await fetch(`${jiraRow.base_url}/rest/api/3/search/jql`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ jql, maxResults: 2, fields: ['summary', 'status', 'issuetype'] }),
        });

        const diagText = await diagRes.text();
        let diagJson: any;
        try { diagJson = JSON.parse(diagText); } catch { diagJson = null; }

        return json({
          jiraBase: jiraRow.base_url,
          jql,
          authPresent: !!auth,
          authLength: auth.length,
          httpStatus: diagRes.status,
          httpStatusText: diagRes.statusText,
          issueCount: diagJson?.issues?.length ?? 0,
          issueKeys: (diagJson?.issues || []).map((i: any) => i.key),
          responsePreview: diagText.substring(0, 1000),
        });
      }
      default:
        return json({ error: 'Not found' }, 404);
    }
  } catch (err: any) {
    console.error(`API error [${method} /api/${path}]:`, err);
    return json({ error: err?.message || 'Internal server error' }, 500);
  }
}
