# Sections: why this YAML syntax

**Date:** 2026-11-02
**Companion to:** [ADR-0014 — Sections: a transparent grouping container](adr/0014_sections_transparent_grouping.md)

ADR-0014 records *what* was decided. This note records *how we got there*: the requirements, the
facts about the codebase that constrained the choice, every syntax we weighed, and why the ones
we did not pick lost. Read it before proposing a different syntax, so the same ground is not
walked twice.

## How far to trust this

| Option | How it was assessed |
|---|---|
| A. Nested `type: section` container (**chosen**) | Built, and exercised on the 1170-line Okta workflow. |
| B. Per-step tag, C. Section header item | Compared side by side during planning, from reading the schema, parser and editor code (an exploration pass over the code, plus the author's own reading). **Not prototyped.** |
| C′ marker steps, D. Comment markers, E. Range registry, F. Reuse `if`/`foreach`, G. Real sub-workflow | Assessed on paper against the same code facts. **Not prototyped.** D and the "removed when the server parses" variant of A were raised during planning; C′, E, F and G were worked through for this write-up. |

"Not prototyped" means the cons below are reasoned from the code, not observed. Where a claim rests
on a specific line of code, the path is given so it can be re-checked.

## 1. What we needed

From the original brief, as requirements:

| # | Requirement |
|---|---|
| R1 | **Empty sections.** A workflow can be a list of empty sections, filled in later ("modules first, code later"), at any level. |
| R2 | **Cheap to add** to an existing workflow, without rewriting it. |
| R3 | **Explicit boundaries.** It is clear where a section starts and ends. |
| R4 | **Not structural.** Grouping steps never changes what runs, step ids, outputs, metering. |
| R5 | **Survives storage.** The section is still there after the server parses and stores the workflow, because the graph on first load and the executions tab are drawn from the stored definition. |
| R6 | **Rollback-safe.** An older Kibana (rollback, or mixed versions in a serverless deploy) copes with it. |
| R7 | **Editor support for free.** Schema validation, completion, hover and folding in the YAML editor, with no new providers. |

Also: the concept must not be called a "sub-workflow", because `workflow.execute` already means
running a child workflow (see G).

## 2. What the codebase constrains

These facts decided most of the comparison. They were established by reading the code, not by running it.

1. **The server strips unknown keys.** Every schema is a plain `z.object`, which in Zod v4 strips
   unknown keys on parse instead of rejecting them (`kbn-workflows/spec/schema.ts`). The only
   explicit precedent for *rejecting* a key is the `if` step's `z.never()` for a step-level `if`.
2. **Raw YAML and parsed definition are stored separately.** A save stores the `yaml` text
   unchanged and a `definition` that is the strict-parsed, key-stripped result
   (`server/api/lib/workflow_prepare.ts`). Comments live only in `yaml`. The execution engine
   builds its graph from `definition`, never from `yaml`
   (`workflows_execution_engine/.../setup_dependencies.ts`).
3. **The graph is drawn from the stored definition on load.** `performComputation` uses the
   `loadedDefinition` when one is given, and parses the YAML only when it is not
   (`public/entities/workflows/store/workflow_detail/utils/computation.ts`). That is the case for
   the first render of a saved workflow and for the executions tab
   (`load_execution_thunk.ts` passes `execution.workflowDefinition`). While the user is editing,
   the client's own passthrough parse takes over.
4. **The editor flags unknown keys as errors** ("Property X is not allowed"), so any new key must
   go into the Zod schema anyway. The client's autocomplete parse is a passthrough that *keeps*
   unknown keys, so an unregistered key would look fine while editing and disappear after a save
   and reload.
5. **Steps have no metadata field.** There is no `description`, `tags`, `meta` or `ui` on a step,
   and no `x-` keys anywhere: no precedent for UI-only data in the YAML.
6. **Arrays of steps are validated in 18 places** in `spec/schema.ts` (the strict and loose
   variants for `fallback`, foreach, while, switch cases and default, if and else, parallel
   branches, merge, and the root `steps`). The `steps` bodies of foreach, while, if, switch cases,
   parallel branches and the root are `.min(1)`; `else`, `default` and the merge body are not. An
   empty `steps` body is not expressible today, which matters for R1.
7. **No custom folding, code lens or inlay providers exist** in the YAML editor. Folding comes
   from monaco-yaml's own provider, which folds by YAML structure.
8. **No code reads YAML comments for meaning.**
9. **A Document round-trip rewrites most real workflows.** Measured: re-serialising the 71 managed
   workflow definitions through the `yaml` Document API changes 56 of them (folded `>-` scalars
   get re-flowed). Anything that edits YAML must splice text instead.

## 3. The options at a glance

✅ meets it, ⚠️ partly or with a cost, ❌ does not. This is a judgment, backed by section 4.

| | R1 empty | R2 cheap to add | R3 explicit ends | R4 not structural | R5 survives storage | R6 rollback-safe | R7 editor for free |
|---|---|---|---|---|---|---|---|
| **A. Nested section** (chosen) | ✅ | ⚠️ re-indent, absorbed by tooling | ✅ | ✅ | ✅ | ❌ | ✅ |
| B. Per-step tag | ❌ top level only, via a registry | ✅ | ⚠️ | ✅ | ⚠️ needs a schema key | ⚠️ runs, editor errors | ⚠️ |
| C. Header item | ✅ | ✅ | ❌ end is ambiguous | ✅ | ⚠️ | ❌ | ⚠️ |
| C′. Begin/end marker steps | ✅ | ✅ | ⚠️ pairs to validate | ⚠️ | ✅ | ❌ | ⚠️ |
| D. Comment markers | ✅ | ✅ | ⚠️ by convention only | ✅ | ❌ not in the definition | ✅ | ❌ |
| E. Range registry | ⚠️ | ✅ | ⚠️ by name | ✅ | ⚠️ needs a schema key | ⚠️ | ⚠️ |
| F. Reuse `if` / `foreach` | ❌ bodies are `min(1)` | ⚠️ re-indent too | ✅ | ❌ | ✅ | ✅ | ✅ |
| G. Real sub-workflow | ⚠️ a workflow needs steps | ❌ data wiring | ✅ | ❌ | ✅ | ✅ | ✅ |

The only column A fails is R6. That is the main cost we accepted (section 6).

## 4. The options in detail

### A. Nested `type: section` container — chosen

```yaml
- name: ingest
  type: section
  title: Ingest alerts
  description: Pull and normalise
  steps:
    - name: fetch_alerts
      type: elasticsearch.search
    - name: dedupe
      type: data.set
```

- **Pros.**
  - Boundaries are explicit and nothing is ambiguous: the indentation is the membership.
  - An empty section is just `steps: []` (or no `steps`), anywhere.
  - Everything that walks child steps already recurses on the `steps` key regardless of type
    (`visitStepChildSlots`, `STEP_BODY_KEYS`), so lookup, the step minimap, name uniqueness, YAML
    mutations and the graph transform see a section's members with no new traversal code.
  - The graph reuses the `foreach` container path: layout, packing and the layout invariants.
  - Schema validation, completion, hover and native folding come from the existing machinery.
- **Cons.**
  - Adding it to existing steps **re-indents** them. On the Okta workflow, 12 sections re-indent
    about 73% of the file (whitespace only; `git diff -w` shows just the 36 header lines). Tooling
    (Wrap/Unwrap) absorbs the effort but not the size of the diff.
  - A new step type is a one-way door for older Kibana (section 6).
  - Sections group **siblings in one list**. The Okta workflow is a guard ladder (about 1100 lines
    under one `if`, 14 levels deep), so sections label the preamble at each level; they do not
    turn it into a flat list of phases.
- **Verdict.** Best on robustness and on the editor, at the price of re-indenting and a one-way
  schema change.

### B. Per-step tag + registry

```yaml
sections:                      # needed for titles and empty sections
  - id: ingest
    title: Ingest alerts
steps:
  - name: fetch_alerts
    section: ingest            # on every member
  - name: dedupe
    section: ingest
```

This is the closest to the original "tag a range of steps" idea.

- **Pros.**
  - Nothing is re-indented: one line per step. The lightest touch on an existing workflow.
  - One optional field on the base step; the lowest code risk of the schema-based options.
  - An older Kibana strips the unknown key and still runs the workflow (the editor shows error
    markers), so it degrades gracefully.
- **Cons.**
  - **Empty sections (R1) are the weak point.** An empty section has no step to carry the tag, so
    it must be declared in a top-level registry, placed by an ordering rule, and only at the top
    level. That is the second of the three stated goals.
  - **Membership is per step and not enforced to be contiguous.** `a b a` needs a rule, and so
    does a tag inside an `if` branch whose parent carries another.
  - **Folding clashes.** There is no header line to fold. A custom fold would overlap each
    member's own fold, so the workaround is a "fold every member" command plus a gutter rail and
    an inline badge: the first custom providers in the editor (fact 7).
  - **A new step joining the section** has to copy the tag from its neighbour, with edge cases at
    the boundary. Renaming a section means editing every member.
  - The key must be added to the schema (facts 1 and 4), and the graph transform has to *discover*
    containers by grouping runs of tagged steps, instead of reusing the `foreach` path.
  - An unknown key that survived parsing would ride along in a step's node configuration (leaf
    steps copy the whole step into `configuration`), so an engine-visible field would be needed
    to keep it out.
