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
 */
export async function updateSyncState(
  env: Env,
  result: TransformResult
): Promise<void> {
  const now = new Date().toISOString();

  // Upsert each work order into sync state
  for (const wo of result.workOrders) {
    const wasReleased = result.releasedKeys.includes(wo.OrderNumber) ? 1 : 0;
    const wasClosed = result.closedKeys.includes(wo.OrderNumber) ? 1 : 0;

    await env.DB
      .prepare(
        `INSERT INTO order_sync_state
         (jira_key, jira_issue_type, last_jira_status, last_jira_updated, was_released, was_closed, last_quantity, last_priority, last_synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(jira_key) DO UPDATE SET
           last_jira_status = excluded.last_jira_status,
           last_jira_updated = excluded.last_jira_updated,
           was_released = CASE WHEN excluded.was_released = 1 THEN 1 ELSE order_sync_state.was_released END,
           was_closed = CASE WHEN excluded.was_closed = 1 THEN 1 ELSE order_sync_state.was_closed END,
           last_quantity = excluded.last_quantity,
           last_priority = excluded.last_priority,
           last_synced_at = excluded.last_synced_at`
      )
      .bind(
        wo.OrderNumber,
        wo.PartNumber,
        wo.Status,
        now,
        wasReleased,
        wasClosed,
        wo.Quantity,
        Number(wo.SchedulingPriority),
        now
      )
      .run();
  }
}
