-- Jira Integration - Seed Data
-- Default business logic from reverse-engineered Access DB

-- ============================================================
-- SETTINGS
-- ============================================================
INSERT OR REPLACE INTO settings (key, value, description) VALUES
  ('location', 'DD Tech', 'Intuiflow location name'),
  ('order_type', 'WO', 'Intuiflow order type'),
  ('unit_of_measure', 'HR', 'Unit of measure for work orders'),
  ('routing_name', 'Standard', 'Default routing name'),
  ('sentinel_quantity', '4.567', 'Default quantity when no estimate exists'),
  ('sentinel_close_date', '2045-12-31', 'Sentinel date for closed orders'),
  ('priority_cutoff', '30', 'Only upload orders with scheduling priority < this value'),
  ('jql_filter', 'project = "IF" AND statusCategory != Done ORDER BY updated DESC', 'JQL query to fetch Jira issues'),
  ('jira_effort_field', 'customfield_10016', 'Jira custom field ID for Effort'),
  ('jira_business_ranking_field', 'customfield_10037', 'Jira custom field ID for Business Ranking'),
  ('jira_epic_link_field', 'customfield_10014', 'Jira custom field ID for Epic Link'),
  ('jira_sprint_field', 'customfield_10020', 'Jira custom field ID for Sprint'),
  ('default_effort_hours', '160', 'Hours when effort label is unknown'),
  ('import_culture', 'en-US', 'Intuiflow import BaseCultureInfoName'),
  ('import_delimiter', ',', 'CSV file delimiter for Intuiflow import');

-- ============================================================
-- PART TYPES (Jira Issue Type → Intuiflow Part Number)
-- ============================================================
INSERT OR REPLACE INTO part_types (jira_issue_type, intuiflow_part_number, is_included, first_operation_seq) VALUES
  ('Defect',         'Defect',         1, 200),
  ('Feature',        'Feature',        1, 100),
  ('Task',           'Task',           1, 400),
  ('Technical Debt', 'Technical Debt', 1, 200),
  ('Epic',           'Epic',           0, 0),
  ('Documentation',  'Documentation',  0, 0),
  ('Release',        'Release',        0, 0),
  ('Research',       'Research',       0, 0),
  ('Test+',          'Test+',          0, 0);

-- ============================================================
-- EFFORT MAPPINGS
-- ============================================================
INSERT OR REPLACE INTO effort_mappings (effort_label, hours) VALUES
  ('Tiny < 8 hrs',    8),
  ('Small <  24 hrs', 24),
  ('Medium < 40 hrs', 40),
  ('Large < 80 hrs',  80),
  ('X-Large',         160);

-- ============================================================
-- PRIORITY RULES (first digit → due date offset)
-- ============================================================
INSERT OR REPLACE INTO priority_rules (priority_prefix, days_offset, fixed_date, description) VALUES
  (1, 45,   NULL,    'High priority: today + 45 days'),
  (2, 90,   NULL,    'Medium priority: today + 90 days'),
  (3, 180,  NULL,    'Low priority: today + 180 days'),
  (9, NULL,  '12-25', 'Backlog: Dec 25 next year');

-- ============================================================
-- PRIORITY VALUES (Jira Priority name → second digit)
-- ============================================================
INSERT OR REPLACE INTO priority_values (jira_priority_name, numeric_value) VALUES
  ('P0 - Critical', 0),
  ('P1 - Urgent',   1),
  ('P2 - High',     2),
  ('P3 - Medium',   3),
  ('P4 - Low',      4),
  ('Highest',        1),
  ('High',           2),
  ('Medium',         3),
  ('Low',            4),
  ('Lowest',         5),
  ('Select Priority', 9);

