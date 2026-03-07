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
      "build_blueprint_report",
      "edit_graph",
      "examples",
      "graph",
      "metrics",
      "optimize",
      "prepare_session",
      "run_report",
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
      arguments: { wallMs: 200, mode: "dt", topN: 3, maxNodes: 3 }
    }));
    if (typeof report?.run?.simTimeMs !== "number") {
      throw new Error("run_report missing simTimeMs");
    }

    console.log(JSON.stringify({
      ok: true,
      tools: toolNames,
      loaded,
      run,
      kpi,
      overview,
      report
    }));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