- **Verdict.** Rejected mainly on R1 and on folding. It is the best option if the goal were only
  to *label* existing steps; it is the weakest for the "modules first" goal.

### C. Section header item

```yaml
steps:
  - section: Ingest alerts     # opens a section; members are the steps that follow
  - name: fetch_alerts
    type: elasticsearch.search
  - name: dedupe
    type: data.set
  - section: Triage            # two headers in a row = an empty section
  - section: Notify
```

- **Pros.**
  - The best authoring experience: one line per section, no re-indent, reads like markdown
    headings, and the header line is a natural place to fold.
  - Position decides membership, so a new step joins the section it is inserted into.
  - Empty sections are two headers in a row, anywhere.
- **Cons.**
  - **The end of a section is ambiguous.** A section runs until the next header or the end of the
    list, so ungrouped steps after a section need an explicit end marker (C′).
  - **Membership is silent.** Moving a step across a header (a drag, a sort, a merge conflict)
    changes its section with no sign in the diff.
  - **The most schema work.** A non-step item has to be allowed in all **18** step-array sites
    (fact 6). The `min(1)` checks stop meaning anything once headers are stripped (a list of only
    headers passes, and is empty). The marker must be removed in both parse paths (the strict
    server parse and the client passthrough), or the engine sees a non-step.
  - The graph transform has to split lists at headers.
  - An older Kibana rejects the item: it is not a step.
