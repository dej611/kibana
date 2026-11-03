# Workflow Visual Builder — current state of implementation

This document describes what is **currently implemented** in the workflow graph authoring surface. It is updated in the same PR that lands each spec. The PR description (the spec itself) is the record of intent; this document is the record of outcome.

---

## What exists today

The workflow graph is a **read-only visualisation** of the workflow YAML with two authoring
foundations now in place (specs 00 and 01):

- Nodes render steps, triggers and `if`/`switch`/`parallel`/`foreach` control-flow blocks.
- Edges render the execution path between steps, with `isMerge` routing for joins after branches.
- The `stepExecutions` colouring from execution runs is the only interactive state.
- All handles are `opacity: 0`; `nodesConnectable={false}`; no mutation path from graph to YAML
  exists (authoring affordances land in specs 03–08).
- `insertStep` can now address any step in the tree, including switch cases and parallel branches
  (spec 00).
- Fork and trigger lane order is stable across YAML edits — growing one branch never visually swaps
  it with a sibling (spec 01).
- `on-failure.fallback` steps are rendered as a side lane hung off the owner. The failure edge is
  always-dashed; it turns red once any lane node has a step-execution record. Two lane shapes:
  terminating (no `continue`) and rejoining (`continue: true`) (spec 02).

## Authoring capabilities

| Capability | Status | Spec | ADR |
|---|---|---|---|
| Shared step-child traversal (prerequisite) | ✅ Implemented | 00 | ADR-0003, ADR-0007 |
| Fork and trigger lane order preserved after layout | ✅ Implemented | 01 | ADR-0008 |
| Fallback lane graph model (read-only) | ✅ Implemented | 02 | ADR-0004, ADR-0010, ADR-0012 |
| Connection ports (visible anchors, hover `+`, red fallback dot) | ❌ Not implemented | 03 | — |
| Insert step from a flow port | ❌ Not implemented | 04 | ADR-0002, ADR-0005, ADR-0006 |
| Node action menu (`⋮` — Edit / Duplicate / Add fallback steps / Delete) | ❌ Not implemented | 05 | — |
| Add trigger overlay | ❌ Not implemented | 06 | — |
| Fallback authoring (red port → write `fallback`; `continue` toggle) | ❌ Not implemented | 07 | ADR-0004 |
| Pending node and insert animation (ghost card, FLIP) | ❌ Not implemented | 08 | ADR-0002 |
| Sections: a transparent `type: section` grouping step (schema, execution, nesting validation) | ✅ Implemented | — | ADR-0014 |
| Sections on the canvas: frame, collapse / expand per viewer, rolled-up run status | ✅ Implemented | — | ADR-0014 |
| Section authoring: "Section" in the Actions menu, Ungroup, Shift+drag to wrap, YAML Wrap / Unwrap code actions | ✅ Implemented | — | ADR-0014 |
| Extract a section to a new workflow (`⋮` menu): the steps move as written into a new manual-trigger workflow, and the section becomes a `workflow.execute` step of the same name. References that cross the boundary are listed for confirmation, not rewritten | ✅ Implemented | Needs create-workflow permission; the new workflow is saved at once, the edit to this one only when it is saved | ADR-0014 |
| Collapse / expand sections from the keyboard: `⌘⌥[` collapses and `⌘⌥]` expands the selected section, or every section when none is selected; works in read-only mode and animates like a click | ✅ Implemented | The code editor's own fold/unfold keys, in the form that works in a browser. VS Code's `⌘K` chords are not used: the graph already takes `⌘K` to add a step. With a step selected inside a section, collapsing leaves that section open | ADR-0014 |

## Known limitations

### Sections

- A collapsed section has no Ungroup in its `⋮` menu; expand it first.
- A collapsed section has no Extract either. Extraction does not wire `inputs` or outputs: the new workflow cannot read this one's variables, constants, inputs, event or step outputs, and the section's `title` and `description` become the new workflow's name and description, because `workflow.execute` has no field for them.
- On the executions tab, a section with a failed or waiting step is shown expanded and cannot be
  collapsed there.