-- ============================================================
-- OPERATIONS LOOKUP (Jira Status → Operation Seq)
-- ============================================================
INSERT OR REPLACE INTO operations_lookup (jira_status, operation_seq, operation_name) VALUES
  ('Business Requirements',    100, 'Business Requirements'),
  ('Defect Review',            200, 'Defect Review'),
  ('Tech Debt Review',         200, 'Tech Debt Review'),
  ('Technical Review',         200, 'Technical Review'),
  ('Add Estimate',             400, 'Add Estimate'),
  ('Triage',                   400, 'Triage'),
  ('Code Review',              600, 'Code Review'),
  ('In Development',           600, 'In Development'),
  ('Ready for Development',    600, 'Ready for Development'),
  ('QA Ready',                 800, 'QA Ready'),
  ('Test',                     800, 'Test'),
  ('Document',                1100, 'Document'),
  ('On Hold',                 1200, 'On Hold'),
  ('More Info Req',           1300, 'More Info Req');

-- ============================================================
-- ROUTING DEFINITIONS
-- Uses part_types.id, so we reference by subquery
-- ============================================================

-- Defect routing
INSERT OR REPLACE INTO routing_definitions (part_type_id, operation_seq, operation_name, resource_name, run_rate, family, sort_order) VALUES
  ((SELECT id FROM part_types WHERE jira_issue_type='Defect'),  200, 'Defect Review',    'QA',          2,  'Single Constraint', 1),
  ((SELECT id FROM part_types WHERE jira_issue_type='Defect'),  400, 'Add Estimate',     'Confirm',     10, 'Single Constraint', 2),
  ((SELECT id FROM part_types WHERE jira_issue_type='Defect'),  600, 'In Development',   'Engineering', 1,  'Single Constraint', 3),
  ((SELECT id FROM part_types WHERE jira_issue_type='Defect'),  800, 'QA Ready',         'QA',          2,  'Single Constraint', 4),
  ((SELECT id FROM part_types WHERE jira_issue_type='Defect'), 1100, 'Document',         'Document',    0,  'Single Constraint', 5),
  ((SELECT id FROM part_types WHERE jira_issue_type='Defect'), 1200, 'On Hold',          'Product',     4,  'Single Constraint', 6),
  ((SELECT id FROM part_types WHERE jira_issue_type='Defect'), 1300, 'More Info Req',    'Product',     4,  'Single Constraint', 7);

-- Feature routing
INSERT OR REPLACE INTO routing_definitions (part_type_id, operation_seq, operation_name, resource_name, run_rate, family, sort_order) VALUES
  ((SELECT id FROM part_types WHERE jira_issue_type='Feature'),  100, 'Business Requirements', 'Product',     4, 'Single Constraint', 1),
  ((SELECT id FROM part_types WHERE jira_issue_type='Feature'),  200, 'Technical Review',      'Engineering', 4, 'Single Constraint', 2),
  ((SELECT id FROM part_types WHERE jira_issue_type='Feature'),  400, 'Add Estimate',          'Confirm',     10, 'Single Constraint', 3),
  ((SELECT id FROM part_types WHERE jira_issue_type='Feature'),  600, 'In Development',        'Engineering', 1,  'Single Constraint', 4),
  ((SELECT id FROM part_types WHERE jira_issue_type='Feature'),  800, 'QA Ready',              'QA',          2,  'Single Constraint', 5),
  ((SELECT id FROM part_types WHERE jira_issue_type='Feature'), 1200, 'On Hold',               'Product',     4,  'Single Constraint', 6),
  ((SELECT id FROM part_types WHERE jira_issue_type='Feature'), 1300, 'More Info Req',         'Product',     4,  'Single Constraint', 7);

-- Task routing
INSERT OR REPLACE INTO routing_definitions (part_type_id, operation_seq, operation_name, resource_name, run_rate, family, sort_order) VALUES
  ((SELECT id FROM part_types WHERE jira_issue_type='Task'),  400, 'Add Estimate',     'Confirm',     10, 'Single Constraint', 1),
  ((SELECT id FROM part_types WHERE jira_issue_type='Task'),  600, 'In Development',   'Engineering', 1,  'Single Constraint', 2),
  ((SELECT id FROM part_types WHERE jira_issue_type='Task'),  800, 'QA Ready',         'QA',          2,  'Single Constraint', 3),
  ((SELECT id FROM part_types WHERE jira_issue_type='Task'), 1100, 'Document',         'Document',    0,  'Single Constraint', 4),
  ((SELECT id FROM part_types WHERE jira_issue_type='Task'), 1200, 'On Hold',          'Confirm',     4,  'Single Constraint', 5),
  ((SELECT id FROM part_types WHERE jira_issue_type='Task'), 1300, 'More Info Req',    'Confirm',     4,  'Single Constraint', 6);

