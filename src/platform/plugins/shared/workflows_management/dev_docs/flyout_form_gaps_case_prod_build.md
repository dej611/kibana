# Flyout Form gaps found while building "case prod" from scratch

**Date:** 2026-11-02 (updated after testing the fields' *Open expanded editor* control)
**Context:** a recorded, scripted build of the "case prod" workflow (9 sections, 27 steps) in the graph editor
on a live instance, driven with puppeteer. The rule for the build was: use the step flyout's **Form**, and fall
back to the flyout's **YAML** tab only for what the Form cannot reach. This note lists every fall-back, and
separates the real gaps from the ones that were my script's doing.

## Summary

The final recording sent **22 of the 23 leaf steps** to the YAML tab. They split into three groups:

| Group | Steps | What it means |
|---|---|---|
| **A. The Form has no way to set it** | **4** | A real gap. YAML was the only route. |
| **B. The Form changes the step** | **1** | The Form is usable but writes something the reference did not have. |
| **C. Reachable through the Form; my script fell back** | **17** | Not a product gap. The script's input method, or the filter I put in front of the Form, sent these to YAML. |

Two more things belong in the summary:

- **The workflow settings flyout was reachable and I bypassed it.** The build went to the YAML tab for the
  workflow name and constants, with a caption saying they have no flyout. That was an unchecked assumption and it
  is wrong. See "Correction" below.
- **The *Open expanded editor* control removes one of the gaps.** The multi-line `description` of `cases.createCase`
  does not fit its single-line inline field, but it lands exactly in the expanded editor (see below). It was
  group A; it is now group C.
- **Many early "the Form garbles this" results were my script, not the Form.** The cause is the *Insert data*
  picker (see "Behaviour worth knowing"). The Form fields in group C accept the values once the picker is dealt with.

## A. The Form cannot set it (4 steps)

| Step | Type | What is missing | Evidence |
|---|---|---|---|
| `update_alert_statuss`, `update_alert_status` | `kibana.SetAlertsStatus` | **Every input.** The flyout says *"No configuration needed. This step has no inputs to set."*, but the step needs `status`, `signal_ids` and `fetcher`. No visible fields, nothing under "Add optional". | Seen in the flyout (screenshot) and in the field inventory: visible `[]`, optional `[]`. Both steps. |
| `lookup-hash-via-vt`, `lookup-url-via-urlscan` | `http` | **Step-level `timeout`** (`timeout: 30s`). It is not a visible field, not under "Add optional", and the **Advanced** section holds only *Retry on failure* and *Continue on failure*. | Field inventory for both steps. `timeout` is a property of connector steps in the schema, so this looks like an omission in the form. |

These are the actionable ones. In each case the YAML tab worked and the result is correct. The *Open expanded
editor* control does not help here: these steps have no field to expand (`SetAlertsStatus`) or no field at all
(`timeout`).

## B. The Form changes the step (1 step)

`get_case_to_update` (`cases.getCase`): setting only `case_id` through the Form also writes
`include_comments: false`. The step then differs from the reference, which has only `case_id`. It is harmless
as far as I can tell (it looks like the schema default), but it is a side effect: the Form writes a field the
user did not touch. My build compared strictly and used the YAML tab to get the exact original. Observed result:
`with: { case_id: "{{steps.x.output}}", include_comments: false }`.

## C. Reachable through the Form; my script fell back (17 steps)

These went to YAML because of how the script typed, not because the Form cannot hold the value. The honest status
of each cause is given, because some are verified and some are inferred.

| Cause | Steps | Status |
|---|---|---|
| **ES\|QL query editor** | 8 (`search_similair_cases_id-process`, `esql_get_context_for_host`, `esql_first_login_user`, `esql_get_context_for_user`, `esql_get_alerts_by_host`, `esql_get_alerts_by_user`, `esql_get_cases_with_indicators`, `esql_get_case_id`) | Scrambled when typed in fast synthetic chunks, and cut off at the first `@` or `{{` with real keystrokes (the picker, below). **Verified** to land exactly when the picker is dismissed with Escape, on **one** representative query (`esql_get_context_for_host`). The query editor has **no** *Open expanded editor* control (only the `@` button and a resize handle), so the expand route does not apply to it. The other 7 were not individually re-tested; all contain `@` or `{{`, which is consistent. |
| **Multi-line `message` on `console`** | 3 (`choose-ioc-using-event-category`, `find_similar_case_id`, `create_case_title`) | The field is a JSON-kind input, so a multi-line text has to be typed as one JSON string with `\n` escapes, inline or in the expanded editor. **Verified at full length**: the 1,010-character `create_case_title` message, typed as a JSON string in the expanded editor with the picker dismissed, was stored as exactly the original text. The 636- and 509-character messages landed inline in the full Form run. Reachable, but the escaping is awkward, and raw multi-line text typed in the expanded editor does **not** apply (see below). |
| **Multi-line `description` on `cases.createCase`** | 1 (`kibana_createCaseDefaultSpace_step`) | The inline field is a single-line input, so newlines collapse. In the **expanded editor** (a textarea) a 3-line sample landed exactly, and the **full original (6,364 characters, with `{{` and `{%`) landed exactly** once the picker was dismissed on each trigger (49 times). Without dismissing it, the text stopped at the first `{{`. |
| **Objects in `http` headers** | 1 step only in this group (`search-on-web`) | Landed with real key events; the same field on `lookup-url-via-urlscan` did too. `lookup-hash-via-vt` has `{{ consts.vtkey }}` in a header, which opens the picker; not retried with Escape. |
| **Structured values the Form accepted in the full Form run** | 4 (`update_case_tag` `updates`; `add_alert_to_case_update` and `add_alert_to_case` `alerts`; `email_step` `to`) | **Verified** in the full Form run: every field of these steps was accepted, and each step needed no YAML. They went to YAML in the recording only because my filter sent objects and arrays there before trying. |

Group C total: 8 + 3 + 1 + 1 + 4 = 17.

One field is left unexplained, so it is not counted as a gap or as reachable: `with.owner` on
`kibana_createCaseDefaultSpace_step` is a combo box. It failed in the full Form run (both input methods) and then
landed with real keystrokes in an isolated probe. I do not know why. That step is counted in group C, for its
`description`; its `owner` is the one open question.

## Behaviour worth knowing

1. **The *Insert data* picker takes over the keyboard on `@` and `{{`.** Typing either in a Form field opens
   a dialog ("Type @ or {{ in any field to open this") and moves focus to its search box. Whatever is typed next goes
   there, not into the field. Real keystrokes of a query with `@timestamp` stopped at `WHERE @`; a URL with
   `{{steps.…` stopped at `…{{steps.choose-i`. A single paste-like insert is also cut at the `@`. **Pressing Escape
   closes only the picker** (the flyout stays open) and typing continues: pressing Escape after each trigger made a
   129-character query with an `@` and `{{` land exactly. I did not test a real clipboard paste.
2. **The *Open expanded editor* control.** Fields that take free text show a small icon next to the `@` button. It
   opens a side editor for just that field, which applies each change as you type; *Back* leaves it. Observed:
   it is a **textarea**, so it holds real line breaks (the `createCase` description worked there); the **picker
   still opens on `@` and `{{`** and still needs Escape; for a **JSON-kind** field such as `console` `message` it
   expects a JSON string literal, and raw multi-line text typed there is not applied (stored value `undefined`);
   and the **ES|QL query editor has no such control**.
3. **Tab inserts two spaces in a code editor.** I committed fields with Tab. In the ES|QL editor that appended two
   trailing spaces, which looked like a failure but was my artefact.
4. **The flyout's YAML tab re-syncs on every change.** Text inserted in chunks was clobbered ("na", then nothing),
   so the build sets the whole fragment in one Monaco edit. I only tried synthetic insertion there, **not real
   keystrokes**, so I cannot say a person typing would hit this.
5. **Monaco logged `BugIndicatingError: Model is disposed!` page errors** while the YAML-tab fragment editor was
   swapped. My edits go through Monaco's API, which may be what triggers them; I did not check manual editing.
6. **A real click on the "+" at the end of a loop's steps selects the loop instead.** The loop node sits over the
   control in the hit-testing order. The script pressed that button through the DOM. Unrelated to the Form, but found
   in the same session.

## Correction: the workflow settings flyout

The build used the YAML tab for the workflow **name** and **constants** and said they have no flyout. They do:
the gear next to the title opens *Workflow settings* with **General** (name, description, tags), **Constants**
and **Outputs** tabs. Verified end to end in a dry run: the name typed in the flyout became the workflow name, and a
constant added with *Add constant* (name, type, value, *Done*) appeared as `consts: { kibana_domain: example.test }`.
All eight constants of the original were not entered this way; one was. The recorded video's phase 3 and its caption
are therefore wrong and should be redone through the flyout.

## Method and limits

- **Two kinds of input, and the difference matters.** *Synthetic* means the browser's insert-text command in small
  chunks (what the script used by default). *Real* means key events typed one by one. Several results differ
  between the two, and the report says which was used.
- **One full Form run**, not repeated. The `owner` result shows that a single run can be flaky.
- **"Form run"** in the appendix is that single run, in which every field of every step was tried through the Form
  and misses were retried with real key events (values over 400 characters were not retried).
- **Typing speed is not representative.** Dismissing the picker 49 times while typing the 6,364-character
  description took about 6 minutes, because the script waits after every `{{`. A person would be far quicker.
- **Not checked:** the expand control on fields other than `description`, `message` and `url`; typing every
  other long value with Escape handling; a real clipboard paste; whether the flyout YAML tab accepts real
  keystrokes; whether the console errors occur for a person.
- **Suggestions are mine** and were not discussed with the owners of these components.

## Appendix: every leaf step

"Form run" is what happened when every field was tried through the Form. "Final recording" is what the video
actually did.

| Section | Step | Type | Form run | Final recording |
|---|---|---|---|---|
| identify_indicator | `choose-ioc-using-event-category` | `console` | every field accepted | YAML tab |
| enrich_indicator | `lookup-hash-via-vt` | `http` | `with.url` did not land; `with.headers` did not land; `timeout` not offered | YAML tab |
| enrich_indicator | `lookup-url-via-urlscan` | `http` | `with.headers` landed with real key events; `timeout` not offered | YAML tab |
| enrich_indicator | `search-on-web` | `http` | `with.headers` landed with real key events | YAML tab |
| find_matching_case | `search_similair_cases_id-process` | `elasticsearch.esql.query` | `with.query` did not land (synthetic input only) | YAML tab |
| find_matching_case | `find_similar_case_id` | `console` | every field accepted | YAML tab |
| find_matching_case | `create_case_title` | `console` | `with.message` did not land (synthetic input only) | YAML tab |
| update_case_details | `get_case_to_update` | `cases.getCase` | every field accepted (Form adds a default `include_comments: false`) | YAML tab |
| update_case_details | `update_case_tag` | `cases.updateCase` | every field accepted | YAML tab |
| attach_alerts_to_existing_case | `add_alert_to_case_update` | `cases.addAlerts` | every field accepted | YAML tab |
| attach_alerts_to_existing_case | `update_alert_statuss` | `kibana.SetAlertsStatus` | `with.status` not offered; `with.signal_ids` not offered; `with.fetcher` not offered | YAML tab |
| gather_context | `esql_get_context_for_host` | `elasticsearch.esql.query` | `with.query` did not land | YAML tab |
| gather_context | `esql_first_login_user` | `elasticsearch.esql.query` | `with.query` did not land | YAML tab |
| gather_context | `esql_get_context_for_user` | `elasticsearch.esql.query` | `with.query` did not land | YAML tab |
| gather_context | `esql_get_alerts_by_host` | `elasticsearch.esql.query` | `with.query` did not land | YAML tab |
| gather_context | `esql_get_alerts_by_user` | `elasticsearch.esql.query` | `with.query` did not land | YAML tab |
| gather_context | `esql_get_cases_with_indicators` | `elasticsearch.esql.query` | `with.query` did not land (synthetic input only) | YAML tab |
| create_case | `kibana_createCaseDefaultSpace_step` | `cases.createCase` | `with.description` did not land inline (it does in the expanded editor); `with.owner` did not land | YAML tab |
| create_case | `esql_get_case_id` | `elasticsearch.esql.query` | `with.query` did not land | YAML tab |
| attach_alerts_to_new_case | `process-item` | `console` | every field accepted | Form |
| attach_alerts_to_new_case | `add_alert_to_case` | `cases.addAlerts` | every field accepted | YAML tab |
| attach_alerts_to_new_case | `update_alert_status` | `kibana.SetAlertsStatus` | `with.status` not offered; `with.signal_ids` not offered; `with.fetcher` not offered | YAML tab |
| notify_by_email | `email_step` | `email` | every field accepted | YAML tab |

## Reproduce

The scripts are in the session scratchpad (`build.js`, `harness.js`, `plan.js`, `probe*.js`) and are not in the
repo. A full Form attempt is `REPORT=1 PACE=0.3 node build.js`; the recorded build is
`RECORD=<file.webm> PACE=0.6 node build.js`. They need Chrome, the Playwright-bundled ffmpeg, and the live instance.
