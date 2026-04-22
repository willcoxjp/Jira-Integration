import type { Env, PipelineQueueMessage } from './types';
import { apiRouter } from './api/router';
import { runPipeline } from './pipeline/runner';
import { matchesSchedule, getNextPhase, type CronScheduleConfig } from './utils/cron-schedule';
import { dashboardPage } from './ui/pages/dashboard';
import { cronPage } from './ui/pages/cron';
import { settingsPage } from './ui/pages/settings';
import { partTypesPage } from './ui/pages/part-types';
import { routingsPage } from './ui/pages/routings';
import { operationsPage } from './ui/pages/operations';
import { prioritiesPage } from './ui/pages/priorities';
import { effortPage } from './ui/pages/effort';
import { releasesPage } from './ui/pages/releases';
import { resourcesPage } from './ui/pages/resources';
import { runsPage } from './ui/pages/runs';

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

async function loadCronConfig(env: Env): Promise<CronScheduleConfig> {
  const rows = await env.DB
    .prepare("SELECT key, value FROM settings WHERE key IN ('cron_enabled','cron_timezone','cron_days','cron_hour','cron_minute')")
    .all<{ key: string; value: string }>();
  const s: Record<string, string> = {};
  for (const row of rows.results) s[row.key] = row.value;
  return {
    enabled:  s.cron_enabled !== 'false',
    timezone: s.cron_timezone ?? 'America/New_York',
    days:     (s.cron_days ?? '1,2,3,4,5').split(',').map(Number),
    hour:     parseInt(s.cron_hour  ?? '6',  10),
    minute:   parseInt(s.cron_minute ?? '0', 10),
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/health') {
      return new Response('OK', { status: 200 });
    }

    if (path.startsWith('/api/')) {
      return apiRouter(request, env, url);
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      switch (path) {
        case '/':
          return html(await dashboardPage(env));
        case '/cron':
          return html(await cronPage(env));
        case '/settings':
          return html(await settingsPage(env));
        case '/part-types':
          return html(await partTypesPage(env));
        case '/routings':
          return html(await routingsPage(env));
        case '/operations':
          return html(await operationsPage(env));
        case '/priorities':
          return html(await prioritiesPage(env));
        case '/effort':
          return html(await effortPage(env));
        case '/releases':
          return html(await releasesPage(env));
        case '/resources':
          return html(await resourcesPage(env));
        case '/runs':
          return html(await runsPage(env, url));
        default:
          return html('<h1>404 - Not Found</h1>', 404);
      }
    } catch (err: any) {
      console.error('UI render error:', err);
      return html(`<h1>Error</h1><pre>${err?.message || 'Unknown error'}</pre>`, 500);
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      const config = await loadCronConfig(env);
      if (!matchesSchedule(new Date(), config)) {
        return; // This 15-min slot isn't the configured run time
      }

      // Dry run only — fetch Jira, transform, store CSVs.
      // Each upload phase gets its own Worker invocation via queue.
      const { runId } = await runPipeline(env, 'cron', { dryRun: true });
      await env.PIPELINE_QUEUE.send({ phase: 'wo', sourceRunId: runId });
    })().catch((err) => {
      console.error('Scheduled pipeline error:', err);
    }));
  },

  async queue(batch: MessageBatch<PipelineQueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const { phase, sourceRunId } = message.body;
      try {
        await runPipeline(env, 'cron', { phase, sourceRunId });
        const next = getNextPhase(phase);
        if (next) {
          await env.PIPELINE_QUEUE.send({ phase: next, sourceRunId });
        }
        message.ack();
      } catch (err) {
        console.error(`Queue phase ${phase} failed:`, err);
        message.retry();
      }
    }
  },
};
