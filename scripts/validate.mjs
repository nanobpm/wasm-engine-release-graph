// Offline SHAPE-gate: validate `graph/release-graph.json` against the derived DeliveryGraph JSON
// Schema. This is the fast, dependency-light check CI runs on every PR. It validates STRUCTURE only
// — the authoritative SEMANTIC validation (acyclic DAG, no dangling edges, every `<node>.<fact>`
// endpoint resolves) is nano-workforce's `validateDeliveryGraph`, exercised by `preview.mjs` against
// a running Merlin. A green shape-gate is necessary, not sufficient; see README.
import { readFileSync } from "node:fs";
import Ajv from "ajv";

const args = process.argv.slice(2);
const GRAPH = args[0] ?? "graph/release-graph.json";
const SCHEMA = args[1] ?? "schema/delivery-graph.schema.json";

const schema = JSON.parse(readFileSync(SCHEMA, "utf8"));
const graph = JSON.parse(readFileSync(GRAPH, "utf8"));

// `discriminator` is an OpenAPI keyword Ajv doesn't know; `strict:false` lets it be ignored while
// the sibling `oneOf` still enforces the union. `allErrors` surfaces every violation at once.
const ajv = new Ajv({ strict: false, allErrors: true });
const validate = ajv.compile(schema);

if (validate(graph)) {
  const kinds = graph.nodes.reduce((m, n) => ((m[n.kind] = (m[n.kind] ?? 0) + 1), m), {});
  console.log(`✓ ${GRAPH} is shape-valid — ${graph.nodes.length} nodes`, kinds, `| ${(graph.edges ?? []).length} edges`);
  process.exit(0);
}

console.error(`✗ ${GRAPH} failed shape validation:`);
for (const e of validate.errors ?? []) {
  console.error(`  ${e.instancePath || "/"} ${e.message}${e.params ? " " + JSON.stringify(e.params) : ""}`);
}
process.exit(1);
