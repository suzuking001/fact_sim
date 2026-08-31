# fact_sim AI MCP Guide

## Goal

Use the integrated `fact-sim-ai` MCP with as few tool calls and tokens as possible.

`engine_test` returns only its summary plus failures and warnings by default. Full
per-case results are written to artifacts when `saveArtifacts=true`; request
`includeDetails=true` only when every successful case is genuinely needed.

`edit_graph` also omits full node `properties` from results by default. Use
`includeDetails=true` only when the updated configuration must be returned inline.

## Recommended sequence

1. `prepare_session`
2. `run_report`
3. `edit_graph` only when the graph must change
4. `graph` / `metrics` only for extra detail

## Minimal prompts

### Load + run + report

`Use fact-sim-ai MCP. Prepare session with example=sample_line1, mode=dt, reset=true. Then run_report for 3000 ms and return KPI + top 5 bottlenecks.`

### Edit + verify

`Use fact-sim-ai MCP. Apply an edit_graph batch, then run_report and tell me whether throughput improved.`

### Build from scratch

`Use fact-sim-ai MCP. Build the graph with build_blueprint_report and return throughput + bottlenecks.`

## `run_report` defaults

If omitted:

- `wallMs = 1000`
- `topN = 5`
- `reset = true` when `example` is provided, otherwise `false`
- `includeNodes = false`
- `maxNodes = 12` only when `includeNodes = true`

This keeps the response compact by default.

## `edit_graph` batch references

`edit_graph` supports `action="batch"` and per-operation `ref`.

Later operations can reference earlier node IDs with `$name`.

Example:

```json
{
  "action": "batch",
  "operations": [
    {
      "action": "add",
      "ref": "src",
      "nodeType": "factory/basic",
      "title": "Source",
      "x": 0,
      "y": 0,
      "properties": { "presetId": "source", "sourceMode": "work" }
    },
    {
      "action": "add",
      "ref": "eq1",
      "nodeType": "factory/basic",
      "title": "Equipment",
      "x": 180,
      "y": 0,
      "properties": { "presetId": "machine" }
    },
    {
      "action": "connect",
      "fromNodeId": "$src",
      "toNodeId": "$eq1",
      "portKind": "work"
    }
  ]
}
```

Returned `refs` will include:

```json
{
  "src": 101,
  "eq1": 102
}
```

## Legacy compatibility

Older prompts can still use:

- `load_example`
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

Prefer the newer compact tools for new work.
