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
   - objective / candidate scoring / topology suggestions / DOE / layout checks

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
