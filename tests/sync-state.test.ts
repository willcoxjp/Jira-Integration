import { describe, it, expect, vi } from 'vitest';
import { updateSyncState } from '../src/pipeline/sync-state';
import type { TransformResult, WorkOrderRow } from '../src/types';

function makeWorkOrder(overrides: Partial<WorkOrderRow> = {}): WorkOrderRow {
  return {
    WorkOrderNumber: 'IF-1234',
    OrderDate: '1/1/2025',
    PartNumber: 'Defect',
    Revision: '',
    Location: 'DD Tech',
    RoutingName: 'Standard',
    WorkOrderQuantity: 8,
    EndRequestDate: '3/1/2025',
    Priority: 12,
    Expedite: 'None',
    SalesOrderNumber: '',
    LineItem: '',
    SalesOrderQuantity: '',
    Customer: '',
    UnitPrice: '',
    Notes: 'Fix the broken widget',
    GroupName: '',
    GroupResource: '',
    UserDefined1: '',
    UserDefined2: '',
    UserDefined3: '',
    UserDefined4: '',
    UserDefined5: '',
    UserDefined6: '',
    UserDefined7: '',
    UserDefined8: '',
    FinalBufferOverride: '',
    ReplenishmentPriorityLocation: '',
    GroupOrder: '',
    ...overrides,
  };
}

function makeTransformResult(overrides: Partial<TransformResult> = {}): TransformResult {
  return {
    workOrders: [],
    commands: [],
    transactions: [],
    closedKeys: [],
    releasedKeys: [],
    issueStatuses: new Map(),
    stats: { fetched: 0, excluded: 0, workOrders: 0, commands: 0, transactions: 0, closed: 0, errors: 0 },
    ...overrides,
  };
}

function makeMockEnv() {
  const batchedStatements: any[] = [];
  const boundValues: any[][] = [];

  const mockPrepare = vi.fn().mockReturnValue({
    bind: (...args: any[]) => {
      boundValues.push(args);
      const stmt = { _args: args };
      batchedStatements.push(stmt);
      return stmt;
    },
  });

  const mockBatch = vi.fn().mockResolvedValue([]);

  return {
    env: {
      DB: {
        prepare: mockPrepare,
        batch: mockBatch,
      },
    } as any,
    mockPrepare,
    mockBatch,
    boundValues,
    batchedStatements,
  };
}

