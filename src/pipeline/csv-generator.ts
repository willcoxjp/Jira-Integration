import { generateCsv } from '../utils/csv';
import type { WorkOrderRow, CommandRow, TransactionRow, CsvFiles } from '../types';

/**
 * Column order for Intuiflow Supply Order (Work Order) CSV import.
 * Matches the field order expected by Intuiflow's /api/v2/import.
 */
export const WORK_ORDER_COLUMNS = [
  'OrderNumber',
  'PartNumber',
  'Revision',
  'Location',
  'OrderDate',
  'RequestDate',
  'PromiseDate',
  'StartDate',
  'OrderType',
  'Quantity',
  'QuantityTo',
  'Priority',
  'Expedite',
  'Status',
  'Vendor',
  'VendorIdentifier',
  'Comments',
  'Notes',
  'UnitOfMeasure',
  'UnitOfMeasureTo',
  'RoutingName',
  'SchedulingPriority',
  'SchedulingExpedite',
  'GroupName',
  'GroupResource',
  'SalesOrderNumber',
  'LineItem',
  'SalesOrderQuantity',
  'Customer',
  'UnitPrice',
  'UserDefined1',
  'UserDefined2',
  'UserDefined3',
  'UserDefined4',
  'UserDefined5',
  'UserDefined6',
  'UserDefined7',
  'UserDefined8',
  'FinalBufferOverride',
  'ReplenishmentPriorityLocation',
  'GroupOrder',
  'ActualOrderDate',
  'BOMName',
];

/**
 * Column order for Intuiflow Command Release CSV.
 */
export const COMMAND_COLUMNS = [
  'OrderNumber',
  'PartNumber',
  'Location',
  'Command',
  'OperationSequenceNumber',
];

/**
 * Column order for Intuiflow Transaction File CSV.
 */
export const TRANSACTION_COLUMNS = [
  'OrderNumber',
  'PartNumber',
  'Location',
  'OperationSequenceNumber',
  'EntryDate',
  'EntryType',
  'Quantity',
  'IsLastBatch',
  'BackfillPrevious',
  'Notes',
];

export function generateWorkOrdersCsv(workOrders: WorkOrderRow[]): string {
  return generateCsv(WORK_ORDER_COLUMNS, workOrders as unknown as Record<string, unknown>[]);
}

export function generateCommandsCsv(commands: CommandRow[]): string {
  return generateCsv(COMMAND_COLUMNS, commands as unknown as Record<string, unknown>[]);
}

export function generateTransactionsCsv(transactions: TransactionRow[]): string {
  return generateCsv(TRANSACTION_COLUMNS, transactions as unknown as Record<string, unknown>[]);
}

export function generateAllCsvFiles(
  workOrders: WorkOrderRow[],
  commands: CommandRow[],
  transactions: TransactionRow[]
): CsvFiles {
  return {
    workOrdersCsv: generateWorkOrdersCsv(workOrders),
    commandsCsv: generateCommandsCsv(commands),
    transactionsCsv: generateTransactionsCsv(transactions),
  };
}
