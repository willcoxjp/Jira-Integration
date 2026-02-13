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
      default:
        return json({ error: 'Not found' }, 404);
    }
  } catch (err: any) {
    console.error(`API error [${method} /api/${path}]:`, err);
    return json({ error: err?.message || 'Internal server error' }, 500);
  }
}
