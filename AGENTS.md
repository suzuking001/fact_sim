# fact_sim Agent Notes

## Preferred control path

For `fact_sim` tasks, prefer the integrated MCP server `fact-sim-ai` over manual browser interaction when the task is one of these:

- load or inspect example graphs
- run simulation for a fixed time
- collect KPI, bottleneck, benchmark, or graph overview summaries
- add, update, connect, disconnect, or remove nodes
- build small graphs from blueprints
- export graph, HTML, snapshot, or CSV artifacts

Use browser automation only when the task is explicitly visual/UI-focused and cannot be answered from MCP outputs alone.

## Preferred tool order

1. `prepare_session`
2. `run_report`
3. `graph`
4. `edit_graph`
5. `metrics`
6. `optimize`

## Efficient patterns

- For reproducible checks, use `simulate` with `action="run_for"` instead of `start` / `stop`.
- For single-shot evaluation, prefer `run_report`.
- For graph creation + verification, prefer `build_blueprint_report`.
- For graph mutation, prefer `edit_graph` with `action="batch"` and `ref` + `$name` references.
- Keep responses compact unless the user asks for raw JSON or exported files.

## Example prompts

- `Use fact-sim-ai MCP to load sample_line1, run 3000ms in dt mode, and return KPI + bottleneck summary.`
- `Use fact-sim-ai MCP to add an equipment node after node 12 and connect work ports.`
- `Use fact-sim-ai MCP to build a small blueprint, run 1000ms, and report throughput.`

## Prompt templates

- quick scenario check  
  `Use fact-sim-ai MCP. Prepare session with example=<name>, mode=<dt|event>, reset=true. Then run_report for <wallMs> ms and return KPI, top <N> bottlenecks, and a short conclusion.`

- graph patch + verify  
  `Use fact-sim-ai MCP. Apply edit_graph batch operations with ref names, then run_report for <wallMs> ms and tell me whether throughput improved.`

- blueprint build + verify  
  `Use fact-sim-ai MCP. Build the graph from a blueprint with build_blueprint_report, run for <wallMs> ms, and return node/link counts, KPI, and bottleneck summary.`

- export workflow  
  `Use fact-sim-ai MCP. Save the current graph JSON, snapshot PNG, and embedded HTML, then return only the saved paths.`

- legacy prompt fallback  
  `If an older prompt uses load_example / run_simulation_for / get_kpi_summary, use the legacy alias tools instead of rewriting the workflow manually.`
