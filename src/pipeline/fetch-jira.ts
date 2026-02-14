import type { Env, JiraIssue, PipelineConfig } from '../types';

/**
 * Fetch all matching Jira issues using the v3 search/jql endpoint.
 * Uses nextPageToken pagination (startAt is not supported on this endpoint).
 */
export async function fetchJiraIssues(
  env: Env,
  config: PipelineConfig,
  limit = 5000
): Promise<JiraIssue[]> {
  const base = await getJiraBaseUrl(env);
  const auth = env.JIRA_BASIC_AUTH;
  if (!auth) throw new Error('Missing JIRA_BASIC_AUTH secret');

  const fields = buildFieldList(config);
  const pageSize = 1000;
  const results: JiraIssue[] = [];
  let nextPageToken: string | undefined;

  while (results.length < limit) {
    const payload: any = {
      jql: config.jqlFilter,
      maxResults: Math.min(pageSize, limit - results.length),
      fields,
    };
    if (nextPageToken) {
      payload.nextPageToken = nextPageToken;
    }

    const res = await fetch(`${base}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira search failed: ${res.status} ${res.statusText} :: ${text}`);
    }

    const json: any = await res.json();
    const issues = json.issues || [];
    results.push(...issues);

    if (issues.length === 0) break;

    // Use nextPageToken for pagination
    nextPageToken = json.nextPageToken;
    if (!nextPageToken) break;
  }

  return results;
}

/**
 * Build the list of Jira fields to request, including configurable custom field IDs.
 */
function buildFieldList(config: PipelineConfig): string[] {
  const standard = [
    'summary',
    'assignee',
    'status',
    'issuetype',
    'priority',
    'duedate',
    'updated',
    'created',
    'project',
    'fixVersions',
    'components',
    'creator',
    'reporter',
    'labels',
    'timetracking',
  ];

  const custom: string[] = [];
  if (config.effortFieldId) custom.push(config.effortFieldId);
  if (config.bizRankFieldId) custom.push(config.bizRankFieldId);
  if (config.epicLinkFieldId) custom.push(config.epicLinkFieldId);
  if (config.sprintFieldId) custom.push(config.sprintFieldId);

  return [...standard, ...custom];
}

async function getJiraBaseUrl(env: Env): Promise<string> {
  const row = await env.DB
    .prepare("SELECT base_url FROM connectors WHERE kind='jira' AND is_enabled=1 LIMIT 1")
    .first<{ base_url: string }>();
  if (!row) throw new Error('No enabled Jira connector configured');
  return row.base_url;
}
