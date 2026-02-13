import type {
  Env,
  PipelineConfig,
  PartTypeConfig,
  PriorityRule,
  OperationEntry,
  RoutingEntry,
  ReleaseDate,
} from '../types';

/**
 * Load the full pipeline configuration from D1 tables.
 * Called once at the start of each pipeline run.
 */
export async function loadPipelineConfig(env: Env): Promise<PipelineConfig> {
  // Load settings as key-value map
  const settingsResult = await env.DB.prepare('SELECT key, value FROM settings').all();
  const s = new Map<string, string>();
  for (const row of settingsResult.results as Array<{ key: string; value: string }>) {
    s.set(row.key, row.value);
  }

  // Load part types
  const partTypesResult = await env.DB.prepare('SELECT * FROM part_types').all();
  const partTypes: PartTypeConfig[] = (partTypesResult.results as any[]).map(r => ({
    id: r.id,
    jiraIssueType: r.jira_issue_type,
    intuiflowPartNumber: r.intuiflow_part_number,
    isIncluded: !!r.is_included,
    firstOperationSeq: r.first_operation_seq,
  }));

  // Load effort mappings
  const effortResult = await env.DB.prepare('SELECT effort_label, hours FROM effort_mappings').all();
  const effortMappings = new Map<string, number>();
  for (const row of effortResult.results as Array<{ effort_label: string; hours: number }>) {
    effortMappings.set(row.effort_label, row.hours);
  }

  // Load priority rules
  const priRulesResult = await env.DB.prepare('SELECT * FROM priority_rules').all();
  const priorityRules = new Map<number, PriorityRule>();
  for (const row of priRulesResult.results as any[]) {
    priorityRules.set(row.priority_prefix, {
      priorityPrefix: row.priority_prefix,
      daysOffset: row.days_offset,
      fixedDate: row.fixed_date,
      description: row.description || '',
    });
  }

  // Load priority values
  const priValsResult = await env.DB.prepare('SELECT jira_priority_name, numeric_value FROM priority_values').all();
  const priorityValues = new Map<string, number>();
  for (const row of priValsResult.results as Array<{ jira_priority_name: string; numeric_value: number }>) {
    priorityValues.set(row.jira_priority_name, row.numeric_value);
  }

  // Load operations lookup
  const opsResult = await env.DB.prepare('SELECT * FROM operations_lookup').all();
  const operationsLookup = new Map<string, OperationEntry>();
  for (const row of opsResult.results as any[]) {
    operationsLookup.set(row.jira_status, {
      jiraStatus: row.jira_status,
      operationSeq: row.operation_seq,
      operationName: row.operation_name,
    });
  }

  // Load routing definitions grouped by part type
  const routingsResult = await env.DB
    .prepare('SELECT * FROM routing_definitions ORDER BY part_type_id, sort_order')
    .all();
  const routings = new Map<number, RoutingEntry[]>();
  for (const row of routingsResult.results as any[]) {
    const entry: RoutingEntry = {
      id: row.id,
      partTypeId: row.part_type_id,
      operationSeq: row.operation_seq,
      operationName: row.operation_name,
      resourceName: row.resource_name,
      runRate: row.run_rate,
      setupTime: row.setup_time,
      fixedOffset: row.fixed_offset,
      isPrimaryConstraint: !!row.is_primary_constraint,
      family: row.family,
      sortOrder: row.sort_order,
    };
    if (!routings.has(row.part_type_id)) {
      routings.set(row.part_type_id, []);
    }
    routings.get(row.part_type_id)!.push(entry);
  }

  // Load release dates
  const relResult = await env.DB.prepare('SELECT * FROM release_dates').all();
  const releaseDates = new Map<string, ReleaseDate>();
  for (const row of relResult.results as any[]) {
    releaseDates.set(row.version_name, {
      versionName: row.version_name,
      status: row.status,
      startDate: row.start_date,
      releaseDate: row.release_date,
      description: row.description,
    });
  }

  return {
    location: s.get('location') || 'DD Tech',
    orderType: s.get('order_type') || 'WO',
    unitOfMeasure: s.get('unit_of_measure') || 'HR',
    routingName: s.get('routing_name') || 'Standard',
    sentinelQuantity: parseFloat(s.get('sentinel_quantity') || '4.567'),
    sentinelCloseDate: s.get('sentinel_close_date') || '2045-12-31',
    priorityCutoff: parseInt(s.get('priority_cutoff') || '30', 10),
    jqlFilter: s.get('jql_filter') || 'project = IF ORDER BY updated DESC',
    effortFieldId: s.get('jira_effort_field') || 'customfield_10016',
    bizRankFieldId: s.get('jira_business_ranking_field') || 'customfield_10037',
    epicLinkFieldId: s.get('jira_epic_link_field') || 'customfield_10014',
    sprintFieldId: s.get('jira_sprint_field') || 'customfield_10020',
    defaultEffortHours: parseFloat(s.get('default_effort_hours') || '160'),
    importCulture: s.get('import_culture') || 'en-US',
    importDelimiter: s.get('import_delimiter') || ',',
    partTypes,
    effortMappings,
    priorityRules,
    priorityValues,
    operationsLookup,
    routings,
    releaseDates,
  };
}
