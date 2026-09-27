# FactSim AI Assistant

FactSim AI Assistant is an optional browser-side layer. Closing the panel or leaving every provider disconnected does not change the existing editor or simulation workflow.

## Architecture

```text
AI Chat Panel -> FactSimAgent -> AIProvider
                         |
                         +-> ToolRegistry -> validated FactSim tools -> App.graph / simulation engine
```

The chat UI does not edit `App.graph` and does not invoke simulation internals directly. Only tools explicitly registered in `ToolRegistry` can read or change the active model.

## Providers

- Browser AI (WebLLM): checks WebGPU, loads a selected registry model on demand, reports load progress, supports streaming, interruption, and unload.
- Ollama: configurable endpoint and model, default endpoint `http://localhost:11434`, with model discovery through `/api/tags`.
- OpenAI-compatible: configurable base URL, model, and API key. The key is held only in the active page/provider instance and is not written to source code or `localStorage`.

Provider-specific code implements the common `AIProvider` interface. `FactSimAgent` has no WebLLM, Ollama, or OpenAI-specific branches.

### User image attachments

Paste a clipboard image into the chat input with Ctrl+V, drop image files on the composer, or use the image attachment button. Pending thumbnails can be removed individually; accepted messages show the images in the chat. Enter an accompanying instruction such as "この画像のここがおかしい"; image-only messages use "添付画像を確認してください。" as the user request. Ordinary text paste is unaffected. A screenshot can include user-drawn highlights; the agent must verify current graph IDs before applying edits and ask for clarification if the indicated target is ambiguous.

PNG, JPEG, WebP and GIF are accepted (GIF is sent as a static frame). Limits are four images per message and 10 MB per input file. Images are decoded, reduced to a maximum 1600-pixel long edge without upscaling, rasterized as PNG, and limited to 8 MB of base64 data each. SVG and invalid image data are rejected. Preview URLs used during decoding are revoked. Images are not stored in localStorage or uploaded when merely attached; sending transmits them to the selected provider endpoint. Ollama vision capability is required in the current UI. Unsupported or disconnected providers show an actionable error and retain the draft text and images.

User attachments remain available for follow-up questions within the active in-memory conversation, with at most four retained images across recent messages. Clear removes the conversation and pending attachments. Switching to a text-only provider omits earlier image bytes from its requests. This is separate from transient `get_layout_snapshot` observation images, which are discarded after writes/end of turn and are never retained in chat history.

All chat messages, including greetings and capability questions, go to the selected LLM. There are no canned chat answers. Browser AI uses a JSON envelope containing `reply` and `tool_calls`, allowing natural conversation and optional tool execution in the same response. This avoids WebLLM's native Hermes function-call-only schema. The panel displays only the generated reply; tool requests are parsed and validated by the registry. Browser AI preserves recent complete conversation turns within a bounded context budget; older turns may be omitted when the model context fills up. Structured browser responses are buffered until valid JSON is complete. If generation cuts an envelope off at the output limit, the provider retries once with instructions for a shorter response and a larger output budget; incomplete tool calls are never executed.

## MVP tools

| Tool | Class | Risk | Purpose |
| --- | --- | --- | --- |
| `get_model_summary` | READ | low | Compact model and simulation status DTO |
| `get_node` | READ | low | One node's safe DTO, editable parameters, and connections |
| `set_node_parameter` | WRITE | medium | Validated edit using existing graph/Flow history hooks |
| `run_simulation` | SIMULATION | low | Bounded run through the existing FactSim engine |
| `get_kpis` | READ | low | Measured sink completions and throughput from runtime state |
| `add_node` | WRITE | medium | Named node creation through the existing node catalog |
| `connect_nodes` | WRITE | medium | Connects two free compatible ports without replacing edges |
| `insert_node_on_link` | WRITE | medium | Inserts a catalog node into an existing edge, reconnects both sides, and rolls back failed edits |
| `move_node` | WRITE | low | Moves one existing node to graph coordinates without editing topology or simulation settings |
| `auto_layout` | WRITE | low | Arranges all nodes using existing flow/group-aware layout and fits the graph to the viewport |
| `get_layout_snapshot` | READ | low | Current graph image (vision models), node/viewport bounds, positions, connections and measured overlap pairs |
| `get_simulation_report` | READ | low | One bulk graph/runtime read, states, KPIs, pending-transfer cycles, runtime errors and ranked suspects |
| `get_nodes` | READ | low | Focused batch of up to 100 nodes with ports/settings and runtime diagnostics |
| `profile_simulation` | SIMULATION | low | Selected-engine stepping, actual wall-time measurements, progress samples and bounded partial reports |

### Efficient freeze investigations

Start with `get_simulation_report`, rather than following every connection with individual `get_node` calls. It returns all graph IDs and edges for typical models (up to 500 nodes / 2000 edges, explicit truncation beyond those limits), so identical Equipment names do not require a long traversal. Follow with one bounded `profile_simulation` covering the reported time, then `get_nodes` only for a focused suspect batch. The prompt targets 2–4 tool rounds; this is guidance, not a guarantee of model behavior.

