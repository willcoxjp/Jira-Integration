import type { Env, SyncStateRow, TransformResult } from '../types';

/**
 * Load the current sync state for all tracked orders.
 */
export async function loadSyncState(env: Env): Promise<Map<string, SyncStateRow>> {
  const result = await env.DB.prepare('SELECT * FROM order_sync_state').all();
  const map = new Map<string, SyncStateRow>();

  for (const row of result.results as any[]) {
    map.set(row.jira_key, {
      jiraKey: row.jira_key,
      jiraIssueType: row.jira_issue_type,
      lastJiraStatus: row.last_jira_status,
      lastJiraUpdated: row.last_jira_updated,
      wasReleased: !!row.was_released,
      wasClosed: !!row.was_closed,
      lastQuantity: row.last_quantity,
      lastPriority: row.last_priority,
    });
  }

  return map;
}

/**
 * Update sync state after a successful pipeline run.
 * Uses D1 batch API to avoid hitting the subrequest limit.
 */
export async function updateSyncState(
  env: Env,
  result: TransformResult
): Promise<void> {
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

  const statements = result.workOrders.map(wo => {
    const jiraKey = wo.WorkOrderNumber;
    const wasReleased = result.releasedKeys.includes(jiraKey) ? 1 : 0;
    const wasClosed = result.closedKeys.includes(jiraKey) ? 1 : 0;
    const jiraStatus = result.issueStatuses.get(jiraKey) ?? '';

    return env.DB
      .prepare(upsertSql)
      .bind(
        jiraKey,
        wo.PartNumber,
        jiraStatus,
        now,
        wasReleased,
        wasClosed,
        wo.WorkOrderQuantity,
        wo.Priority,
        now
      );
  });

  // D1 batch executes all statements in a single transaction (single subrequest)
  if (statements.length > 0) {
    await env.DB.batch(statements);
  }
}
