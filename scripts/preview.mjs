// AUTHORITATIVE preview/dispatch against a running Nano Workforce ("Merlin") instance. Unlike the
// offline shape-gate, this POSTs the graph to Merlin's control API, which runs the REAL
// `validateDeliveryGraph` + `compileDeliveryGraph` — the single source of truth — and returns the
// compiled mermaid, the human stop-points, and the side-effects an approval authorises.
//
//   node scripts/preview.mjs               # preview only (no side effects)
//   node scripts/preview.mjs --dispatch    # preview, then dispatch with the approval token
//
// A graph with any side-effecting (`agent`/`connector`) node is PARKED at approval unless dispatched
// with its content-addressed approval token — this script surfaces that token on preview and, with
// `--dispatch`, echoes it back to actually launch. Env: MERLIN_URL (default http://127.0.0.1:3000),
// MERLIN_BASE (default /app/api).
import { readFileSync } from "node:fs";

const DISPATCH = process.argv.includes("--dispatch");
const GRAPH = process.argv.find((a, i) => i >= 2 && !a.startsWith("--")) ?? "graph/release-graph.json";
const URL = process.env.MERLIN_URL ?? "http://127.0.0.1:3000";
const BASE = process.env.MERLIN_BASE ?? "/app/api";
const graphJson = readFileSync(GRAPH, "utf8");

const post = async (op, body) => {
  const res = await fetch(`${URL}${BASE}/${op}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${op} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return { status: res.status, json };
};

// Preview (parse + validate + compile + STAGE a proposal, zero dispatch/side effects).
// The framework routes operations by their OpenAPI *path*, not their operationId.
const preview = await post("actions/delivery-graph/preview", { graphJson });
const p = preview.json;
if (!p.ok) {
  console.error(`✗ preview rejected:${p.error ? " " + p.error : ""}`);
  for (const e of p.errors ?? []) console.error(`  ${e.path}: ${e.message}`);
  process.exit(1);
}
console.log(`✓ preview ok — "${p.title ?? "graph"}"`);
console.log(`  nodes=${p.nodeCount} humanStops=${p.humanNodeCount} sideEffects=${p.sideEffectCount} digest=${p.digest}`);
if (p.humanNodes?.length) {
  console.log("  human stop-points:");
  for (const h of p.humanNodes) console.log(`    • ${h.nodeId} — ${h.prompt ?? "(generic)"}`);
}
if (p.sideEffects?.length) {
  console.log("  side effects (an approval authorises ALL of these):");
  for (const s of p.sideEffects) console.log(`    • ${s.nodeId} [${s.kind}] — ${s.description}`);
}
if (p.diagram) console.log("\n" + p.diagram);

if (!DISPATCH) {
  console.log(`\n(preview only — re-run with --dispatch to launch; approval token = ${p.digest})`);
  process.exit(0);
}

// Dispatch: the door is OPERATOR-ONLY and launches a STAGED proposal by its digest (the preview
// above staged it). The operator presenting the digest IS the approval — there is no graphJson or
// replayable token on this door (ADR 0005 Decision 7 / #460). Idempotent on the digest.
const run = await post("actions/delivery-graph/dispatch", { digest: p.digest });
const r = run.json;
if (!r.ok) {
  console.error(`✗ dispatch failed:${r.error ? " " + r.error : ""}${r.message ? " " + r.message : ""}`);
  process.exit(1);
}
console.log(`\n✓ dispatched — status=${r.status ?? run.status} runKey=${r.runKey}`);
if (r.processInstanceKey) console.log(`  processInstanceKey=${r.processInstanceKey} processDefinitionId=${r.processDefinitionId}`);
if (r.alreadyRunning) console.log("  (short-circuited onto an already-running instance — idempotent)");
