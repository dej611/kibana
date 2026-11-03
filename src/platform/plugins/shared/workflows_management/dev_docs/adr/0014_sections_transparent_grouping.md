# ADR-0014 — Sections: a transparent grouping container

**Status:** Accepted
**Date:** 2026-10-30
**Deciders:** @elastic/workflows-eng

## Context

Large workflows are hard to read. The reference case, `suspend-okta-access-and-revoke-sessions`, is
1170 lines and 113 steps, and almost all of it sits under one `if` nested 14 deep. The graph has no
way to name a stretch of steps, fold it away, or sketch a workflow as a list of parts to fill in
later.

We want a **reading layer**: a name for a run of sibling steps, drawn as a frame and collapsible on
the canvas. It must not be structural: grouping steps must never change what runs, what a step id
or output path is, or what is metered.

## Decision

**A `type: section` step, kept in the stored definition and made transparent in the execution-graph
builder.**

```yaml
- name: ingest
  type: section
  title: Ingest alerts          # label; falls back to the deslugified name
  description: Pull and normalise
  steps: [ … ]                  # may be empty, or omitted
```

- **Where it is erased.** Exactly one place: `createStepsSequence` in `build_execution_graph.ts`
  calls `inlineSections` before it visits any step, so a section never becomes an execution node and
  never has a step execution. The definition keeps sections, so the first graph render and the
  executions tab (both built from the server-stored definition) still show them.
- **Allowed keys.** `name`, `type`, `title`, `description`, `steps`. `if`, `on-failure`, `timeout`,
  `foreach` and `max-step-size` are **rejected**, not stripped (`z.never()`, as `if` does for a
  step-level `if`): a section has no execution semantics, and an ignored key would mislead.
- **Empty sections are valid and run as a no-op,** at any level. `insertGraphBetweenNodes` joins a
  body that inlines to nothing; a workflow made only of empty sections completes immediately. The
  one exception is a **parallel branch**, which the executor starts from its first node: a branch
  that is only empty sections fails with a graph-build error.
- **Sections cannot nest, at any depth** (`section → if.then → section` included). Enforced as a
  validation rule (`nestedSection`) on the server and in the editor, because JSON Schema cannot
  express ancestry. The engine's inlining stays recursive, so a nested section that slips through
  is still a no-op.
- **Names.** `name` is the identity (unique in the step namespace, the collapse-state key); `title`
  is the label. A section is never offered as `steps.<name>.output`.
- **Collapse is per viewer.** Kept in localStorage per workflow, never in the YAML, so toggling does
  not dirty the workflow or add an undo entry. On the executions tab, a section with a failed or
  waiting step is shown expanded without changing what the viewer chose.
- **Graph.** `section` is in `CONTAINER_STEP_TYPES`, so layout, packing and the layout invariants
  treat it as a `foreach` body. A collapsed section is one plain `step` node
  (`data.section.memberStepNames`); its status is rolled up from its steps.
- **Editing is minimal text splices.** `wrapStepsInSection` / `unwrapSection` add or remove a
  3-line header and move only the wrapped lines by one level. Every byte outside is untouched.
  The YAML code action, the graph marquee and the graph's Ungroup all use them.
- **Rollout.** One release, no section-specific flag.

## Alternatives considered

The full investigation behind the syntax choice, with every option compared against the
requirements, is in [section_yaml_syntax_investigation.md](../section_yaml_syntax_investigation.md).

- **Per-step tag `section: <id>` plus a top-level registry.** The least invasive, but an empty
  section has no steps to carry it, so it needs the registry and an ordering rule, and only works
  at the top level. A custom fold also clashes with the first step's own fold.
- **A `- section: Title` header item opening a section.** The least YAML, but a non-step item has to
  be allowed in all 18 step-array schema sites, and the end of a section is ambiguous.
- **YAML comments (`# --- Ingest ---`).** Lost in JSON and AI round-trips, and comments would carry
  meaning for the first time.
- **Removing sections when the server parses.** They would vanish from the graph on first load and
  from every execution view, since both are built from the stored definition.
- **Empty-only is an error, or a separate "draft" state.** Rejected for a no-op: it keeps the
  validity model unchanged and lets a skeleton workflow be run and filled in.
- **Unlimited nesting, or direct children only.** Rejected: a frame inside a frame reads worse than
  a flat list, and "direct children only" is invisible on a canvas where frames still nest.
- **Re-serialising through the `yaml` Document.** Rejected: it re-flows folded scalars in 56 of the
  71 managed workflows, so a first Wrap would rewrite most of the file.
- **React Flow's built-in drag selection for the marquee.** Rejected: the canvas owns node
  selection (controlled nodes, no change handler), so the marquee reads the pointer itself.

## Consequences

- Wrapping steps changes nothing observable: execution graph, step ids, metering and telemetry are
  identical (asserted by tests over generated workflows and the managed definitions).
- An older Kibana (rollback, or mixed versions during a serverless deploy) treats a workflow with a
  section as invalid. This is accepted with the one-release rollout.
- Wrapping re-indents the wrapped steps, so a large Wrap is a large whitespace-only diff
  (`git diff -w` is just the header lines). On the Okta workflow, 12 sections add 36 lines and
  re-indent about 73% of the file.
- A section groups siblings in one list, so a guard ladder (the Okta shape) gets labelled
  preambles, not a flattened phase view; collapsing all 12 sections takes the graph from 113 steps
  to 45 nodes.
- The marquee wraps a set of caught steps as follows. Steps in one branch are wrapped within that
  branch; a whole branch, or steps from several branches, stand for the block; a loop body is a
  plain list. A range inside a section, or holding one, is refused.
- The collapsed node has no Ungroup in its menu: expand the section first.
- Extracting a section to a workflow (`readSectionForExtraction`, `replaceSectionWithWorkflowExecute`) moves its steps verbatim and rewrites nothing. What the steps read from outside, and what the rest reads from inside, is found by scanning the text and shown for confirmation; it can name more than is really missing.
- A section forced open on the executions tab cannot be collapsed there.
