import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { FactSimRuntime } from "../fact-sim-runtime.js";
import { registerAiTools } from "./register-ai-tools.js";

export function createMcpServer(runtime: FactSimRuntime): McpServer {
  const server = new McpServer(
    {
      name: "fact-sim-ai",
      version: "0.3.0"
    },
    {
      capabilities: {
        logging: {}
      }
    }
  );

  registerAiTools(server, runtime);

  return server;
}
