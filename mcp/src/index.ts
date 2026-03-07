import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { FactSimRuntime } from "./fact-sim-runtime.js";
import { createMcpServer } from "./server/create-mcp-server.js";
import { errorMessage, getMcpRoot, log, resolveFactSimRoot } from "./server/tool-helpers.js";

async function main(): Promise<void> {
  const mcpRoot = getMcpRoot();
  const factSimRoot = resolveFactSimRoot(mcpRoot);
  const runtime = new FactSimRuntime({
    repoRoot: factSimRoot,
    preferredPort: 8123,
    logger: (message, details) => log("INFO", message, undefined, details)
  });
  const server = createMcpServer(runtime);
  const transport = new StdioServerTransport();

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log("INFO", `shutdown requested (${signal})`);
    try {
      await runtime.close();
      await server.close();
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("uncaughtException", (error) => {
    log("ERROR", "uncaughtException", undefined, errorMessage(error));
    void shutdown("uncaughtException");
  });
  process.on("unhandledRejection", (reason) => {
    log("ERROR", "unhandledRejection", undefined, errorMessage(reason));
    void shutdown("unhandledRejection");
  });

  log("INFO", "starting fact-sim AI MCP server", undefined, {
    mcpRoot,
    factSimRoot
  });
  await server.connect(transport);
  log("INFO", "fact-sim AI MCP server connected over stdio");
}

main().catch((error) => {
  log("ERROR", "fatal startup error", undefined, errorMessage(error));
  process.exit(1);
});
