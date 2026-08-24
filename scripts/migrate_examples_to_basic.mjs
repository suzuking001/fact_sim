import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(process.cwd());
const sampleDir = path.join(repoRoot, "sample");

globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.App = {};
globalThis.LiteGraph = {
  LGraphNode: class {},
  registered_node_types: {}
};

await import(pathToFileURL(path.join(repoRoot, "js", "nodes", "basic_node.js")).href);

if(typeof globalThis.App.migrateGraphDataToBasic !== "function"){
  throw new Error("App.migrateGraphDataToBasic is unavailable");
}

const embeddedExamples = new Map([
  ["simple.json", ["simple.js", "simple"]],
  ["branch.json", ["branch.js", "branch"]],
  ["parallel_benchmark.json", ["parallel_benchmark.js", "parallel_benchmark"]],
  ["shuttle_line5.json", ["shuttle_line5.js", "shuttle_line5"]],
  ["graph (3).json", ["carrier.js", "carrier"]],
  ["pallet_station_demo.json", ["pallet_station_demo.js", "pallet_station_demo"]],
  ["sample_line1.json", ["sample_line1.js", "sample_line1"]],
  ["sample_line2.json", ["sample_line2.js", "sample_line2"]]
]);

function embeddedScript(exampleKey, jsonText){
  const encoded = Buffer.from(jsonText, "utf8").toString("base64");
  return `(function(){\n`
    + `  var root = (typeof window !== "undefined") ? window : globalThis;\n`
    + `  root.EXAMPLES = root.EXAMPLES || {};\n`
    + `  var base64 = '${encoded}';\n`
    + `  var binary = atob(base64);\n`
    + `  var bytes = new Uint8Array(binary.length);\n`
    + `  for(var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);\n`
    + `  var json = (typeof TextDecoder === "function")\n`
    + `    ? new TextDecoder("utf-8").decode(bytes)\n`
    + `    : decodeURIComponent(Array.prototype.map.call(bytes, function(value){ return "%" + value.toString(16).padStart(2, "0"); }).join(""));\n`
    + `  root.EXAMPLES[${JSON.stringify(exampleKey)}] = JSON.parse(json);\n`
    + `})();\n`;
}

const reports = [];
for(const entry of fs.readdirSync(sampleDir, { withFileTypes: true })){
  if(!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;
  const jsonPath = path.join(sampleDir, entry.name);
  const source = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const result = globalThis.App.migrateGraphDataToBasic(source, {});
  if(result?.preview?.blocked){
    throw new Error(`${entry.name}: migration blocked: ${JSON.stringify(result.preview.warnings || [])}`);
  }
  const graph = result?.data || result;
  const invalid = (graph.nodes || []).filter((node) => node?.type !== "factory/basic");
  if(invalid.length){
    throw new Error(`${entry.name}: non-Basic nodes remain: ${invalid.map((node) => `${node.id}:${node.type}`).join(", ")}`);
  }
  const legacyProperties = (graph.nodes || []).filter((node) => Object.prototype.hasOwnProperty.call(node?.properties || {}, "legacySourceType"));
  if(legacyProperties.length){
    throw new Error(`${entry.name}: legacySourceType remains on ${legacyProperties.length} node(s)`);
  }
  const jsonText = `${JSON.stringify(graph, null, 2)}\n`;
  fs.writeFileSync(jsonPath, jsonText, "utf8");
  const embedded = embeddedExamples.get(entry.name);
  if(embedded){
    fs.writeFileSync(path.join(sampleDir, embedded[0]), embeddedScript(embedded[1], jsonText), "utf8");
  }
  reports.push({
    file: entry.name,
    nodeCount: (graph.nodes || []).length,
    converted: Number(result?.preview?.convertedNodeCount) || 0,
    removedConfigNodes: Number(result?.preview?.removedConfigNodeCount) || 0
  });
}

console.log(JSON.stringify(reports, null, 2));
