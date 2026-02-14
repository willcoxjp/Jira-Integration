import { describe, it, expect } from 'vitest';
import {
  calculateQuantity,
  calculatePriority,
  buildWorkOrderRow,
  transformIssues,
} from '../src/pipeline/transform';
import type {
  JiraIssue,
  PipelineConfig,
  PartTypeConfig,
  PriorityRule,
  SyncStateRow,
} from '../src/types';

// ============================================================
// Test fixtures
// ============================================================

function makeConfig(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  return {
    location: 'DD Tech',
    orderType: 'WO',
    unitOfMeasure: 'HR',
    routingName: 'Standard',
    sentinelQuantity: 4.567,
    sentinelCloseDate: '2045-12-31',
    priorityCutoff: 30,
    jqlFilter: '',
    effortFieldId: 'customfield_10016',
    bizRankFieldId: 'customfield_10037',
    epicLinkFieldId: 'customfield_10014',
    sprintFieldId: 'customfield_10020',
    defaultEffortHours: 160,
    importCulture: 'en-US',
    importDelimiter: ',',
    partTypes: [
      { id: 1, jiraIssueType: 'Defect', intuiflowPartNumber: 'Defect', isIncluded: true, firstOperationSeq: 200 },
      { id: 2, jiraIssueType: 'Feature', intuiflowPartNumber: 'Feature', isIncluded: true, firstOperationSeq: 100 },
      { id: 3, jiraIssueType: 'Task', intuiflowPartNumber: 'Task', isIncluded: true, firstOperationSeq: 400 },
      { id: 4, jiraIssueType: 'Technical Debt', intuiflowPartNumber: 'Technical Debt', isIncluded: true, firstOperationSeq: 200 },
      { id: 5, jiraIssueType: 'Epic', intuiflowPartNumber: 'Epic', isIncluded: false, firstOperationSeq: 0 },
    ],
    effortMappings: new Map([
      ['Tiny < 8 hrs', 8],
      ['Small <  24 hrs', 24],
      ['Medium < 40 hrs', 40],
      ['Large < 80 hrs', 80],
    ]),
    priorityRules: new Map<number, PriorityRule>([
      [1, { priorityPrefix: 1, daysOffset: 45, fixedDate: null, description: '' }],
      [2, { priorityPrefix: 2, daysOffset: 90, fixedDate: null, description: '' }],
      [3, { priorityPrefix: 3, daysOffset: 180, fixedDate: null, description: '' }],
      [9, { priorityPrefix: 9, daysOffset: null, fixedDate: '12-25', description: '' }],
    ]),
    priorityValues: new Map([
      ['P0 - Critical', 0],
      ['P1 - Urgent', 1],
      ['P2 - High', 2],
      ['P3 - Medium', 3],
      ['P4 - Low', 4],
      ['Select Priority', 9],
    ]),
    operationsLookup: new Map([
      ['Defect Review', { jiraStatus: 'Defect Review', operationSeq: 200, operationName: 'Defect Review' }],
      ['In Development', { jiraStatus: 'In Development', operationSeq: 600, operationName: 'In Development' }],
      ['QA Ready', { jiraStatus: 'QA Ready', operationSeq: 800, operationName: 'QA Ready' }],
      ['Closed', { jiraStatus: 'Closed', operationSeq: 1200, operationName: 'On Hold' }],
    ]),
    routings: new Map(),
    releaseDates: new Map([
      ['Intuiflow Release 2024.3.2', { versionName: 'Intuiflow Release 2024.3.2', status: 'UNRELEASED', startDate: '2024-02-01', releaseDate: '2024-06-07', description: '' }],
    ]),
    ...overrides,
  };
}