- **Verdict.** Rejected: the schema cost and the end-of-section ambiguity are real, not cosmetic.

### C′. Begin/end marker steps

```yaml
- name: ingest_begin
  type: section.begin
  title: Ingest alerts
- name: fetch_alerts
  type: elasticsearch.search
- name: ingest_end
  type: section.end
```

Fixes C's ambiguity by pairing, and, because the markers are *steps*, avoids the non-step-item
problem in the 18 array sites.

- **Pros.** Flat, no re-indent, explicit end, empty section is an adjacent pair, works with the
  existing step walkers.
- **Cons.**
  - Pairs have to be validated: unmatched, crossed, or split across branch lists (begin in
    `then`, end in `else`). Nothing in the schema can express that; it is a new ancestry-style
    validator like the nesting rule, but harder.
  - They are steps, so they must be erased before execution or they become no-op execution nodes
    with step ids, executions and metering (the opposite of R4).
  - Two names per section, to keep unique.
  - An older Kibana sees unknown step types and marks the workflow invalid.
- **Verdict.** All of A's one-way-door cost with more validation, for no re-indent saving that
  Wrap/Unwrap does not already provide.

### D. Comment markers

```yaml
steps:
  # [section: ingest] Ingest alerts
  - name: fetch_alerts
    type: elasticsearch.search
  - name: dedupe
    type: data.set
  # [/section]
```

- **Pros.**
  - **Zero schema change and no version risk.** Every Kibana, old or new, ignores comments. This is
    the one option that is fully rollback-safe (R6), and it is the cheapest to add to an existing
    workflow (R2).
  - Nothing is re-indented, and an empty section is two adjacent comments.