Profiling defaults to 1200 simulation seconds and 15 wall seconds, checks time/cancellation between engine updates, yields to the browser, and stops on a non-advancing clock, time budget, runtime error or suspicious inactivity. Existing results are continued by default; `resetBeforeRun: true` explicitly clears them. Reports measure startup, engine updates (total / maximum), stop/render, progress and completion changes. They never change model parameters. A single synchronous engine call that never returns cannot be interrupted by this same-page timer. Intermediate normal UI rendering is not reproduced, so successful stepping does not rule out a display/rendering freeze.

WAIT states and pending-transfer cycles are suspects, not proof of deadlock. Future timed work prevents inactivity alone from stopping a run; exhausted finite sources may also be normal. Event heap sizes are not exposed, and the assistant must not invent queue growth. The panel collapses raw diagnostic data and shows separate AI-generation / tool-execution / total wall time. The next request can read the previous request's timing summary.

After 16 tool rounds the agent makes one final provider request with tools disabled and recorded evidence, returning a generated partial summary rather than `Agent stopped after 16 tool iterations`. Provider/network failures can still prevent that summary; existing tool results remain available. The regression tests use synthetic large-graph/runtime fixtures and mock providers for orchestration, plus the real selected simulation engine on the simple example. They do not establish the cause of a user's unsaved model freezing near 1000 seconds.

Users can discuss a graph plan before asking the assistant to apply it. Graph-building tools reuse the catalog, LiteGraph connections, and the existing undo stack. Edits reset prior simulation runtime results; editing while simulation runs is rejected. The model summary lists available node kinds and individual node views expose ports.

Appearance requests such as overlapping nodes or tidying the graph start with `get_layout_snapshot`. The LLM inspects the observation, chooses an individual node and graph coordinates, calls `move_node`, and inspects again. No automatic placement algorithm chooses coordinates in this workflow. Unaffected nodes and the viewport stay fixed; do not rename nodes or modify simulation parameters as a substitute. The snapshot includes title-inclusive graph bounds, screen pixel bounds, overlap pairs, connections and viewport transform; default scope is visible nodes. `scope: "all"` also exposes off-screen geometry, never off-screen pixels. Large observations explicitly report truncation. `move_node` accepts `avoidOverlap: true` and optional `minimumGap` (default 20) to reject new collisions before changing anything. Writes ask for confirmation by default, reject edits while simulation runs, preserve topology, parameters and current results, and are single undoable edits.

Ollama detects the selected model's `vision` capability from `/api/tags` or `/api/show`. For vision models, the snapshot redraws and captures the actual graph canvas as a PNG, adds non-overlapping node-ID labels, and sends it as a separate image attachment. The capture is limited to 1600 pixels on its longest side, does not include the entire browser window or DOM panels, and does not capture other applications. Only the latest observation image is attached during the current turn; writes invalidate it and require a fresh inspection. Image data is never put in tool JSON, chat logs or retained conversation history. Canvas security restrictions are reported explicitly. Browser AI and other text-only providers receive geometry only and must not claim to have seen pixels. The connection notice states whether inspection supports images or geometry only.

`auto_layout` is reserved for explicit requests to rearrange the entire graph automatically. It reuses `autoLayoutGraph`, defaults to `flow-group` with spacing 120, and reports moved node count and overlap pairs before/after. It reframes existing groups; failures restore original positions and group bounds.

To insert a buffer between already connected nodes, use `insert_node_on_link` with `fromNodeId`, `toNodeId`, `kind: "buffer"`, and a unique `name`. It replaces only the selected edge with two connections, preserves unrelated links, and is one undoable edit. Optional zero-based `fromPort` / `toPort` disambiguate parallel edges. Node connection DTOs include link IDs and numeric port indices. Missing connections, incompatible ports, and invalid kinds are rejected before changes; reconnection failures restore the original graph. The assistant must not ask for manual disconnection or substitute unrelated timing changes for a supported insertion.

`set_node_parameter` never creates a missing property. Flow timing parameters are exposed as `<flowNodeId>.seconds`; `cycleTime` is available only when a node has exactly one Process, so a multi-process Flow cannot be changed ambiguously.

## Confirmation and security

READ and SIMULATION tools run automatically. WRITE tools ask by default; users can enable safe automatic edits from the panel. Destructive tools are not part of the MVP and the registry always reserves them for confirmation.

The implementation does not use `eval`, does not expose arbitrary application functions, and does not pass raw UI state to the model. Tool input is schema-checked and then validated again against the current FactSim node/Flow. Validation failures are returned to the agent as tool results so it can correct its arguments without bypassing validation.

## Verification

Run the focused browser test from the repository root:

```powershell
node mcp/scripts/test-ai-assistant.mjs
```

For real GPU inference checks (downloads the lightweight Browser AI model on first use):

```powershell
node mcp/scripts/test-ai-assistant.mjs --real-webllm
```

Set `FACT_SIM_AI_TEST_MODEL` to a registry model ID to test another model. The report explicitly records when no WebGPU adapter is available and real inference was skipped.

The report is written to `artifacts/ai-assistant/browser-test.json` (or `browser-test-real.json` for real inference); the visual QA screenshot is temporary and is written under `tmp/`.
