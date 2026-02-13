import type {
  JiraIssue,
  PipelineConfig,
  PartTypeConfig,
  SyncStateRow,
  WorkOrderRow,
  CommandRow,
  TransactionRow,
  TransformResult,
  RunStats,
} from '../types';
import { calculateDueDate, formatDate } from '../utils/dates';

/**
 * Calculate work order quantity (hours) from a Jira issue.
 *
 * Priority order:
 *   1. Original estimate (seconds → hours, rounded)
 *   2. Effort custom field → mapped hours
 *   3. Sentinel default (4.567)
 */
export function calculateQuantity(issue: JiraIssue, config: PipelineConfig): number {
  // 1. Original estimate
  const estimateSec = issue.fields.timetracking?.originalEstimateSeconds;
  if (estimateSec && estimateSec > 0) {
    return Math.round(estimateSec / 3600);
  }

  // 2. Effort field mapping
  const effortValue = issue.fields[config.effortFieldId];
  if (effortValue) {
    const mapped = config.effortMappings.get(String(effortValue));
    if (mapped !== undefined) return mapped;
    return config.defaultEffortHours;
  }

  // 3. Sentinel default
  return config.sentinelQuantity;
}

/**
 * Calculate 2-digit scheduling priority.
 *
 * First digit: Business Ranking custom field (1-9, default 9)
 * Second digit: Jira Priority name → numeric value (default 9)
 */
export function calculatePriority(issue: JiraIssue, config: PipelineConfig): number {
  // First digit: business ranking
  const bizRankRaw = issue.fields[config.bizRankFieldId];
  let firstDigit = 9;
  if (bizRankRaw !== null && bizRankRaw !== undefined) {
    const parsed = Math.floor(Number(bizRankRaw));
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 9) {
      firstDigit = parsed;
    }
  }

  // Second digit: Jira priority
  const priName = issue.fields.priority?.name ?? '';
  const secondDigit = config.priorityValues.get(priName) ?? 9;

  return firstDigit * 10 + secondDigit;
}

/**
 * Build a single Intuiflow Work Order row from a Jira issue.
 */
export function buildWorkOrderRow(
  issue: JiraIssue,
  partType: PartTypeConfig,
  quantity: number,
  priority: number,
  dueDate: string,
  releaseDate: string | null,
  config: PipelineConfig
): WorkOrderRow {
  const requestDate = releaseDate ?? dueDate;
  const promiseDate = releaseDate ?? dueDate;

  // Notes: first 50 chars of summary, commas stripped
  const notes = (issue.fields.summary || '')
    .substring(0, 50)
    .replace(/,/g, '');

  // Components as comma-separated string
  const components = (issue.fields.components ?? [])
    .map(c => c.name)
    .join(',');

  // Labels as comma-separated string
  const labels = (issue.fields.labels ?? []).join(',');

  // Fix versions as comma-separated string
  const fixVersions = (issue.fields.fixVersions ?? [])
    .map(v => v.name)
    .join(',');

  // Sprint
  const sprint = issue.fields[config.sprintFieldId] ?? '';
  const sprintName = typeof sprint === 'object' && sprint?.name ? sprint.name : String(sprint || '');

  // Epic link
  const epicLink = issue.fields[config.epicLinkFieldId] ?? '';

  return {
    OrderNumber: issue.key,
    PartNumber: partType.intuiflowPartNumber,
    Revision: '',
    Location: config.location,
    OrderDate: formatDate(issue.fields.created),
    RequestDate: requestDate,
    PromiseDate: promiseDate,
    StartDate: '',
    OrderType: config.orderType,
    Quantity: quantity,
    QuantityTo: quantity,
    Priority: '',
    Expedite: '',
    Status: 'Committed',
    Vendor: '',
    VendorIdentifier: '',
    Comments: issue.fields.assignee?.displayName ?? '',
    Notes: notes,
    UnitOfMeasure: config.unitOfMeasure,
    UnitOfMeasureTo: config.unitOfMeasure,
    RoutingName: config.routingName,
    SchedulingPriority: String(priority),
    SchedulingExpedite: '',
    GroupName: '',
    GroupResource: '',
    SalesOrderNumber: '',
    LineItem: '',
    SalesOrderQuantity: '',
    Customer: '',
    UnitPrice: '',
    UserDefined1: components,
    UserDefined2: issue.fields.assignee?.displayName ?? '',
    UserDefined3: issue.fields.creator?.displayName ?? '',
    UserDefined4: fixVersions,
    UserDefined5: sprintName,
    UserDefined6: labels,
    UserDefined7: String(epicLink || ''),
    UserDefined8: '',
    FinalBufferOverride: '',
    ReplenishmentPriorityLocation: '',
    GroupOrder: '',
    ActualOrderDate: '',
    BOMName: '',
    EpicLink: String(epicLink || ''),
  };
}