- **Cons.**
  - **The parsed definition has no comments** (fact 2). The server stores them only in the raw
    `yaml`. Everything drawn from the definition (the graph on first load, the executions tab; fact 3)
    would be blind to sections unless each consumer re-parsed the raw YAML.
  - **Nothing validates them.** A typo, an unbalanced marker, a start in one branch and an end in
    another: all silently accepted. No schema, so no completion, no hover, no name uniqueness, no
    nesting rule. R7 fails.
  - **They invent a micro-syntax.** The section name and title have to be parsed out of comment
    text, with their own escaping (a `]`, a `:`, a `#` in a title).
  - **Comments are not part of the YAML data model.** Any tool that rebuilds YAML from the parsed
    definition drops them. Today those are fallback paths (an execution without stored YAML, an
    export with no stored YAML; the main stored `yaml` keeps comments), but JSON-based tooling and
    generated YAML give no such guarantee. Whether AI-generated edits keep comments was not
    measured.
  - **It would be the first time comments carry meaning** (fact 8), and folding would need a
    custom provider (fact 7).
- **Verdict.** Rejected. It is the safest to ship and the weakest at everything the UI feature
  needs. If R6 ever outweighs the rest, this is the fallback (section 7).

### E. Range registry (sections as data, steps untouched)

```yaml
sections:
  - title: Ingest alerts
    from: fetch_alerts
    to: dedupe
steps:
  - name: fetch_alerts
  - name: dedupe
```

- **Pros.** No step is touched or re-indented. Sections are declared as data, so empty ones are
  easy, and one registry holds every title.
- **Cons.**
  - Ranges refer to steps **by name**, so a rename, delete, reorder or insert must also update the
    registry. Every step mutation (`yaml_mutations`, `yaml_edit`) would have to know about it.
  - A range only means something inside **one list**; which list, in a nested workflow, has to be
    added to the address.
  - The label sits away from the steps it labels, and there is no header line to fold.
  - A top-level key must be added to `WorkflowSchemaBase` (fact 1).
- **Verdict.** Rejected. It moves the problem from indentation to reference maintenance.

### F. Reuse an existing control-flow step

Use `if` with a constant condition, or a one-iteration `foreach`, as the grouping container.

- **Pros.** No schema change; valid on every Kibana; the graph already draws containers.
- **Cons.** They are real control flow: they add enter/exit nodes, evaluate a condition or set up
  an iteration scope (`foreach.item`), and change step ids, outputs and metering (R4 fails).
  Their bodies are `min(1)`, so an empty module cannot exist (R1 fails). A reader would take them
  for logic.
- **Verdict.** Rejected on R1 and R4.

### G. Real sub-workflow (`workflow.execute`)

What the brief first called a "sub-workflow".

- **Pros.** Real modularity and reuse; independent testing; valid on every Kibana.
- **Cons.** It changes what runs: a separate execution with its own `inputs` and outputs, a
  separate data scope (the child cannot read the parent's `steps`, `variables`, `consts`, `inputs`
  or `event`), run-as identity, a nesting-depth limit (`workflows_execution_engine/server/config.ts`),
  and its own metering. The brief says the box is "a reading abstraction layer, not structural in
  any way", so this is a different feature. It also needs steps (a workflow's `steps` is `min(1)`).
- **Verdict.** Not a syntax for sections, and the reason we did not call them sub-workflows.
  The two meet in one place: the section menu's **Extract to new workflow** moves a section's
  steps into a real workflow and replaces the section with a `workflow.execute` step, one way,
  with the data-flow caveat shown to the user.

## 5. Why A landed

### The "no-op step"

A section is a step in the *stored* definition that the *execution* graph erases. It has three
properties, each from a requirement:

- **It is a step, so it is a container of steps.** That is what makes R1, R3 and R7 free: the
  schema, the walkers, the editor and the `foreach` graph path already handle "a step with a
  `steps` list".
- **It never executes** (R4). One function, `inlineSections`, called at the top of
  `createStepsSequence`, splices a section's children into its parent's list before any step is
  visited. So no section is ever an execution node, no step execution is written for one,
  workflow-level `on-failure` never wraps one, step ids are unchanged, and `steps.<section>` is
  never offered as an output.
- **It stays in the stored definition** (R5), see the next point.

### It nearly did not: "removed when the server parses"

The first form of A, shown at the start of planning, said the strict server parse would remove
sections, so the stored definition and the engine would never see them. It was dropped when the
code facts were checked: because the graph is drawn from the stored `definition` on first load
and on the executions tab (fact 3), a section removed at parse time would disappear from the
graph on load and from every execution view. The fix was to keep sections in the definition and
erase them in exactly one place, the execution-graph builder.

A third form was not taken: keep sections and let the engine run each as a pass-through node.
That reintroduces what `inlineSections` removes (an execution node and a step-execution record
per section, metering, a `steps.<section>` output), and it was not prototyped.

