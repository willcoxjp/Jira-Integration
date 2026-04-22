import type { Env, PipelineQueueMessage } from './types';
import { apiRouter } from './api/router';
import { runPipeline } from './pipeline/runner';
import { dashboardPage } from './ui/pages/dashboard';
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (path === '/health') {
      return new Response('OK', { status: 200 });
    }

    // API routes
    if (path.startsWith('/api/')) {
      return apiRouter(request, env, url);
    }

    // UI pages (GET only)
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      switch (path) {
        case '/':
          return html(await dashboardPage(env));
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
      // Respect the cron_enabled toggle from the dashboard
      const setting = await env.DB
        .prepare("SELECT value FROM settings WHERE key='cron_enabled'")
        .first<{ value: string }>();
      if (setting?.value === 'false') {
        console.log('Cron disabled via settings — skipping run.');
        return;
      }

      // Run dry run only (Jira fetch + transform + store CSVs).
      // Upload phases are chained via queue so each gets a fresh subrequest budget.
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
        const next = PHASE_SEQUENCE[PHASE_SEQUENCE.indexOf(phase) + 1];
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

const PHASE_SEQUENCE = ['wo', 'reschedule', 'commands', 'transactions', 'sync'];