function makeIssue(overrides: Partial<JiraIssue['fields']> = {}, key = 'IF-1234'): JiraIssue {
  return {
    key,
    fields: {
      summary: 'Fix the broken widget in the scheduler',
      assignee: { displayName: 'Patrick Willcox', accountId: 'abc123' },
      status: { name: 'In Development', statusCategory: { key: 'indeterminate', name: 'In Progress' } },
      issuetype: { name: 'Defect' },
      priority: { name: 'P2 - High' },
      duedate: null,
      updated: '2025-01-15T12:00:00.000Z',
      created: '2025-01-01T10:00:00.000Z',
      project: { key: 'IF' },
      fixVersions: [],
      components: [{ name: 'Scheduler' }],
      creator: { displayName: 'Tim Hutkowski' },
      reporter: { displayName: 'Tim Hutkowski' },
      labels: ['CMG-2024.6'],
      timetracking: {},
      ...overrides,
    },
  };
}

// ============================================================
// calculateQuantity
// ============================================================

describe('calculateQuantity', () => {
  const config = makeConfig();

  it('uses original estimate (seconds → hours, rounded)', () => {
    const issue = makeIssue({ timetracking: { originalEstimateSeconds: 28800 } }); // 8 hours
    expect(calculateQuantity(issue, config)).toBe(8);
  });

  it('rounds original estimate to nearest hour', () => {
    const issue = makeIssue({ timetracking: { originalEstimateSeconds: 5400 } }); // 1.5 hours
    expect(calculateQuantity(issue, config)).toBe(2);
  });

  it('skips zero original estimate, falls through to effort', () => {
    const issue = makeIssue({
      timetracking: { originalEstimateSeconds: 0 },
      customfield_10016: 'Medium < 40 hrs',
    });
    expect(calculateQuantity(issue, config)).toBe(40);
  });

  it('uses effort field mapping when no estimate', () => {
    const issue = makeIssue({ customfield_10016: 'Tiny < 8 hrs' });
    expect(calculateQuantity(issue, config)).toBe(8);
  });

  it('uses effort field for "Small" label', () => {
    const issue = makeIssue({ customfield_10016: 'Small <  24 hrs' });
    expect(calculateQuantity(issue, config)).toBe(24);
  });

  it('uses effort field for "Large" label', () => {
    const issue = makeIssue({ customfield_10016: 'Large < 80 hrs' });
    expect(calculateQuantity(issue, config)).toBe(80);
  });

  it('uses default effort hours for unknown effort label', () => {
    const issue = makeIssue({ customfield_10016: 'Unknown Label' });
    expect(calculateQuantity(issue, config)).toBe(160);
  });

  it('returns sentinel quantity when no estimate and no effort', () => {
    const issue = makeIssue();
    expect(calculateQuantity(issue, config)).toBe(4.567);
  });
});

// ============================================================
// calculatePriority
// ============================================================

describe('calculatePriority', () => {
  const config = makeConfig();

  it('combines business ranking and jira priority', () => {
    const issue = makeIssue({
      priority: { name: 'P2 - High' },
      customfield_10037: 1,
    });
    expect(calculatePriority(issue, config)).toBe(12);
  });

  it('defaults business ranking to 9 when null', () => {
    const issue = makeIssue({ priority: { name: 'P2 - High' } });
    expect(calculatePriority(issue, config)).toBe(92);
  });

  it('defaults jira priority to 9 for "Select Priority"', () => {
    const issue = makeIssue({
      priority: { name: 'Select Priority' },
      customfield_10037: 2,
    });
    expect(calculatePriority(issue, config)).toBe(29);
  });

  it('defaults both to 9 when all null', () => {
    const issue = makeIssue({ priority: undefined });
    expect(calculatePriority(issue, config)).toBe(99);
  });

  it('handles string business ranking', () => {
    const issue = makeIssue({
      priority: { name: 'P3 - Medium' },
      customfield_10037: '2',
    });
    expect(calculatePriority(issue, config)).toBe(23);
  });

  it('handles P0 critical priority', () => {
    const issue = makeIssue({
      priority: { name: 'P0 - Critical' },
      customfield_10037: 1,
    });
    expect(calculatePriority(issue, config)).toBe(10);
  });
});

// ============================================================
// buildWorkOrderRow
// ============================================================