/**
 * Transform a batch of Jira issues into Intuiflow work orders,
 * commands, and transactions.
 */
export function transformIssues(
  issues: JiraIssue[],
  config: PipelineConfig,
  syncState: Map<string, SyncStateRow>,
  today: Date = new Date()
): TransformResult {
  const workOrders: WorkOrderRow[] = [];
  const commands: CommandRow[] = [];
  const transactions: TransactionRow[] = [];
  const closedKeys: string[] = [];
  const releasedKeys: string[] = [];
  const stats: RunStats = {
    fetched: issues.length,
    excluded: 0,
    workOrders: 0,
    commands: 0,
    transactions: 0,
    closed: 0,
    errors: 0,
  };

  for (const issue of issues) {
    // A. Find part type mapping
    const partType = config.partTypes.find(
      pt => pt.jiraIssueType === issue.fields.issuetype.name
    );
    if (!partType || !partType.isIncluded) {
      stats.excluded++;
      continue;
    }

    // B. Calculate quantity
    const quantity = calculateQuantity(issue, config);

    // C. Calculate priority
    const priority = calculatePriority(issue, config);
    if (priority >= config.priorityCutoff) {
      stats.excluded++;
      continue;
    }

    // D. Calculate due date
    const dueDate = calculateDueDate(priority, config.priorityRules, today);

    // E. Resolve release date from fix versions
    let releaseDate: string | null = null;
    const fixVersions = issue.fields.fixVersions ?? [];
    for (const fv of fixVersions) {
      const rd = config.releaseDates.get(fv.name);
      if (rd?.releaseDate) {
        releaseDate = rd.releaseDate;
        break;
      }
    }

    // F. Build work order
    const wo = buildWorkOrderRow(issue, partType, quantity, priority, dueDate, releaseDate, config);
    workOrders.push(wo);
    stats.workOrders++;

    // G. Check existing sync state
    const prev = syncState.get(issue.key);
    const isClosed =
      issue.fields.status.name === 'Closed' ||
      issue.fields.status.statusCategory?.key === 'done';

    // H. Close command
    if (isClosed && prev && !prev.wasClosed) {
      commands.push({
        OrderNumber: issue.key,
        PartNumber: partType.intuiflowPartNumber,
        Location: config.location,
        Command: 'Close',
        OperationSequenceNumber: null,
      });
      closedKeys.push(issue.key);
      stats.closed++;
      stats.commands++;
    }

    // I. Release command (for new, not-yet-released issues)
    if (!prev || !prev.wasReleased) {
      commands.push({
        OrderNumber: issue.key,
        PartNumber: partType.intuiflowPartNumber,
        Location: config.location,
        Command: 'Release',
        OperationSequenceNumber: partType.firstOperationSeq,
      });
      releasedKeys.push(issue.key);
      stats.commands++;
    }

    // J. Transaction entries based on current status
    if (prev && !isClosed) {
      const opEntry = config.operationsLookup.get(issue.fields.status.name);
      if (opEntry && prev.lastJiraStatus !== issue.fields.status.name) {
        transactions.push({
          OrderNumber: issue.key,
          PartNumber: partType.intuiflowPartNumber,
          Location: config.location,
          OperationSequenceNumber: opEntry.operationSeq,
          EntryDate: '',
          EntryType: 'receive_qty',
          Quantity: quantity,
          IsLastBatch: 'TRUE',
          BackfillPrevious: 'TRUE',
          Notes: '',
        });
        stats.transactions++;
      }
    }
  }

  return { workOrders, commands, transactions, closedKeys, releasedKeys, stats };
}
