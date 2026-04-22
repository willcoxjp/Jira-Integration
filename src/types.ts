// ============================================================
// Environment
// ============================================================
export interface Env {
  DB: D1Database;
  PIPELINE_QUEUE: Queue<PipelineQueueMessage>;
  JIRA_BASIC_AUTH?: string;
  INTUIFLOW_API_KEY?: string;
}

export interface PipelineQueueMessage {
  phase: string;
  sourceRunId: number;
}

// ============================================================
// Jira API types
// ============================================================
export interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    assignee?: { displayName: string; accountId: string };
    status: { name: string; statusCategory?: { key: string; name: string } };
    issuetype: { name: string };
    priority?: { name: string };
    duedate?: string;
    updated: string;
    created: string;
    project: { key: string };
    fixVersions?: Array<{ name: string }>;
    components?: Array<{ name: string }>;
    creator?: { displayName: string };
    reporter?: { displayName: string };
    labels?: string[];
    timetracking?: { originalEstimateSeconds?: number };
    [customField: string]: any;
  };
}

// ============================================================
// Pipeline configuration (loaded from D1 at runtime)
// ============================================================
export interface PipelineConfig {
  // Settings
  location: string;
  orderType: string;
  unitOfMeasure: string;
  routingName: string;
  sentinelQuantity: number;
  sentinelCloseDate: string;
  priorityCutoff: number;
  jqlFilter: string;
  effortFieldId: string;
  bizRankFieldId: string;
  epicLinkFieldId: string;
  sprintFieldId: string;
  defaultEffortHours: number;
  importCulture: string;
  importDelimiter: string;

  // Lookup tables
  partTypes: PartTypeConfig[];
  effortMappings: Map<string, number>;
  priorityRules: Map<number, PriorityRule>;
  priorityValues: Map<string, number>;
  operationsLookup: Map<string, OperationEntry>;
  routings: Map<number, RoutingEntry[]>;
  releaseDates: Map<string, ReleaseDate>;
}

export interface PartTypeConfig {
  id: number;
  jiraIssueType: string;
  intuiflowPartNumber: string;
  isIncluded: boolean;
  firstOperationSeq: number;
}

export interface PriorityRule {
  priorityPrefix: number;
  daysOffset: number | null;
  fixedDate: string | null;
  description: string;
}

export interface OperationEntry {
  jiraStatus: string;
  operationSeq: number;
  operationName: string;
}

export interface RoutingEntry {
  id: number;
  partTypeId: number;
  operationSeq: number;
  operationName: string;
  resourceName: string;
  runRate: number;
  setupTime: number;
  fixedOffset: number;
  isPrimaryConstraint: boolean;
  family: string;
  sortOrder: number;
}

export interface ReleaseDate {
  versionName: string;
  status: string | null;
  startDate: string | null;
  releaseDate: string | null;
  description: string | null;
}

// ============================================================
// Sync state
// ============================================================
export interface SyncStateRow {
  jiraKey: string;
  jiraIssueType: string | null;
  lastJiraStatus: string | null;
  lastJiraUpdated: string | null;
  wasReleased: boolean;
  wasClosed: boolean;
  lastQuantity: number | null;
  lastPriority: number | null;
}

// ============================================================
// Transform output
// ============================================================
export interface WorkOrderRow {
  WorkOrderNumber: string;
  OrderDate: string;
  PartNumber: string;
  Revision: string;
  Location: string;
  RoutingName: string;
  WorkOrderQuantity: number;
  EndRequestDate: string;
  Priority: number;
  Expedite: string;
  SalesOrderNumber: string;
  LineItem: string;
  SalesOrderQuantity: string;
  Customer: string;
  UnitPrice: string;
  Notes: string;
  GroupName: string;
  GroupResource: string;
  UserDefined1: string;
  UserDefined2: string;
  UserDefined3: string;
  UserDefined4: string;
  UserDefined5: string;
  UserDefined6: string;
  UserDefined7: string;
  UserDefined8: string;
  FinalBufferOverride: string;
  ReplenishmentPriorityLocation: string;
  GroupOrder: string;
}

export interface CommandRow {
  OrderNumber: string;
  PartNumber: string;
  Location: string;
  Command: string;
  OperationSequenceNumber: number | null;
}

export interface TransactionRow {
  OrderNumber: string;
  PartNumber: string;
  Location: string;
  OperationSequenceNumber: number;
  EntryDate: string;
  EntryType: string;
  Quantity: number;
  IsLastBatch: string;
  BackfillPrevious: string;
  Notes: string;
}

export interface CsvFiles {
  workOrdersCsv: string;
  commandsCsv: string;
  transactionsCsv: string;
}

// ============================================================
// Run tracking
// ============================================================
export interface RunStats {
  fetched: number;
  excluded: number;
  workOrders: number;
  commands: number;
  transactions: number;
  closed: number;
  errors: number;
}

export interface TransformResult {
  workOrders: WorkOrderRow[];
  commands: CommandRow[];
  transactions: TransactionRow[];
  closedKeys: string[];
  releasedKeys: string[];
  /** Jira key → current Jira status name (for sync state tracking) */
  issueStatuses: Map<string, string>;
  stats: RunStats;
}
