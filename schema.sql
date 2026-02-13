-- Jira Integration - D1 Schema
-- Configurable ETL hub: Jira Cloud → Intuiflow

-- ============================================================
-- DROP old scaffold tables we no longer use
-- ============================================================
DROP TABLE IF EXISTS pipelines;
DROP TABLE IF EXISTS mappings;

-- ============================================================
-- CONNECTORS (retained from scaffold)
-- ============================================================
CREATE TABLE IF NOT EXISTS connectors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('jira','intuiflow')),
  base_url TEXT NOT NULL,
  auth_type TEXT NOT NULL CHECK (auth_type IN ('basic','bearer','apikey','none')),
  secret_ref TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT
);

-- ============================================================
-- RUN TRACKING (retained + extended)
-- ============================================================
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  stats_json TEXT NOT NULL DEFAULT '{}',
  error_text TEXT,
  config_snapshot_json TEXT
);

CREATE TABLE IF NOT EXISTS run_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  jira_key TEXT NOT NULL,
  action TEXT NOT NULL,
  csv_type TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  error_text TEXT,
  FOREIGN KEY (run_id) REFERENCES runs(id)
);

CREATE TABLE IF NOT EXISTS run_csvs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  csv_type TEXT NOT NULL,
  csv_content TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (run_id) REFERENCES runs(id)
);

CREATE TABLE IF NOT EXISTS errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  stage TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  error_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (run_id) REFERENCES runs(id)
);

CREATE TABLE IF NOT EXISTS checkpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ============================================================
-- GLOBAL SETTINGS (key-value config)
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ============================================================
-- PART TYPE MAPPINGS
-- Jira Issue Type → Intuiflow Part Number
-- ============================================================
CREATE TABLE IF NOT EXISTS part_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jira_issue_type TEXT NOT NULL UNIQUE,
  intuiflow_part_number TEXT NOT NULL,
  is_included INTEGER NOT NULL DEFAULT 1,
  first_operation_seq INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ============================================================
-- EFFORT MAPPINGS
-- Jira Effort label → hours
-- ============================================================
CREATE TABLE IF NOT EXISTS effort_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  effort_label TEXT NOT NULL UNIQUE,
  hours REAL NOT NULL
);

-- ============================================================
-- PRIORITY RULES
-- First digit of scheduling priority → due date offset
-- ============================================================
CREATE TABLE IF NOT EXISTS priority_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  priority_prefix INTEGER NOT NULL UNIQUE,
  days_offset INTEGER,
  fixed_date TEXT,
  description TEXT
);

-- ============================================================
-- PRIORITY VALUES
-- Jira Priority name → numeric value (second digit)
-- ============================================================
CREATE TABLE IF NOT EXISTS priority_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jira_priority_name TEXT NOT NULL UNIQUE,
  numeric_value INTEGER NOT NULL
);

-- ============================================================
-- OPERATIONS LOOKUP
-- Jira Status → Operation Sequence Number
-- ============================================================
CREATE TABLE IF NOT EXISTS operations_lookup (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jira_status TEXT NOT NULL UNIQUE,
  operation_seq INTEGER NOT NULL,
  operation_name TEXT NOT NULL
);

-- ============================================================
-- ROUTING DEFINITIONS
-- Part type → ordered operations with resources
-- ============================================================
CREATE TABLE IF NOT EXISTS routing_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_type_id INTEGER NOT NULL,
  operation_seq INTEGER NOT NULL,
  operation_name TEXT NOT NULL,
  resource_name TEXT NOT NULL,
  run_rate REAL NOT NULL DEFAULT 1.0,
  setup_time REAL NOT NULL DEFAULT 0.0,
  fixed_offset REAL NOT NULL DEFAULT 0.0,
  is_primary_constraint INTEGER NOT NULL DEFAULT 0,
  family TEXT NOT NULL DEFAULT 'Single Constraint',
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (part_type_id) REFERENCES part_types(id),
  UNIQUE(part_type_id, operation_seq)
);

-- ============================================================
-- RELEASE DATES
-- Fix Version name → start/release dates
-- ============================================================
CREATE TABLE IF NOT EXISTS release_dates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_name TEXT NOT NULL UNIQUE,
  status TEXT,
  start_date TEXT,
  release_date TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT
);

-- ============================================================
-- RESOURCES
-- Finite capacity resources in Intuiflow
-- ============================================================
CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_name TEXT NOT NULL UNIQUE,
  location TEXT NOT NULL DEFAULT 'DD Tech',
  resource_type TEXT NOT NULL DEFAULT 'Resource',
  capacity_count INTEGER NOT NULL DEFAULT 1,
  crew_size INTEGER NOT NULL DEFAULT 1,
  efficiency REAL NOT NULL DEFAULT 100.0,
  resource_calendar TEXT NOT NULL DEFAULT 'Standard Calendar (M-F)',
  is_active INTEGER NOT NULL DEFAULT 1,
  description TEXT
);

-- ============================================================
-- ORDER SYNC STATE
-- Tracks what has been sent to Intuiflow
-- ============================================================
CREATE TABLE IF NOT EXISTS order_sync_state (
  jira_key TEXT PRIMARY KEY,
  jira_issue_type TEXT,
  last_jira_status TEXT,
  last_jira_updated TEXT,
  was_released INTEGER NOT NULL DEFAULT 0,
  was_closed INTEGER NOT NULL DEFAULT 0,
  last_quantity REAL,
  last_priority INTEGER,
  intuiflow_order_id TEXT,
  last_synced_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_connectors_kind ON connectors(kind);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_run_details_run ON run_details(run_id);
CREATE INDEX IF NOT EXISTS idx_run_csvs_run ON run_csvs(run_id);
CREATE INDEX IF NOT EXISTS idx_errors_run ON errors(run_id);
CREATE INDEX IF NOT EXISTS idx_routing_part ON routing_definitions(part_type_id);
CREATE INDEX IF NOT EXISTS idx_sync_state_status ON order_sync_state(last_jira_status);
