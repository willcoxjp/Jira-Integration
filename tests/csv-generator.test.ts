import { describe, it, expect } from 'vitest';
import { generateWorkOrdersCsv, generateCommandsCsv, generateTransactionsCsv, WORK_ORDER_COLUMNS, COMMAND_COLUMNS, TRANSACTION_COLUMNS } from '../src/pipeline/csv-generator';
import type { WorkOrderRow, CommandRow, TransactionRow } from '../src/types';

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
    ...overrides,
  };
}

describe('generateWorkOrdersCsv', () => {
  it('has correct header columns', () => {
    const csv = generateWorkOrdersCsv([]);
    const header = csv.split('\n')[0];
    expect(header).toContain('WorkOrderNumber');
    expect(header).toContain('PartNumber');
    expect(header).toContain('Priority');
    expect(header).toContain('UserDefined1');
    expect(header).toContain('EndRequestDate');
    expect(header).toContain('WorkOrderQuantity');
    expect(header).not.toContain('Status');
    expect(header).not.toContain('OrderType');
  });

  it('generates one data row per work order', () => {
    const csv = generateWorkOrdersCsv([makeWorkOrder(), makeWorkOrder({ WorkOrderNumber: 'IF-5678' })]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3); // header + 2 rows
  });

  it('includes all field values in correct positions', () => {
    const csv = generateWorkOrdersCsv([makeWorkOrder()]);
    const lines = csv.split('\n');
    const values = lines[1].split(',');
    const headerCols = lines[0].split(',');
    const orderIdx = headerCols.indexOf('WorkOrderNumber');
    expect(values[orderIdx]).toBe('IF-1234');
  });

  it('matches old Access DB column order', () => {
    const csv = generateWorkOrdersCsv([]);
    const header = csv.split('\n')[0];
    const cols = header.split(',');
    expect(cols[0]).toBe('WorkOrderNumber');
    expect(cols[1]).toBe('OrderDate');
    expect(cols[2]).toBe('PartNumber');
    expect(cols[3]).toBe('Revision');
    expect(cols[4]).toBe('Location');
    expect(cols[5]).toBe('RoutingName');
    expect(cols[6]).toBe('WorkOrderQuantity');
    expect(cols[7]).toBe('EndRequestDate');
    expect(cols[8]).toBe('Priority');
    expect(cols[9]).toBe('Expedite');
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