describe('buildWorkOrderRow', () => {
  const config = makeConfig();
  const today = new Date('2025-01-15');

  it('maps basic fields correctly', () => {
    const issue = makeIssue();
    const partType = config.partTypes[0]; // Defect
    const row = buildWorkOrderRow(issue, partType, 8, 12, '2025-03-01', null, config);

    expect(row.WorkOrderNumber).toBe('IF-1234');
    expect(row.PartNumber).toBe('Defect');
    expect(row.Location).toBe('DD Tech');
    expect(row.WorkOrderQuantity).toBe(8);
    expect(row.RoutingName).toBe('Standard');
    expect(row.Priority).toBe(12);
    expect(row.Expedite).toBe('None');
  });

  it('maps user defined fields', () => {
    const issue = makeIssue({
      components: [{ name: 'Scheduler' }],
      assignee: { displayName: 'Patrick', accountId: 'x' },
      creator: { displayName: 'Tim' },
      labels: ['CMG-2024.6', 'urgent'],
    });
    const partType = config.partTypes[0];
    const row = buildWorkOrderRow(issue, partType, 8, 12, '2025-03-01', null, config);

    expect(row.UserDefined1).toBe('Scheduler');
    expect(row.UserDefined2).toBe('Patrick');
    expect(row.UserDefined3).toBe('Tim');
    expect(row.UserDefined6).toBe('CMG-2024.6;urgent');
  });

  it('truncates Notes to 50 chars and strips commas', () => {
    const issue = makeIssue({
      summary: 'This is a very long summary, with commas, that should be truncated to fifty characters maximum',
    });
    const partType = config.partTypes[0];
    const row = buildWorkOrderRow(issue, partType, 8, 12, '2025-03-01', null, config);

    expect(row.Notes.length).toBeLessThanOrEqual(50);
    expect(row.Notes).not.toContain(',');
  });

  it('uses release date for EndRequestDate when available', () => {
    const issue = makeIssue();
    const partType = config.partTypes[0];
    const row = buildWorkOrderRow(issue, partType, 8, 12, '2025-03-01', '2024-06-07', config);

    expect(row.EndRequestDate).toBe('6/7/2024');
  });

  it('falls back to due date for EndRequestDate when no release date', () => {
    const issue = makeIssue();
    const partType = config.partTypes[0];
    const row = buildWorkOrderRow(issue, partType, 8, 12, '2025-03-01', null, config);

    expect(row.EndRequestDate).toBe('3/1/2025');
  });

  it('formats OrderDate as US date', () => {
    const issue = makeIssue({ created: '2025-01-01T10:00:00.000Z' });
    const partType = config.partTypes[0];
    const row = buildWorkOrderRow(issue, partType, 8, 12, '2025-03-01', null, config);

    expect(row.OrderDate).toBe('1/1/2025');
  });
});

// ============================================================
// transformIssues (integration test)
// ============================================================

