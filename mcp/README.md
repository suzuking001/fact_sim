# fact_sim AI MCP

Integrated MCP server for `fact_sim`.

This server is tuned for AI-agent use:

- same repository, no sibling repo assumption
- small tool surface
- compact JSON responses
- Playwright-backed control of the real app

## Tools

High-frequency tools for AI agents:

1. `prepare_session`
2. `run_report`
3. `build_blueprint_report`
4. `edit_graph` with `action="batch"`

Defaults tuned for short prompts:

- `run_report.wallMs`: `1000`
- `run_report.topN`: `5`
- `build_blueprint_report.wallMs`: `1000`
- `includeNodes`: `false`

Core tools:

1. `examples`
   - `list`
   - `load`
2. `simulate`
   - `status`
   - `start`
   - `stop`
   - `run_for`
   - `set_mode`
   - `set_speed`
   - `reset`
   - `set_time`
   - `set_seed`
   - `get_seed`
3. `graph`
   - overview / import / export / save / share / snapshot / html export / repair
   - node types / node ports
4. `edit_graph`
   - add / update / remove / connect / disconnect / build
5. `metrics`
   - KPI / bottlenecks / benchmark / save timeline CSV
6. `optimize`

## Recommended workflow for AI agents

- setup: `prepare_session`
- run + inspect: `run_report`
- graph editing: `edit_graph`
- graph export / import / ports: `graph`
- KPI / benchmark / bottlenecks: `metrics`
- candidate scoring / DOE / layout rules: `optimize`

## Compatibility aliases

High-frequency aliases from the older `fact_sim_mcp` naming are available:

- `load_example`
- `start_simulation`
- `stop_simulation`
- `run_simulation_for`
- `get_simulation_status`
- `get_kpi_summary`
- `run_benchmark`
- `get_graph_overview`
- `add_node`
- `update_node`
- `connect_nodes`
- `connect_nodes_by_port_kind`
- `remove_node`
- `build_graph_from_blueprint`

## Batch references

`edit_graph` batch supports:

- per-operation `ref`
- `$name` references in later `nodeId` / `fromNodeId` / `toNodeId`

This lets AI build and connect graphs in one tool call.

## Setup

```bash
cd mcp
npm install
npm run build
```

For Chromium:

```bash
npx playwright install chromium
```

## VS Code / Codex

This repository already includes `.vscode/mcp.json`:

```json
{
  "servers": {
    "fact-sim-ai": {
      "command": "node",
      "args": ["mcp/dist/index.js"]
    }
  }
}
```

## Smoke test

```bash
cd mcp
npm run build
npm run smoke
```
