// Render `graph/release-graph.json` to a Mermaid `flowchart` (`docs/graph.mmd`) — a DERIVED
// documentation artifact regenerated from the graph, so it can never drift from the source. CI
// git-diffs the output (`--check`) so a forgotten re-render fails the build. This is the repo's OWN
// human-readable view (node → shaped box, edge → labelled arrow); the authoritative compiled diagram
// is whatever nano-workforce's compiler emits at dispatch — this is deliberately a lightweight echo.
import { readFileSync, writeFileSync } from "node:fs";

const CHECK = process.argv.includes("--check");
const GRAPH = process.argv.find((a, i) => i >= 2 && !a.startsWith("--")) ?? "graph/release-graph.json";
const OUT = "docs/graph.mmd";

const graph = JSON.parse(readFileSync(GRAPH, "utf8"));

// kind → (glyph, mermaid node-shape delimiters).
const SHAPE = {
  agent: ["🤖", (l) => `["${l}"]`], // rectangle: automated work (side-effecting)
  human: ["🧑", (l) => `(["${l}"])`], // stadium: a human stop-point
  wait: ["⏳", (l) => `{{"${l}"}}`], // hexagon: an engine readiness gate
  connector: ["🔌", (l) => `[/"${l}"/]`], // parallelogram: automated I/O
};

const lines = ["flowchart TD"];
if (graph.name) lines.push(`  %% ${graph.name}`);
for (const n of [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id))) {
  const [glyph, shape] = SHAPE[n.kind] ?? ["", (l) => `["${l}"]`];
  lines.push(`  ${n.id}${shape(`${glyph} ${n.kind}: ${n.id}`)}`);
}
for (const e of graph.edges ?? []) {
  const [fromNode, fact] = e.from.split(".");
  // A guarded edge (S7) labels its FEEL predicate (`<fact> == <literal>`); a split's else-branch
  // labels `default`; an unconditional edge labels its consumed fact (if any).
  const guard =
    e.when !== undefined
      ? `${e.when.split(".")[1] ?? e.when} == ${typeof e.equals === "string" ? `'${e.equals}'` : e.equals}`
      : e.default === true
        ? "default"
        : undefined;
  const label = guard ?? fact;
  lines.push(label ? `  ${fromNode} -- "${label}" --> ${e.to}` : `  ${fromNode} --> ${e.to}`);
}
const mmd = lines.join("\n") + "\n";

if (CHECK) {
  let current = "";
  try {
    current = readFileSync(OUT, "utf8");
  } catch {
    /* missing → drift */
  }
  if (current !== mmd) {
    console.error(`✗ ${OUT} is stale — run \`npm run render\` and commit the result.`);
    process.exit(1);
  }
  console.log(`✓ ${OUT} is up to date.`);
} else {
  writeFileSync(OUT, mmd);
  console.log(`wrote ${OUT} (${graph.nodes.length} nodes, ${(graph.edges ?? []).length} edges)`);
}
