import { describe, it, expect } from 'vitest';
import { generateWorkOrdersCsv, generateCommandsCsv, generateTransactionsCsv, WORK_ORDER_COLUMNS, COMMAND_COLUMNS, TRANSACTION_COLUMNS } from '../src/pipeline/csv-generator';
import type { WorkOrderRow, CommandRow, TransactionRow } from '../src/types';

function makeWorkOrder(overrides: Partial<WorkOrderRow> = {}): WorkOrderRow {
  return {
    OrderNumber: 'IF-1234',
    PartNumber: 'Defect',
    Revision: '',
    Location: 'DD Tech',
    OrderDate: '2025-01-01',
    RequestDate: '2025-03-01',
    PromiseDate: '2025-03-01',
    StartDate: '',
    OrderType: 'WO',
    Quantity: 8,
    QuantityTo: 8,
    Priority: '',
    Expedite: '',
    Status: 'Committed',
    Vendor: '',
    VendorIdentifier: '',
    Comments: 'Patrick',
    Notes: 'Fix the broken widget',
    UnitOfMeasure: 'HR',
    UnitOfMeasureTo: 'HR',
    RoutingName: 'Standard',
    SchedulingPriority: '12',
    SchedulingExpedite: '',
    GroupName: '',
    GroupResource: '',
    SalesOrderNumber: '',
    LineItem: '',
    SalesOrderQuantity: '',
    Customer: '',
    UnitPrice: '',
    UserDefined1: 'Scheduler',
    UserDefined2: 'Patrick',
    UserDefined3: 'Tim',
    UserDefined4: '',
    UserDefined5: '',
    UserDefined6: 'CMG-2024.6',
    UserDefined7: '',
    UserDefined8: '',
    FinalBufferOverride: '',
    ReplenishmentPriorityLocation: '',
    GroupOrder: '',
    ActualOrderDate: '',
    BOMName: '',
    EpicLink: '',
    ...overrides,
  };
}

describe('generateWorkOrdersCsv', () => {
  it('has correct header columns', () => {
    const csv = generateWorkOrdersCsv([]);
    const header = csv.split('\n')[0];
    expect(header).toContain('OrderNumber');
    expect(header).toContain('PartNumber');
    expect(header).toContain('SchedulingPriority');
    expect(header).toContain('UserDefined1');
  });

  it('generates one data row per work order', () => {
    const csv = generateWorkOrdersCsv([makeWorkOrder(), makeWorkOrder({ OrderNumber: 'IF-5678' })]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3); // header + 2 rows
  });

  it('includes all field values in correct positions', () => {
    const csv = generateWorkOrdersCsv([makeWorkOrder()]);
    const lines = csv.split('\n');
    const values = lines[1].split(',');
    const headerCols = lines[0].split(',');
    const orderIdx = headerCols.indexOf('OrderNumber');
    expect(values[orderIdx]).toBe('IF-1234');
  });
});

describe('generateCommandsCsv', () => {
  it('generates correct columns', () => {
    const csv = generateCommandsCsv([]);
    expect(csv).toContain('OrderNumber');
    expect(csv).toContain('Command');
    expect(csv).toContain('OperationSequenceNumber');
  });

  it('generates rows for commands', () => {
    const cmds: CommandRow[] = [
      { OrderNumber: 'IF-100', PartNumber: 'Defect', Location: 'DD Tech', Command: 'Release', OperationSequenceNumber: 200 },
      { OrderNumber: 'IF-200', PartNumber: 'Feature', Location: 'DD Tech', Command: 'Close', OperationSequenceNumber: null },
    ];
    const csv = generateCommandsCsv(cmds);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('IF-100');
    expect(lines[1]).toContain('Release');
  });
});

describe('generateTransactionsCsv', () => {
  it('generates correct columns', () => {
    const csv = generateTransactionsCsv([]);
    expect(csv).toContain('OrderNumber');
    expect(csv).toContain('EntryType');
    expect(csv).toContain('IsLastBatch');
  });

  it('generates rows for transactions', () => {
    const txns: TransactionRow[] = [
      { OrderNumber: 'IF-100', PartNumber: 'Defect', Location: 'DD Tech', OperationSequenceNumber: 800, EntryDate: '', EntryType: 'receive_qty', Quantity: 8, IsLastBatch: 'TRUE', BackfillPrevious: 'TRUE', Notes: '' },
    ];
    const csv = generateTransactionsCsv(txns);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('receive_qty');
  });
});
