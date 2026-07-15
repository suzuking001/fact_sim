import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const cwd = process.cwd();
const serverPath = path.resolve(cwd, "dist", "index.js");
const repoRoot = path.resolve(cwd, "..");

function parseTextResult(result) {
  const text = result?.content?.find?.((item) => item?.type === "text")?.text ?? "";
  return text ? JSON.parse(text) : null;
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: {
      ...process.env,
      FACT_SIM_ROOT: repoRoot
    }
  });

  const client = new Client({
    name: "fact-sim-ai-smoke",
    version: "0.1.0"
  });

  await client.connect(transport);

  try {
    const toolList = await client.listTools();
    const toolNames = toolList.tools.map((tool) => tool.name).sort();
    const expected = [
      "add_node",
      "build_blueprint_report",
      "build_graph_from_blueprint",
      "connect_nodes",
      "connect_nodes_by_port_kind",
      "edit_graph",
      "examples",
      "graph",
      "get_graph_overview",
      "get_kpi_summary",
      "get_simulation_status",
      "load_example",
      "metrics",
      "optimize",
      "prepare_session",
      "remove_node",
      "run_benchmark",
      "run_report",
      "run_simulation_for",
      "simulate"
    ];
    for (const name of expected) {
      if (!toolNames.includes(name)) {
        throw new Error(`Missing tool: ${name}`);
      }
    }

    const examples = parseTextResult(await client.callTool({
      name: "examples",
      arguments: { action: "list" }
    }));
    if (!Array.isArray(examples?.examples) || examples.examples.length === 0) {
      throw new Error("examples list returned no items");
    }

    const initialOverview = parseTextResult(await client.callTool({
      name: "graph",
      arguments: { action: "overview" }
    }));
    const defaultExample = JSON.parse(fs.readFileSync(path.resolve(repoRoot, "sample", "sample_line2.json"), "utf8"));
    if (initialOverview?.nodeCount !== defaultExample.nodes?.length
      || initialOverview?.linkCount !== defaultExample.links?.length) {
      throw new Error(
        `initial graph is not sample_line2: expected ${defaultExample.nodes?.length}/${defaultExample.links?.length}, `
        + `got ${initialOverview?.nodeCount}/${initialOverview?.linkCount}`
      );
    }

    const loaded = parseTextResult(await client.callTool({
      name: "examples",
      arguments: { action: "load", name: "sample_line1" }
    }));
    if (!loaded?.nodeCount || loaded.nodeCount < 2) {
      throw new Error("load example failed");
    }

    const run = parseTextResult(await client.callTool({
      name: "simulate",
      arguments: { action: "run_for", wallMs: 400, mode: "dt" }
    }));
    if (typeof run?.simTimeMs !== "number" || run.simTimeMs <= 0) {
      throw new Error("run_for did not advance simulation");
    }

    const kpi = parseTextResult(await client.callTool({
      name: "metrics",
      arguments: { action: "kpi" }
    }));
    if (typeof kpi?.nodeCount !== "number" || typeof kpi?.linkCount !== "number") {
      throw new Error("kpi response missing graph counts");
    }

    const overview = parseTextResult(await client.callTool({
      name: "graph",
      arguments: { action: "overview", includeNodes: true, maxNodes: 5 }
    }));
    if (!Array.isArray(overview?.nodes)) {
      throw new Error("graph overview missing nodes");
    }

    const report = parseTextResult(await client.callTool({
      name: "run_report",
      arguments: { mode: "dt", topN: 3, maxNodes: 3 }
    }));
    if (typeof report?.run?.simTimeMs !== "number") {
      throw new Error("run_report missing simTimeMs");
    }
    if (report?.run?.wallMs !== 1000) {
      throw new Error("run_report default wallMs was not applied");
    }

    const aliasStatus = parseTextResult(await client.callTool({
      name: "get_simulation_status",
      arguments: {}
    }));
    if (typeof aliasStatus?.nodeCount !== "number") {
      throw new Error("legacy alias get_simulation_status failed");
    }

    const batch = parseTextResult(await client.callTool({
      name: "edit_graph",
      arguments: {
        action: "batch",
        operations: [
          {
            action: "add",
            ref: "batchEquip",
            nodeType: "factory/equip",
            title: "MCP Batch Equip",
            x: 80,
            y: 80,
            properties: { processTime: 5, downTime: 6 }
          },
          {
            action: "add",
            ref: "batchSource",
            nodeType: "factory/source",
            title: "MCP Batch Source",
            x: 20,
            y: 80,
            properties: { spawnInterval: 10 }
          },
          {
            action: "connect",
            fromNodeId: "$batchSource",
            toNodeId: "$batchEquip",
            portKind: "work"
          }
        ]
      }
    }));
    if (typeof batch?.operationCount !== "number" || batch.operationCount !== 3) {
      throw new Error("edit_graph batch did not return operationCount=3");
    }
    if (!batch?.refs?.batchEquip || !batch?.refs?.batchSource) {
      throw new Error("edit_graph batch refs were not returned");
    }

    console.log(JSON.stringify({
      ok: true,
      tools: toolNames,
      initialOverview,
      loaded,
      run,
      kpi,
      overview,
      report,
      aliasStatus,
      batch
    }));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