- The Shift+drag marquee cannot sub-group inside a section (sections cannot nest). The YAML code
  action wraps steps anywhere a section is allowed.
- A `?stepId=` link to a step inside a collapsed section opens the section. "Open in YAML" /
  "Show in graph" from the YAML editor does not select anything on the graph today, so it does not
  expand a section either.

### Dead end: "insert after a whole block"

There is no affordance for inserting a step immediately after an entire `if`/`switch`/`parallel`/`foreach` block. The _address_ works (`{ mode: 'after', stepName: '<the block step>' }`) and `insertStep` splices correctly at `targetRange[1]`, but there is no graph node to hang a port on: `transform_workflow_to_graph.ts` wires branch leaves directly to the next sibling via `exitIds = dedupeIds(branchExits)` and there is no join node.

**Until this is designed, a workflow whose last step is a block is a dead end on the canvas** — the only way to continue it is the YAML tab.

The same applies to fallback lanes when `continue` is absent: `ExitTryBlock` re-throws, so there is no node below the fallback steps to carry a port.

Candidate designs (all deferred, pending design and product input):
- A synthetic join node carrying the port (honest, but re-lays-out every existing block).
- An `Insert step after` item in the `⋮` node-action menu (no structural change; works when the block is last).
- An append-at-end canvas overlay (closes the "block is last step" sub-gap).

### Fallback lane ports: not yet rendered

Fallback lane nodes render and are fully positioned. They do not yet have ports — the visible red failure port is spec 07's scope. The lane itself can be any depth; nested `on-failure.fallback` blocks render as nested side lanes.

---

## Architecture overview

> This section is populated as specs land.

### Packages and their roles

| Package | Role in authoring |
|---|---|
| `@kbn/workflows` (`graph_layout/`) | Logical graph construction; `visitStepChildSlots` (shared traversal) |
| `@kbn/dag-layout` | Dagre wrapper; `dagLayout` returns positioned nodes (`DagPositionedNode`) only; edge routing is computed in `@kbn/workflows-ui` |
| `@kbn/workflows-ui` | ReactFlow rendering; structure-driven cross-axis packing after `dagLayout` (`pack_workflow_structure.ts`, `workflow_layout_pipeline.ts`; ADR-0013); `WorkflowGraphEditActions` seam; `port_geometry.ts` |
| `@kbn/workflows-yaml` (`lib/yaml_edit`) | YAML AST utilities; `getStepNode`, `buildWorkflowLookup` |
| `workflows_management` | Redux store; snippet mutation path; `insertStepSnippet`; `WorkflowVisualEditor` |

### Data flow for a graph gesture

> Not yet implemented. Will be filled in when spec 04 lands.

### Gate: `canAuthor`

```ts
const canAuthor = !useWorkflowEditorReadOnly() && definition !== undefined;
```

`useWorkflowEditorReadOnly()` returns `true` when:
- `isExecutionsTab` (prevents overwriting live draft with frozen execution YAML)
- `workflow?.managed === true`
- `!canEditWorkflow` (capability check)

`definition !== undefined` gates against the stale-graph hazard: when the YAML is syntactically valid but schema-invalid, `definition` is `undefined` and the canvas renders `lastValidRef` — a stale graph. Ports vanish entirely; one line of canvas chrome explains why.

The mutation source is always `selectYamlString`, never `selectEditorYaml`. On the executions tab, `selectEditorYaml` returns `execution?.yaml` — reading it would overwrite the live draft with a historical document.

---

## Vocabulary

See [`@kbn/workflows/CONTEXT.md`](../../../../packages/shared/kbn-workflows/CONTEXT.md) for the canonical glossary. Key terms:

- **lane** — the cross-axis extent of one child slot's steps; declaration order is the invariant enforced by the cross-axis packer (ADR-0013)
- **port** — the interactive attachment point (affordance), not the ReactFlow `Handle` primitive
- **fallback steps** — steps under `on-failure.fallback`; not "error handling steps"
- **fallback lane** — the placed row/column of fallback steps; not "error branch"
- **snippet** — generated step YAML; not "template" or "fragment"
- **anchor step** — the step an insertion is addressed relative to; not bare "anchor"
