// Derive `schema/delivery-graph.schema.json` from Nano Workforce's `openapi.yaml` — the SINGLE
// source of truth for the DeliveryGraph contract (nano-workforce ADR 0059). This repo never
// hand-maintains the schema: it EXTRACTS the DeliveryGraph subtree (the 8 self-contained component
// schemas) and rewrites their `#/components/schemas/*` refs to local `#/$defs/*`, producing a
// standalone JSON Schema the offline shape-gate (`validate.mjs`) uses. Re-run whenever the upstream
// contract moves; CI git-diffs the result so a stale schema fails the build instead of drifting.
//
//   node scripts/extract-schema.mjs [--openapi <path>] [--out <path>]
//
// `--openapi` defaults to `$NWF_OPENAPI` else a sibling `../nano-workforce/openapi.yaml` checkout.
import { readFileSync, writeFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const OPENAPI = opt("--openapi", process.env.NWF_OPENAPI ?? "../nano-workforce/openapi.yaml");
const OUT = opt("--out", "schema/delivery-graph.schema.json");

// The self-contained DeliveryGraph subtree — the transitive closure of `DeliveryGraph`'s $refs.
const NEEDED = [
  "DeliveryGraph",
  "DeliveryNode",
  "DeliveryNodeAgent",
  "DeliveryNodeWait",
  "DeliveryNodeHuman",
  "DeliveryNodeConnector",
  "DeliveryNodeCommon",
  "DeliveryFact",
  "DeliveryEdge",
  "ReadinessProbe",
];

const doc = parseYaml(readFileSync(OPENAPI, "utf8"));
const schemas = doc?.components?.schemas;
if (!schemas) throw new Error(`no components.schemas in ${OPENAPI}`);

// Rewrite every `#/components/schemas/X` ref to `#/$defs/X`, in place, over an arbitrary subtree.
const rewriteRefs = (node) => {
  if (Array.isArray(node)) return node.map(rewriteRefs);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "$ref" && typeof v === "string") {
        out.$ref = v.replace("#/components/schemas/", "#/$defs/");
      } else {
        out[k] = rewriteRefs(v);
      }
    }
    return out;
  }
  return node;
};

const $defs = {};
for (const name of NEEDED) {
  if (!schemas[name]) throw new Error(`upstream openapi is missing component schema '${name}'`);
  $defs[name] = rewriteRefs(schemas[name]);
}

const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://nanobpm.io/schemas/delivery-graph.schema.json",
  title: "DeliveryGraph",
  description:
    "SHAPE gate for a Nano Workforce delivery graph (ADR 0005). DERIVED — regenerate with " +
    "`node scripts/extract-schema.mjs`; the authoritative SEMANTIC validator (DAG acyclicity, " +
    "edge integrity, fact resolution) lives in nano-workforce `validateDeliveryGraph` and runs at " +
    "dispatch. Do not hand-edit.",
  $ref: "#/$defs/DeliveryGraph",
  $defs,
};

writeFileSync(OUT, JSON.stringify(schema, null, 2) + "\n");
console.log(`wrote ${OUT} (${NEEDED.length} component schemas, from ${OPENAPI})`);