describe('transformIssues', () => {
  const config = makeConfig();
  const today = new Date('2025-01-15');

  it('transforms a simple defect into a work order', () => {
    const issues = [makeIssue({ customfield_10037: 1 })];
    const syncState = new Map<string, SyncStateRow>();
    const result = transformIssues(issues, config, syncState, today);

    expect(result.workOrders).toHaveLength(1);
    expect(result.workOrders[0].WorkOrderNumber).toBe('IF-1234');
    expect(result.workOrders[0].PartNumber).toBe('Defect');
    expect(result.stats.workOrders).toBe(1);
  });

  it('excludes non-included issue types', () => {
    const issues = [makeIssue({ issuetype: { name: 'Epic' } })];
    const syncState = new Map<string, SyncStateRow>();
    const result = transformIssues(issues, config, syncState, today);

    expect(result.workOrders).toHaveLength(0);
    expect(result.stats.excluded).toBe(1);
  });

  it('excludes issues with priority >= cutoff', () => {
    // Business ranking null (9) + P4-Low (4) = 94, which is >= 30
    const issues = [makeIssue({ priority: { name: 'P4 - Low' } })];
    const syncState = new Map<string, SyncStateRow>();
    const result = transformIssues(issues, config, syncState, today);

    expect(result.workOrders).toHaveLength(0);
    expect(result.stats.excluded).toBe(1);
  });

  it('generates Release command for new issues', () => {
    const issues = [makeIssue({ customfield_10037: 1 })];
    const syncState = new Map<string, SyncStateRow>();
    const result = transformIssues(issues, config, syncState, today);

    const releaseCmd = result.commands.find(c => c.Command === 'Release');
    expect(releaseCmd).toBeDefined();
    expect(releaseCmd!.OrderNumber).toBe('IF-1234');
    expect(releaseCmd!.OperationSequenceNumber).toBe(200); // Defect first op
  });

  it('does NOT generate Release for already-released issues', () => {
    const issues = [makeIssue({ customfield_10037: 1 })];
    const syncState = new Map<string, SyncStateRow>([
      ['IF-1234', { jiraKey: 'IF-1234', jiraIssueType: 'Defect', lastJiraStatus: 'In Development', lastJiraUpdated: '', wasReleased: true, wasClosed: false, lastQuantity: 8, lastPriority: 12 }],
    ]);
    const result = transformIssues(issues, config, syncState, today);

    const releaseCmd = result.commands.find(c => c.Command === 'Release');
    expect(releaseCmd).toBeUndefined();
  });

  it('generates Close command for closed issues', () => {
    const issues = [makeIssue({
      status: { name: 'Closed', statusCategory: { key: 'done', name: 'Done' } },
      customfield_10037: 1,
    })];
    const syncState = new Map<string, SyncStateRow>([
      ['IF-1234', { jiraKey: 'IF-1234', jiraIssueType: 'Defect', lastJiraStatus: 'In Development', lastJiraUpdated: '', wasReleased: true, wasClosed: false, lastQuantity: 8, lastPriority: 12 }],
    ]);
    const result = transformIssues(issues, config, syncState, today);

    const closeCmd = result.commands.find(c => c.Command === 'Close');
    expect(closeCmd).toBeDefined();
    expect(closeCmd!.OrderNumber).toBe('IF-1234');
    expect(result.closedKeys).toContain('IF-1234');
  });

  it('generates transaction entries based on status', () => {
    const issues = [makeIssue({
      status: { name: 'QA Ready', statusCategory: { key: 'indeterminate', name: 'In Progress' } },
      customfield_10037: 1,
    })];
    const syncState = new Map<string, SyncStateRow>([
      ['IF-1234', { jiraKey: 'IF-1234', jiraIssueType: 'Defect', lastJiraStatus: 'In Development', lastJiraUpdated: '', wasReleased: true, wasClosed: false, lastQuantity: 8, lastPriority: 12 }],
    ]);
    const result = transformIssues(issues, config, syncState, today);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].OperationSequenceNumber).toBe(800); // QA Ready
    expect(result.transactions[0].EntryType).toBe('receive_qty');
  });

  it('resolves release date from fix versions', () => {
    const issues = [makeIssue({
      fixVersions: [{ name: 'Intuiflow Release 2024.3.2' }],
      customfield_10037: 1,
    })];
    const syncState = new Map<string, SyncStateRow>();
    const result = transformIssues(issues, config, syncState, today);

    expect(result.workOrders[0].EndRequestDate).toBe('6/7/2024');
  });

  it('handles multiple issues in a batch', () => {
    const issues = [
      makeIssue({ customfield_10037: 1 }, 'IF-100'),
      makeIssue({ issuetype: { name: 'Feature' }, customfield_10037: 2 }, 'IF-200'),
      makeIssue({ issuetype: { name: 'Epic' } }, 'IF-300'), // excluded
    ];
    const syncState = new Map<string, SyncStateRow>();
    const result = transformIssues(issues, config, syncState, today);

    expect(result.workOrders).toHaveLength(2);
    expect(result.stats.fetched).toBe(3);
    expect(result.stats.excluded).toBe(1);
    expect(result.stats.workOrders).toBe(2);
  });
});
