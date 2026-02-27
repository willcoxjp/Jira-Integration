# Jira Integration

Cloudflare Worker that syncs work orders from Jira to Intuiflow. Reverse-engineered from Dan's original Access DB VBA macros.

## Stack

- **Runtime**: Cloudflare Workers
- **Database**: D1 (SQLite)
- **Sources**: Jira REST API
- **Targets**: Intuiflow Import API

## How It Works

1. **Fetch** — Pulls work order data from Jira using configurable JQL queries
2. **Transform** — Maps Jira fields to Intuiflow's expected format
3. **Generate CSV** — Builds CSV files matching Intuiflow's import schema
4. **Upload** — Creates import sessions and pushes data to Intuiflow

## Project Structure

```
src/
├── worker.ts              # Entry point
├── types.ts               # Shared types
├── api/                   # REST API routes
│   ├── router.ts          # Route handler
│   ├── connectors.ts      # Connector management
│   ├── runs.ts            # Pipeline run history
│   ├── releases.ts        # Release tracking
│   └── ...                # Other entity endpoints
├── pipeline/              # ETL pipeline
│   ├── runner.ts          # Orchestrates fetch→transform→upload
│   ├── fetch-jira.ts      # Jira API client
│   ├── transform.ts       # Field mapping logic
│   ├── csv-generator.ts   # CSV output formatting
│   ├── upload-intuiflow.ts # Intuiflow import API client
│   ├── config-loader.ts   # Pipeline configuration
│   └── sync-state.ts      # Incremental sync tracking
├── ui/                    # Admin UI
└── utils/                 # Shared utilities
```

## Setup

1. Create D1 database and update `wrangler.toml`
2. Apply schema: `wrangler d1 execute jira-integration --file schema.sql`
3. Seed config: `wrangler d1 execute jira-integration --file seed.sql`
4. Set secrets:
   - `wrangler secret put JIRA_BASIC_AUTH` (Base64 user:token)
   - `wrangler secret put INTUIFLOW_API_KEY`
5. Deploy: `npx wrangler deploy`

## Development

```bash
npm install
npm run dev    # Local dev server
npm test       # Run tests
```
