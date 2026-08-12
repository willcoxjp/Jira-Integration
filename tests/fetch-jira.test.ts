import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchJiraIssues } from '../src/pipeline/fetch-jira';

const CONFIG: any = { jqlFilter: 'project = "IF" ORDER BY updated DESC' };

function makeEnv(auth: string | undefined = 'YmFzZTY0') {
  const stmt: any = {
    first: vi.fn().mockResolvedValue({ base_url: 'https://algo.atlassian.net' }),
  };
  stmt.bind = vi.fn().mockReturnValue(stmt);
  return { DB: { prepare: vi.fn().mockReturnValue(stmt) }, JIRA_BASIC_AUTH: auth } as any;
}

function jsonResponse(body: any, status = 200) {
  return { ok: status >= 200 && status < 300, status, statusText: '', json: async () => body, text: async () => JSON.stringify(body) };
}

describe('fetchJiraIssues auth preflight', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  // Regression: 2026-08-12. Jira answers /search/jql with HTTP 200 and an empty
  // issue list when credentials are bad, so an expired token silently produced
  // `fetched: 0` runs for ~110 days. An empty result must now be disambiguated.
  it('throws a credentials error when the search returns empty and /myself is 401', async () => {
    const fetchMock = vi.fn(async (url: any) => {
      if (String(url).includes('/rest/api/3/myself')) return jsonResponse({ message: 'Unauthorized' }, 401);
      return jsonResponse({ issues: [], isLast: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchJiraIssues(makeEnv(), CONFIG)).rejects.toThrow(/credential|token|401/i);
  });

  it('returns an empty array when the search is empty but credentials are valid', async () => {
    const fetchMock = vi.fn(async (url: any) => {
      if (String(url).includes('/rest/api/3/myself')) return jsonResponse({ accountId: 'abc' }, 200);
      return jsonResponse({ issues: [], isLast: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchJiraIssues(makeEnv(), CONFIG)).resolves.toEqual([]);
  });

  it('does not spend a preflight subrequest when issues are returned', async () => {
    const fetchMock = vi.fn(async (url: any) => {
      if (String(url).includes('/rest/api/3/myself')) return jsonResponse({ accountId: 'abc' }, 200);
      return jsonResponse({ issues: [{ key: 'IF-1' }], isLast: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    const issues = await fetchJiraIssues(makeEnv(), CONFIG);

    expect(issues).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([u]: any[]) => String(u).includes('/myself'))).toBe(false);
  });

  it('still throws on a non-ok search response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ errorMessages: ['bad jql'] }, 400)));

    await expect(fetchJiraIssues(makeEnv(), CONFIG)).rejects.toThrow(/Jira search failed: 400/);
  });
});