describe('updateSyncState', () => {
  it('calls DB.batch with one statement per work order', async () => {
    const { env, mockBatch } = makeMockEnv();

    const result = makeTransformResult({
      workOrders: [
        makeWorkOrder({ WorkOrderNumber: 'IF-100', PartNumber: 'Defect', WorkOrderQuantity: 8, Priority: 12 }),
        makeWorkOrder({ WorkOrderNumber: 'IF-200', PartNumber: 'Feature', WorkOrderQuantity: 24, Priority: 23 }),
      ],
      releasedKeys: ['IF-100'],
      closedKeys: [],
      issueStatuses: new Map([['IF-100', 'In Development'], ['IF-200', 'QA Ready']]),
    });

    await updateSyncState(env, result);

    expect(mockBatch).toHaveBeenCalledTimes(1);
    const statements = mockBatch.mock.calls[0][0];
    expect(statements).toHaveLength(2);
  });

  it('uses WorkOrderNumber as jira_key (not OrderNumber)', async () => {
    const { env, boundValues } = makeMockEnv();

    const result = makeTransformResult({
      workOrders: [makeWorkOrder({ WorkOrderNumber: 'IF-999' })],
      releasedKeys: [],
      closedKeys: [],
      issueStatuses: new Map([['IF-999', 'Open']]),
    });

    await updateSyncState(env, result);

    // First bound value should be the jira_key = WorkOrderNumber
    expect(boundValues[0][0]).toBe('IF-999');
  });

  it('uses PartNumber from WorkOrderRow', async () => {
    const { env, boundValues } = makeMockEnv();

    const result = makeTransformResult({
      workOrders: [makeWorkOrder({ WorkOrderNumber: 'IF-100', PartNumber: 'Task' })],
      releasedKeys: [],
      closedKeys: [],
      issueStatuses: new Map([['IF-100', 'Open']]),
    });

    await updateSyncState(env, result);

    // Second bound value should be PartNumber
    expect(boundValues[0][1]).toBe('Task');
  });

  it('uses WorkOrderQuantity (not Quantity) for last_quantity', async () => {
    const { env, boundValues } = makeMockEnv();

    const result = makeTransformResult({
      workOrders: [makeWorkOrder({ WorkOrderNumber: 'IF-100', WorkOrderQuantity: 42 })],
      releasedKeys: [],
      closedKeys: [],
      issueStatuses: new Map([['IF-100', 'Open']]),
    });

    await updateSyncState(env, result);

    // 7th bound value (index 6) should be quantity
    expect(boundValues[0][6]).toBe(42);
  });

  it('uses Priority (not SchedulingPriority) for last_priority', async () => {
    const { env, boundValues } = makeMockEnv();

    const result = makeTransformResult({
      workOrders: [makeWorkOrder({ WorkOrderNumber: 'IF-100', Priority: 15 })],
      releasedKeys: [],
      closedKeys: [],
      issueStatuses: new Map([['IF-100', 'Open']]),
    });

    await updateSyncState(env, result);

    // 8th bound value (index 7) should be priority
    expect(boundValues[0][7]).toBe(15);
  });

  it('sets wasReleased=1 for released keys', async () => {
    const { env, boundValues } = makeMockEnv();

    const result = makeTransformResult({
      workOrders: [makeWorkOrder({ WorkOrderNumber: 'IF-100' })],
      releasedKeys: ['IF-100'],
      closedKeys: [],
      issueStatuses: new Map([['IF-100', 'Open']]),
    });

    await updateSyncState(env, result);

    // 5th bound value (index 4) should be wasReleased = 1
    expect(boundValues[0][4]).toBe(1);
  });

  it('sets wasClosed=1 for closed keys', async () => {
    const { env, boundValues } = makeMockEnv();

    const result = makeTransformResult({
      workOrders: [makeWorkOrder({ WorkOrderNumber: 'IF-100' })],
      releasedKeys: [],
      closedKeys: ['IF-100'],
      issueStatuses: new Map([['IF-100', 'Closed']]),
    });

    await updateSyncState(env, result);

    // 6th bound value (index 5) should be wasClosed = 1
    expect(boundValues[0][5]).toBe(1);
  });

  it('gets Jira status from issueStatuses map', async () => {
    const { env, boundValues } = makeMockEnv();

    const result = makeTransformResult({
      workOrders: [makeWorkOrder({ WorkOrderNumber: 'IF-100' })],
      releasedKeys: [],
      closedKeys: [],
      issueStatuses: new Map([['IF-100', 'In Review']]),
    });

    await updateSyncState(env, result);

    // 3rd bound value (index 2) should be the Jira status
    expect(boundValues[0][2]).toBe('In Review');
  });

  it('defaults to empty string when issueStatuses has no entry', async () => {
    const { env, boundValues } = makeMockEnv();

    const result = makeTransformResult({
      workOrders: [makeWorkOrder({ WorkOrderNumber: 'IF-100' })],
      releasedKeys: [],
      closedKeys: [],
      issueStatuses: new Map(), // no entry for IF-100
    });

    await updateSyncState(env, result);

    expect(boundValues[0][2]).toBe('');
  });

  it('does not call DB.batch when there are no work orders', async () => {
    const { env, mockBatch } = makeMockEnv();

    const result = makeTransformResult({ workOrders: [] });

    await updateSyncState(env, result);

    expect(mockBatch).not.toHaveBeenCalled();
  });
});