-- Technical Debt routing
INSERT OR REPLACE INTO routing_definitions (part_type_id, operation_seq, operation_name, resource_name, run_rate, family, sort_order) VALUES
  ((SELECT id FROM part_types WHERE jira_issue_type='Technical Debt'),  200, 'Tech Debt Review',  'Engineering', 4, 'Single Constraint', 1),
  ((SELECT id FROM part_types WHERE jira_issue_type='Technical Debt'),  400, 'Add Estimate',      'Confirm',     4, 'Single Constraint', 2),
  ((SELECT id FROM part_types WHERE jira_issue_type='Technical Debt'),  600, 'In Development',    'Engineering', 1, 'Single Constraint', 3),
  ((SELECT id FROM part_types WHERE jira_issue_type='Technical Debt'),  800, 'QA Ready',          'QA',          2, 'Single Constraint', 4),
  ((SELECT id FROM part_types WHERE jira_issue_type='Technical Debt'), 1100, 'Document',          'Document',    0, 'Single Constraint', 5),
  ((SELECT id FROM part_types WHERE jira_issue_type='Technical Debt'), 1200, 'On Hold',           'Confirm',     4, 'Single Constraint', 6),
  ((SELECT id FROM part_types WHERE jira_issue_type='Technical Debt'), 1300, 'More Info Req',     'Confirm',     4, 'Single Constraint', 7);

-- ============================================================
-- RELEASE DATES (from Access DB tblReleaseDates)
-- ============================================================
INSERT OR REPLACE INTO release_dates (version_name, status, start_date, release_date, description) VALUES
  ('Intuiflow Release 2024.1.5', 'UNRELEASED', '2024-05-06', '2024-05-24', 'Updated .NET Framework LTS release.'),
  ('Intuiflow Release 2024.3.1', 'UNRELEASED', '2024-04-15', '2024-05-22', '.NET Core, LTS Release'),
  ('Intuiflow Release 2024.3.2', 'UNRELEASED', '2024-02-01', '2024-06-07', '.NET Core LTS Release, Cloud and Datacenter Edition');

-- ============================================================
-- RESOURCES (from Access DB tblResource)
-- ============================================================
INSERT OR REPLACE INTO resources (resource_name, location, resource_type, capacity_count, crew_size, efficiency, resource_calendar, is_active, description) VALUES
  ('QA',           'DD Tech', 'Resource', 2, 1, 90,  'Standard Calendar (M-F)', 1, 'QA Testing'),
  ('Engineering',  'DD Tech', 'Resource', 5, 1, 90,  'Standard Calendar (M-F)', 1, 'Development'),
  ('Product',      'DD Tech', 'Resource', 1, 1, 75,  'Standard Calendar (M-F)', 1, 'Product Management'),
  ('Confirm',      'DD Tech', 'Resource', 2, 1, 90,  'Standard Calendar (M-F)', 1, 'Confirmation/Estimation'),
  ('Document',     'DD Tech', 'Resource', 1, 1, 90,  'Standard Calendar (M-F)', 1, 'Documentation');

-- ============================================================
-- CONNECTORS (templates - user fills in URLs/creds)
-- ============================================================
INSERT OR REPLACE INTO connectors (name, kind, base_url, auth_type, secret_ref, config_json) VALUES
  ('Jira Cloud',  'jira',      'https://demanddriven.atlassian.net', 'basic',  'JIRA_BASIC_AUTH', '{}'),
  ('Intuiflow',   'intuiflow', 'https://product.demanddriventech.com', 'api_key', 'INTUIFLOW_API_KEY', '{}');
