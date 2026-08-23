# wasm-engine-release-graph

A **reusable, version-controlled [Nano Workforce](https://nanobpm.io) delivery graph** that
orchestrates a coordinated release across the nano ecosystem: the WASM engine
(`@nanobpm/engine-wasm`) and everything downstream of it, with each package's dependency bump
applied **in topological order** and every cross-repo publish gated on the upstream actually being
live on the registry.

This repo is **the process, as data**. The graph is authored once
([`graph/release-graph.json`](graph/release-graph.json)), checked in, reviewed like code, and
re-run every release — as opposed to Nano Workforce's built-in processes (merge-loop, convergence,
plan-fanout) or its *one-shot* ad-hoc delivery graphs. It is the reference example of a
**user-supplied, repeating delivery graph**.

## Why this exists

The nano ecosystem roots in one Rust crate and fans out through **three different release systems**:

| Train | Repo | Mechanism | Publishes |
|---|---|---|---|
| engine / bojtos | `Magikcraft/nano-bpm` + `nanobpm/bojtos` | manual tag + `bojtos-release.mjs` (**OTP**) | `engine-wasm`, `engine-testkit`, `bojtos-kit`, `bojtos-react` |
| urban | `nanobpm/nano-ide` | release-please (CI token) | `urban`, `workflow`, `urban-testkit` |
| apps | `nano-workforce`, `console`, `urban-pr-review` | semantic-release / adopt PRs | the sinks |

Cutting a coordinated release is **not** just tagging — it is bumping each downstream dependency
**range** in the right order and *proving the range resolves to the new upstream* before publishing
the next layer. On `0.x`, `^0.3.0` means `>=0.3.0 <0.4.0`, so a minor bump silently strands
consumers (this is a live problem: `bojtos-kit` pins `engine-wasm ^0.3.0` while `0.8.0` is
published). This graph encodes that ordering and those gates so the sequence is reproducible instead
of tribal knowledge.

## The graph

10 `agent` (automated work) · 4 `human` (the OTP publishes that can't be automated) · 7 `wait`
(npm registry-propagation gates). Rendered view — [`docs/graph.mmd`](docs/graph.mmd):

```mermaid
flowchart TD
  subgraph engine_bojtos["Magikcraft/nano-bpm + bojtos — OTP publishes (human)"]
    ew-prep["🤖 tag engine-core · make console-wasm"] --> ew-publish(["🧑 OTP publish engine-wasm"]) --> ew-live{{"⏳ engine-wasm live"}}
    et-bump["🤖 bump engine-wasm range"] --> et-publish(["🧑 OTP publish engine-testkit"]) --> et-live{{"⏳ engine-testkit live"}}
    bk-bump["🤖 bump engine-wasm (caret-trap check)"] --> bk-publish(["🧑 OTP publish bojtos-kit"]) --> bk-live{{"⏳ bojtos-kit live"}}
    br-bump["🤖 bump bojtos-kit range"] --> br-publish(["🧑 OTP publish bojtos-react"]) --> br-live{{"⏳ bojtos-react live"}}
  end
  subgraph urban_train["nanobpm/nano-ide — release-please (CI token, agentic)"]
    urban-release["🤖 cut urban"] --> urban-live{{"⏳ urban live"}}
    wf-bump["🤖 bump urban · cut workflow"] --> wf-live{{"⏳ workflow live"}}
    ut-bump["🤖 JOIN: bump ew+et+urban · cut urban-testkit"] --> ut-live{{"⏳ urban-testkit live"}}
  end
  subgraph sinks["adopt PRs (agentic)"]
    adopt-console["🤖 adopt-console"]
    adopt-nwf["🤖 adopt-nano-workforce"]
    adopt-upr["🤖 adopt-urban-pr-review"]
  end
  ew-live --> et-bump
  ew-live --> bk-bump
  bk-live --> br-bump
  ew-live --> ut-bump
  et-live --> ut-bump
  urban-live --> ut-bump
  br-live --> adopt-console
  ew-live --> adopt-console
  ut-live --> adopt-nwf
  wf-live --> adopt-nwf
  urban-live --> adopt-nwf
  urban-live --> adopt-upr
```

### Node kinds

- **🤖 `agent`** — a `senior:*` worker job does the mechanical work (bump the upstream range, catch
  the caret trap, build + test, open/merge the release PR). Side-effecting.
- **🧑 `human`** — a scheduled user task. Used **only** for the interactive **OTP** npm publishes on
  the engine/bojtos train, which can't be automated. Answerable by a person *or* an agent.
- **⏳ `wait`** — a durable `npm` readiness probe: block the next cut until the upstream version is
  actually resolvable on the registry (the propagation-lag guard). Emits an `artifact` fact.

Every `agent`/`connector` node is a **side effect**, so the whole graph is **parked at approval**
until dispatched with its content-addressed approval token (see below).

## Working with the graph

```bash
npm install
npm run schema     # (re)derive schema/ from nano-workforce's openapi.yaml (single source of truth)
npm run validate   # offline SHAPE gate (Ajv) — structure only
npm run render     # regenerate docs/graph.mmd from the graph
npm run check      # validate + assert docs/graph.mmd is up to date (what CI runs)
```

The offline shape-gate is **necessary, not sufficient**: the authoritative **semantic** validation
(acyclic DAG, no dangling edges, every `<node>.<fact>` endpoint resolves) lives in Nano Workforce's
`validateDeliveryGraph` and runs at dispatch. To exercise it — and to preview/launch the run —
point at a running Merlin instance:

```bash
MERLIN_URL=http://127.0.0.1:3000 npm run preview     # validate + compile + show diagram/stops/effects (no side effects)
MERLIN_URL=http://127.0.0.1:3000 npm run dispatch    # preview, then launch with the approval token
```

`preview` calls `previewDeliveryGraph`; `dispatch` calls `dispatchDeliveryGraph` with the graph's
digest as approval. A re-dispatch with the same graph is idempotent (short-circuits onto the
in-flight run).

## Single source of truth / no drift

- [`graph/release-graph.json`](graph/release-graph.json) is the **only** hand-authored artifact.
- [`schema/delivery-graph.schema.json`](schema/delivery-graph.schema.json) and
  [`docs/graph.mmd`](docs/graph.mmd) are **derived** — regenerated by `scripts/extract-schema.mjs`
  (from nano-workforce's `openapi.yaml`) and `scripts/render.mjs` respectively. CI git-diffs them,
  so a stale artifact fails the build instead of drifting.
- The schema is *extracted* from the upstream contract, never hand-copied — when the DeliveryGraph
  vocabulary moves, re-run `npm run schema` and commit.

## License

MIT — see [LICENSE](LICENSE).
