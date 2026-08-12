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

    if (issues.length === 0) {
      // Jira answers /search/jql with HTTP 200 and an empty issue list when the
      // credentials are bad — it does NOT return 401 here. Without this check an
      // expired API token is indistinguishable from "the JQL matched nothing",
      // which is exactly how a dead token went unnoticed from 2026-04-23 to
      // 2026-08-12: every run recorded `fetched: 0` and reported success, and the
      // only visible symptom was a misleading "No work orders CSV found in dry
      // run #N" thrown one phase later by runner.ts.
      //
      // Only preflight when the result set is empty, so the normal path costs no
      // extra subrequest (the Worker has a hard subrequest budget per invocation).
      if (results.length === 0) await assertCredentialsValid(base, auth);
      break;
    }

    // Use nextPageToken for pagination
    nextPageToken = json.nextPageToken;
    if (!nextPageToken) break;
  }

  return results;
}

/**
 * Verify JIRA_BASIC_AUTH still authenticates, and throw a self-explanatory error if not.
 *
 * /rest/api/3/myself is the cheapest endpoint that actually honors auth (it returns a
 * real 401), unlike /search/jql. Called only when a search comes back empty.
 *
 * To rotate the token: create one at
 * https://id.atlassian.com/manage-profile/security/api-tokens then run
 *   npx wrangler secret put JIRA_BASIC_AUTH
 * with the base64 of "<email>:<api-token>".
 */
async function assertCredentialsValid(base: string, auth: string): Promise<void> {
  const res = await fetch(`${base}/rest/api/3/myself`, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `Jira credentials rejected (${res.status} from /myself). The JIRA_BASIC_AUTH token is ` +
        `expired or revoked — note that /search/jql hides this by returning 200 with zero ` +
        `issues. Rotate the token at https://id.atlassian.com/manage-profile/security/api-tokens ` +
        `and run: npx wrangler secret put JIRA_BASIC_AUTH`
    );
  }
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
