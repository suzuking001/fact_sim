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

  Browser models include Llama 3.2 1B, Hermes 2 Pro 8B, Hermes-3 Llama 3.1 8B, DeepSeek-R1-Distill-Qwen-7B, Llama 3.1 8B Instruct, and Phi-4-mini-instruct. The four requested entries use their `q4f16_1-MLC` IDs from the [pinned WebLLM 0.2.85 model configuration](https://github.com/mlc-ai/web-llm/blob/v0.2.85/src/config.ts); approximate VRAM estimates are displayed when selected. DeepSeek was already registered and is not duplicated. All entries use the existing JSON conversation/tool protocol, not native function calling. Availability in the picker does not guarantee tool accuracy or sufficient GPU memory on every device.
- Ollama: configurable endpoint and model, default endpoint `http://localhost:11434`, with model discovery through `/api/tags`. Selecting Ollama, reopening with saved Ollama settings, or changing the endpoint automatically refreshes the Installed models dropdown; Get Models refreshes it manually. This is the only model field and shows every returned model name/tag. Selecting a model saves the choice; click Test & Use to activate it. Refreshes preserve the chosen model when it is still installed, otherwise select the first available model.
- OpenAI-compatible: configurable base URL, model, and API key. The key is held only in the active page/provider instance and is not written to source code or `localStorage`.

Provider-specific code implements the common `AIProvider` interface. `FactSimAgent` has no WebLLM, Ollama, or OpenAI-specific branches.

Ollama's Thinking selector defaults to Fast (`think: false`) for models advertising thinking capability; Detailed opts into `think: true`. This is per-request, not a change to the Ollama service or Modelfile, and unsupported non-thinking models omit the field. The preference is stored with other non-secret UI settings and applies to the next generation. The API behavior follows the [official Ollama chat API](https://docs.ollama.com/api/chat). Each generation defaults to a 90-second wall-time deadline; the panel reports elapsed wait/generation time every four seconds. A timeout aborts only that request and gives guidance about loading, scheduling and inference load. It does not kill unrelated work or guarantee those external delays disappear. Thinking text is not displayed as a chat answer.

### 詳細設定（応答時間・生成パラメータ）

AIパネルの **Provider & model → 詳細設定** から以下を変更できます。設定は同じブラウザの `factsim-ai-settings` に保存され、再接続せずに次の送信から適用されます。応答途中の変更は進行中の送信には適用しません。APIキーは保存しません。

| 設定 | 対象 | 既定値・意味 |
| --- | --- | --- |
| Temperature | 全プロバイダー | 0.2。0〜2で回答のばらつきを調整 |
| 生成トークン上限 | 全プロバイダー | 空欄は既定値。Browser AIは512（切り詰め後の再試行時768）、他はサーバー既定。指定時は再試行にも同じ上限を使用 |
| ツール呼び出しのラウンド上限 | 全プロバイダー | 16。1〜100。1ラウンドに複数ツールを呼ぶ場合あり。上限到達後、追加のAI生成で取得済みの結果を要約 |
| 応答タイムアウト（秒） | Ollama | 90。0〜86400。**0は無制限**。読込・待ち行列・推論・ストリーム完了までを含む、AI生成1回ごとの上限 |
| コンテキスト長・Top P・Top K・繰り返し抑制・乱数シード | Ollama | 空欄はOllama既定。`num_ctx` / `top_p` / `top_k` / `repeat_penalty` / `seed` として送信 |
| モデル保持時間（秒） | Ollama | 空欄はOllama既定。0は生成後の解放、-1は保持を継続。`keep_alive` として送信 |

今回の90秒エラーに対しては、応答タイムアウトを例えば **300秒** または **0（無制限）** に変更して再送信してください。無制限でも **Stop** で停止できます。これはOllama生成リクエストの時間設定であり、モデル一覧取得や接続確認の期限ではありません。空欄のOllama固有設定は送信しません。値の意味は [Ollamaのパラメータ仕様](https://docs.ollama.com/modelfile#valid-parameters-and-values) に従います。コンテキスト長を大きくするとメモリ使用量が増えます。

「生成パラメータを既定値に戻す」は上記の設定だけを初期化します。プロバイダー・モデル・接続先・Thinking・編集確認設定は保持します。不正な値は保存・送信せず、入力欄の修正を促します。既存の保存設定に新項目がなければ上記の既定値を補います。プログラムからは `OllamaProvider.initialize({requestTimeoutMs:0})` でも期限を無効にできます。

### User image attachments

Paste a clipboard image into the chat input with Ctrl+V, drop image files on the composer, or use the image attachment button. Pending thumbnails can be removed individually; accepted messages show the images in the chat. Enter an accompanying instruction such as "この画像のここがおかしい"; image-only messages use "添付画像を確認してください。" as the user request. Ordinary text paste is unaffected. A screenshot can include user-drawn highlights; the agent must verify current graph IDs before applying edits and ask for clarification if the indicated target is ambiguous.

PNG, JPEG, WebP and GIF are accepted (GIF is sent as a static frame). Limits are four images per message and 10 MB per input file. Images are decoded, reduced to a maximum 1600-pixel long edge without upscaling, rasterized as PNG, and limited to 8 MB of base64 data each. SVG and invalid image data are rejected. Preview URLs used during decoding are revoked. Images are not stored in localStorage or uploaded when merely attached; sending transmits them to the selected provider endpoint. Ollama vision capability is required in the current UI. Unsupported or disconnected providers show an actionable error and retain the draft text and images.

User attachments remain available for follow-up questions within the active in-memory conversation, with at most four retained images across recent messages. Clear removes the conversation and pending attachments. Switching to a text-only provider omits earlier image bytes from its requests. This is separate from transient `get_layout_snapshot` observation images, which are discarded after writes/end of turn and are never retained in chat history.

All chat messages, including greetings and capability questions, go to the selected LLM. There are no canned chat answers. Browser AI uses a JSON envelope containing `reply` and `tool_calls`, allowing natural conversation and optional tool execution in the same response. This avoids WebLLM's native Hermes function-call-only schema. The panel displays only the generated reply; tool requests are parsed and validated by the registry. Browser AI preserves recent complete conversation turns within a bounded context budget; older turns may be omitted when the model context fills up. Structured browser responses are buffered until valid JSON is complete. If generation cuts an envelope off at the output limit, the provider retries once with instructions for a shorter response and a larger output budget; incomplete tool calls are never executed.

## MVP tools

### Additional editing operations

| Tool | Confirmation | Contract |
| --- | --- | --- |
| `batch_set_node_parameters` | Normal write policy | Up to 100 explicit changes; validate every target first, reject duplicate aliases, rollback the whole batch on failure; one undo. Name-only changes preserve simulation results. Relative changes are calculated by the LLM from inspected actual values. |
| `disconnect_nodes` | Always | Exactly one directed edge; optional zero-based ports disambiguate. No node removal. |
| `remove_node` | Always | Isolated deletion by default; attached edges require explicit `disconnectAttached=true`. `reconnect=true` atomically bypasses an intermediate Equipment node (including Buffer) with exactly one input/output edge; refuses Source/Sink, ambiguous branches, incompatible ports and self-links. |
| `duplicate_node` | Normal write policy | Copies serialized custom node settings and Flow, with a unique name; no links or runtime results. No automatic parallel routing. |
| `move_nodes` | Normal write policy | Moves up to 100 explicit IDs by graph dx/dy; preserves their relative positions, viewport, settings and links. Does not avoid obstacles automatically; inspect/recheck geometry. |

These operations use normal FactSim graph/history APIs. A cancelled destructive operation is not retried via other tools. Running simulation is rejected before confirmation; validation is repeated after confirmation. Topology/timing edits reset simulation results, while group translation and name-only batches do not. A guarded undo can restore one completed destructive edit as well as one write/batch; it is not whole-conversation undo.

`node mcp/scripts/test-ai-scenarios.mjs --suite=editing` tests ten real Ollama editing requests (21–30) in isolated fixture graphs. Destructive confirmations are explicitly accepted in the harness except case 29, which cancels; the user's app confirmation settings and model are not changed. Use `--case=25` for an individual request; raw attempts are in `artifacts/ai-assistant/scenarios-editing-real.json`.

WebLLM replaces the long FactSim system playbook with a browser-specific compact safety/operation contract and removes duplicate tool/schema descriptions from its prompt. Live compact context, measured edit accounting, final tool-budget instructions, all tool names and schema constraints remain intact. Other providers retain the full prompt. This avoids sending the large-model playbook on top of tool definitions to 4096-token browser models; context retries still bound previous conversation/tool results. It does not increase GPU memory allocation or substitute canned greetings for model-generated conversation.

`node mcp/scripts/test-ai-assistant.mjs --webllm-tokenizers` checks the greeting prompt with the four requested models' actual tokenizers, reserving 768 output tokens and 128 template tokens. `--real-webllm` runs real GPU inference; set `FACT_SIM_AI_TEST_MODEL` to select Phi-4 or another registry model. Test-only `FACT_SIM_AI_TEST_CACHE_BACKEND=indexeddb` can be used when the isolated browser's default Cache API fails during model downloads; production loading is unchanged.

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
| `undo_last_ai_edit` | WRITE | medium | Undo the latest single AI edit only if the same graph/history/configuration still matches; reject later manual edits |
| `get_node_catalog` | READ | low | Preview actual customized templates, editable defaults, Process phases and ports without adding live nodes |

Ambiguous duplicate names require a target clarification; missing nodes are not created as a substitute. Invalid parameter values are rejected before confirmation, and an aborted request is checked again after confirmation so it cannot apply a late edit. Follow-up references use successful conversation tool results. Node-count accounting records counts before each user turn separately from current post-edit totals.

`undo_last_ai_edit` uses the normal FactSim undo stack, requires the usual write confirmation, and applies to one tool edit in the same registry session. It rejects a changed graph, changed history, configuration/position differences (including uncaptured manual edits), running simulation, and repeated/unowned undo. It does not blindly roll back a multi-tool construction or restore over newer work. Runtime results can be reset by normal undo. Tracking AI ownership does not add extra history entries.

Before constructing timed nodes, `get_node_catalog` exposes actual template overrides. A Machine may contain multiple Process phases; generic 'processing 2 seconds' then requires clarification about total versus per-phase time. Construction may be partially completed before clarification, but timing must not be claimed complete. With an explicit summed total/equal allocation, verify all Process values and preserve other phases. Returned preview nodes have no live graph IDs.

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

### Real Ollama scenario checks

`node mcp/scripts/test-ai-scenarios.mjs` exercises ten realistic Japanese questions against the actual installed Ollama `qwen3.8:27b` model in an isolated headless Edge page. Set `FACT_SIM_AI_SCENARIO_MODEL` to test another installed model. Use `--case=9` (1–10) for an individual question and `FACT_SIM_AI_SCENARIO_TIMEOUT` for the per-question cancellation limit (milliseconds, default 120000). The script does not mock model replies, alter user tabs, download models, or change Ollama configuration. Test graph edits use automatic safe-write policy only inside the isolated test page, not the user's app settings.

Each question starts from the simple four-node fixture; the overlap scenario intentionally overlaps two nodes, and the bottleneck scenario pre-runs 120 seconds. The harness records generated answers, actual tool calls/results, wall times, final graph facts and errors in `artifacts/ai-assistant/scenarios-real.json`, appending each attempt. A passing check requires the expected behavior and a response within 60 seconds on this test machine. These checks are scoped to that model, mode and fixture, not a guarantee for all models or large graphs. Text checks are heuristic; manually review causal claims, unsupported capabilities and topology-preserving improvement suggestions as well. The first model-load time cannot be compared directly with warm-model timings.

The prompt restricts capability descriptions to available tools/parameters, avoids overclaiming UI causes from a successful stepping test, uses one focused parameter batch for bottleneck investigation, and labels theoretical gains separately from measured gains. Mandatory sequential operations must not be turned into alternative parallel routes in an improvement proposal.

For ten additional instructions (test IDs 11–20), run `node mcp/scripts/test-ai-scenarios.mjs --suite=extended` or add `--case=18` for one case. Results append to `artifacts/ai-assistant/scenarios-extended-real.json`. The suite includes ambiguous/missing targets, invalid timing, multi-turn references and undo, customized multi-Process construction with an explicit clarification reply, before/after measured comparison, and a real annotated PNG sent as a user attachment. `--legacy-no-undo --suite=extended --case=17` reproduces the old missing-tool behavior against the real model by omitting only the new undo tool; it does not fake replies. Final passes validate meaningful settings and topology, not lazy rendering/Flow caches. Automated answer checks remain heuristic and are supplemented by manual review.