### Decisions that follow from the syntax

The ADR holds the full list. The ones that come straight from the syntax choice:

| Decision | Why | Rejected |
|---|---|---|
| Name it `section` | Reads as a reading unit, no execution meaning, no clash. | `group` (the graph code already says `foreachGroup`), `block` (already loose for if/switch/try), `stage` (suggests execution), `sub-workflow` (G) |
| `name` is identity, optional `title` is the label | `name` is unique in the step namespace and keys the collapse state; a title can hold punctuation and be renamed without losing state. | Deslugified `name` only; `description` doubling as the label |
| Empty sections are valid and run as a no-op | R1: a skeleton workflow can be run and filled in. Implemented in the graph builder; no runtime change. | An "invalid draft" error; a separate "draft" state |
| Only `name`, `type`, `title`, `description`, `steps` allowed; `if`, `on-failure`, `timeout`, `foreach`, `max-step-size` **rejected** | A section has no execution semantics; a key that is silently stripped would mislead (the `if` step's `z.never()` is the precedent). | Stripping unknown keys |
| Sections cannot nest, at any depth | A frame inside a frame reads worse than a flat list; JSON Schema cannot express ancestry, so it is a validation rule. | Unlimited nesting; "direct children only", which is invisible on a canvas where frames still nest |
| Collapse state is per viewer, in localStorage | Toggling must not dirty the workflow or add an undo entry. | A YAML `collapsed: true` default |
| Wrap and Unwrap are minimal text splices | Fact 9: the Document API would rewrite most real files on the first Wrap. | Document API round-trip |
| One release, no section-specific flag | Chosen by the maintainers. | Schema first with the UI flagged; everything behind a flag |

## 6. What A costs us

Stated plainly, because they are the reasons to revisit it.

- **One-way door for older Kibana.** A workflow saved with `type: section` is invalid on a Kibana
  that does not know the type. A rollback, or a mixed-version serverless deploy, cannot run it.
  Accepted with the one-release rollout. B, D, E, F and G would not have had this cost.
- **A large diff when sectioning an existing workflow.** Whitespace-only, and `git diff -w` is
  small, but a reviewer reading a plain diff sees most of the file change.
- **Siblings only, one level.** A section cannot span two lists (a `then` and its `else`), cannot
  contain another section, and cannot group non-adjacent steps.
- **A guard-ladder workflow is only labelled, not flattened.** Collapsing all 12 Okta sections
  takes the graph from 113 steps to 45 nodes, because the 14-deep ladder and its stop notices
  remain.
- **`workflow.execute` has no title or description field,** so extracting a section moves its
  title and description onto the new workflow instead.

## 7. When to reopen the decision

- **If rollback safety matters more than the editor support**: D (comments) is the only fully safe
  option; it would need the raw YAML parsed in every consumer and a small validator. Expect to
  lose completion, hover and folding for sections.
- **If the re-indent diff is the main complaint**: C with an explicit end marker (C′) or B give a
  one-line adoption. Weigh that against the schema work (C′) or the empty-section gap (B).
- **If nested modules are wanted**: lift the nesting rule. The engine already inlines recursively,
  and layout handles nested containers through the `foreach` path; the open work is the marquee
  and the validation rule.
- **If sections should span branches**: none of the options above supports it without a registry
  (E), and E's name-reference cost then applies.

## 8. Where to look

| What | Where (under `src/platform/`) |
|---|---|
| Section schema | `packages/shared/kbn-workflows/spec/schema.ts` (`SectionStepSchema`) |
| Erasing sections for execution | `packages/shared/kbn-workflows/graph/build_execution_graph/inline_sections.ts` |
| Nesting rule | `packages/shared/kbn-workflows/common/validate_section_nesting.ts` |
| Wrap / Unwrap / Extract splices | `packages/shared/kbn-workflows-yaml/lib/yaml_edit/section_edit.ts`, `section_extract.ts` |
| Graph container and collapse | `packages/shared/kbn-workflows/graph_layout/transform_workflow_to_graph.ts` |
| Definition vs YAML on load | `plugins/shared/workflows_management/public/entities/workflows/store/workflow_detail/utils/computation.ts` |
| Where the strict parse strips keys | `packages/shared/kbn-workflows-yaml/common/yaml/parse_workflow_yaml_to_json.ts` |
